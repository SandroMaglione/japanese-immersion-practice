import {
  IndexedDb as PlatformIndexedDb,
  IndexedDbDatabase,
  IndexedDbVersion,
} from "@effect/platform-browser";
import { Effect, Layer } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";

import * as Tables from "./tables.ts";

export const DatabaseName = "japanese-immersion-practice";

export class Version1 extends IndexedDbVersion.make(
  Tables.PracticeImportsTable,
  Tables.PracticeAttemptsTable,
  Tables.KanjiEntriesTable,
  Tables.WordEntriesTable,
  Tables.WordPracticeSubmissionsTable
) {}

export class JapanesePracticeDatabase extends IndexedDbDatabase.make(
  Version1,
  Effect.fn("JapanesePracticeDatabase.init")(function* (api) {
    yield* api.createObjectStore("practice_imports");
    yield* api.createIndex("practice_imports", "byImportedAt");

    yield* api.createObjectStore("practice_attempts");
    yield* api.createIndex("practice_attempts", "byImport");
    yield* api.createIndex("practice_attempts", "byResult");

    yield* api.createObjectStore("kanji_entries");
    yield* api.createIndex("kanji_entries", "byUpdatedAt");

    yield* api.createObjectStore("word_entries");
    yield* api.createIndex("word_entries", "byUpdatedAt");

    yield* api.createObjectStore("word_practice_submissions");
    yield* api.createIndex("word_practice_submissions", "byWordText");
    yield* api.createIndex("word_practice_submissions", "bySubmittedAt");
    yield* api.createIndex("word_practice_submissions", "byNextReviewAt");
  })
) {}

export const layer = JapanesePracticeDatabase.layer(DatabaseName);

export const browserLayer = layer.pipe(
  Layer.provideMerge(PlatformIndexedDb.layerWindow),
  Layer.provideMerge(Reactivity.layer)
);
