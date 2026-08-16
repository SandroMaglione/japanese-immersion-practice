import { Domain, Store } from "@jip/data";
import {
  WordMemoryScheduler,
  WordPracticePresentation,
  WordPracticeStage,
  WordSessionSelection,
} from "@jip/services";
import { DateTime, Effect, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const SessionMissSchema = Schema.Struct({
  count: Schema.Number,
  wordId: Schema.String,
});

const SessionSelectionStateSchema = Schema.Struct({
  consecutiveLearningSelections: Schema.Number,
  dueReviewSelectionsSinceForced: Schema.Number,
  misses: Schema.Array(SessionMissSchema),
  newWordCredit: Schema.Number,
  recentWordIds: Schema.Array(Schema.String),
});

const PracticeItemSchema = Schema.Struct({
  example: Schema.optionalKey(Domain.WordPracticeExample),
  kind: Domain.WordPracticeKind,
  source: Domain.WordPracticeSource,
  state: Domain.WordMemoryState,
  word: Domain.Word,
});

const PracticeSessionStatsSchema = Schema.Struct({
  attemptCount: Schema.Number,
  correctCount: Schema.Number,
  extraCount: Schema.Number,
  newCount: Schema.Number,
  scheduledCount: Schema.Number,
});

const PracticeSessionDataSchema = Schema.Struct({
  activeWordCount: Schema.Number,
  dueReviewCount: Schema.Number,
  item: Schema.optionalKey(PracticeItemSchema),
  selectionState: SessionSelectionStateSchema,
  sessionId: Domain.WordPracticeSessionId,
});

const PracticeSubmitResultSchema = Schema.Struct({
  dueReviewCount: Schema.Number,
  message: Schema.optionalKey(Schema.String),
  nextItem: Schema.optionalKey(PracticeItemSchema),
  selectionState: SessionSelectionStateSchema,
  stats: PracticeSessionStatsSchema,
});

const PracticeOverviewContextSchema = Schema.Struct({
  activeWordCount: Schema.Number,
  answerVisible: Schema.Boolean,
  rating: Schema.optionalKey(Domain.WordPracticeRating),
  currentItem: Schema.optionalKey(PracticeItemSchema),
  dueReviewCount: Schema.Number,
  message: Schema.optionalKey(Schema.String),
  selectionState: SessionSelectionStateSchema,
  sessionId: Schema.optionalKey(Domain.WordPracticeSessionId),
  stats: PracticeSessionStatsSchema,
});

const SubmitPracticeInputSchema = Schema.Struct({
  rating: Schema.optionalKey(Domain.WordPracticeRating),
  currentItem: Schema.optionalKey(PracticeItemSchema),
  dueReviewCount: Schema.Number,
  selectionState: SessionSelectionStateSchema,
  sessionId: Schema.optionalKey(Domain.WordPracticeSessionId),
  stats: PracticeSessionStatsSchema,
});

type MemoryState = typeof Domain.WordMemoryState.Type;
type SessionSelectionState = typeof SessionSelectionStateSchema.Type;

const InitialSelectionState = {
  consecutiveLearningSelections: 0,
  dueReviewSelectionsSinceForced: 0,
  misses: [],
  newWordCredit: 1,
  recentWordIds: [],
} as const satisfies SessionSelectionState;

const InitialStats = {
  attemptCount: 0,
  correctCount: 0,
  extraCount: 0,
  newCount: 0,
  scheduledCount: 0,
} as const;

const _toEpochMillis = ({ dateTime }: { readonly dateTime: DateTime.Utc }) =>
  DateTime.toEpochMillis(dateTime);

const _memoryCardFromState = ({
  state,
}: {
  readonly state: MemoryState;
}): WordMemoryScheduler.WordMemoryCard => ({
  difficulty: state.difficulty,
  dueAtMillis: _toEpochMillis({ dateTime: state.dueAt }),
  elapsedDays: state.elapsedDays,
  lapses: state.lapses,
  ...(state.lastReviewAt === undefined
    ? {}
    : {
        lastReviewAtMillis: _toEpochMillis({ dateTime: state.lastReviewAt }),
      }),
  learningSteps: state.learningSteps,
  phase: state.phase,
  repetitions: state.repetitions,
  scheduledDays: state.scheduledDays,
  stability: state.stability,
});

const _selectionCandidateFromState = ({
  now,
  state,
}: {
  readonly now: number;
  readonly state: MemoryState;
}): WordSessionSelection.WordSessionSelectionCandidate => {
  const card = _memoryCardFromState({ state });

  return {
    difficulty: state.difficulty,
    dueAtMillis: card.dueAtMillis,
    lastPracticedAtMillis: _toEpochMillis({
      dateTime: state.lastPracticedAt,
    }),
    phase: state.phase,
    retrievability: WordMemoryScheduler.retrievability({ card, now }),
    scheduledDays: state.scheduledDays,
    wordId: state.wordId,
  };
};

const _toServiceSelectionState = ({
  state,
}: {
  readonly state: SessionSelectionState;
}): WordSessionSelection.WordSessionSelectionState => ({
  consecutiveLearningSelections: state.consecutiveLearningSelections,
  dueReviewSelectionsSinceForced: state.dueReviewSelectionsSinceForced,
  missCounts: Object.fromEntries(
    state.misses.map((miss) => [miss.wordId, miss.count])
  ),
  newWordCredit: state.newWordCredit,
  recentWordIds: state.recentWordIds,
});

const _fromServiceSelectionState = ({
  state,
}: {
  readonly state: WordSessionSelection.WordSessionSelectionState;
}): SessionSelectionState => ({
  consecutiveLearningSelections: state.consecutiveLearningSelections,
  dueReviewSelectionsSinceForced: state.dueReviewSelectionsSinceForced,
  misses: Object.entries(state.missCounts).map(([wordId, count]) => ({
    count,
    wordId,
  })),
  newWordCredit: state.newWordCredit,
  recentWordIds: state.recentWordIds,
});

const _loadNextPracticeItem = ({
  now,
  selectionState,
}: {
  readonly now: number;
  readonly selectionState: SessionSelectionState;
}) =>
  Effect.gen(function* () {
    const store = yield* Store.Store;
    const storedPools = yield* store.loadWordSelectionPool({
      limit: 64,
      now,
    });
    const pools = {
      activeLearningCount: storedPools.activeLearningCount,
      dueLearning: storedPools.dueLearning.map((state) =>
        _selectionCandidateFromState({ now, state })
      ),
      dueReview: storedPools.dueReview.map((state) =>
        _selectionCandidateFromState({ now, state })
      ),
      earlyLearning: storedPools.earlyLearning.map((state) =>
        _selectionCandidateFromState({ now, state })
      ),
      extra: storedPools.extra.map((state) =>
        _selectionCandidateFromState({ now, state })
      ),
      newWords: storedPools.newWords.map((state) =>
        _selectionCandidateFromState({ now, state })
      ),
    };
    const serviceSelectionState = _toServiceSelectionState({
      state: selectionState,
    });
    const randomValues = new Uint32Array(1);
    crypto.getRandomValues(randomValues);
    const selection = WordSessionSelection.selectNextWord({
      now,
      pools,
      randomFraction: (randomValues[0] ?? 0) / 0x100000000,
      state: serviceSelectionState,
    });

    if (selection === undefined) {
      return {
        activeWordCount: storedPools.activeWordCount,
        dueReviewCount: storedPools.dueReviewCount,
        selectionState,
      };
    }

    const state = [
      ...storedPools.dueLearning,
      ...storedPools.dueReview,
      ...storedPools.earlyLearning,
      ...storedPools.extra,
      ...storedPools.newWords,
    ].find((candidate) => candidate.wordId === selection.candidate.wordId);
    const word =
      state === undefined ? undefined : yield* store.getWord(state.wordId);

    if (state === undefined || word === undefined) {
      return {
        activeWordCount: storedPools.activeWordCount,
        dueReviewCount: storedPools.dueReviewCount,
        selectionState,
      };
    }

    const nextSelectionState = WordSessionSelection.sessionStateAfterSelection({
      selection,
      state: serviceSelectionState,
    });
    const example = WordPracticePresentation.selectExample({
      attemptCount: state.attemptCount,
      examples: word.examples ?? [],
      wordId: word.id,
    });

    return {
      activeWordCount: storedPools.activeWordCount,
      dueReviewCount: storedPools.dueReviewCount,
      item: {
        ...(example === undefined ? {} : { example }),
        kind: selection.kind,
        source: selection.source,
        state,
        word,
      },
      selectionState: _fromServiceSelectionState({
        state: nextSelectionState,
      }),
    };
  });

export const makePracticeOverviewMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(PracticeOverviewContextSchema),
      events: {
        rateAgain: Schema.toStandardSchemaV1(Schema.Void),
        rateHard: Schema.toStandardSchemaV1(Schema.Void),
        rateGood: Schema.toStandardSchemaV1(Schema.Void),
        rateEasy: Schema.toStandardSchemaV1(Schema.Void),
        refresh: Schema.toStandardSchemaV1(Schema.Void),
        reveal: Schema.toStandardSchemaV1(Schema.Void),
      },
    },
    actorSources: {
      loadPracticeSession: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(PracticeSessionDataSchema),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const selection = yield* _loadNextPracticeItem({
                now,
                selectionState: InitialSelectionState,
              });
              const sessionId = yield* Schema.decodeEffect(
                Domain.WordPracticeSessionId
              )(crypto.randomUUID());

              return {
                ...selection,
                sessionId,
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
              const store = yield* Store.Store;
              const currentItem = input.currentItem;
              const sessionId = input.sessionId;

              if (currentItem === undefined || sessionId === undefined) {
                return yield* Effect.fail(
                  new Error("Could not find a word to practice.")
                );
              }

              const storedWord = yield* store.getWord(currentItem.word.id);

              if (
                storedWord === undefined ||
                storedWord.archivedAt !== undefined
              ) {
                return yield* Effect.fail(
                  new Error("That word is no longer active.")
                );
              }

              const reviewedAt = DateTime.toEpochMillis(yield* DateTime.now);
              const rating = input.rating;

              if (rating === undefined) {
                return yield* Effect.fail(
                  new Error("Choose a rating before saving the review.")
                );
              }

              const isCorrect = rating !== "again";
              const result = isCorrect ? "correct" : "incorrect";
              const previousCard = _memoryCardFromState({
                state: currentItem.state,
              });
              const transition = WordMemoryScheduler.applyPracticeResult({
                card: previousCard,
                kind: currentItem.kind,
                now: reviewedAt,
                rating,
              });
              const stageTransition = WordPracticeStage.transitionAfterRating({
                card: transition.card,
                kind: currentItem.kind,
                now: reviewedAt,
                rating,
                stage: currentItem.state.stage,
                stageAttemptCount: currentItem.state.stageAttemptCount,
                stageFailureStreak: currentItem.state.stageFailureStreak,
                stageMasteryStreak: currentItem.state.stageMasteryStreak,
                stageStartedAtMillis: _toEpochMillis({
                  dateTime: currentItem.state.stageStartedAt,
                }),
              });
              const nextState = yield* Schema.decodeEffect(
                Domain.WordMemoryState
              )({
                wordId: currentItem.state.wordId,
                stage: stageTransition.stage,
                stageStartedAt: stageTransition.stageStartedAtMillis,
                stageAttemptCount: stageTransition.stageAttemptCount,
                stageFailureStreak: stageTransition.stageFailureStreak,
                stageMasteryStreak: stageTransition.stageMasteryStreak,
                phase: stageTransition.card.phase,
                dueAt: stageTransition.card.dueAtMillis,
                stability: stageTransition.card.stability,
                difficulty: stageTransition.card.difficulty,
                elapsedDays: stageTransition.card.elapsedDays,
                scheduledDays: stageTransition.card.scheduledDays,
                learningSteps: stageTransition.card.learningSteps,
                repetitions: stageTransition.card.repetitions,
                lapses: stageTransition.card.lapses,
                attemptCount: currentItem.state.attemptCount + 1,
                correctCount:
                  currentItem.state.correctCount + (isCorrect ? 1 : 0),
                incorrectCount:
                  currentItem.state.incorrectCount + (isCorrect ? 0 : 1),
                introducedAt:
                  currentItem.state.introducedAt === undefined
                    ? reviewedAt
                    : _toEpochMillis({
                        dateTime: currentItem.state.introducedAt,
                      }),
                ...(stageTransition.card.lastReviewAtMillis === undefined
                  ? {}
                  : { lastReviewAt: stageTransition.card.lastReviewAtMillis }),
                lastPracticedAt: reviewedAt,
                schedulerVersion: WordMemoryScheduler.SchedulerVersion,
                createdAt: _toEpochMillis({
                  dateTime: currentItem.state.createdAt,
                }),
                updatedAt: reviewedAt,
              });
              const event = yield* Schema.decodeEffect(
                Domain.WordPracticeEvent
              )({
                id: crypto.randomUUID(),
                wordId: currentItem.word.id,
                submittedText: "",
                reviewedAt,
                result,
                rating,
                stage: currentItem.state.stage,
                ...(stageTransition.demotedTo === undefined
                  ? {}
                  : { demotedTo: stageTransition.demotedTo }),
                ...(stageTransition.promotedTo === undefined
                  ? {}
                  : { promotedTo: stageTransition.promotedTo }),
                kind: currentItem.kind,
                source: currentItem.source,
                previousDueAt: transition.previousDueAtMillis,
                nextDueAt: stageTransition.card.dueAtMillis,
                changedSchedule: transition.changedSchedule,
                phaseBefore: previousCard.phase,
                phaseAfter: stageTransition.card.phase,
                stabilityAfter: stageTransition.card.stability,
                difficultyAfter: stageTransition.card.difficulty,
                schedulerVersion: WordMemoryScheduler.SchedulerVersion,
                sessionId,
                sessionPosition: input.stats.attemptCount,
              });

              yield* store.savePracticeResult({ event, state: nextState });

              const selectionStateAfterResult =
                WordSessionSelection.sessionStateAfterResult({
                  dueReviewCount: input.dueReviewCount,
                  result,
                  state: _toServiceSelectionState({
                    state: input.selectionState,
                  }),
                  wordId: currentItem.word.id,
                });
              const fallbackSelectionState = _fromServiceSelectionState({
                state: selectionStateAfterResult,
              });
              const nextSelection = yield* _loadNextPracticeItem({
                now: reviewedAt,
                selectionState: fallbackSelectionState,
              }).pipe(
                Effect.map((selection) => ({
                  ...selection,
                  selectionFailed: false as const,
                })),
                Effect.orElseSucceed(() => ({
                  dueReviewCount: input.dueReviewCount,
                  item: undefined,
                  selectionFailed: true as const,
                  selectionState: fallbackSelectionState,
                }))
              );
              const stats = {
                attemptCount: input.stats.attemptCount + 1,
                correctCount: input.stats.correctCount + (isCorrect ? 1 : 0),
                extraCount:
                  input.stats.extraCount +
                  (currentItem.kind === "extra" ? 1 : 0),
                newCount:
                  input.stats.newCount + (currentItem.source === "new" ? 1 : 0),
                scheduledCount:
                  input.stats.scheduledCount +
                  (currentItem.kind === "scheduled" ? 1 : 0),
              };

              return {
                dueReviewCount: nextSelection.dueReviewCount,
                ...(nextSelection.selectionFailed
                  ? {
                      message:
                        "Your answer was saved, but the next word could not be loaded.",
                    }
                  : {}),
                nextItem: nextSelection.item,
                selectionState: nextSelection.selectionState,
                stats,
              };
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      activeWordCount: 0,
      answerVisible: false,
      rating: undefined,
      dueReviewCount: 0,
      selectionState: InitialSelectionState,
      stats: InitialStats,
    },
    initial: "Loading",
    states: {
      Loading: {
        invoke: {
          src: "loadPracticeSession",
          onDone: ({ event }) => ({
            target:
              event.output.item === undefined
                ? event.output.activeWordCount === 0
                  ? "EmptyLibrary"
                  : "Complete"
                : "Ready",
            context: {
              activeWordCount: event.output.activeWordCount,
              answerVisible: false,
              rating: undefined,
              currentItem: event.output.item,
              dueReviewCount: event.output.dueReviewCount,
              message: undefined,
              selectionState: event.output.selectionState,
              sessionId: event.output.sessionId,
              stats: InitialStats,
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
          refresh: {
            target: "Loading",
          },
          rateGood: {
            target: "Submitting",
            context: {
              rating: "good",
            },
          },
          rateAgain: {
            target: "Submitting",
            context: {
              rating: "again",
            },
          },
          rateHard: {
            target: "Submitting",
            context: {
              rating: "hard",
            },
          },
          rateEasy: {
            target: "Submitting",
            context: {
              rating: "easy",
            },
          },
          reveal: {
            context: {
              answerVisible: true,
            },
          },
        },
      },
      Submitting: {
        invoke: {
          src: "submitPracticeAnswer",
          input: ({ context }) => ({
            rating: context.rating,
            currentItem: context.currentItem,
            dueReviewCount: context.dueReviewCount,
            selectionState: context.selectionState,
            sessionId: context.sessionId,
            stats: context.stats,
          }),
          onDone: ({ event }) =>
            event.output.nextItem === undefined
              ? {
                  target: "Loading",
                  context: {
                    answerVisible: false,
                    rating: undefined,
                    currentItem: undefined,
                    dueReviewCount: event.output.dueReviewCount,
                    message: event.output.message,
                    selectionState: event.output.selectionState,
                    stats: event.output.stats,
                  },
                }
              : {
                  target: "Ready",
                  context: {
                    answerVisible: false,
                    rating: undefined,
                    currentItem: event.output.nextItem,
                    dueReviewCount: event.output.dueReviewCount,
                    message: event.output.message,
                    selectionState: event.output.selectionState,
                    stats: event.output.stats,
                  },
                },
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
      EmptyLibrary: {
        on: {
          refresh: {
            target: "Loading",
          },
        },
      },
      Complete: {
        on: {
          refresh: {
            target: "Loading",
          },
        },
      },
      Failure: {
        on: {
          refresh: {
            target: "Loading",
          },
        },
      },
    },
  });
