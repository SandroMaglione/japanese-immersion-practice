import { IndexedDb } from "@jip/indexeddb";
import { FuriganaText } from "@jip/services";
import { Array as EffectArray, DateTime, Effect, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const RecentAttemptLimit = 8;
const RecentAttemptDecay = 0.7;
const NewWordPriorityScore = 55;
const PracticeBatchSize = 25;

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
  attemptCount: Schema.Number,
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
  kanjiEntries: Schema.Array(IndexedDb.Domain.KanjiEntry),
  queue: Schema.Array(PracticeQueueItemSchema),
});

const PracticeOverviewContextSchema = Schema.Struct({
  batch: Schema.optionalKey(PracticeBatchSummarySchema),
  currentResponse: Schema.String,
  kanjiEntries: Schema.Array(IndexedDb.Domain.KanjiEntry),
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

const _submissionsForWord = ({
  submissions,
  wordText,
}: {
  readonly submissions: readonly WordPracticeSubmission[];
  readonly wordText: string;
}) => submissions.filter((submission) => submission.wordText === wordText);

const _correctStreak = ({
  submissions,
}: {
  readonly submissions: readonly WordPracticeSubmission[];
}) => {
  const sortedSubmissions = _sortSubmissionsBySubmittedAt({ submissions });
  let streak = 0;

  for (let index = sortedSubmissions.length - 1; index >= 0; index -= 1) {
    const submission = sortedSubmissions[index];

    if (submission === undefined) {
      return streak;
    }

    if (_submissionResult({ submission }) !== "correct") {
      return streak;
    }

    streak += 1;
  }

  return streak;
};

const _incorrectStreak = ({
  submissions,
}: {
  readonly submissions: readonly WordPracticeSubmission[];
}) => {
  const sortedSubmissions = _sortSubmissionsBySubmittedAt({ submissions });
  let streak = 0;

  for (let index = sortedSubmissions.length - 1; index >= 0; index -= 1) {
    const submission = sortedSubmissions[index];

    if (submission === undefined) {
      return streak;
    }

    if (_submissionResult({ submission }) !== "incorrect") {
      return streak;
    }

    streak += 1;
  }

  return streak;
};

const _priorityScore = ({
  submissions,
}: {
  readonly submissions: readonly WordPracticeSubmission[];
}) => {
  if (!EffectArray.isReadonlyArrayNonEmpty(submissions)) {
    return NewWordPriorityScore;
  }

  const sortedSubmissions = _sortSubmissionsBySubmittedAt({ submissions });
  const latestSubmission = sortedSubmissions[sortedSubmissions.length - 1];
  const lastAttemptWasIncorrect =
    latestSubmission !== undefined &&
    _submissionResult({ submission: latestSubmission }) === "incorrect";
  const recentSubmissions = sortedSubmissions
    .slice(-RecentAttemptLimit)
    .reverse();
  let missedWeight = 0;
  let totalWeight = 0;
  let weight = 1;

  for (const submission of recentSubmissions) {
    totalWeight += weight;

    if (_submissionResult({ submission }) === "incorrect") {
      missedWeight += weight;
    }

    weight *= RecentAttemptDecay;
  }

  const weightedRecentMissRate =
    totalWeight === 0 ? 0 : missedWeight / totalWeight;

  return (
    weightedRecentMissRate * 100 +
    _incorrectStreak({ submissions }) * 20 +
    (lastAttemptWasIncorrect ? 15 : 0) -
    _correctStreak({ submissions }) * 8
  );
};

const _buildPrioritizedWordOrder = ({
  submissions,
  words,
}: {
  readonly submissions: readonly WordPracticeSubmission[];
  readonly words: readonly WordEntry[];
}) =>
  words
    .map((word) => {
      const wordSubmissions = _submissionsForWord({
        submissions,
        wordText: word.text,
      });
      const sortedSubmissions = _sortSubmissionsBySubmittedAt({
        submissions: wordSubmissions,
      });
      const latestSubmission = sortedSubmissions[sortedSubmissions.length - 1];

      return {
        attemptCount: wordSubmissions.length,
        lastSubmittedAtMillis:
          latestSubmission === undefined
            ? undefined
            : _toEpochMillis({ dateTime: latestSubmission.submittedAt }),
        priorityScore: _priorityScore({ submissions: wordSubmissions }),
        word,
      };
    })
    .sort((left, right) => {
      const priorityDifference = right.priorityScore - left.priorityScore;

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const attemptDifference = left.attemptCount - right.attemptCount;

      if (attemptDifference !== 0) {
        return attemptDifference;
      }

      const leftLastSubmittedAtMillis =
        left.lastSubmittedAtMillis ??
        _toEpochMillis({ dateTime: left.word.createdAt });
      const rightLastSubmittedAtMillis =
        right.lastSubmittedAtMillis ??
        _toEpochMillis({ dateTime: right.word.createdAt });
      const lastSubmittedAtDifference =
        leftLastSubmittedAtMillis - rightLastSubmittedAtMillis;

      return lastSubmittedAtDifference !== 0
        ? lastSubmittedAtDifference
        : _normalizePracticeText({ text: left.word.text }).localeCompare(
            _normalizePracticeText({ text: right.word.text })
          );
    })
    .slice(0, PracticeBatchSize)
    .map((item) => item.word.text);

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
  const attemptedWordTexts = submissionsForBatch.map(
    (submission) => submission.wordText
  );

  return batch.wordOrder.flatMap((wordText, batchPosition) => {
    if (attemptedWordTexts.includes(wordText)) {
      return [];
    }

    const word = words.find((entry) => entry.text === wordText);

    if (word === undefined) {
      return [];
    }

    const submissionsForWord = _submissionsForWord({
      submissions,
      wordText,
    });

    return [
      {
        attemptCount: submissionsForWord.length,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        batchPosition,
        correctStreak: _correctStreak({ submissions: submissionsForWord }),
        incorrectStreak: _incorrectStreak({ submissions: submissionsForWord }),
        priorityScore: _priorityScore({ submissions: submissionsForWord }),
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
              const kanjiEntries = yield* store.listKanjiEntries();
              const words = yield* store.listWordEntries();
              const submissions = yield* store.listWordPracticeSubmissions();
              const batches = yield* store.listWordPracticeBatches();

              if (!EffectArray.isReadonlyArrayNonEmpty(words)) {
                return {
                  kanjiEntries,
                  queue: [],
                };
              }

              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const existingActiveBatch = _activePracticeBatch({ batches });
              const batch =
                existingActiveBatch === undefined
                  ? yield* _makePracticeBatch({
                      batchNumber: _nextBatchNumber({ batches }),
                      startedAt: now,
                      wordOrder: _buildPrioritizedWordOrder({
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
                const nextBatch = yield* _makePracticeBatch({
                  batchNumber: _nextBatchNumber({ batches }),
                  startedAt: now,
                  wordOrder: _buildPrioritizedWordOrder({
                    submissions,
                    words,
                  }),
                });

                yield* store.upsertWordPracticeBatch(completedBatch);
                yield* store.insertWordPracticeBatch(nextBatch);

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
                  kanjiEntries,
                  queue: nextQueue,
                };
              }

              return {
                batch: _buildBatchSummary({
                  batch,
                  queue,
                  words,
                }),
                kanjiEntries,
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
              const kanjiEntries = yield* store.listKanjiEntries();
              const words = yield* store.listWordEntries();
              const submissions = yield* store.listWordPracticeSubmissions();
              const batches = yield* store.listWordPracticeBatches();

              if (!EffectArray.isReadonlyArrayNonEmpty(words)) {
                return {
                  kanjiEntries,
                  queue: [],
                };
              }

              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const activeBatch = _activePracticeBatch({ batches });
              const nextBatch = yield* _makePracticeBatch({
                batchNumber: _nextBatchNumber({ batches }),
                startedAt: now,
                wordOrder: _buildPrioritizedWordOrder({
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
                kanjiEntries,
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
                const nextBatch = yield* _makePracticeBatch({
                  batchNumber: _nextBatchNumber({ batches }),
                  startedAt: submittedAt,
                  wordOrder: _buildPrioritizedWordOrder({
                    submissions,
                    words,
                  }),
                });
                const nextQueue = _buildPracticeQueue({
                  batch: nextBatch,
                  submissions,
                  words,
                });
                const completedBatchSubmissions = _batchSubmissions({
                  batch: completedBatch,
                  submissions,
                });
                const completedBatchCorrectCount =
                  completedBatchSubmissions.filter(
                    (completedBatchSubmission) =>
                      _submissionResult({
                        submission: completedBatchSubmission,
                      }) === "correct"
                  ).length;

                yield* store.saveWordPracticeSubmissionAndBatches({
                  batches: [completedBatch, nextBatch],
                  submission,
                });

                return {
                  batch: _buildBatchSummary({
                    batch: nextBatch,
                    queue: nextQueue,
                    words,
                  }),
                  batchCompleted: {
                    batchNumber: completedBatch.batchNumber,
                    correctCount: completedBatchCorrectCount,
                    incorrectCount:
                      completedBatchSubmissions.length -
                      completedBatchCorrectCount,
                    totalCount: _batchTotalCount({
                      batch: completedBatch,
                      words,
                    }),
                  },
                  batchNumber: batch.batchNumber,
                  isCorrect,
                  queue: nextQueue,
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
      kanjiEntries: [],
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
              batch: event.output.batch,
              kanjiEntries: event.output.kanjiEntries,
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
              currentResponse: "",
              kanjiEntries: event.output.kanjiEntries,
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
          refresh: {
            target: "RefreshingBatch",
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
