import { IndexedDb } from "@jip/indexeddb";
import {
  FuriganaText,
  WordPracticeReview,
  WordPracticeSelection,
} from "@jip/services";
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
  isDue: Schema.Boolean,
  lastSubmittedAt: Schema.optionalKey(Schema.DateTimeUtcFromMillis),
  nextReviewAt: Schema.optionalKey(Schema.DateTimeUtcFromMillis),
  reviewLevel: Schema.Number,
  reviewProgress: Schema.Number,
  reviewProgressTarget: Schema.Number,
  selectionWeight: Schema.Number,
  word: IndexedDb.Domain.WordEntry,
});

const WordPracticeHistoryContextSchema = Schema.Struct({
  matchingSummaries: Schema.Array(WordPracticeHistorySummarySchema),
  message: Schema.optionalKey(Schema.String),
  query: Schema.String,
  summaries: Schema.Array(WordPracticeHistorySummarySchema),
  todayAttemptCount: Schema.Number,
});

const WordPracticeHistoryDataSchema = Schema.Struct({
  summaries: Schema.Array(WordPracticeHistorySummarySchema),
  todayAttemptCount: Schema.Number,
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

const _wordPracticeReviewSubmissions = ({
  submissions,
  wordText,
}: {
  readonly submissions: readonly (typeof IndexedDb.Domain.WordPracticeSubmission.Type)[];
  readonly wordText: string;
}) =>
  submissions
    .filter((submission) => submission.wordText === wordText)
    .map((submission) => ({
      result: _submissionResult({ submission }),
      submittedAtMillis: _toEpochMillis({
        dateTime: submission.submittedAt,
      }),
    }));

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
      `level ${summary.reviewLevel}`,
      summary.isDue ? "due" : "paused",
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
          output: Schema.toStandardSchemaV1(WordPracticeHistoryDataSchema),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const batches = yield* store.listWordPracticeBatches();
              const submissions = yield* store.listWordPracticeSubmissions();
              const words = yield* store.listWordEntries();
              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const storedStates = yield* store.listWordPracticeStates();
              const persistedStates = storedStates.map((state) => {
                const nextReviewAtMillis =
                  state.nextReviewAt === undefined
                    ? undefined
                    : _toEpochMillis({ dateTime: state.nextReviewAt });

                return {
                  level: state.level,
                  levelStartedAtMillis: _toEpochMillis({
                    dateTime: state.levelStartedAt,
                  }),
                  ...(nextReviewAtMillis === undefined
                    ? {}
                    : { nextReviewAtMillis }),
                  wordText: state.wordText,
                };
              });
              const derivedStates = words.flatMap((word) => {
                const persistedState = persistedStates.find(
                  (state) => state.wordText === word.text
                );

                if (persistedState !== undefined) {
                  return [];
                }

                const wordSubmissions = _wordPracticeReviewSubmissions({
                  submissions,
                  wordText: word.text,
                });

                if (!EffectArray.isReadonlyArrayNonEmpty(wordSubmissions)) {
                  return [];
                }

                return [
                  {
                    ...WordPracticeReview.stateFromSubmissions({
                      submissions: wordSubmissions,
                    }),
                    wordText: word.text,
                  },
                ];
              });
              const states = [...persistedStates, ...derivedStates];
              const today = new Date(now);
              const todayAttemptCount = submissions.filter((submission) => {
                const submittedAt = new Date(
                  _toEpochMillis({
                    dateTime: submission.submittedAt,
                  })
                );

                return (
                  today.getFullYear() === submittedAt.getFullYear() &&
                  today.getMonth() === submittedAt.getMonth() &&
                  today.getDate() === submittedAt.getDate()
                );
              }).length;
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
                  words: words.map((word) => {
                    const state = WordPracticeReview.reviewStateForWord({
                      now,
                      states,
                      wordText: word.text,
                    });

                    return {
                      ...(state.nextReviewAtMillis === undefined
                        ? {}
                        : { nextReviewAtMillis: state.nextReviewAtMillis }),
                      text: word.text,
                    };
                  }),
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

                const reviewState = WordPracticeReview.reviewStateForWord({
                  now,
                  states,
                  wordText: word.text,
                });
                const reviewSubmissions = _wordPracticeReviewSubmissions({
                  submissions,
                  wordText: word.text,
                });
                const reviewProgress =
                  WordPracticeReview.correctProgressAtLevel({
                    state: reviewState,
                    submissions: reviewSubmissions,
                  });
                const reviewProgressTarget = WordPracticeReview.reviewLevelRule(
                  {
                    level: reviewState.level,
                  }
                ).correctSubmissionTarget;
                const nextReviewAt =
                  reviewState.nextReviewAtMillis === undefined
                    ? undefined
                    : DateTime.makeUnsafe(reviewState.nextReviewAtMillis);

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
                  isDue: WordPracticeReview.isDue({
                    now,
                    state: reviewState,
                  }),
                  ...(latestAttempt === undefined
                    ? {}
                    : {
                        lastSubmittedAt: latestAttempt.submission.submittedAt,
                      }),
                  ...(nextReviewAt === undefined ? {} : { nextReviewAt }),
                  reviewLevel: reviewState.level,
                  reviewProgress,
                  reviewProgressTarget,
                  selectionWeight:
                    selectionCandidates.find(
                      (candidate) => candidate.word.text === word.text
                    )?.selectionWeight ?? 0,
                  word,
                };
              });

              return {
                summaries: summaries.sort((left, right) => {
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
                }),
                todayAttemptCount,
              };
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      matchingSummaries: [],
      query: "",
      summaries: [],
      todayAttemptCount: 0,
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
            const { summaries, todayAttemptCount } = event.output;

            return {
              target: "Ready",
              context: {
                matchingSummaries: _filterSummaries({
                  query: context.query,
                  summaries,
                }),
                message: undefined,
                summaries,
                todayAttemptCount,
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
