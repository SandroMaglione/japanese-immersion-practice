import { IndexedDb } from "@jip/indexeddb";
import { WordMemoryScheduler } from "@jip/services";
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

const WordMemoryContextSchema = Schema.Struct({
  groups: Schema.Array(WordMemoryGroupSchema),
  message: Schema.optionalKey(Schema.String),
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

export const makeWordMemoryMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<IndexedDb.Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(WordMemoryContextSchema),
      events: {
        refresh: Schema.toStandardSchemaV1(Schema.Void),
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
