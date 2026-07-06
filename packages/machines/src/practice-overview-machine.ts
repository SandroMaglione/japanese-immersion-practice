import { IndexedDb } from "@jip/indexeddb";
import { FuriganaText, WordPracticeSelection } from "@jip/services";
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
  word: IndexedDb.Domain.WordEntry,
});

const PracticeSubmissionResultSchema = Schema.Struct({
  batchCompleted: Schema.optionalKey(CompletedPracticeBatchSummarySchema),
  batchNumber: Schema.Number,
  isCorrect: Schema.Boolean,
  wordDescription: Schema.optionalKey(Schema.String),
  wordText: Schema.String,
  wordTranslation: Schema.String,
});

const PracticeSubmitResultSchema = Schema.Struct({
  batch: PracticeBatchSummarySchema,
  batchCompleted: Schema.optionalKey(CompletedPracticeBatchSummarySchema),
  batchNumber: Schema.Number,
  isCorrect: Schema.Boolean,
  queue: Schema.Array(PracticeQueueItemSchema),
  wordDescription: Schema.optionalKey(Schema.String),
  wordText: Schema.String,
  wordTranslation: Schema.String,
});

const PracticeSessionDataSchema = Schema.Struct({
  batch: Schema.optionalKey(PracticeBatchSummarySchema),
  completedBatch: Schema.optionalKey(CompletedPracticeBatchSummarySchema),
  queue: Schema.Array(PracticeQueueItemSchema),
});

const PracticeOverviewContextSchema = Schema.Struct({
  batch: Schema.optionalKey(PracticeBatchSummarySchema),
  completedBatch: Schema.optionalKey(CompletedPracticeBatchSummarySchema),
  currentResponse: Schema.String,
  lastResult: Schema.optionalKey(PracticeSubmissionResultSchema),
  message: Schema.optionalKey(Schema.String),
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

const _buildWordPracticeWordOrder = ({
  batches,
  now,
  submissions,
  words,
}: {
  readonly batches: readonly WordPracticeBatch[];
  readonly now: number;
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
    words: words.map((word) => ({ text: word.text })),
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
  submissions,
  words,
}: {
  readonly batch: WordPracticeBatch;
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
                  ? yield* _makePracticeBatch({
                      batchNumber: _nextBatchNumber({ batches }),
                      startedAt: now,
                      wordOrder: _buildWordPracticeWordOrder({
                        batches,
                        now,
                        submissions,
                        words,
                      }),
                    })
                  : existingActiveBatch;

              if (existingActiveBatch === undefined) {
                yield* store.insertWordPracticeBatch(batch);
              }

              const queue = _buildPracticeQueue({
                batch,
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
              const activeBatch = _activePracticeBatch({ batches });
              const nextBatch = yield* _makePracticeBatch({
                batchNumber: _nextBatchNumber({ batches }),
                startedAt: now,
                wordOrder: _buildWordPracticeWordOrder({
                  batches,
                  now,
                  submissions,
                  words,
                }),
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
              const submission = yield* Schema.decodeEffect(
                IndexedDb.Domain.WordPracticeSubmission
              )({
                batchId: batch.id,
                batchPosition: input.batchPosition,
                id: crypto.randomUUID(),
                result: isCorrect ? "correct" : "incorrect",
                submittedAt,
                submittedText,
                wordText: word.text,
              });
              const previousSubmissions =
                yield* store.listWordPracticeSubmissions();
              const submissions = [...previousSubmissions, submission];
              const queueAfterSubmission = _buildPracticeQueue({
                batch,
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

                yield* store.saveWordPracticeSubmissionAndBatches({
                  batches: [completedBatch],
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
                  queue: [],
                  ...(word.description === undefined
                    ? {}
                    : { wordDescription: word.description }),
                  wordText: word.text,
                  wordTranslation: word.translation,
                };
              }

              yield* store.saveWordPracticeSubmissionAndBatches({
                batches: [],
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
                queue: queueAfterSubmission,
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
                wordDescription: event.output.wordDescription,
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
