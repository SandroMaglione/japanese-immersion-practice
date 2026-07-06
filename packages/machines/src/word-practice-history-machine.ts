import { IndexedDb } from "@jip/indexeddb";
import { FuriganaText, WordPracticeSelection } from "@jip/services";
import { Array as EffectArray, DateTime, Effect, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const WordPracticeAttemptViewSchema = Schema.Struct({
  batch: Schema.optionalKey(IndexedDb.Domain.WordPracticeBatch),
  result: IndexedDb.Domain.WordPracticeResult,
  submission: IndexedDb.Domain.WordPracticeSubmission,
});

const WordPracticeHistorySummarySchema = Schema.Struct({
  accuracy: Schema.Number,
  attemptCount: Schema.Number,
  attempts: Schema.Array(WordPracticeAttemptViewSchema),
  correctCount: Schema.Number,
  correctStreak: Schema.Number,
  incorrectCount: Schema.Number,
  incorrectStreak: Schema.Number,
  lastSubmittedAt: Schema.optionalKey(Schema.DateTimeUtcFromMillis),
  selectionWeight: Schema.Number,
  word: IndexedDb.Domain.WordEntry,
});

const WordPracticeHistoryContextSchema = Schema.Struct({
  matchingSummaries: Schema.Array(WordPracticeHistorySummarySchema),
  message: Schema.optionalKey(Schema.String),
  query: Schema.String,
  summaries: Schema.Array(WordPracticeHistorySummarySchema),
});

const _toEpochMillis = ({ dateTime }: { readonly dateTime: DateTime.Utc }) =>
  DateTime.toEpochMillis(dateTime);

const _submissionResult = ({
  submission,
}: {
  readonly submission: typeof IndexedDb.Domain.WordPracticeSubmission.Type;
}): IndexedDb.Domain.WordPracticeResult =>
  submission.result ??
  (FuriganaText.normalizePlainText({
    text: submission.submittedText,
  }) ===
  FuriganaText.normalizePlainText({
    text: submission.wordText,
  })
    ? "correct"
    : "incorrect");

const _filterSummaries = ({
  query,
  summaries,
}: {
  readonly query: string;
  readonly summaries: readonly (typeof WordPracticeHistorySummarySchema.Type)[];
}) => {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

  if (!EffectArray.isReadonlyArrayNonEmpty(tokens)) {
    return summaries;
  }

  return summaries.filter((summary) => {
    const searchable = [
      summary.word.text,
      FuriganaText.toPlainText({ text: summary.word.text }),
      summary.word.translation,
      summary.word.description,
      `${summary.accuracy}`,
      ...summary.attempts.map((attempt) => attempt.result),
      ...summary.attempts.map((attempt) => attempt.submission.submittedText),
    ]
      .filter((value): value is string => value !== undefined)
      .join(" ")
      .toLocaleLowerCase();

    return tokens.every((token) => searchable.includes(token));
  });
};

export const makeWordPracticeHistoryMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<IndexedDb.Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(WordPracticeHistoryContextSchema),
      events: {
        changeQuery: Schema.toStandardSchemaV1(
          Schema.Struct({
            query: Schema.String,
          })
        ),
        refresh: Schema.toStandardSchemaV1(Schema.Void),
      },
    },
    actorSources: {
      loadWordPracticeHistory: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(
            Schema.Array(WordPracticeHistorySummarySchema)
          ),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const batches = yield* store.listWordPracticeBatches();
              const submissions = yield* store.listWordPracticeSubmissions();
              const words = yield* store.listWordEntries();
              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const selectionCandidates =
                WordPracticeSelection.buildSelectionCandidates({
                  batches: batches.map((batch) => ({
                    batchNumber: batch.batchNumber,
                    startedAtMillis: _toEpochMillis({
                      dateTime: batch.startedAt,
                    }),
                    wordOrder: batch.wordOrder,
                  })),
                  now,
                  submissions: submissions.map((submission) => ({
                    result: _submissionResult({ submission }),
                    submittedAtMillis: _toEpochMillis({
                      dateTime: submission.submittedAt,
                    }),
                    wordText: submission.wordText,
                  })),
                  words: words.map((word) => ({ text: word.text })),
                });
              const summaries = words.map((word) => {
                const attempts = submissions
                  .filter((submission) => submission.wordText === word.text)
                  .sort(
                    (left, right) =>
                      _toEpochMillis({ dateTime: right.submittedAt }) -
                      _toEpochMillis({ dateTime: left.submittedAt })
                  )
                  .map((submission) => {
                    const batch =
                      submission.batchId === undefined
                        ? undefined
                        : batches.find(
                            (practiceBatch) =>
                              practiceBatch.id === submission.batchId
                          );
                    const result = _submissionResult({ submission });

                    return {
                      ...(batch === undefined ? {} : { batch }),
                      result,
                      submission,
                    };
                  });
                const latestAttempt = attempts[0];
                const correctCount = attempts.filter(
                  (attempt) => attempt.result === "correct"
                ).length;
                let correctStreak = 0;

                for (const attempt of attempts) {
                  if (attempt.result !== "correct") {
                    break;
                  }

                  correctStreak += 1;
                }

                let incorrectStreak = 0;

                for (const attempt of attempts) {
                  if (attempt.result !== "incorrect") {
                    break;
                  }

                  incorrectStreak += 1;
                }

                return {
                  accuracy: EffectArray.isReadonlyArrayNonEmpty(attempts)
                    ? Math.round((correctCount / attempts.length) * 100)
                    : 0,
                  attemptCount: attempts.length,
                  attempts,
                  correctCount,
                  correctStreak,
                  incorrectCount: attempts.length - correctCount,
                  incorrectStreak,
                  ...(latestAttempt === undefined
                    ? {}
                    : {
                        lastSubmittedAt: latestAttempt.submission.submittedAt,
                      }),
                  selectionWeight:
                    selectionCandidates.find(
                      (candidate) => candidate.word.text === word.text
                    )?.selectionWeight ?? 0,
                  word,
                };
              });

              return summaries.sort((left, right) => {
                const selectionWeightDifference =
                  right.selectionWeight - left.selectionWeight;

                if (selectionWeightDifference !== 0) {
                  return selectionWeightDifference;
                }

                return (
                  (right.lastSubmittedAt === undefined
                    ? 0
                    : _toEpochMillis({
                        dateTime: right.lastSubmittedAt,
                      })) -
                  (left.lastSubmittedAt === undefined
                    ? 0
                    : _toEpochMillis({
                        dateTime: left.lastSubmittedAt,
                      }))
                );
              });
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      matchingSummaries: [],
      query: "",
      summaries: [],
    },
    initial: "Loading",
    states: {
      Failure: {
        on: {
          changeQuery: ({ event }) => ({
            context: {
              query: event.query,
            },
          }),
          refresh: {
            target: "Loading",
          },
        },
      },
      Loading: {
        invoke: {
          src: "loadWordPracticeHistory",
          onDone: ({ context, event }) => {
            const summaries = event.output;

            return {
              target: "Ready",
              context: {
                matchingSummaries: _filterSummaries({
                  query: context.query,
                  summaries,
                }),
                message: undefined,
                summaries,
              },
            };
          },
          onError: ({ event }) => ({
            target: "Failure",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not load word practice history.",
            },
          }),
        },
      },
      Ready: {
        on: {
          changeQuery: ({ context, event }) => ({
            context: {
              matchingSummaries: _filterSummaries({
                query: event.query,
                summaries: context.summaries,
              }),
              query: event.query,
            },
          }),
          refresh: {
            target: "Loading",
          },
        },
      },
    },
  });
