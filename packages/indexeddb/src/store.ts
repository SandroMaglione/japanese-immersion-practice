import { Array as EffectArray, Context, DateTime, Effect, Layer } from "effect";

import * as Database from "./database.ts";
import * as Domain from "./domain.ts";

export type StoreService = Context.Service.Shape<typeof Store>;

export class Store extends Context.Service<Store>()("@jip/indexeddb/Store", {
  make: Effect.gen(function* () {
    const db = yield* Database.JapanesePracticeDatabase.getQueryBuilder;

    const listDueMemoryStates = ({
      limit,
      now,
      phase,
    }: {
      readonly limit: number;
      readonly now: number;
      readonly phase: "learning" | "review" | "relearning";
    }) =>
      db
        .from("word_memory_states")
        .select("byPhaseAndDueAt")
        .between([phase], [phase, now])
        .limit(limit);

    const listFutureMemoryStates = ({
      limit,
      now,
      phase,
    }: {
      readonly limit: number;
      readonly now: number;
      readonly phase: "learning" | "review" | "relearning";
    }) =>
      db
        .from("word_memory_states")
        .select("byPhaseAndDueAt")
        .between([phase, now], [phase, []], { excludeLowerBound: true })
        .limit(limit);

    return {
      listWords: Effect.fn("Store.listWords")(function* () {
        return yield* db.from("words").select("byUpdatedAt").reverse();
      }),

      getWord: Effect.fn("Store.getWord")(function* (
        wordId: Domain.Word["id"]
      ) {
        const words = yield* db.from("words").select().equals(wordId);

        return words[0];
      }),

      insertWordWithMemoryState: Effect.fn("Store.insertWordWithMemoryState")(
        function* ({
          state,
          word,
        }: {
          readonly state: Domain.WordMemoryState;
          readonly word: Domain.Word;
        }) {
          yield* db.withTransaction({
            tables: ["words", "word_memory_states"],
            mode: "readwrite",
          })(
            Effect.all([
              db.from("words").insert(word),
              db.from("word_memory_states").insert(state),
            ])
          );
        }
      ),

      insertWordsWithMemoryStates: Effect.fn(
        "Store.insertWordsWithMemoryStates"
      )(function* ({
        states,
        words,
      }: {
        readonly states: readonly Domain.WordMemoryState[];
        readonly words: readonly Domain.Word[];
      }) {
        if (!EffectArray.isReadonlyArrayNonEmpty(words)) {
          return;
        }

        yield* db.withTransaction({
          tables: ["words", "word_memory_states"],
          mode: "readwrite",
        })(
          Effect.all([
            db.from("words").insertAll([...words]),
            db.from("word_memory_states").insertAll([...states]),
          ])
        );
      }),

      updateWord: Effect.fn("Store.updateWord")(function* (word: Domain.Word) {
        yield* db.from("words").upsert(word);
      }),

      deleteWord: Effect.fn("Store.deleteWord")(function* (
        wordId: Domain.Word["id"]
      ) {
        yield* db.withTransaction({
          tables: ["words", "word_memory_states", "word_practice_events"],
          mode: "readwrite",
        })(
          Effect.all([
            db.from("words").delete().equals(wordId),
            db.from("word_memory_states").delete().equals(wordId),
            db.from("word_practice_events").delete("byWordId").equals(wordId),
          ])
        );
      }),

      deleteAllWords: Effect.fn("Store.deleteAllWords")(function* () {
        yield* db.withTransaction({
          tables: ["words", "word_memory_states", "word_practice_events"],
          mode: "readwrite",
        })(
          Effect.all([
            db.from("words").clear,
            db.from("word_memory_states").clear,
            db.from("word_practice_events").clear,
          ])
        );
      }),

      listMemoryStates: Effect.fn("Store.listMemoryStates")(function* () {
        return yield* db
          .from("word_memory_states")
          .select("byUpdatedAt")
          .reverse();
      }),

      replaceMemoryStates: Effect.fn("Store.replaceMemoryStates")(function* (
        states: readonly Domain.WordMemoryState[]
      ) {
        if (!EffectArray.isReadonlyArrayNonEmpty(states)) {
          return;
        }

        yield* db.withTransaction({
          tables: ["word_memory_states"],
          mode: "readwrite",
        })(
          Effect.forEach(
            states,
            (state) => db.from("word_memory_states").upsert(state),
            { discard: true }
          )
        );
      }),

      getMemoryState: Effect.fn("Store.getMemoryState")(function* (
        wordId: Domain.WordMemoryState["wordId"]
      ) {
        const states = yield* db
          .from("word_memory_states")
          .select()
          .equals(wordId);

        return states[0];
      }),

      loadWordSelectionPool: Effect.fn("Store.loadWordSelectionPool")(
        function* ({
          limit,
          now,
        }: {
          readonly limit: number;
          readonly now: number;
        }) {
          const [
            dueLearning,
            dueRelearning,
            dueReview,
            futureLearning,
            futureRelearning,
            futureReview,
            oldestPracticedReview,
            newWords,
            learningCount,
            relearningCount,
            dueReviewCount,
          ] = yield* Effect.all([
            listDueMemoryStates({ limit, now, phase: "learning" }),
            listDueMemoryStates({ limit, now, phase: "relearning" }),
            listDueMemoryStates({ limit, now, phase: "review" }),
            listFutureMemoryStates({ limit, now, phase: "learning" }),
            listFutureMemoryStates({ limit, now, phase: "relearning" }),
            listFutureMemoryStates({ limit, now, phase: "review" }),
            db
              .from("word_memory_states")
              .select("byPhaseAndLastPracticedAt")
              .between(["review"], ["review", []])
              .limit(limit),
            db
              .from("word_memory_states")
              .select("byPhase")
              .equals("new")
              .limit(limit),
            db.from("word_memory_states").count("byPhase").equals("learning"),
            db.from("word_memory_states").count("byPhase").equals("relearning"),
            db
              .from("word_memory_states")
              .count("byPhaseAndDueAt")
              .between(["review"], ["review", now]),
          ]);
          const extra = [...futureReview, ...oldestPracticedReview].filter(
            (state, index, states) =>
              states.findIndex(
                (candidate) => candidate.wordId === state.wordId
              ) === index
          );

          return {
            activeLearningCount: learningCount + relearningCount,
            dueLearning: [...dueLearning, ...dueRelearning].sort(
              (left, right) =>
                DateTime.toEpochMillis(left.dueAt) -
                DateTime.toEpochMillis(right.dueAt)
            ),
            dueReview,
            dueReviewCount,
            earlyLearning: [...futureLearning, ...futureRelearning]
              .sort(
                (left, right) =>
                  DateTime.toEpochMillis(left.dueAt) -
                  DateTime.toEpochMillis(right.dueAt)
              )
              .slice(0, limit),
            extra,
            newWords,
          };
        }
      ),

      savePracticeResult: Effect.fn("Store.savePracticeResult")(function* ({
        event,
        state,
      }: {
        readonly event: Domain.WordPracticeEvent;
        readonly state: Domain.WordMemoryState;
      }) {
        yield* db.withTransaction({
          tables: ["word_memory_states", "word_practice_events"],
          mode: "readwrite",
        })(
          Effect.all([
            db.from("word_memory_states").upsert(state),
            db.from("word_practice_events").insert(event),
          ])
        );
      }),

      listPracticeEvents: Effect.fn("Store.listPracticeEvents")(function* () {
        return yield* db
          .from("word_practice_events")
          .select("byReviewedAt")
          .reverse();
      }),

      listPracticeEventsByWord: Effect.fn("Store.listPracticeEventsByWord")(
        function* (wordId: Domain.WordPracticeEvent["wordId"]) {
          const events = yield* db
            .from("word_practice_events")
            .select("byWordId")
            .equals(wordId);

          return events.sort(
            (left, right) =>
              DateTime.toEpochMillis(right.reviewedAt) -
              DateTime.toEpochMillis(left.reviewedAt)
          );
        }
      ),

      countPracticeEventsBetween: Effect.fn("Store.countPracticeEventsBetween")(
        function* ({
          end,
          start,
        }: {
          readonly end: number;
          readonly start: number;
        }) {
          return yield* db
            .from("word_practice_events")
            .count("byReviewedAt")
            .between(start, end, { excludeUpperBound: true });
        }
      ),
    };
  }),
}) {
  static readonly Default = Layer.effect(this)(this.make);
}
