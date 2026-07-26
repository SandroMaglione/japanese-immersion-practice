import { IndexedDb } from "@jip/indexeddb";
import { FuriganaText, WordMemoryScheduler } from "@jip/services";
import {
  Array as EffectArray,
  DateTime,
  Effect,
  HashMap,
  HashSet,
  Option,
  Predicate,
  Schema,
} from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const WordHistoryStatusSchema = Schema.Literals([
  "new",
  "learning",
  "relearning",
  "due",
  "scheduled",
]);

const WordPracticeHistorySummarySchema = Schema.Struct({
  accuracy: Schema.Number,
  attemptCount: Schema.Number,
  correctCount: Schema.Number,
  incorrectCount: Schema.Number,
  isDue: Schema.Boolean,
  retrievability: Schema.Number,
  state: IndexedDb.Domain.WordMemoryState,
  status: WordHistoryStatusSchema,
  word: IndexedDb.Domain.Word,
});

const WordPracticeHistoryContextSchema = Schema.Struct({
  matchingSummaries: Schema.Array(WordPracticeHistorySummarySchema),
  message: Schema.optionalKey(Schema.String),
  query: Schema.String,
  selectedAttempts: Schema.Array(IndexedDb.Domain.WordPracticeEvent),
  selectedWordId: Schema.optionalKey(IndexedDb.Domain.WordId),
  summaries: Schema.Array(WordPracticeHistorySummarySchema),
  todayAttemptCount: Schema.Number,
  visibleSummaryCount: Schema.Number,
});

const WordPracticeHistoryDataSchema = Schema.Struct({
  summaries: Schema.Array(WordPracticeHistorySummarySchema),
  todayAttemptCount: Schema.Number,
});

const WordAttemptsDataSchema = Schema.Struct({
  attempts: Schema.Array(IndexedDb.Domain.WordPracticeEvent),
  wordId: IndexedDb.Domain.WordId,
});

const _errorMessage = ({
  error,
  fallback,
}: {
  readonly error: unknown;
  readonly fallback: string;
}) => {
  const messages: string[] = [];
  let current = error;

  while (current instanceof Error && messages.length < 4) {
    messages.push(current.message);
    current = current.cause;
  }

  if (
    current instanceof Event &&
    current.target !== null &&
    Predicate.hasProperty(current.target, "error") &&
    current.target.error instanceof Error
  ) {
    messages.push(current.target.error.message);
  }

  const distinctMessages = messages.filter(
    (message, index) => messages.indexOf(message) === index
  );

  return EffectArray.isReadonlyArrayNonEmpty(distinctMessages)
    ? distinctMessages.join(": ")
    : fallback;
};

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
      summary.status,
      `${summary.accuracy}`,
      `${summary.attemptCount}`,
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
          Schema.Struct({ query: Schema.String })
        ),
        closeWord: Schema.toStandardSchemaV1(Schema.Void),
        refresh: Schema.toStandardSchemaV1(Schema.Void),
        loadMore: Schema.toStandardSchemaV1(Schema.Void),
        selectWord: Schema.toStandardSchemaV1(
          Schema.Struct({ wordId: IndexedDb.Domain.WordId })
        ),
      },
    },
    actorSources: {
      loadWordAttempts: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(
            Schema.UndefinedOr(IndexedDb.Domain.WordId)
          ),
          output: Schema.toStandardSchemaV1(WordAttemptsDataSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              if (input === undefined) {
                return yield* Effect.fail(
                  new Error("Could not find that word.")
                );
              }

              const store = yield* IndexedDb.Store.Store;
              const word = yield* store.getWord(input);

              if (word === undefined || word.archivedAt !== undefined) {
                return yield* Effect.fail(
                  new Error("Could not find that word.")
                );
              }

              const attempts = yield* store.listPracticeEventsByWord(input);

              return {
                attempts,
                wordId: input,
              };
            })
          ),
      }),
      loadWordPracticeHistory: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(WordPracticeHistoryDataSchema),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const [events, words, states] = yield* Effect.all([
                store.listPracticeEvents(),
                store.listWords(),
                store.listMemoryStates(),
              ]);
              const activeWords = words.filter(
                (word) => word.archivedAt === undefined
              );
              let activeWordIds = HashSet.empty<IndexedDb.Domain.WordId>();

              for (const word of activeWords) {
                activeWordIds = HashSet.add(activeWordIds, word.id);
              }

              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const today = new Date(now);
              const startOfToday = new Date(
                today.getFullYear(),
                today.getMonth(),
                today.getDate()
              ).getTime();
              const startOfTomorrow = new Date(
                today.getFullYear(),
                today.getMonth(),
                today.getDate() + 1
              ).getTime();
              const todayAttemptCount = events.filter((event) => {
                const reviewedAt = DateTime.toEpochMillis(event.reviewedAt);

                return (
                  HashSet.has(activeWordIds, event.wordId) &&
                  reviewedAt >= startOfToday &&
                  reviewedAt < startOfTomorrow
                );
              }).length;
              const stateByWordId = HashMap.fromIterable(
                states.map((state) => [state.wordId, state] as const)
              );
              const summaries: (typeof WordPracticeHistorySummarySchema.Type)[] =
                activeWords.flatMap((word) => {
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
                      accuracy:
                        state.attemptCount === 0
                          ? 0
                          : Math.round(
                              (state.correctCount / state.attemptCount) * 100
                            ),
                      attemptCount: state.attemptCount,
                      correctCount: state.correctCount,
                      incorrectCount: state.incorrectCount,
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
                summaries: summaries.sort((left, right) => {
                  if (left.isDue !== right.isDue) {
                    return left.isDue ? -1 : 1;
                  }

                  const retrievabilityDifference =
                    left.retrievability - right.retrievability;

                  if (retrievabilityDifference !== 0) {
                    return retrievabilityDifference;
                  }

                  return (
                    DateTime.toEpochMillis(left.state.dueAt) -
                    DateTime.toEpochMillis(right.state.dueAt)
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
      selectedAttempts: [],
      summaries: [],
      todayAttemptCount: 0,
      visibleSummaryCount: 100,
    },
    initial: "Loading",
    states: {
      Loading: {
        invoke: {
          src: "loadWordPracticeHistory",
          onDone: ({ context, event }) => ({
            target: "Ready",
            context: {
              matchingSummaries: _filterSummaries({
                query: context.query,
                summaries: event.output.summaries,
              }),
              message: undefined,
              selectedAttempts: [],
              selectedWordId: undefined,
              summaries: event.output.summaries,
              todayAttemptCount: event.output.todayAttemptCount,
              visibleSummaryCount: 100,
            },
          }),
          onError: ({ event }) => ({
            target: "Failure",
            context: {
              message: _errorMessage({
                error: event.error,
                fallback: "Could not load word practice history.",
              }),
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
              visibleSummaryCount: 100,
            },
          }),
          closeWord: {
            context: {
              selectedAttempts: [],
              selectedWordId: undefined,
            },
          },
          refresh: {
            target: "Loading",
          },
          loadMore: ({ context }) => ({
            context: {
              visibleSummaryCount: context.visibleSummaryCount + 100,
            },
          }),
          selectWord: ({ event }) => ({
            target: "LoadingAttempts",
            context: {
              selectedAttempts: [],
              selectedWordId: event.wordId,
            },
          }),
        },
      },
      LoadingAttempts: {
        invoke: {
          src: "loadWordAttempts",
          input: ({ context }) => context.selectedWordId,
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              message: undefined,
              selectedAttempts: event.output.attempts,
              selectedWordId: event.output.wordId,
            },
          }),
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              message: _errorMessage({
                error: event.error,
                fallback: "Could not load word attempts.",
              }),
            },
          }),
        },
        on: {
          closeWord: {
            target: "Ready",
            context: {
              selectedAttempts: [],
              selectedWordId: undefined,
            },
          },
        },
      },
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
    },
  });
