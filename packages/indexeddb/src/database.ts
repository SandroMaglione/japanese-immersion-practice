import {
  IndexedDb as PlatformIndexedDb,
  IndexedDbDatabase,
  IndexedDbTable,
  IndexedDbVersion,
} from "@effect/platform-browser";
import { Effect, Layer, Schema } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";

import * as Tables from "./tables.ts";

export const DatabaseName = "japanese-immersion-practice";

class RemovedImportStoreTable extends IndexedDbTable.make({
  name: "practice_imports",
  schema: Schema.Struct({
    id: Schema.String,
  }),
  keyPath: "id",
  indexes: {},
}) {}

class RemovedSentenceResponseStoreTable extends IndexedDbTable.make({
  name: "practice_attempts",
  schema: Schema.Struct({
    id: Schema.String,
  }),
  keyPath: "id",
  indexes: {},
}) {}

class RemovedCharacterStoreTable extends IndexedDbTable.make({
  name: "kanji_entries",
  schema: Schema.Struct({
    symbol: Schema.String,
  }),
  keyPath: "symbol",
  indexes: {},
}) {}

export class Version1 extends IndexedDbVersion.make(
  RemovedImportStoreTable,
  RemovedSentenceResponseStoreTable,
  RemovedCharacterStoreTable,
  Tables.WordEntriesTable,
  Tables.WordPracticeSubmissionsTable
) {}

export class Version2 extends IndexedDbVersion.make(
  RemovedImportStoreTable,
  RemovedSentenceResponseStoreTable,
  RemovedCharacterStoreTable,
  Tables.WordEntriesTable,
  Tables.WordPracticeSubmissionsTable,
  Tables.WordPracticeBatchesTable
) {}

export class Version3 extends IndexedDbVersion.make(
  Tables.WordEntriesTable,
  Tables.WordPracticeSubmissionsTable,
  Tables.WordPracticeBatchesTable
) {}

export class JapanesePracticeDatabase extends IndexedDbDatabase.make(
  Version1,
  Effect.fn("JapanesePracticeDatabase.init")(function* (api) {
    yield* api.createObjectStore("word_entries");
    yield* api.createIndex("word_entries", "byUpdatedAt");

    yield* api.createObjectStore("word_practice_submissions");
    yield* api.createIndex("word_practice_submissions", "byWordText");
    yield* api.createIndex("word_practice_submissions", "bySubmittedAt");
  })
)
  .add(
    Version2,
    Effect.fn("JapanesePracticeDatabase.migrateToVersion2")(
      function* (_fromApi, toApi) {
        yield* toApi.createObjectStore("word_practice_batches");
        yield* toApi.createIndex("word_practice_batches", "byBatchNumber");
        yield* toApi.createIndex("word_practice_batches", "byStartedAt");
      }
    )
  )
  .add(
    Version3,
    Effect.fn("JapanesePracticeDatabase.migrateToVersion3")(
      function* (fromApi, _toApi) {
        if (
          fromApi.transaction.db.objectStoreNames.contains("practice_imports")
        ) {
          yield* fromApi.deleteObjectStore("practice_imports");
        }

        if (
          fromApi.transaction.db.objectStoreNames.contains("practice_attempts")
        ) {
          yield* fromApi.deleteObjectStore("practice_attempts");
        }

        if (fromApi.transaction.db.objectStoreNames.contains("kanji_entries")) {
          yield* fromApi.deleteObjectStore("kanji_entries");
        }
      }
    )
  ) {}

export const layer = JapanesePracticeDatabase.layer(DatabaseName);

export const browserLayer = layer.pipe(
  Layer.provideMerge(PlatformIndexedDb.layerWindow),
  Layer.provideMerge(Reactivity.layer)
);
