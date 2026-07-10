import {
  IndexedDb as PlatformIndexedDb,
  IndexedDbDatabase,
  IndexedDbTable,
  IndexedDbVersion,
} from "@effect/platform-browser";
import { Effect, Layer, Result, Schema } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";

import { buildVersion5Data } from "./legacy-migration.ts";
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

export class Version4 extends IndexedDbVersion.make(
  Tables.WordEntriesTable,
  Tables.WordPracticeSubmissionsTable,
  Tables.WordPracticeStatesTable,
  Tables.WordPracticeBatchesTable
) {}

export class Version5 extends IndexedDbVersion.make(
  Tables.WordsTable,
  Tables.WordMemoryStatesTable,
  Tables.WordPracticeEventsTable
) {}

export class Version6 extends IndexedDbVersion.make(
  Tables.WordsTable,
  Tables.WordMemoryStatesTable,
  Tables.WordPracticeEventsTable
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
  )
  .add(
    Version4,
    Effect.fn("JapanesePracticeDatabase.migrateToVersion4")(
      function* (_fromApi, toApi) {
        yield* toApi.createObjectStore("word_practice_states");
        yield* toApi.createIndex("word_practice_states", "byUpdatedAt");
      }
    )
  )
  .add(
    Version5,
    Effect.fn("JapanesePracticeDatabase.migrateToVersion5")(
      function* (_fromApi, _toApi) {
        yield* Effect.void;
      }
    )
  )
  .add(
    Version6,
    Effect.fn("JapanesePracticeDatabase.migrateToVersion6")(
      function* (fromApi, toApi) {
        const objectStoreNames = fromApi.transaction.db.objectStoreNames;
        const hasLegacyStores =
          objectStoreNames.contains("word_entries") &&
          objectStoreNames.contains("word_practice_submissions") &&
          objectStoreNames.contains("word_practice_batches");
        const hasCurrentStores =
          objectStoreNames.contains("words") &&
          objectStoreNames.contains("word_memory_states") &&
          objectStoreNames.contains("word_practice_events");

        if (!hasLegacyStores) {
          if (hasCurrentStores) {
            return;
          }

          return yield* Effect.fail(
            new Error("The existing word database is incomplete.")
          );
        }

        if (objectStoreNames.contains("words")) {
          yield* fromApi.deleteObjectStore("words");
        }

        if (objectStoreNames.contains("word_memory_states")) {
          yield* fromApi.deleteObjectStore("word_memory_states");
        }

        if (objectStoreNames.contains("word_practice_events")) {
          yield* fromApi.deleteObjectStore("word_practice_events");
        }

        yield* toApi.createObjectStore("words");
        yield* toApi.createIndex("words", "byUpdatedAt");
        yield* toApi.createObjectStore("word_memory_states");
        yield* toApi.createIndex("word_memory_states", "byDueAt");
        yield* toApi.createIndex("word_memory_states", "byLastPracticedAt");
        yield* toApi.createIndex("word_memory_states", "byPhase");
        yield* toApi.createIndex("word_memory_states", "byPhaseAndDueAt");
        yield* toApi.createIndex(
          "word_memory_states",
          "byPhaseAndLastPracticedAt"
        );
        yield* toApi.createIndex("word_memory_states", "byUpdatedAt");
        yield* toApi.createObjectStore("word_practice_events");
        yield* toApi.createIndex("word_practice_events", "byReviewedAt");
        yield* toApi.createIndex("word_practice_events", "bySessionId");
        yield* toApi.createIndex("word_practice_events", "byWordId");

        yield* Effect.callback<void, Error>((resume) => {
          type MigrationInput = Parameters<typeof buildVersion5Data>[0];

          const transaction = fromApi.transaction;
          const legacyWordsRequest = transaction
            .objectStore("word_entries")
            .getAll();
          const legacySubmissionsRequest = transaction
            .objectStore("word_practice_submissions")
            .getAll();
          const legacyBatchesRequest = transaction
            .objectStore("word_practice_batches")
            .getAll();
          let legacyWords: MigrationInput["legacyWords"] | undefined;
          let legacySubmissions:
            | MigrationInput["legacySubmissions"]
            | undefined;
          let legacyBatches: MigrationInput["legacyBatches"] | undefined;

          const migrateWhenReady = () => {
            if (
              legacyWords === undefined ||
              legacySubmissions === undefined ||
              legacyBatches === undefined
            ) {
              return;
            }

            const readyLegacyWords = legacyWords;
            const readyLegacySubmissions = legacySubmissions;
            const readyLegacyBatches = legacyBatches;
            const migrationResult = Result.try({
              try: () => {
                const nextData = buildVersion5Data({
                  legacyBatches: readyLegacyBatches,
                  legacySubmissions: readyLegacySubmissions,
                  legacyWords: readyLegacyWords,
                });
                const wordsStore = transaction.objectStore("words");
                const statesStore =
                  transaction.objectStore("word_memory_states");
                const eventsStore = transaction.objectStore(
                  "word_practice_events"
                );

                for (const word of nextData.words) {
                  wordsStore.add(word);
                }

                for (const state of nextData.states) {
                  statesStore.add(state);
                }

                for (const event of nextData.events) {
                  eventsStore.add(event);
                }

                transaction.db.deleteObjectStore("word_entries");
                transaction.db.deleteObjectStore("word_practice_submissions");
                if (
                  transaction.db.objectStoreNames.contains(
                    "word_practice_states"
                  )
                ) {
                  transaction.db.deleteObjectStore("word_practice_states");
                }
                transaction.db.deleteObjectStore("word_practice_batches");
              },
              catch: (cause) =>
                new Error("Could not transform legacy practice data.", {
                  cause,
                }),
            });

            resume(
              Result.isFailure(migrationResult)
                ? Effect.fail(migrationResult.failure)
                : Effect.void
            );
          };
          const failRead = (request: IDBRequest) => () => {
            resume(
              Effect.fail(
                new Error("Could not read legacy practice data.", {
                  cause: request.error,
                })
              )
            );
          };

          legacyWordsRequest.onerror = failRead(legacyWordsRequest);
          legacySubmissionsRequest.onerror = failRead(legacySubmissionsRequest);
          legacyBatchesRequest.onerror = failRead(legacyBatchesRequest);
          legacyWordsRequest.onsuccess = () => {
            legacyWords = legacyWordsRequest.result;
            migrateWhenReady();
          };
          legacySubmissionsRequest.onsuccess = () => {
            legacySubmissions = legacySubmissionsRequest.result;
            migrateWhenReady();
          };
          legacyBatchesRequest.onsuccess = () => {
            legacyBatches = legacyBatchesRequest.result;
            migrateWhenReady();
          };
        });
      }
    )
  ) {}

export const layer = JapanesePracticeDatabase.layer(DatabaseName);

export const browserLayer = layer.pipe(
  Layer.provideMerge(PlatformIndexedDb.layerWindow),
  Layer.provideMerge(Reactivity.layer)
);
