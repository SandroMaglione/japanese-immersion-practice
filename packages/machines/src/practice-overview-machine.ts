import { IndexedDb } from "@jip/indexeddb";
import { DateTime, Effect, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const DayMillis = 24 * 60 * 60 * 1000;
const IncorrectReviewIntervalMillis = 10 * 60 * 1000;
const LastCorrectReviewIntervalMillis = 120 * DayMillis;
const CorrectReviewIntervalsMillis = [
  1 * DayMillis,
  3 * DayMillis,
  7 * DayMillis,
  14 * DayMillis,
  30 * DayMillis,
  60 * DayMillis,
  LastCorrectReviewIntervalMillis,
] as const;

const PracticeQueueItemSchema = Schema.Struct({
  attemptCount: Schema.Number,
  correctStreak: Schema.Number,
  isDue: Schema.Boolean,
  nextReviewAt: Schema.DateTimeUtcFromMillis,
  word: IndexedDb.Domain.WordEntry,
});

const PracticeSubmissionResultSchema = Schema.Struct({
  isCorrect: Schema.Boolean,
  nextReviewAt: Schema.DateTimeUtcFromMillis,
  wordText: Schema.String,
  wordTranslation: Schema.String,
});

const PracticeSubmitResultSchema = Schema.Struct({
  isCorrect: Schema.Boolean,
  nextReviewAt: Schema.DateTimeUtcFromMillis,
  queue: Schema.Array(PracticeQueueItemSchema),
  wordText: Schema.String,
  wordTranslation: Schema.String,
});

const PracticeSessionDataSchema = Schema.Struct({
  queue: Schema.Array(PracticeQueueItemSchema),
});

const PracticeOverviewContextSchema = Schema.Struct({
  currentResponse: Schema.String,
  lastResult: Schema.optionalKey(PracticeSubmissionResultSchema),
  message: Schema.optionalKey(Schema.String),
  queue: Schema.Array(PracticeQueueItemSchema),
});

const SubmitPracticeInputSchema = Schema.Struct({
  submittedText: Schema.String,
  wordText: Schema.String,
});

type WordPracticeSubmission =
  typeof IndexedDb.Domain.WordPracticeSubmission.Type;

const _toEpochMillis = ({ dateTime }: { readonly dateTime: DateTime.Utc }) =>
  DateTime.toEpochMillis(dateTime);

const _normalizePracticeText = ({ text }: { readonly text: string }) =>
  text.trim().normalize("NFKC");

const _isCorrectPracticeAnswer = ({
  submittedText,
  wordText,
}: {
  readonly submittedText: string;
  readonly wordText: string;
}) =>
  _normalizePracticeText({ text: submittedText }) ===
  _normalizePracticeText({ text: wordText });

const _sortSubmissionsBySubmittedAt = ({
  submissions,
}: {
  readonly submissions: readonly WordPracticeSubmission[];
}) =>
  [...submissions].sort(
    (left, right) =>
      _toEpochMillis({ dateTime: left.submittedAt }) -
      _toEpochMillis({ dateTime: right.submittedAt })
  );

const _correctStreak = ({
  submissions,
  wordText,
}: {
  readonly submissions: readonly WordPracticeSubmission[];
  readonly wordText: string;
}) => {
  const sortedSubmissions = _sortSubmissionsBySubmittedAt({ submissions });
  let streak = 0;

  for (let index = sortedSubmissions.length - 1; index >= 0; index -= 1) {
    const submission = sortedSubmissions[index];

    if (submission === undefined) {
      return streak;
    }

    if (
      !_isCorrectPracticeAnswer({
        submittedText: submission.submittedText,
        wordText,
      })
    ) {
      return streak;
    }

    streak += 1;
  }

  return streak;
};

const _buildPracticeQueue = ({
  now,
  submissions,
  words,
}: {
  readonly now: DateTime.Utc;
  readonly submissions: readonly WordPracticeSubmission[];
  readonly words: readonly (typeof IndexedDb.Domain.WordEntry.Type)[];
}) => {
  const nowEpochMillis = _toEpochMillis({ dateTime: now });

  return words
    .map((word) => {
      const submissionsForWord = submissions.filter(
        (submission) => submission.wordText === word.text
      );
      const sortedSubmissions = _sortSubmissionsBySubmittedAt({
        submissions: submissionsForWord,
      });
      const latestSubmission = sortedSubmissions[sortedSubmissions.length - 1];
      const nextReviewAt = latestSubmission?.nextReviewAt ?? word.createdAt;

      return {
        attemptCount: submissionsForWord.length,
        correctStreak: _correctStreak({
          submissions: submissionsForWord,
          wordText: word.text,
        }),
        isDue: _toEpochMillis({ dateTime: nextReviewAt }) <= nowEpochMillis,
        nextReviewAt,
        word,
      };
    })
    .sort((left, right) => {
      const nextReviewDifference =
        _toEpochMillis({ dateTime: left.nextReviewAt }) -
        _toEpochMillis({ dateTime: right.nextReviewAt });

      if (nextReviewDifference !== 0) {
        return nextReviewDifference;
      }

      const attemptDifference = left.attemptCount - right.attemptCount;

      if (attemptDifference !== 0) {
        return attemptDifference;
      }

      const updatedAtDifference =
        _toEpochMillis({ dateTime: left.word.updatedAt }) -
        _toEpochMillis({ dateTime: right.word.updatedAt });

      return updatedAtDifference !== 0
        ? updatedAtDifference
        : left.word.text.localeCompare(right.word.text);
    });
};

export const makePracticeOverviewMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<IndexedDb.Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(PracticeOverviewContextSchema),
      events: {
        changeResponse: Schema.toStandardSchemaV1(
          Schema.Struct({ response: Schema.String })
        ),
        refresh: Schema.toStandardSchemaV1(Schema.Void),
        submit: Schema.toStandardSchemaV1(Schema.Void),
      },
    },
    actorSources: {
      loadPracticeOverview: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(PracticeSessionDataSchema),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const now = yield* DateTime.now;
              const words = yield* store.listWordEntries();
              const submissions = yield* store.listWordPracticeSubmissions();

              return {
                queue: _buildPracticeQueue({
                  now,
                  submissions,
                  words,
                }),
              };
            })
          ),
      }),
      submitPracticeAnswer: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(SubmitPracticeInputSchema),
          output: Schema.toStandardSchemaV1(PracticeSubmitResultSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              const submittedText = input.submittedText.trim();
              const wordText = input.wordText.trim();

              if (submittedText === "" || wordText === "") {
                return yield* Effect.fail(
                  new Error("Type an answer before submitting.")
                );
              }

              const store = yield* IndexedDb.Store.Store;
              const words = yield* store.listWordEntries();
              const word = words.find((entry) => entry.text === wordText);

              if (word === undefined) {
                return yield* Effect.fail(
                  new Error("Could not find that word in the library.")
                );
              }

              const submittedAt = DateTime.toEpochMillis(yield* DateTime.now);
              const submissions =
                yield* store.listWordPracticeSubmissionsByWord(word.text);
              const isCorrect = _isCorrectPracticeAnswer({
                submittedText,
                wordText: word.text,
              });
              const correctStreak = _correctStreak({
                submissions,
                wordText: word.text,
              });
              const reviewIntervalMillis = isCorrect
                ? (CorrectReviewIntervalsMillis[
                    Math.min(
                      correctStreak,
                      CorrectReviewIntervalsMillis.length - 1
                    )
                  ] ?? LastCorrectReviewIntervalMillis)
                : IncorrectReviewIntervalMillis;
              const submission = yield* Schema.decodeEffect(
                IndexedDb.Domain.WordPracticeSubmission
              )({
                id: crypto.randomUUID(),
                nextReviewAt: submittedAt + reviewIntervalMillis,
                submittedAt,
                submittedText,
                wordText: word.text,
              });

              yield* store.insertWordPracticeSubmission(submission);

              const now = yield* DateTime.now;
              const queuedWords = yield* store.listWordEntries();
              const queuedSubmissions =
                yield* store.listWordPracticeSubmissions();

              return {
                isCorrect,
                nextReviewAt: submission.nextReviewAt,
                queue: _buildPracticeQueue({
                  now,
                  submissions: queuedSubmissions,
                  words: queuedWords,
                }),
                wordText: word.text,
                wordTranslation: word.translation,
              };
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      currentResponse: "",
      queue: [],
    },
    initial: "Loading",
    states: {
      Loading: {
        invoke: {
          src: "loadPracticeOverview",
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              lastResult: undefined,
              message: undefined,
              queue: event.output.queue,
            },
          }),
          onError: ({ event }) => ({
            target: "Failure",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not load practice data.",
            },
          }),
        },
      },
      Ready: {
        on: {
          changeResponse: ({ event }) => ({
            context: {
              currentResponse: event.response,
              message: undefined,
            },
          }),
          refresh: {
            target: "Loading",
          },
          submit: {
            target: "Submitting",
          },
        },
      },
      Submitting: {
        invoke: {
          src: "submitPracticeAnswer",
          input: ({ context }) => ({
            submittedText: context.currentResponse,
            wordText: context.queue[0]?.word.text ?? "",
          }),
          onDone: ({ event }) => ({
            target: "Revealed",
            context: {
              currentResponse: "",
              lastResult: {
                isCorrect: event.output.isCorrect,
                nextReviewAt: event.output.nextReviewAt,
                wordText: event.output.wordText,
                wordTranslation: event.output.wordTranslation,
              },
              message: undefined,
              queue: event.output.queue,
            },
          }),
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not save the answer.",
            },
          }),
        },
      },
      Revealed: {
        on: {
          refresh: {
            target: "Loading",
          },
          submit: {
            target: "Ready",
            context: {
              lastResult: undefined,
              message: undefined,
            },
          },
        },
      },
      Failure: {
        on: {
          changeResponse: ({ event }) => ({
            context: {
              currentResponse: event.response,
            },
          }),
          refresh: {
            target: "Loading",
          },
        },
      },
    },
  });
