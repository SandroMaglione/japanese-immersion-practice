import { IndexedDb } from "@jip/indexeddb";
import { FuriganaText } from "@jip/services";
import {
  Array as EffectArray,
  DateTime,
  Effect,
  Formatter,
  Option,
  Schema,
} from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const LibraryDataSchema = Schema.Struct({
  kanjiEntries: Schema.Array(IndexedDb.Domain.KanjiEntry),
  wordEntries: Schema.Array(IndexedDb.Domain.WordEntry),
});

const WordLibraryViewSchema = Schema.Literals(["batch", "single"]);

const DeleteWordConfirmationTimeoutMillis = 4_000;

export const DeleteAllWordsConfirmationText = "delete all my words";

const LibraryContextSchema = Schema.Struct({
  deleteAllWordsConfirmation: Schema.String,
  deletingWordText: Schema.optionalKey(Schema.String),
  editingWordDescription: Schema.String,
  editingWordOriginalText: Schema.optionalKey(Schema.String),
  editingWordText: Schema.String,
  editingWordTranslation: Schema.String,
  importedWordCount: Schema.Number,
  kanjiDescription: Schema.String,
  kanjiEntries: Schema.Array(IndexedDb.Domain.KanjiEntry),
  kanjiReadings: Schema.String,
  kanjiSymbol: Schema.String,
  message: Schema.optionalKey(Schema.String),
  wordDescription: Schema.String,
  wordEntries: Schema.Array(IndexedDb.Domain.WordEntry),
  wordImportJsonText: Schema.String,
  wordText: Schema.String,
  wordTranslation: Schema.String,
  wordView: WordLibraryViewSchema,
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

const UpdateWordInputSchema = Schema.Struct({
  description: Schema.String,
  originalText: Schema.String,
  text: Schema.String,
  translation: Schema.String,
});

const DeleteWordInputSchema = Schema.Struct({
  text: Schema.String,
});

const DeleteAllWordsInputSchema = Schema.Struct({
  confirmation: Schema.String,
});

const ImportWordsInputSchema = Schema.Struct({
  jsonText: Schema.String,
});

const ImportWordsResultSchema = Schema.Struct({
  importedCount: Schema.Number,
  kanjiEntries: Schema.Array(IndexedDb.Domain.KanjiEntry),
  skippedCount: Schema.Number,
  skippedReasons: Schema.Array(Schema.String),
  wordEntries: Schema.Array(IndexedDb.Domain.WordEntry),
});

const FuriganaNotationDescription =
  "Furigana notation: add each kanji reading in square brackets immediately after that kanji, with no spaces, for example 資[し]金[きん]. Do not group readings after a multi-kanji word. For kana-only words, write the word as-is.";

const WordImportJsonWordSchema = Schema.Struct({
  description: Schema.optionalKey(
    Schema.NullOr(Schema.String).annotate({
      description:
        "Optional notes. Add syntax, one short example sentence, or nuance information about this word.",
    })
  ),
  text: IndexedDb.Domain.NonEmptyString.annotate({
    description: `Japanese word or expression to import. ${FuriganaNotationDescription}`,
  }),
  translation: IndexedDb.Domain.NonEmptyString.annotate({
    description:
      "Plain translations for this Japanese word, separated by semicolons and a single space, with no semicolon at the end. Example: qualifications; requirements; capabilities. Do not include explanations, sentences, numbering, or extra notes.",
  }),
});

const WordImportJsonSourceSchema = Schema.Struct({
  words: Schema.Array(Schema.Unknown),
});

export const WordImportJsonSchema = Schema.Struct({
  words: Schema.Array(WordImportJsonWordSchema)
    .check(Schema.isNonEmpty())
    .annotate({
      description: "Words to import into the word library.",
    }),
}).annotate({
  description:
    "JSON payload for importing Japanese vocabulary words into the word library.",
  title: "Word import JSON",
});

export const WordImportJsonSchemaDocument =
  Schema.toJsonSchemaDocument(WordImportJsonSchema);

export const WordImportJsonSchemaDefinition =
  WordImportJsonSchemaDocument.schema;

export const WordImportJsonSchemaDefinitionText = Formatter.formatJson(
  WordImportJsonSchemaDefinition,
  {
    space: 2,
  }
);

export const WordImportJsonExample = Formatter.formatJson(
  {
    words: [
      {
        description:
          "事業を始めるための資金が必要です。Money prepared for a specific purpose, especially business or activity costs.",
        text: "資[し]金[きん]",
        translation: "funds; capital",
      },
      {
        description:
          "思いがけない再会などに使う。昨日、駅で友達にばったり会った。",
        text: "ばったり会[あ]う",
        translation: "to run into; to bump into",
      },
    ],
  },
  {
    space: 2,
  }
);

const _loadLibraryData = Effect.gen(function* () {
  const store = yield* IndexedDb.Store.Store;
  const kanjiEntries = yield* store.listKanjiEntries();
  const wordEntries = yield* store.listWordEntries();

  return {
    kanjiEntries,
    wordEntries,
  };
});

const _normalizeWordText = ({ text }: { readonly text: string }) =>
  FuriganaText.normalizePlainText({ text });

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
        changeEditingWordDescription: Schema.toStandardSchemaV1(
          Schema.Struct({ description: Schema.String })
        ),
        changeEditingWordText: Schema.toStandardSchemaV1(
          Schema.Struct({ text: Schema.String })
        ),
        changeEditingWordTranslation: Schema.toStandardSchemaV1(
          Schema.Struct({ translation: Schema.String })
        ),
        changeDeleteAllWordsConfirmation: Schema.toStandardSchemaV1(
          Schema.Struct({ confirmation: Schema.String })
        ),
        changeWordDescription: Schema.toStandardSchemaV1(
          Schema.Struct({ description: Schema.String })
        ),
        changeWordImportJsonText: Schema.toStandardSchemaV1(
          Schema.Struct({ jsonText: Schema.String })
        ),
        changeWordText: Schema.toStandardSchemaV1(
          Schema.Struct({ text: Schema.String })
        ),
        changeWordTranslation: Schema.toStandardSchemaV1(
          Schema.Struct({ translation: Schema.String })
        ),
        cancelDeleteAllWords: Schema.toStandardSchemaV1(Schema.Void),
        cancelWordDeletion: Schema.toStandardSchemaV1(Schema.Void),
        cancelWordEdit: Schema.toStandardSchemaV1(Schema.Void),
        deleteAllWords: Schema.toStandardSchemaV1(Schema.Void),
        deleteWord: Schema.toStandardSchemaV1(
          Schema.Struct({ text: Schema.String })
        ),
        editWord: Schema.toStandardSchemaV1(
          Schema.Struct({ text: Schema.String })
        ),
        importWords: Schema.toStandardSchemaV1(Schema.Void),
        refresh: Schema.toStandardSchemaV1(Schema.Void),
        resetWordImport: Schema.toStandardSchemaV1(Schema.Void),
        saveKanji: Schema.toStandardSchemaV1(Schema.Void),
        saveWord: Schema.toStandardSchemaV1(Schema.Void),
        selectWordView: Schema.toStandardSchemaV1(
          Schema.Struct({ view: WordLibraryViewSchema })
        ),
        updateWord: Schema.toStandardSchemaV1(Schema.Void),
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
              const normalizedText = _normalizeWordText({ text });
              const translation = input.translation.trim();
              const description = input.description.trim();

              if (normalizedText === "" || translation === "") {
                return yield* Effect.fail(
                  new Error("Add a word and translation before saving.")
                );
              }

              const store = yield* IndexedDb.Store.Store;
              const existingWordEntries = yield* store.listWordEntries();

              if (
                existingWordEntries.some(
                  (entry) =>
                    _normalizeWordText({ text: entry.text }) === normalizedText
                )
              ) {
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
      importWordEntries: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(ImportWordsInputSchema),
          output: Schema.toStandardSchemaV1(ImportWordsResultSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              if (input.jsonText.trim() === "") {
                return yield* Effect.fail(
                  new Error("Paste word JSON before importing.")
                );
              }

              const importData = yield* Schema.decodeEffect(
                Schema.fromJsonString(WordImportJsonSourceSchema)
              )(input.jsonText.replace(/^\uFEFF/, ""));

              const skippedReasons: string[] = [];
              const parsedWords: {
                readonly description?: string;
                readonly normalizedText: string;
                readonly text: string;
                readonly translation: string;
              }[] = [];

              for (const [
                wordIndex,
                unknownWord,
              ] of importData.words.entries()) {
                const decodedWord = Schema.decodeUnknownOption(
                  WordImportJsonWordSchema
                )(unknownWord);

                if (Option.isNone(decodedWord)) {
                  skippedReasons.push(`#${wordIndex + 1}: invalid word JSON`);
                  continue;
                }

                const description = decodedWord.value.description?.trim() ?? "";
                const text = decodedWord.value.text.trim();
                const translation = decodedWord.value.translation.trim();
                const normalizedText = _normalizeWordText({ text });
                const displayText =
                  FuriganaText.toPlainText({ text }) || `#${wordIndex + 1}`;

                if (normalizedText === "" || translation === "") {
                  skippedReasons.push(
                    `${displayText}: missing word or translation`
                  );
                  continue;
                }

                if (translation.endsWith(";")) {
                  skippedReasons.push(
                    `${displayText}: translation ends with ;`
                  );
                  continue;
                }

                parsedWords.push({
                  ...(description === "" ? {} : { description }),
                  normalizedText,
                  text,
                  translation,
                });
              }

              const unrepeatedWords: typeof parsedWords = [];

              for (const parsedWord of parsedWords) {
                if (
                  unrepeatedWords.some(
                    (word) => word.normalizedText === parsedWord.normalizedText
                  )
                ) {
                  skippedReasons.push(
                    `${FuriganaText.toPlainText({ text: parsedWord.text })}: repeated in import JSON`
                  );
                  continue;
                }

                unrepeatedWords.push(parsedWord);
              }

              const store = yield* IndexedDb.Store.Store;
              const existingWordEntries = yield* store.listWordEntries();
              const newWords: typeof parsedWords = [];

              for (const parsedWord of unrepeatedWords) {
                if (
                  existingWordEntries.some(
                    (entry) =>
                      _normalizeWordText({ text: entry.text }) ===
                      parsedWord.normalizedText
                  )
                ) {
                  skippedReasons.push(
                    `${FuriganaText.toPlainText({ text: parsedWord.text })}: already in library`
                  );
                  continue;
                }

                newWords.push(parsedWord);
              }

              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const wordEntries = yield* Effect.all(
                newWords.map((word) =>
                  Schema.decodeEffect(IndexedDb.Domain.WordEntry)({
                    createdAt: now,
                    ...(word.description === undefined
                      ? {}
                      : { description: word.description }),
                    text: word.text,
                    translation: word.translation,
                    updatedAt: now,
                  })
                )
              );

              if (EffectArray.isReadonlyArrayNonEmpty(wordEntries)) {
                yield* store.insertWordEntries(wordEntries);
              }

              const libraryData = yield* _loadLibraryData;

              return {
                importedCount: wordEntries.length,
                kanjiEntries: libraryData.kanjiEntries,
                skippedCount: skippedReasons.length,
                skippedReasons: skippedReasons.slice(0, 5),
                wordEntries: libraryData.wordEntries,
              };
            })
          ),
      }),
      updateWordEntry: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(UpdateWordInputSchema),
          output: Schema.toStandardSchemaV1(LibraryDataSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              const originalText = input.originalText.trim();
              const text = input.text.trim();
              const normalizedText = _normalizeWordText({ text });
              const translation = input.translation.trim();
              const description = input.description.trim();

              if (_normalizeWordText({ text: originalText }) === "") {
                return yield* Effect.fail(
                  new Error("Choose a word before updating.")
                );
              }

              if (normalizedText === "" || translation === "") {
                return yield* Effect.fail(
                  new Error("Add a word and translation before updating.")
                );
              }

              const store = yield* IndexedDb.Store.Store;
              const existingWordEntries = yield* store.listWordEntries();
              const existingWordEntry = existingWordEntries.find(
                (entry) => entry.text === originalText
              );

              if (existingWordEntry === undefined) {
                return yield* Effect.fail(
                  new Error("Could not find that word in your library.")
                );
              }

              if (
                text !== originalText &&
                existingWordEntries.some(
                  (entry) =>
                    entry.text !== originalText &&
                    _normalizeWordText({ text: entry.text }) === normalizedText
                )
              ) {
                return yield* Effect.fail(
                  new Error("That word is already in your library.")
                );
              }

              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const wordEntry = yield* Schema.decodeEffect(
                IndexedDb.Domain.WordEntry
              )({
                createdAt: DateTime.toEpochMillis(existingWordEntry.createdAt),
                ...(description === "" ? {} : { description }),
                text,
                translation,
                updatedAt: now,
              });

              yield* store.updateWordEntry({
                originalText,
                wordEntry,
              });

              return yield* _loadLibraryData;
            })
          ),
      }),
      deleteWordEntry: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(DeleteWordInputSchema),
          output: Schema.toStandardSchemaV1(LibraryDataSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              const text = input.text.trim();

              if (text === "") {
                return yield* Effect.fail(
                  new Error("Choose a word before deleting.")
                );
              }

              const store = yield* IndexedDb.Store.Store;
              const existingWordEntries = yield* store.listWordEntries();

              if (!existingWordEntries.some((entry) => entry.text === text)) {
                return yield* Effect.fail(
                  new Error("Could not find that word in your library.")
                );
              }

              yield* store.deleteWordEntry(text);

              return yield* _loadLibraryData;
            })
          ),
      }),
      deleteAllWordEntries: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(DeleteAllWordsInputSchema),
          output: Schema.toStandardSchemaV1(LibraryDataSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              if (
                input.confirmation.trim() !== DeleteAllWordsConfirmationText
              ) {
                return yield* Effect.fail(
                  new Error("Type the confirmation phrase before deleting.")
                );
              }

              const store = yield* IndexedDb.Store.Store;
              yield* store.deleteAllWordEntries();

              return yield* _loadLibraryData;
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      deleteAllWordsConfirmation: "",
      editingWordDescription: "",
      editingWordText: "",
      editingWordTranslation: "",
      importedWordCount: 0,
      kanjiDescription: "",
      kanjiEntries: [],
      kanjiReadings: "",
      kanjiSymbol: "",
      wordDescription: "",
      wordEntries: [],
      wordImportJsonText: "",
      wordText: "",
      wordTranslation: "",
      wordView: "batch",
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
          cancelDeleteAllWords: {
            context: {
              deleteAllWordsConfirmation: "",
              message: undefined,
            },
          },
          cancelWordDeletion: {
            context: {
              deletingWordText: undefined,
              message: undefined,
            },
          },
          cancelWordEdit: {
            context: {
              editingWordDescription: "",
              editingWordOriginalText: undefined,
              editingWordText: "",
              editingWordTranslation: "",
              message: undefined,
            },
          },
          changeEditingWordDescription: ({ event }) => ({
            context: {
              editingWordDescription: event.description,
              message: undefined,
            },
          }),
          changeDeleteAllWordsConfirmation: ({ event }) => ({
            context: {
              deleteAllWordsConfirmation: event.confirmation,
              message: undefined,
            },
          }),
          changeEditingWordText: ({ event }) => ({
            context: {
              editingWordText: event.text,
              message: undefined,
            },
          }),
          changeEditingWordTranslation: ({ event }) => ({
            context: {
              editingWordTranslation: event.translation,
              message: undefined,
            },
          }),
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
          changeWordImportJsonText: ({ event }) => ({
            context: {
              message: undefined,
              wordImportJsonText: event.jsonText,
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
          deleteAllWords: {
            target: "ConfirmingAllWordsDeletion",
            context: {
              deleteAllWordsConfirmation: "",
              deletingWordText: undefined,
              editingWordDescription: "",
              editingWordOriginalText: undefined,
              editingWordText: "",
              editingWordTranslation: "",
              message: undefined,
            },
          },
          deleteWord: ({ event }) => ({
            target: "ConfirmingWordDeletion",
            context: {
              deletingWordText: event.text,
              editingWordDescription: "",
              editingWordOriginalText: undefined,
              editingWordText: "",
              editingWordTranslation: "",
              message: undefined,
            },
          }),
          editWord: ({ context, event }) => {
            const wordEntry = context.wordEntries.find(
              (entry) => entry.text === event.text
            );

            if (wordEntry === undefined) {
              return {
                context: {
                  message: "Could not find that word in your library.",
                },
              };
            }

            return {
              context: {
                editingWordDescription: wordEntry.description ?? "",
                editingWordOriginalText: wordEntry.text,
                editingWordText: wordEntry.text,
                editingWordTranslation: wordEntry.translation,
                message: undefined,
              },
            };
          },
          importWords: {
            target: "ImportingWords",
          },
          refresh: {
            target: "Loading",
          },
          resetWordImport: {
            context: {
              importedWordCount: 0,
              message: undefined,
              wordImportJsonText: "",
            },
          },
          saveKanji: {
            target: "SavingKanji",
          },
          saveWord: {
            target: "SavingWord",
          },
          selectWordView: ({ event }) => ({
            context: {
              message: undefined,
              wordView: event.view,
            },
          }),
          updateWord: {
            target: "UpdatingWord",
          },
        },
      },
      ConfirmingWordDeletion: {
        after: {
          [DeleteWordConfirmationTimeoutMillis]: {
            target: "Ready",
            context: {
              deletingWordText: undefined,
              message: undefined,
            },
          },
        },
        on: {
          cancelWordDeletion: {
            target: "Ready",
            context: {
              deletingWordText: undefined,
              message: undefined,
            },
          },
          deleteAllWords: {
            target: "ConfirmingAllWordsDeletion",
            context: {
              deleteAllWordsConfirmation: "",
              deletingWordText: undefined,
              message: undefined,
            },
          },
          deleteWord: ({ context, event }) =>
            context.deletingWordText === event.text
              ? {
                  target: "DeletingWord",
                }
              : {
                  reenter: true,
                  target: "ConfirmingWordDeletion",
                  context: {
                    deletingWordText: event.text,
                    message: undefined,
                  },
                },
          refresh: {
            target: "Loading",
          },
        },
      },
      ConfirmingAllWordsDeletion: {
        on: {
          cancelDeleteAllWords: {
            target: "Ready",
            context: {
              deleteAllWordsConfirmation: "",
              message: undefined,
            },
          },
          changeDeleteAllWordsConfirmation: ({ event }) => ({
            context: {
              deleteAllWordsConfirmation: event.confirmation,
              message: undefined,
            },
          }),
          deleteAllWords: {
            target: "DeletingAllWords",
          },
          deleteWord: ({ event }) => ({
            target: "ConfirmingWordDeletion",
            context: {
              deleteAllWordsConfirmation: "",
              deletingWordText: event.text,
              message: undefined,
            },
          }),
          refresh: {
            target: "Loading",
          },
        },
      },
      DeletingWord: {
        invoke: {
          src: "deleteWordEntry",
          input: ({ context }) => ({
            text: context.deletingWordText ?? "",
          }),
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              deletingWordText: undefined,
              kanjiEntries: event.output.kanjiEntries,
              message: "Word deleted.",
              wordEntries: event.output.wordEntries,
            },
          }),
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              deletingWordText: undefined,
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not delete the word.",
            },
          }),
        },
      },
      DeletingAllWords: {
        invoke: {
          src: "deleteAllWordEntries",
          input: ({ context }) => ({
            confirmation: context.deleteAllWordsConfirmation,
          }),
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              deleteAllWordsConfirmation: "",
              editingWordDescription: "",
              editingWordOriginalText: undefined,
              editingWordText: "",
              editingWordTranslation: "",
              kanjiEntries: event.output.kanjiEntries,
              message: "All words deleted.",
              wordEntries: event.output.wordEntries,
            },
          }),
          onError: ({ event }) => ({
            target: "ConfirmingAllWordsDeletion",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not delete all words.",
            },
          }),
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
      ImportingWords: {
        invoke: {
          src: "importWordEntries",
          input: ({ context }) => ({
            jsonText: context.wordImportJsonText,
          }),
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              importedWordCount: event.output.importedCount,
              kanjiEntries: event.output.kanjiEntries,
              message:
                event.output.skippedCount === 0
                  ? `${event.output.importedCount} words imported.`
                  : `${event.output.importedCount} words imported. ${event.output.skippedCount} skipped (${event.output.skippedReasons.join("; ")}${
                      event.output.skippedCount >
                      event.output.skippedReasons.length
                        ? "; more skipped"
                        : ""
                    }).`,
              wordEntries: event.output.wordEntries,
              wordImportJsonText: "",
            },
          }),
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not import the words.",
            },
          }),
        },
      },
      UpdatingWord: {
        invoke: {
          src: "updateWordEntry",
          input: ({ context }) => ({
            description: context.editingWordDescription,
            originalText: context.editingWordOriginalText ?? "",
            text: context.editingWordText,
            translation: context.editingWordTranslation,
          }),
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              editingWordDescription: "",
              editingWordOriginalText: undefined,
              editingWordText: "",
              editingWordTranslation: "",
              kanjiEntries: event.output.kanjiEntries,
              message: "Word updated.",
              wordEntries: event.output.wordEntries,
            },
          }),
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not update the word.",
            },
          }),
        },
      },
    },
  });
