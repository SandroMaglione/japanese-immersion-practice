import { Context, Effect, Layer } from "effect";

import * as Database from "./database.ts";
import * as Domain from "./domain.ts";

export type ImportPracticeInput = {
  readonly practiceImport: Domain.PracticeImport;
  readonly attempts: readonly Domain.PracticeAttempt[];
};

export type StoreService = Context.Service.Shape<typeof Store>;

export class Store extends Context.Service<Store>()("@jip/indexeddb/Store", {
  make: Effect.gen(function* () {
    const db = yield* Database.JapanesePracticeDatabase.getQueryBuilder;

    return {
      importPractice: Effect.fn("Store.importPractice")(function* ({
        attempts,
        practiceImport,
      }: ImportPracticeInput) {
        yield* db.withTransaction({
          tables: ["practice_imports", "practice_attempts"],
          mode: "readwrite",
        })(
          Effect.all([
            db.from("practice_imports").insert(practiceImport),
            db.from("practice_attempts").insertAll([...attempts]),
          ])
        );
      }),

      listPracticeImports: Effect.fn("Store.listPracticeImports")(function* () {
        return yield* db
          .from("practice_imports")
          .select("byImportedAt")
          .reverse();
      }),

      listPracticeAttempts: Effect.fn("Store.listPracticeAttempts")(
        function* () {
          return yield* db.from("practice_attempts").select();
        }
      ),

      listPracticeAttemptsByImport: Effect.fn(
        "Store.listPracticeAttemptsByImport"
      )(function* (importId: Domain.PracticeImportId) {
        return yield* db
          .from("practice_attempts")
          .select("byImport")
          .equals(importId);
      }),

      countPracticeAttemptsByImport: Effect.fn(
        "Store.countPracticeAttemptsByImport"
      )(function* (importId: Domain.PracticeImportId) {
        return yield* db
          .from("practice_attempts")
          .count("byImport")
          .equals(importId);
      }),

      listPracticeAttemptsByResult: Effect.fn(
        "Store.listPracticeAttemptsByResult"
      )(function* (result: Domain.PracticeResult) {
        return yield* db
          .from("practice_attempts")
          .select("byResult")
          .equals(result);
      }),

      listKanjiEntries: Effect.fn("Store.listKanjiEntries")(function* () {
        return yield* db.from("kanji_entries").select("byUpdatedAt").reverse();
      }),

      upsertKanjiEntry: Effect.fn("Store.upsertKanjiEntry")(function* (
        kanjiEntry: Domain.KanjiEntry
      ) {
        yield* db.from("kanji_entries").upsert(kanjiEntry);
      }),

      listWordEntries: Effect.fn("Store.listWordEntries")(function* () {
        return yield* db.from("word_entries").select("byUpdatedAt").reverse();
      }),

      upsertWordEntry: Effect.fn("Store.upsertWordEntry")(function* (
        wordEntry: Domain.WordEntry
      ) {
        yield* db.from("word_entries").upsert(wordEntry);
      }),

      insertWordPracticeSubmission: Effect.fn(
        "Store.insertWordPracticeSubmission"
      )(function* (submission: Domain.WordPracticeSubmission) {
        yield* db.from("word_practice_submissions").insert(submission);
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

      listDueWordPracticeSubmissions: Effect.fn(
        "Store.listDueWordPracticeSubmissions"
      )(function* (nextReviewAtEpochMillis: number) {
        return yield* db
          .from("word_practice_submissions")
          .select("byNextReviewAt")
          .lte(nextReviewAtEpochMillis);
      }),
    };
  }),
}) {
  static readonly Default = Layer.effect(this)(this.make);
}
