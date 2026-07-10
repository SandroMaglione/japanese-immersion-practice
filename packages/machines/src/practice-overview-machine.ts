import { IndexedDb } from "@jip/indexeddb";
import {
  FuriganaText,
  WordMemoryScheduler,
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
  kind: IndexedDb.Domain.WordPracticeKind,
  source: IndexedDb.Domain.WordPracticeSource,
  state: IndexedDb.Domain.WordMemoryState,
  word: IndexedDb.Domain.Word,
});

const PracticeSessionStatsSchema = Schema.Struct({
  attemptCount: Schema.Number,
  correctCount: Schema.Number,
  extraCount: Schema.Number,
  newCount: Schema.Number,
  scheduledCount: Schema.Number,
});

const PracticeResultSchema = Schema.Struct({
  changedSchedule: Schema.Boolean,
  difficulty: Schema.Number,
  isCorrect: Schema.Boolean,
  kind: IndexedDb.Domain.WordPracticeKind,
  nextReviewAt: Schema.DateTimeUtcFromMillis,
  phaseAfter: IndexedDb.Domain.WordMemoryPhase,
  phaseBefore: IndexedDb.Domain.WordMemoryPhase,
  source: IndexedDb.Domain.WordPracticeSource,
  stability: Schema.Number,
  word: IndexedDb.Domain.Word,
});

const PracticeSessionDataSchema = Schema.Struct({
  dueReviewCount: Schema.Number,
  item: Schema.optionalKey(PracticeItemSchema),
  selectionState: SessionSelectionStateSchema,
  sessionId: IndexedDb.Domain.WordPracticeSessionId,
});

const PracticeSubmitResultSchema = Schema.Struct({
  dueReviewCount: Schema.Number,
  message: Schema.optionalKey(Schema.String),
  nextItem: Schema.optionalKey(PracticeItemSchema),
  result: PracticeResultSchema,
  selectionState: SessionSelectionStateSchema,
  stats: PracticeSessionStatsSchema,
});

const PracticeOverviewContextSchema = Schema.Struct({
  currentItem: Schema.optionalKey(PracticeItemSchema),
  currentResponse: Schema.String,
  dueReviewCount: Schema.Number,
  lastResult: Schema.optionalKey(PracticeResultSchema),
  message: Schema.optionalKey(Schema.String),
  nextItem: Schema.optionalKey(PracticeItemSchema),
  selectionState: SessionSelectionStateSchema,
  sessionId: Schema.optionalKey(IndexedDb.Domain.WordPracticeSessionId),
  stats: PracticeSessionStatsSchema,
});

const SubmitPracticeInputSchema = Schema.Struct({
  currentItem: Schema.optionalKey(PracticeItemSchema),
  dueReviewCount: Schema.Number,
  response: Schema.String,
  selectionState: SessionSelectionStateSchema,
  sessionId: Schema.optionalKey(IndexedDb.Domain.WordPracticeSessionId),
  stats: PracticeSessionStatsSchema,
});

type MemoryState = typeof IndexedDb.Domain.WordMemoryState.Type;
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

const _normalizePracticeText = ({ text }: { readonly text: string }) =>
  FuriganaText.normalizePlainText({ text });

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
    const store = yield* IndexedDb.Store.Store;
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
        dueReviewCount: storedPools.dueReviewCount,
        selectionState,
      };
    }

    const nextSelectionState = WordSessionSelection.sessionStateAfterSelection({
      selection,
      state: serviceSelectionState,
    });

    return {
      dueReviewCount: storedPools.dueReviewCount,
      item: {
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
                IndexedDb.Domain.WordPracticeSessionId
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
              const store = yield* IndexedDb.Store.Store;
              const currentItem = input.currentItem;
              const sessionId = input.sessionId;

              if (currentItem === undefined || sessionId === undefined) {
                return yield* Effect.fail(
                  new Error("Could not find a word to practice.")
                );
              }

              const reviewedAt = DateTime.toEpochMillis(yield* DateTime.now);
              const submittedText = input.response.trim();
              const isCorrect =
                _normalizePracticeText({ text: submittedText }) ===
                _normalizePracticeText({ text: currentItem.word.text });
              const result = isCorrect ? "correct" : "incorrect";
              const previousCard = _memoryCardFromState({
                state: currentItem.state,
              });
              const transition = WordMemoryScheduler.applyPracticeResult({
                card: previousCard,
                kind: currentItem.kind,
                now: reviewedAt,
                result,
              });
              const nextState = yield* Schema.decodeEffect(
                IndexedDb.Domain.WordMemoryState
              )({
                wordId: currentItem.state.wordId,
                phase: transition.card.phase,
                dueAt: transition.card.dueAtMillis,
                stability: transition.card.stability,
                difficulty: transition.card.difficulty,
                elapsedDays: transition.card.elapsedDays,
                scheduledDays: transition.card.scheduledDays,
                learningSteps: transition.card.learningSteps,
                repetitions: transition.card.repetitions,
                lapses: transition.card.lapses,
                attemptCount: currentItem.state.attemptCount + 1,
                correctCount:
                  currentItem.state.correctCount + (isCorrect ? 1 : 0),
                incorrectCount:
                  currentItem.state.incorrectCount + (isCorrect ? 0 : 1),
                ...(transition.card.lastReviewAtMillis === undefined
                  ? {}
                  : { lastReviewAt: transition.card.lastReviewAtMillis }),
                lastPracticedAt: reviewedAt,
                schedulerVersion: WordMemoryScheduler.SchedulerVersion,
                createdAt: _toEpochMillis({
                  dateTime: currentItem.state.createdAt,
                }),
                updatedAt: reviewedAt,
              });
              const event = yield* Schema.decodeEffect(
                IndexedDb.Domain.WordPracticeEvent
              )({
                id: crypto.randomUUID(),
                wordId: currentItem.word.id,
                submittedText,
                reviewedAt,
                result,
                kind: currentItem.kind,
                source: currentItem.source,
                previousDueAt: transition.previousDueAtMillis,
                nextDueAt: transition.card.dueAtMillis,
                changedSchedule: transition.changedSchedule,
                phaseAfter: transition.card.phase,
                stabilityAfter: transition.card.stability,
                difficultyAfter: transition.card.difficulty,
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
                result: {
                  changedSchedule: transition.changedSchedule,
                  difficulty: transition.card.difficulty,
                  isCorrect,
                  kind: currentItem.kind,
                  nextReviewAt: DateTime.makeUnsafe(
                    transition.card.dueAtMillis
                  ),
                  phaseAfter: transition.card.phase,
                  phaseBefore: currentItem.state.phase,
                  source: currentItem.source,
                  stability: transition.card.stability,
                  word: currentItem.word,
                },
                selectionState: nextSelection.selectionState,
                stats,
              };
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      currentResponse: "",
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
            target: event.output.item === undefined ? "EmptyLibrary" : "Ready",
            context: {
              currentItem: event.output.item,
              currentResponse: "",
              dueReviewCount: event.output.dueReviewCount,
              lastResult: undefined,
              message: undefined,
              nextItem: undefined,
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
            currentItem: context.currentItem,
            dueReviewCount: context.dueReviewCount,
            response: context.currentResponse,
            selectionState: context.selectionState,
            sessionId: context.sessionId,
            stats: context.stats,
          }),
          onDone: ({ event }) => ({
            target: "Revealed",
            context: {
              currentItem: undefined,
              currentResponse: "",
              dueReviewCount: event.output.dueReviewCount,
              lastResult: event.output.result,
              message: event.output.message,
              nextItem: event.output.nextItem,
              selectionState: event.output.selectionState,
              stats: event.output.stats,
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
          submit: ({ context }) =>
            context.nextItem === undefined
              ? {
                  target: "Loading",
                  context: {
                    lastResult: undefined,
                  },
                }
              : {
                  target: "Ready",
                  context: {
                    currentItem: context.nextItem,
                    lastResult: undefined,
                    nextItem: undefined,
                  },
                },
        },
      },
      EmptyLibrary: {
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
