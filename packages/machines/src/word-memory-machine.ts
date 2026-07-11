import { IndexedDb } from "@jip/indexeddb";
import { WordMemoryRecalculation, WordMemoryScheduler } from "@jip/services";
import { DateTime, Effect, HashMap, Option, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const WordMemoryStatusSchema = Schema.Literals([
  "new",
  "learning",
  "relearning",
  "due",
  "scheduled",
]);

const WordMemoryOverviewWordSchema = Schema.Struct({
  isDue: Schema.Boolean,
  retrievability: Schema.Number,
  state: IndexedDb.Domain.WordMemoryState,
  word: IndexedDb.Domain.Word,
});

const WordMemoryGroupSchema = Schema.Struct({
  status: WordMemoryStatusSchema,
  words: Schema.Array(WordMemoryOverviewWordSchema),
});

const WordMemoryRecalculationPreviewSchema = Schema.Struct({
  changedWordCount: Schema.Number,
  dueNowAfterCount: Schema.Number,
  dueNowBeforeCount: Schema.Number,
  dueWithinSevenDaysAfterCount: Schema.Number,
  dueWithinSevenDaysBeforeCount: Schema.Number,
  medianStabilityAfter: Schema.Number,
  medianStabilityBefore: Schema.Number,
  practiceEventCount: Schema.Number,
  reclassifiedEventCount: Schema.Number,
  wordCount: Schema.Number,
});

const WordMemoryContextSchema = Schema.Struct({
  groups: Schema.Array(WordMemoryGroupSchema),
  message: Schema.optionalKey(Schema.String),
  notice: Schema.optionalKey(Schema.String),
  recalculationPreview: Schema.optionalKey(
    WordMemoryRecalculationPreviewSchema
  ),
  selectedStatus: WordMemoryStatusSchema,
});

const WordMemoryDataSchema = Schema.Struct({
  groups: Schema.Array(WordMemoryGroupSchema),
});

const MemoryStatuses = [
  "new",
  "learning",
  "relearning",
  "due",
  "scheduled",
] as const;

const MillisecondsPerDay = 86_400_000;

const _median = ({ values }: { readonly values: readonly number[] }) => {
  if (values[0] === undefined) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const middleValue = sorted[middle] ?? 0;

  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? middleValue) + middleValue) / 2
    : middleValue;
};

const _isDueBy = ({
  dueBy,
  state,
}: {
  readonly dueBy: number;
  readonly state: IndexedDb.Domain.WordMemoryState;
}) => state.phase !== "new" && DateTime.toEpochMillis(state.dueAt) <= dueBy;

const _calculateRecalculation = ({
  events,
  now,
  states,
  words,
}: {
  readonly events: readonly IndexedDb.Domain.WordPracticeEvent[];
  readonly now: number;
  readonly states: readonly IndexedDb.Domain.WordMemoryState[];
  readonly words: readonly IndexedDb.Domain.Word[];
}) => {
  let eventsByWordId = HashMap.empty<
    IndexedDb.Domain.WordId,
    IndexedDb.Domain.WordPracticeEvent[]
  >();
  const stateByWordId = HashMap.fromIterable(
    states.map((state) => [state.wordId, state] as const)
  );

  for (const event of events) {
    const wordEvents = Option.getOrUndefined(
      HashMap.get(eventsByWordId, event.wordId)
    );

    if (wordEvents === undefined) {
      eventsByWordId = HashMap.set(eventsByWordId, event.wordId, [event]);
    } else {
      wordEvents.push(event);
    }
  }

  const currentStates: IndexedDb.Domain.WordMemoryState[] = [];
  const nextStates: IndexedDb.Domain.WordMemoryState[] = [];
  let practiceEventCount = 0;
  let reclassifiedEventCount = 0;

  for (const word of words) {
    const currentState = Option.getOrUndefined(
      HashMap.get(stateByWordId, word.id)
    );

    if (currentState === undefined) {
      continue;
    }

    const wordEvents = Option.getOrElse(
      HashMap.get(eventsByWordId, word.id),
      () => []
    );
    const replay = WordMemoryRecalculation.replayPracticeHistory({
      createdAtMillis: DateTime.toEpochMillis(word.createdAt),
      events: wordEvents.map((event) => ({
        id: event.id,
        kind: event.kind,
        result: event.result,
        reviewedAtMillis: DateTime.toEpochMillis(event.reviewedAt),
        sessionId: event.sessionId,
        sessionPosition: event.sessionPosition,
      })),
    });

    const { lastReviewAt: _lastReviewAt, ...stateWithoutLastReview } =
      currentState;
    const nextState: IndexedDb.Domain.WordMemoryState = {
      ...stateWithoutLastReview,
      phase: replay.card.phase,
      dueAt: DateTime.makeUnsafe(replay.card.dueAtMillis),
      stability: replay.card.stability,
      difficulty: replay.card.difficulty,
      elapsedDays: replay.card.elapsedDays,
      scheduledDays: replay.card.scheduledDays,
      learningSteps: replay.card.learningSteps,
      repetitions: replay.card.repetitions,
      lapses: replay.card.lapses,
      ...(replay.card.lastReviewAtMillis === undefined
        ? {}
        : {
            lastReviewAt: DateTime.makeUnsafe(replay.card.lastReviewAtMillis),
          }),
      schedulerVersion: WordMemoryScheduler.SchedulerVersion,
    };

    currentStates.push(currentState);
    nextStates.push(nextState);
    practiceEventCount += wordEvents.length;
    reclassifiedEventCount += replay.reclassifiedEventCount;
  }

  const dueWithinSevenDays = now + 7 * MillisecondsPerDay;
  const changedStates = nextStates.filter((nextState, index) => {
    const currentState = currentStates[index];

    return currentState === undefined
      ? false
      : currentState.phase !== nextState.phase ||
          DateTime.toEpochMillis(currentState.dueAt) !==
            DateTime.toEpochMillis(nextState.dueAt) ||
          currentState.stability !== nextState.stability ||
          currentState.difficulty !== nextState.difficulty ||
          currentState.elapsedDays !== nextState.elapsedDays ||
          currentState.scheduledDays !== nextState.scheduledDays ||
          currentState.learningSteps !== nextState.learningSteps ||
          currentState.repetitions !== nextState.repetitions ||
          currentState.lapses !== nextState.lapses ||
          (currentState.lastReviewAt === undefined
            ? undefined
            : DateTime.toEpochMillis(currentState.lastReviewAt)) !==
            (nextState.lastReviewAt === undefined
              ? undefined
              : DateTime.toEpochMillis(nextState.lastReviewAt));
  });

  return {
    changedStates,
    preview: {
      changedWordCount: changedStates.length,
      dueNowAfterCount: nextStates.filter((state) =>
        _isDueBy({ dueBy: now, state })
      ).length,
      dueNowBeforeCount: currentStates.filter((state) =>
        _isDueBy({ dueBy: now, state })
      ).length,
      dueWithinSevenDaysAfterCount: nextStates.filter((state) =>
        _isDueBy({ dueBy: dueWithinSevenDays, state })
      ).length,
      dueWithinSevenDaysBeforeCount: currentStates.filter((state) =>
        _isDueBy({ dueBy: dueWithinSevenDays, state })
      ).length,
      medianStabilityAfter: _median({
        values: nextStates.map((state) => state.stability),
      }),
      medianStabilityBefore: _median({
        values: currentStates.map((state) => state.stability),
      }),
      practiceEventCount,
      reclassifiedEventCount,
      wordCount: nextStates.length,
    },
  };
};

export const makeWordMemoryMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<IndexedDb.Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(WordMemoryContextSchema),
      events: {
        applyRecalculation: Schema.toStandardSchemaV1(Schema.Void),
        cancelRecalculation: Schema.toStandardSchemaV1(Schema.Void),
        refresh: Schema.toStandardSchemaV1(Schema.Void),
        requestRecalculation: Schema.toStandardSchemaV1(Schema.Void),
        selectStatus: Schema.toStandardSchemaV1(
          Schema.Struct({ status: WordMemoryStatusSchema })
        ),
      },
    },
    actorSources: {
      loadWordMemory: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(WordMemoryDataSchema),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const [words, states] = yield* Effect.all([
                store.listWords(),
                store.listMemoryStates(),
              ]);
              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const stateByWordId = HashMap.fromIterable(
                states.map((state) => [state.wordId, state] as const)
              );
              const overviewWords = words.flatMap((word) => {
                const state = Option.getOrUndefined(
                  HashMap.get(stateByWordId, word.id)
                );

                if (state === undefined) {
                  return [];
                }

                const card: WordMemoryScheduler.WordMemoryCard = {
                  difficulty: state.difficulty,
                  dueAtMillis: DateTime.toEpochMillis(state.dueAt),
                  elapsedDays: state.elapsedDays,
                  lapses: state.lapses,
                  ...(state.lastReviewAt === undefined
                    ? {}
                    : {
                        lastReviewAtMillis: DateTime.toEpochMillis(
                          state.lastReviewAt
                        ),
                      }),
                  learningSteps: state.learningSteps,
                  phase: state.phase,
                  repetitions: state.repetitions,
                  scheduledDays: state.scheduledDays,
                  stability: state.stability,
                };
                const isDue = WordMemoryScheduler.isDue({ card, now });

                return [
                  {
                    isDue,
                    retrievability: WordMemoryScheduler.retrievability({
                      card,
                      now,
                    }),
                    state,
                    status:
                      state.phase === "new" ||
                      state.phase === "learning" ||
                      state.phase === "relearning"
                        ? state.phase
                        : isDue
                          ? "due"
                          : "scheduled",
                    word,
                  },
                ];
              });

              return {
                groups: MemoryStatuses.map((status) => ({
                  status,
                  words: overviewWords
                    .filter((word) => word.status === status)
                    .sort((left, right) => {
                      const dueDifference =
                        DateTime.toEpochMillis(left.state.dueAt) -
                        DateTime.toEpochMillis(right.state.dueAt);

                      return dueDifference === 0
                        ? left.word.text.localeCompare(right.word.text)
                        : dueDifference;
                    })
                    .map(({ status: _status, ...word }) => word),
                })),
              };
            })
          ),
      }),
      previewWordMemoryRecalculation: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(
            WordMemoryRecalculationPreviewSchema
          ),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const [events, states, words] = yield* Effect.all([
                store.listPracticeEvents(),
                store.listMemoryStates(),
                store.listWords(),
              ]);
              const now = DateTime.toEpochMillis(yield* DateTime.now);

              return _calculateRecalculation({ events, now, states, words })
                .preview;
            })
          ),
      }),
      applyWordMemoryRecalculation: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(
            WordMemoryRecalculationPreviewSchema
          ),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const [events, states, words] = yield* Effect.all([
                store.listPracticeEvents(),
                store.listMemoryStates(),
                store.listWords(),
              ]);
              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const recalculation = _calculateRecalculation({
                events,
                now,
                states,
                words,
              });

              yield* store.replaceMemoryStates(recalculation.changedStates);

              return recalculation.preview;
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      groups: MemoryStatuses.map((status) => ({ status, words: [] })),
      selectedStatus: "due",
    },
    initial: "Loading",
    states: {
      Loading: {
        invoke: {
          src: "loadWordMemory",
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              groups: event.output.groups,
              message: undefined,
            },
          }),
          onError: ({ event }) => ({
            target: "Failure",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not load word memory.",
            },
          }),
        },
      },
      Ready: {
        on: {
          requestRecalculation: {
            target: "CalculatingRecalculationPreview",
            context: {
              message: undefined,
              notice: undefined,
              recalculationPreview: undefined,
            },
          },
          refresh: {
            target: "Loading",
          },
          selectStatus: ({ event }) => ({
            context: {
              selectedStatus: event.status,
            },
          }),
        },
      },
      CalculatingRecalculationPreview: {
        invoke: {
          src: "previewWordMemoryRecalculation",
          onDone: ({ event }) => ({
            target: "ConfirmingRecalculation",
            context: {
              recalculationPreview: event.output,
            },
          }),
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not preview the schedule recalculation.",
              recalculationPreview: undefined,
            },
          }),
        },
      },
      ConfirmingRecalculation: {
        on: {
          applyRecalculation: {
            target: "ApplyingRecalculation",
          },
          cancelRecalculation: {
            target: "Ready",
            context: {
              recalculationPreview: undefined,
            },
          },
        },
      },
      ApplyingRecalculation: {
        invoke: {
          src: "applyWordMemoryRecalculation",
          onDone: ({ event }) => ({
            target: "Loading",
            context: {
              notice:
                event.output.changedWordCount === 0
                  ? "All schedules already match your practice history."
                  : `Recalculated ${event.output.changedWordCount} word schedules from ${event.output.practiceEventCount} practice attempts.`,
              recalculationPreview: undefined,
            },
          }),
          onError: ({ event }) => ({
            target: "ConfirmingRecalculation",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not apply the schedule recalculation.",
            },
          }),
        },
      },
      Failure: {
        on: {
          refresh: {
            target: "Loading",
          },
          selectStatus: ({ event }) => ({
            context: {
              selectedStatus: event.status,
            },
          }),
        },
      },
    },
  });
