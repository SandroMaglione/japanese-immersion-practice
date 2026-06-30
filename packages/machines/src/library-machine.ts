import { IndexedDb } from "@jip/indexeddb";
import { DateTime, Effect, Array as EffectArray, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const LibraryDataSchema = Schema.Struct({
  kanjiEntries: Schema.Array(IndexedDb.Domain.KanjiEntry),
  wordEntries: Schema.Array(IndexedDb.Domain.WordEntry),
});

const LibraryContextSchema = Schema.Struct({
  kanjiDescription: Schema.String,
  kanjiEntries: Schema.Array(IndexedDb.Domain.KanjiEntry),
  kanjiReadings: Schema.String,
  kanjiSymbol: Schema.String,
  message: Schema.optionalKey(Schema.String),
  wordDescription: Schema.String,
  wordEntries: Schema.Array(IndexedDb.Domain.WordEntry),
  wordText: Schema.String,
  wordTranslation: Schema.String,
});

const SaveKanjiInputSchema = Schema.Struct({
  description: Schema.String,
  readings: Schema.String,
  symbol: Schema.String,
});

const SaveWordInputSchema = Schema.Struct({
  description: Schema.String,
  text: Schema.String,
  translation: Schema.String,
});

const _loadLibraryData = Effect.gen(function* () {
  const store = yield* IndexedDb.Store.Store;
  const kanjiEntries = yield* store.listKanjiEntries();
  const wordEntries = yield* store.listWordEntries();

  return {
    kanjiEntries,
    wordEntries,
  };
});

export const makeLibraryMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<IndexedDb.Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(LibraryContextSchema),
      events: {
        changeKanjiDescription: Schema.toStandardSchemaV1(
          Schema.Struct({ description: Schema.String })
        ),
        changeKanjiReadings: Schema.toStandardSchemaV1(
          Schema.Struct({ readings: Schema.String })
        ),
        changeKanjiSymbol: Schema.toStandardSchemaV1(
          Schema.Struct({ symbol: Schema.String })
        ),
        changeWordDescription: Schema.toStandardSchemaV1(
          Schema.Struct({ description: Schema.String })
        ),
        changeWordText: Schema.toStandardSchemaV1(
          Schema.Struct({ text: Schema.String })
        ),
        changeWordTranslation: Schema.toStandardSchemaV1(
          Schema.Struct({ translation: Schema.String })
        ),
        refresh: Schema.toStandardSchemaV1(Schema.Void),
        saveKanji: Schema.toStandardSchemaV1(Schema.Void),
        saveWord: Schema.toStandardSchemaV1(Schema.Void),
      },
    },
    actorSources: {
      loadLibrary: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(LibraryDataSchema),
        },
        run: () => runtime.runPromise(_loadLibraryData),
      }),
      saveKanjiEntry: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(SaveKanjiInputSchema),
          output: Schema.toStandardSchemaV1(LibraryDataSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              const symbol = input.symbol.trim();
              const description = input.description.trim();
              const readings = input.readings
                .split(/[\s,、]+/)
                .map((reading) => reading.trim())
                .filter(Boolean);

              if (
                symbol === "" ||
                description === "" ||
                !EffectArray.isReadonlyArrayNonEmpty(readings)
              ) {
                return yield* Effect.fail(
                  new Error("Add a kanji, at least one reading, and a note.")
                );
              }

              const store = yield* IndexedDb.Store.Store;
              const existingKanjiEntries = yield* store.listKanjiEntries();

              if (
                existingKanjiEntries.some((entry) => entry.symbol === symbol)
              ) {
                return yield* Effect.fail(
                  new Error("That kanji is already in your library.")
                );
              }

              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const kanjiEntry = yield* Schema.decodeEffect(
                IndexedDb.Domain.KanjiEntry
              )({
                createdAt: now,
                description,
                readings,
                symbol,
                updatedAt: now,
              });

              yield* store.insertKanjiEntry(kanjiEntry);

              return yield* _loadLibraryData;
            })
          ),
      }),
      saveWordEntry: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(SaveWordInputSchema),
          output: Schema.toStandardSchemaV1(LibraryDataSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              const text = input.text.trim();
              const translation = input.translation.trim();
              const description = input.description.trim();

              if (text === "" || translation === "") {
                return yield* Effect.fail(
                  new Error("Add a word and translation before saving.")
                );
              }

              const store = yield* IndexedDb.Store.Store;
              const existingWordEntries = yield* store.listWordEntries();

              if (existingWordEntries.some((entry) => entry.text === text)) {
                return yield* Effect.fail(
                  new Error("That word is already in your library.")
                );
              }

              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const wordEntry = yield* Schema.decodeEffect(
                IndexedDb.Domain.WordEntry
              )({
                createdAt: now,
                ...(description === "" ? {} : { description }),
                text,
                translation,
                updatedAt: now,
              });

              yield* store.insertWordEntry(wordEntry);

              return yield* _loadLibraryData;
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      kanjiDescription: "",
      kanjiEntries: [],
      kanjiReadings: "",
      kanjiSymbol: "",
      wordDescription: "",
      wordEntries: [],
      wordText: "",
      wordTranslation: "",
    },
    initial: "Loading",
    states: {
      Loading: {
        invoke: {
          src: "loadLibrary",
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              kanjiEntries: event.output.kanjiEntries,
              message: undefined,
              wordEntries: event.output.wordEntries,
            },
          }),
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not load the library.",
            },
          }),
        },
      },
      Ready: {
        on: {
          changeKanjiDescription: ({ event }) => ({
            context: {
              kanjiDescription: event.description,
              message: undefined,
            },
          }),
          changeKanjiReadings: ({ event }) => ({
            context: {
              kanjiReadings: event.readings,
              message: undefined,
            },
          }),
          changeKanjiSymbol: ({ event }) => ({
            context: {
              kanjiSymbol: event.symbol,
              message: undefined,
            },
          }),
          changeWordDescription: ({ event }) => ({
            context: {
              message: undefined,
              wordDescription: event.description,
            },
          }),
          changeWordText: ({ event }) => ({
            context: {
              message: undefined,
              wordText: event.text,
            },
          }),
          changeWordTranslation: ({ event }) => ({
            context: {
              message: undefined,
              wordTranslation: event.translation,
            },
          }),
          refresh: {
            target: "Loading",
          },
          saveKanji: {
            target: "SavingKanji",
          },
          saveWord: {
            target: "SavingWord",
          },
        },
      },
      SavingKanji: {
        invoke: {
          src: "saveKanjiEntry",
          input: ({ context }) => ({
            description: context.kanjiDescription,
            readings: context.kanjiReadings,
            symbol: context.kanjiSymbol,
          }),
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              kanjiDescription: "",
              kanjiEntries: event.output.kanjiEntries,
              kanjiReadings: "",
              kanjiSymbol: "",
              message: "Kanji saved.",
              wordEntries: event.output.wordEntries,
            },
          }),
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not save the kanji.",
            },
          }),
        },
      },
      SavingWord: {
        invoke: {
          src: "saveWordEntry",
          input: ({ context }) => ({
            description: context.wordDescription,
            text: context.wordText,
            translation: context.wordTranslation,
          }),
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              kanjiEntries: event.output.kanjiEntries,
              message: "Word saved.",
              wordDescription: "",
              wordEntries: event.output.wordEntries,
              wordText: "",
              wordTranslation: "",
            },
          }),
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not save the word.",
            },
          }),
        },
      },
    },
  });
