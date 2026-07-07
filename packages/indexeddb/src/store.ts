import { Array as EffectArray, Context, Effect, Layer } from "effect";

import * as Database from "./database.ts";
import * as Domain from "./domain.ts";

export type StoreService = Context.Service.Shape<typeof Store>;

export class Store extends Context.Service<Store>()("@jip/indexeddb/Store", {
  make: Effect.gen(function* () {
    const db = yield* Database.JapanesePracticeDatabase.getQueryBuilder;

    return {
      listWordEntries: Effect.fn("Store.listWordEntries")(function* () {
        return yield* db.from("word_entries").select("byUpdatedAt").reverse();
      }),

      insertWordEntry: Effect.fn("Store.insertWordEntry")(function* (
        wordEntry: Domain.WordEntry
      ) {
        yield* db.from("word_entries").insert(wordEntry);
      }),

      insertWordEntries: Effect.fn("Store.insertWordEntries")(function* (
        wordEntries: readonly Domain.WordEntry[]
      ) {
        yield* db.from("word_entries").insertAll([...wordEntries]);
      }),

      updateWordEntry: Effect.fn("Store.updateWordEntry")(function* ({
        originalText,
        wordEntry,
      }: {
        readonly originalText: Domain.WordEntry["text"];
        readonly wordEntry: Domain.WordEntry;
      }) {
        if (originalText === wordEntry.text) {
          yield* db.from("word_entries").upsert(wordEntry);
          return;
        }

        yield* db.withTransaction({
          tables: [
            "word_entries",
            "word_practice_batches",
            "word_practice_states",
            "word_practice_submissions",
          ],
          mode: "readwrite",
        })(
          Effect.gen(function* () {
            const submissions = yield* db
              .from("word_practice_submissions")
              .select("byWordText")
              .equals(originalText);
            const batches = yield* db
              .from("word_practice_batches")
              .select("byStartedAt");
            const states = yield* db
              .from("word_practice_states")
              .select()
              .equals(originalText);
            const updatedSubmissions = submissions.map((submission) => ({
              ...submission,
              wordText: wordEntry.text,
            }));
            const updatedStates = states.map((state) => ({
              ...state,
              wordText: wordEntry.text,
            }));
            const updatedBatches = batches
              .filter((batch) => batch.wordOrder.includes(originalText))
              .map((batch) => ({
                ...batch,
                wordOrder: batch.wordOrder.map((wordText) =>
                  wordText === originalText ? wordEntry.text : wordText
                ),
              }));

            yield* db.from("word_entries").delete().equals(originalText);
            yield* db.from("word_entries").insert(wordEntry);
            yield* db
              .from("word_practice_submissions")
              .upsertAll(updatedSubmissions);
            yield* db
              .from("word_practice_states")
              .delete()
              .equals(originalText);
            yield* db.from("word_practice_states").upsertAll(updatedStates);
            yield* db.from("word_practice_batches").upsertAll(updatedBatches);
          })
        );
      }),

      deleteWordEntry: Effect.fn("Store.deleteWordEntry")(function* (
        text: Domain.WordEntry["text"]
      ) {
        yield* db.withTransaction({
          tables: [
            "word_entries",
            "word_practice_batches",
            "word_practice_states",
            "word_practice_submissions",
          ],
          mode: "readwrite",
        })(
          Effect.gen(function* () {
            const submissions = yield* db
              .from("word_practice_submissions")
              .select("byWordText")
              .equals(text);
            const batches = yield* db
              .from("word_practice_batches")
              .select("byStartedAt");
            const updatedBatches = batches
              .filter((batch) => batch.wordOrder.includes(text))
              .map((batch) => ({
                ...batch,
                wordOrder: batch.wordOrder.filter(
                  (wordText) => wordText !== text
                ),
              }));

            yield* Effect.all([
              db.from("word_entries").delete().equals(text),
              db.from("word_practice_states").delete().equals(text),
              Effect.all(
                submissions.map((submission) =>
                  db
                    .from("word_practice_submissions")
                    .delete()
                    .equals(submission.id)
                )
              ),
              db.from("word_practice_batches").upsertAll(updatedBatches),
            ]);
          })
        );
      }),

      deleteAllWordEntries: Effect.fn("Store.deleteAllWordEntries")(
        function* () {
          yield* db.withTransaction({
            tables: [
              "word_entries",
              "word_practice_batches",
              "word_practice_states",
              "word_practice_submissions",
            ],
            mode: "readwrite",
          })(
            Effect.all([
              db.from("word_entries").clear,
              db.from("word_practice_batches").clear,
              db.from("word_practice_states").clear,
              db.from("word_practice_submissions").clear,
            ])
          );
        }
      ),

      insertWordPracticeSubmission: Effect.fn(
        "Store.insertWordPracticeSubmission"
      )(function* (submission: Domain.WordPracticeSubmission) {
        yield* db.from("word_practice_submissions").insert(submission);
      }),

      saveWordPracticeSubmissionAndBatches: Effect.fn(
        "Store.saveWordPracticeSubmissionAndBatches"
      )(function* ({
        batches,
        submission,
      }: {
        readonly batches: readonly Domain.WordPracticeBatch[];
        readonly submission: Domain.WordPracticeSubmission;
      }) {
        yield* db.withTransaction({
          tables: ["word_practice_batches", "word_practice_submissions"],
          mode: "readwrite",
        })(
          Effect.gen(function* () {
            yield* db.from("word_practice_submissions").insert(submission);

            if (!EffectArray.isReadonlyArrayNonEmpty(batches)) {
              return;
            }

            yield* db.from("word_practice_batches").upsertAll([...batches]);
          })
        );
      }),

      saveWordPracticeSubmissionStateAndBatches: Effect.fn(
        "Store.saveWordPracticeSubmissionStateAndBatches"
      )(function* ({
        batches,
        state,
        submission,
      }: {
        readonly batches: readonly Domain.WordPracticeBatch[];
        readonly state: Domain.WordPracticeState;
        readonly submission: Domain.WordPracticeSubmission;
      }) {
        yield* db.withTransaction({
          tables: [
            "word_practice_batches",
            "word_practice_states",
            "word_practice_submissions",
          ],
          mode: "readwrite",
        })(
          Effect.gen(function* () {
            yield* db.from("word_practice_submissions").insert(submission);
            yield* db.from("word_practice_states").upsert(state);

            if (!EffectArray.isReadonlyArrayNonEmpty(batches)) {
              return;
            }

            yield* db.from("word_practice_batches").upsertAll([...batches]);
          })
        );
      }),

      listWordPracticeSubmissions: Effect.fn(
        "Store.listWordPracticeSubmissions"
      )(function* () {
        return yield* db
          .from("word_practice_submissions")
          .select("bySubmittedAt")
          .reverse();
      }),

      listWordPracticeSubmissionsByWord: Effect.fn(
        "Store.listWordPracticeSubmissionsByWord"
      )(function* (wordText: Domain.WordPracticeSubmission["wordText"]) {
        return yield* db
          .from("word_practice_submissions")
          .select("byWordText")
          .equals(wordText);
      }),

      listWordPracticeStates: Effect.fn("Store.listWordPracticeStates")(
        function* () {
          return yield* db
            .from("word_practice_states")
            .select("byUpdatedAt")
            .reverse();
        }
      ),

      getWordPracticeState: Effect.fn("Store.getWordPracticeState")(function* (
        wordText: Domain.WordPracticeState["wordText"]
      ) {
        const states = yield* db
          .from("word_practice_states")
          .select()
          .equals(wordText);

        return states[0];
      }),

      upsertWordPracticeState: Effect.fn("Store.upsertWordPracticeState")(
        function* (state: Domain.WordPracticeState) {
          yield* db.from("word_practice_states").upsert(state);
        }
      ),

      upsertWordPracticeStates: Effect.fn("Store.upsertWordPracticeStates")(
        function* (states: readonly Domain.WordPracticeState[]) {
          yield* db.from("word_practice_states").upsertAll([...states]);
        }
      ),

      listWordPracticeBatches: Effect.fn("Store.listWordPracticeBatches")(
        function* () {
          return yield* db
            .from("word_practice_batches")
            .select("byStartedAt")
            .reverse();
        }
      ),

      insertWordPracticeBatch: Effect.fn("Store.insertWordPracticeBatch")(
        function* (batch: Domain.WordPracticeBatch) {
          yield* db.from("word_practice_batches").insert(batch);
        }
      ),

      upsertWordPracticeBatch: Effect.fn("Store.upsertWordPracticeBatch")(
        function* (batch: Domain.WordPracticeBatch) {
          yield* db.from("word_practice_batches").upsert(batch);
        }
      ),
    };
  }),
}) {
  static readonly Default = Layer.effect(this)(this.make);
}
