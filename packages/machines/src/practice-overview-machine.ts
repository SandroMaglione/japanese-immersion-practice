import { IndexedDb } from "@jip/indexeddb";
import {
  FuriganaText,
  WordPracticeReview,
  WordPracticeSelection,
} from "@jip/services";
import { Array as EffectArray, DateTime, Effect, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const PracticeBatchSummarySchema = Schema.Struct({
  id: IndexedDb.Domain.WordPracticeBatchId,
  batchNumber: Schema.Number,
  completedCount: Schema.Number,
  totalCount: Schema.Number,
});

const CompletedPracticeBatchSummarySchema = Schema.Struct({
  batchNumber: Schema.Number,
  correctCount: Schema.Number,
  incorrectCount: Schema.Number,
  totalCount: Schema.Number,
});

const PracticeQueueItemSchema = Schema.Struct({
  batchId: IndexedDb.Domain.WordPracticeBatchId,
  batchNumber: Schema.Number,
  batchPosition: Schema.Number,
  correctStreak: Schema.Number,
  incorrectStreak: Schema.Number,
  priorityScore: Schema.Number,
  reviewLevel: Schema.Number,
  reviewProgress: Schema.Number,
  reviewProgressTarget: Schema.Number,
  word: IndexedDb.Domain.WordEntry,
});

const PracticeSubmissionResultSchema = Schema.Struct({
  batchCompleted: Schema.optionalKey(CompletedPracticeBatchSummarySchema),
  batchNumber: Schema.Number,
  isCorrect: Schema.Boolean,
  nextReviewAt: Schema.optionalKey(Schema.DateTimeUtcFromMillis),
  previousReviewLevel: Schema.Number,
  reviewLevel: Schema.Number,
  reviewProgress: Schema.Number,
  reviewProgressTarget: Schema.Number,
  wordDescription: Schema.optionalKey(Schema.String),
  wordText: Schema.String,
  wordTranslation: Schema.String,
});

const PracticeSubmitResultSchema = Schema.Struct({
  batch: PracticeBatchSummarySchema,
  batchCompleted: Schema.optionalKey(CompletedPracticeBatchSummarySchema),
  batchNumber: Schema.Number,
  isCorrect: Schema.Boolean,
  nextReviewAt: Schema.optionalKey(Schema.DateTimeUtcFromMillis),
  previousReviewLevel: Schema.Number,
  queue: Schema.Array(PracticeQueueItemSchema),
  reviewLevel: Schema.Number,
  reviewProgress: Schema.Number,
  reviewProgressTarget: Schema.Number,
  wordDescription: Schema.optionalKey(Schema.String),
  wordText: Schema.String,
  wordTranslation: Schema.String,
});

const PracticeSessionDataSchema = Schema.Struct({
  batch: Schema.optionalKey(PracticeBatchSummarySchema),
  completedBatch: Schema.optionalKey(CompletedPracticeBatchSummarySchema),
  nextReviewAt: Schema.optionalKey(Schema.DateTimeUtcFromMillis),
  queue: Schema.Array(PracticeQueueItemSchema),
});

const PracticeOverviewContextSchema = Schema.Struct({
  batch: Schema.optionalKey(PracticeBatchSummarySchema),
  completedBatch: Schema.optionalKey(CompletedPracticeBatchSummarySchema),
  currentResponse: Schema.String,
  lastResult: Schema.optionalKey(PracticeSubmissionResultSchema),
  message: Schema.optionalKey(Schema.String),
  nextReviewAt: Schema.optionalKey(Schema.DateTimeUtcFromMillis),
  queue: Schema.Array(PracticeQueueItemSchema),
});

const SubmitPracticeInputSchema = Schema.Struct({
  batchId: Schema.String,
  batchPosition: Schema.Number,
  submittedText: Schema.String,
  wordText: Schema.String,
});

type WordEntry = typeof IndexedDb.Domain.WordEntry.Type;
type WordPracticeBatch = typeof IndexedDb.Domain.WordPracticeBatch.Type;
type WordPracticeSubmission =
  typeof IndexedDb.Domain.WordPracticeSubmission.Type;

const _toEpochMillis = ({ dateTime }: { readonly dateTime: DateTime.Utc }) =>
  DateTime.toEpochMillis(dateTime);

const _normalizePracticeText = ({ text }: { readonly text: string }) =>
  FuriganaText.normalizePlainText({ text });

const _isCorrectPracticeAnswer = ({
  submittedText,
  wordText,
}: {
  readonly submittedText: string;
  readonly wordText: string;
}) =>
  _normalizePracticeText({ text: submittedText }) ===
  _normalizePracticeText({ text: wordText });

const _submissionResult = ({
  submission,
}: {
  readonly submission: WordPracticeSubmission;
}): IndexedDb.Domain.WordPracticeResult =>
  submission.result ??
  (_isCorrectPracticeAnswer({
    submittedText: submission.submittedText,
    wordText: submission.wordText,
  })
    ? "correct"
    : "incorrect");

const _toWordPracticeSelectionSubmission = ({
  submission,
}: {
  readonly submission: WordPracticeSubmission;
}) => ({
  result: _submissionResult({ submission }),
  submittedAtMillis: _toEpochMillis({ dateTime: submission.submittedAt }),
  wordText: submission.wordText,
});

const _toWordPracticeReviewSubmission = ({
  submission,
}: {
  readonly submission: WordPracticeSubmission;
}): WordPracticeReview.WordPracticeReviewSubmission => ({
  result: _submissionResult({ submission }),
  submittedAtMillis: _toEpochMillis({ dateTime: submission.submittedAt }),
});

const _wordPracticeReviewSubmissions = ({
  submissions,
  wordText,
}: {
  readonly submissions: readonly WordPracticeSubmission[];
  readonly wordText: string;
}) =>
  submissions
    .filter((submission) => submission.wordText === wordText)
    .map((submission) => _toWordPracticeReviewSubmission({ submission }));

const _buildWordPracticeReviewStates = ({
  states,
  submissions,
  words,
}: {
  readonly states: readonly (typeof IndexedDb.Domain.WordPracticeState.Type)[];
  readonly submissions: readonly WordPracticeSubmission[];
  readonly words: readonly WordEntry[];
}) => {
  const persistedStates = states.map((state) => {
    const nextReviewAtMillis =
      state.nextReviewAt === undefined
        ? undefined
        : _toEpochMillis({ dateTime: state.nextReviewAt });

    return {
      level: state.level,
      levelStartedAtMillis: _toEpochMillis({
        dateTime: state.levelStartedAt,
      }),
      ...(nextReviewAtMillis === undefined ? {} : { nextReviewAtMillis }),
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

  return [...persistedStates, ...derivedStates];
};

const _nextReviewAtForWords = ({
  now,
  states,
  words,
}: {
  readonly now: number;
  readonly states: readonly WordPracticeReview.WordPracticeReviewWordState[];
  readonly words: readonly WordEntry[];
}) => {
  const nextReviewAtMillis = WordPracticeReview.nextReviewAtMillisForWordTexts({
    now,
    states,
    wordTexts: words.map((word) => word.text),
  });

  return nextReviewAtMillis === undefined
    ? undefined
    : DateTime.makeUnsafe(nextReviewAtMillis);
};

const _buildWordPracticeWordOrder = ({
  batches,
  now,
  states,
  submissions,
  words,
}: {
  readonly batches: readonly WordPracticeBatch[];
  readonly now: number;
  readonly states: readonly WordPracticeReview.WordPracticeReviewWordState[];
  readonly submissions: readonly WordPracticeSubmission[];
  readonly words: readonly WordEntry[];
}) =>
  WordPracticeSelection.buildWordOrder({
    batches: batches.map((batch) => ({
      batchNumber: batch.batchNumber,
      startedAtMillis: _toEpochMillis({ dateTime: batch.startedAt }),
      wordOrder: batch.wordOrder,
    })),
    now,
    submissions: submissions.map((submission) =>
      _toWordPracticeSelectionSubmission({ submission })
    ),
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

const _makePracticeBatch = ({
  batchNumber,
  startedAt,
  wordOrder,
}: {
  readonly batchNumber: number;
  readonly startedAt: number;
  readonly wordOrder: readonly string[];
}) =>
  Schema.decodeEffect(IndexedDb.Domain.WordPracticeBatch)({
    batchNumber,
    id: crypto.randomUUID(),
    startedAt,
    wordOrder,
  });

const _nextBatchNumber = ({
  batches,
}: {
  readonly batches: readonly WordPracticeBatch[];
}) =>
  batches.reduce(
    (highestBatchNumber, batch) =>
      Math.max(highestBatchNumber, batch.batchNumber),
    0
  ) + 1;

const _activePracticeBatch = ({
  batches,
}: {
  readonly batches: readonly WordPracticeBatch[];
}) =>
  batches
    .filter((batch) => batch.completedAt === undefined)
    .sort((left, right) => right.batchNumber - left.batchNumber)[0];

const _completePracticeBatch = ({
  batch,
  completedAt,
}: {
  readonly batch: WordPracticeBatch;
  readonly completedAt: number;
}) =>
  Schema.decodeEffect(IndexedDb.Domain.WordPracticeBatch)({
    ...batch,
    completedAt,
    startedAt: _toEpochMillis({ dateTime: batch.startedAt }),
  });

const _batchSubmissions = ({
  batch,
  submissions,
}: {
  readonly batch: WordPracticeBatch;
  readonly submissions: readonly WordPracticeSubmission[];
}) => submissions.filter((submission) => submission.batchId === batch.id);

const _buildPracticeQueue = ({
  batch,
  now,
  states,
  submissions,
  words,
}: {
  readonly batch: WordPracticeBatch;
  readonly now: number;
  readonly states: readonly WordPracticeReview.WordPracticeReviewWordState[];
  readonly submissions: readonly WordPracticeSubmission[];
  readonly words: readonly WordEntry[];
}) => {
  const submissionsForBatch = _batchSubmissions({ batch, submissions });
  const submittedWordTexts = submissionsForBatch.map(
    (submission) => submission.wordText
  );

  return batch.wordOrder.flatMap((wordText, batchPosition) => {
    if (submittedWordTexts.includes(wordText)) {
      return [];
    }

    const word = words.find((entry) => entry.text === wordText);

    if (word === undefined) {
      return [];
    }

    const submissionsForWord = submissions
      .filter((submission) => submission.wordText === wordText)
      .map((submission) => _toWordPracticeSelectionSubmission({ submission }));
    const reviewSubmissions = submissions
      .filter((submission) => submission.wordText === wordText)
      .map((submission) => _toWordPracticeReviewSubmission({ submission }));
    const reviewState = WordPracticeReview.reviewStateForWord({
      now,
      states,
      wordText,
    });
    const reviewProgress = WordPracticeReview.correctProgressAtLevel({
      state: reviewState,
      submissions: reviewSubmissions,
    });
    const reviewProgressTarget = WordPracticeReview.reviewLevelRule({
      level: reviewState.level,
    }).correctSubmissionTarget;

    return [
      {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        batchPosition,
        correctStreak: WordPracticeSelection.correctStreak({
          submissions: submissionsForWord,
        }),
        incorrectStreak: WordPracticeSelection.incorrectStreak({
          submissions: submissionsForWord,
        }),
        priorityScore: WordPracticeSelection.priorityScore({
          submissions: submissionsForWord,
        }),
        reviewLevel: reviewState.level,
        reviewProgress,
        reviewProgressTarget,
        word,
      },
    ];
  });
};

const _batchTotalCount = ({
  batch,
  words,
}: {
  readonly batch: WordPracticeBatch;
  readonly words: readonly WordEntry[];
}) =>
  batch.wordOrder.filter((wordText) =>
    words.some((word) => word.text === wordText)
  ).length;

const _buildBatchSummary = ({
  batch,
  queue,
  words,
}: {
  readonly batch: WordPracticeBatch;
  readonly queue: readonly (typeof PracticeQueueItemSchema.Type)[];
  readonly words: readonly WordEntry[];
}) => {
  const totalCount = _batchTotalCount({ batch, words });

  return {
    batchNumber: batch.batchNumber,
    completedCount: totalCount - queue.length,
    id: batch.id,
    totalCount,
  };
};

const _buildCompletedBatchSummary = ({
  batch,
  submissions,
  words,
}: {
  readonly batch: WordPracticeBatch;
  readonly submissions: readonly WordPracticeSubmission[];
  readonly words: readonly WordEntry[];
}) => {
  const completedBatchSubmissions = _batchSubmissions({
    batch,
    submissions,
  });
  const correctCount = completedBatchSubmissions.filter(
    (completedBatchSubmission) =>
      _submissionResult({
        submission: completedBatchSubmission,
      }) === "correct"
  ).length;

  return {
    batchNumber: batch.batchNumber,
    correctCount,
    incorrectCount: completedBatchSubmissions.length - correctCount,
    totalCount: _batchTotalCount({
      batch,
      words,
    }),
  };
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
        startNextBatch: Schema.toStandardSchemaV1(Schema.Void),
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
              const words = yield* store.listWordEntries();
              const submissions = yield* store.listWordPracticeSubmissions();
              const batches = yield* store.listWordPracticeBatches();

              if (!EffectArray.isReadonlyArrayNonEmpty(words)) {
                return {
                  queue: [],
                };
              }

              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const storedStates = yield* store.listWordPracticeStates();
              const states = _buildWordPracticeReviewStates({
                states: storedStates,
                submissions,
                words,
              });
              const existingActiveBatch = _activePracticeBatch({ batches });

              if (existingActiveBatch === undefined) {
                const latestCompletedBatch = batches.find(
                  (batch) => batch.completedAt !== undefined
                );

                if (latestCompletedBatch !== undefined) {
                  return {
                    batch: _buildBatchSummary({
                      batch: latestCompletedBatch,
                      queue: [],
                      words,
                    }),
                    completedBatch: _buildCompletedBatchSummary({
                      batch: latestCompletedBatch,
                      submissions,
                      words,
                    }),
                    queue: [],
                  };
                }
              }

              const batch =
                existingActiveBatch === undefined
                  ? yield* Effect.gen(function* () {
                      const wordOrder = _buildWordPracticeWordOrder({
                        batches,
                        now,
                        states,
                        submissions,
                        words,
                      });

                      if (!EffectArray.isReadonlyArrayNonEmpty(wordOrder)) {
                        return undefined;
                      }

                      return yield* _makePracticeBatch({
                        batchNumber: _nextBatchNumber({ batches }),
                        startedAt: now,
                        wordOrder,
                      });
                    })
                  : existingActiveBatch;

              if (batch === undefined) {
                return {
                  nextReviewAt: _nextReviewAtForWords({
                    now,
                    states,
                    words,
                  }),
                  queue: [],
                };
              }

              if (existingActiveBatch === undefined) {
                yield* store.insertWordPracticeBatch(batch);
              }

              const queue = _buildPracticeQueue({
                batch,
                now,
                states,
                submissions,
                words,
              });

              if (!EffectArray.isReadonlyArrayNonEmpty(queue)) {
                const completedBatch = yield* _completePracticeBatch({
                  batch,
                  completedAt: now,
                });

                yield* store.upsertWordPracticeBatch(completedBatch);

                return {
                  batch: _buildBatchSummary({
                    batch: completedBatch,
                    queue: [],
                    words,
                  }),
                  completedBatch: _buildCompletedBatchSummary({
                    batch: completedBatch,
                    submissions,
                    words,
                  }),
                  nextReviewAt: _nextReviewAtForWords({
                    now,
                    states,
                    words,
                  }),
                  queue: [],
                };
              }

              return {
                batch: _buildBatchSummary({
                  batch,
                  queue,
                  words,
                }),
                queue,
              };
            })
          ),
      }),
      refreshPracticeBatch: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(PracticeSessionDataSchema),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const words = yield* store.listWordEntries();
              const submissions = yield* store.listWordPracticeSubmissions();
              const batches = yield* store.listWordPracticeBatches();

              if (!EffectArray.isReadonlyArrayNonEmpty(words)) {
                return {
                  queue: [],
                };
              }

              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const storedStates = yield* store.listWordPracticeStates();
              const states = _buildWordPracticeReviewStates({
                states: storedStates,
                submissions,
                words,
              });
              const activeBatch = _activePracticeBatch({ batches });
              const wordOrder = _buildWordPracticeWordOrder({
                batches,
                now,
                states,
                submissions,
                words,
              });

              if (!EffectArray.isReadonlyArrayNonEmpty(wordOrder)) {
                if (activeBatch !== undefined) {
                  const completedBatch = yield* _completePracticeBatch({
                    batch: activeBatch,
                    completedAt: now,
                  });

                  yield* store.upsertWordPracticeBatch(completedBatch);
                }

                return {
                  nextReviewAt: _nextReviewAtForWords({
                    now,
                    states,
                    words,
                  }),
                  queue: [],
                };
              }

              const nextBatch = yield* _makePracticeBatch({
                batchNumber: _nextBatchNumber({ batches }),
                startedAt: now,
                wordOrder,
              });

              if (activeBatch === undefined) {
                yield* store.insertWordPracticeBatch(nextBatch);
              } else {
                const completedBatch = yield* _completePracticeBatch({
                  batch: activeBatch,
                  completedAt: now,
                });

                yield* store.upsertWordPracticeBatch(completedBatch);
                yield* store.insertWordPracticeBatch(nextBatch);
              }

              const nextQueue = _buildPracticeQueue({
                batch: nextBatch,
                now,
                states,
                submissions,
                words,
              });

              return {
                batch: _buildBatchSummary({
                  batch: nextBatch,
                  queue: nextQueue,
                  words,
                }),
                queue: nextQueue,
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
              const batchId = input.batchId.trim();

              if (wordText === "" || batchId === "") {
                return yield* Effect.fail(
                  new Error("Could not find a word to practice.")
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

              const batches = yield* store.listWordPracticeBatches();
              const batch = batches.find(
                (practiceBatch) => practiceBatch.id === batchId
              );

              if (batch === undefined) {
                return yield* Effect.fail(
                  new Error("Could not find the current practice batch.")
                );
              }

              const submittedAt = DateTime.toEpochMillis(yield* DateTime.now);
              const isCorrect = _isCorrectPracticeAnswer({
                submittedText,
                wordText: word.text,
              });
              const result = isCorrect ? "correct" : "incorrect";
              const previousSubmissions =
                yield* store.listWordPracticeSubmissions();
              const storedStates = yield* store.listWordPracticeStates();
              const states = _buildWordPracticeReviewStates({
                states: storedStates,
                submissions: previousSubmissions,
                words,
              });
              const previousReviewState = WordPracticeReview.reviewStateForWord(
                {
                  now: submittedAt,
                  states,
                  wordText: word.text,
                }
              );
              const wordSubmissions = _wordPracticeReviewSubmissions({
                submissions: previousSubmissions,
                wordText: word.text,
              });
              const nextReviewState = WordPracticeReview.applyPracticeResult({
                now: submittedAt,
                result,
                state: previousReviewState,
                submissions: wordSubmissions,
              });
              const nextReviewWordState = {
                ...nextReviewState,
                wordText: word.text,
              };
              const wordPracticeState = yield* Schema.decodeEffect(
                IndexedDb.Domain.WordPracticeState
              )({
                level: nextReviewWordState.level,
                levelStartedAt: nextReviewWordState.levelStartedAtMillis,
                ...(nextReviewWordState.nextReviewAtMillis === undefined
                  ? {}
                  : { nextReviewAt: nextReviewWordState.nextReviewAtMillis }),
                updatedAt: submittedAt,
                wordText: nextReviewWordState.wordText,
              });
              const submission = yield* Schema.decodeEffect(
                IndexedDb.Domain.WordPracticeSubmission
              )({
                batchId: batch.id,
                batchPosition: input.batchPosition,
                id: crypto.randomUUID(),
                ...(nextReviewState.nextReviewAtMillis === undefined
                  ? {}
                  : { nextReviewAt: nextReviewState.nextReviewAtMillis }),
                result,
                submittedAt,
                submittedText,
                wordText: word.text,
              });
              const submissions = [...previousSubmissions, submission];
              const statesAfterSubmission = [
                ...states.filter((state) => state.wordText !== word.text),
                nextReviewWordState,
              ];
              const reviewSubmissionsAfterSubmission = submissions
                .filter(
                  (nextSubmission) => nextSubmission.wordText === word.text
                )
                .map((nextSubmission) =>
                  _toWordPracticeReviewSubmission({
                    submission: nextSubmission,
                  })
                );
              const reviewProgress = WordPracticeReview.correctProgressAtLevel({
                state: nextReviewState,
                submissions: reviewSubmissionsAfterSubmission,
              });
              const reviewProgressTarget = WordPracticeReview.reviewLevelRule({
                level: nextReviewState.level,
              }).correctSubmissionTarget;
              const queueAfterSubmission = _buildPracticeQueue({
                batch,
                now: submittedAt,
                states: statesAfterSubmission,
                submissions,
                words,
              });

              if (!EffectArray.isReadonlyArrayNonEmpty(queueAfterSubmission)) {
                const completedBatch = yield* _completePracticeBatch({
                  batch,
                  completedAt: submittedAt,
                });
                const completedBatchSummary = _buildCompletedBatchSummary({
                  batch: completedBatch,
                  submissions,
                  words,
                });

                yield* store.saveWordPracticeSubmissionStateAndBatches({
                  batches: [completedBatch],
                  state: wordPracticeState,
                  submission,
                });

                return {
                  batch: _buildBatchSummary({
                    batch: completedBatch,
                    queue: [],
                    words,
                  }),
                  batchCompleted: completedBatchSummary,
                  batchNumber: batch.batchNumber,
                  isCorrect,
                  ...(wordPracticeState.nextReviewAt === undefined
                    ? {}
                    : { nextReviewAt: wordPracticeState.nextReviewAt }),
                  previousReviewLevel: previousReviewState.level,
                  queue: [],
                  reviewLevel: nextReviewState.level,
                  reviewProgress,
                  reviewProgressTarget,
                  ...(word.description === undefined
                    ? {}
                    : { wordDescription: word.description }),
                  wordText: word.text,
                  wordTranslation: word.translation,
                };
              }

              yield* store.saveWordPracticeSubmissionStateAndBatches({
                batches: [],
                state: wordPracticeState,
                submission,
              });

              return {
                batch: _buildBatchSummary({
                  batch,
                  queue: queueAfterSubmission,
                  words,
                }),
                batchNumber: batch.batchNumber,
                isCorrect,
                ...(wordPracticeState.nextReviewAt === undefined
                  ? {}
                  : { nextReviewAt: wordPracticeState.nextReviewAt }),
                previousReviewLevel: previousReviewState.level,
                queue: queueAfterSubmission,
                reviewLevel: nextReviewState.level,
                reviewProgress,
                reviewProgressTarget,
                ...(word.description === undefined
                  ? {}
                  : { wordDescription: word.description }),
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
            target:
              event.output.completedBatch === undefined
                ? "Ready"
                : "BatchFinished",
            context: {
              batch: event.output.batch,
              completedBatch: event.output.completedBatch,
              lastResult: undefined,
              message: undefined,
              nextReviewAt: event.output.nextReviewAt,
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
            target: "RefreshingBatch",
          },
          submit: {
            target: "Submitting",
          },
        },
      },
      RefreshingBatch: {
        invoke: {
          src: "refreshPracticeBatch",
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              batch: event.output.batch,
              completedBatch: undefined,
              currentResponse: "",
              lastResult: undefined,
              message: undefined,
              nextReviewAt: event.output.nextReviewAt,
              queue: event.output.queue,
            },
          }),
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not refresh the practice batch.",
            },
          }),
        },
      },
      Submitting: {
        invoke: {
          src: "submitPracticeAnswer",
          input: ({ context }) => ({
            batchId: context.queue[0]?.batchId ?? "",
            batchPosition: context.queue[0]?.batchPosition ?? 0,
            submittedText: context.currentResponse,
            wordText: context.queue[0]?.word.text ?? "",
          }),
          onDone: ({ event }) => ({
            target: "Revealed",
            context: {
              batch: event.output.batch,
              completedBatch: event.output.batchCompleted,
              currentResponse: "",
              lastResult: {
                batchCompleted: event.output.batchCompleted,
                batchNumber: event.output.batchNumber,
                isCorrect: event.output.isCorrect,
                nextReviewAt: event.output.nextReviewAt,
                previousReviewLevel: event.output.previousReviewLevel,
                reviewLevel: event.output.reviewLevel,
                reviewProgress: event.output.reviewProgress,
                reviewProgressTarget: event.output.reviewProgressTarget,
                wordDescription: event.output.wordDescription,
                wordText: event.output.wordText,
                wordTranslation: event.output.wordTranslation,
              },
              message: undefined,
              nextReviewAt: undefined,
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
          startNextBatch: {
            target: "StartingBatch",
          },
          refresh: {
            target: "RefreshingBatch",
          },
          submit: ({ context }) =>
            context.completedBatch === undefined
              ? {
                  target: "Ready",
                  context: {
                    lastResult: undefined,
                    message: undefined,
                    nextReviewAt: undefined,
                  },
                }
              : {
                  target: "BatchFinished",
                  context: {
                    message: undefined,
                  },
                },
        },
      },
      BatchFinished: {
        on: {
          refresh: {
            target: "StartingBatch",
          },
          startNextBatch: {
            target: "StartingBatch",
          },
        },
      },
      StartingBatch: {
        invoke: {
          src: "refreshPracticeBatch",
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              batch: event.output.batch,
              completedBatch: undefined,
              currentResponse: "",
              lastResult: undefined,
              message: undefined,
              nextReviewAt: event.output.nextReviewAt,
              queue: event.output.queue,
            },
          }),
          onError: ({ event }) => ({
            target: "BatchFinished",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not start the next practice batch.",
            },
          }),
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
