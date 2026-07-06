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
  wordEntries: Schema.Array(IndexedDb.Domain.WordEntry),
});

const WordLibraryViewSchema = Schema.Literals(["batch", "single"]);

export const DeleteAllWordsConfirmationText = "delete all my words";

const LibraryContextSchema = Schema.Struct({
  deleteAllWordsConfirmation: Schema.String,
  deletingWordText: Schema.optionalKey(Schema.String),
  editingWordDescription: Schema.String,
  editingWordOriginalText: Schema.optionalKey(Schema.String),
  editingWordText: Schema.String,
  editingWordTranslation: Schema.String,
  importedWordCount: Schema.Number,
  message: Schema.optionalKey(Schema.String),
  wordDescription: Schema.String,
  wordEntries: Schema.Array(IndexedDb.Domain.WordEntry),
  wordImportJsonText: Schema.String,
  wordText: Schema.String,
  wordTranslation: Schema.String,
  wordView: WordLibraryViewSchema,
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
  skippedCount: Schema.Number,
  skippedReasons: Schema.Array(Schema.String),
  wordEntries: Schema.Array(IndexedDb.Domain.WordEntry),
});

const ExportWordsInputSchema = Schema.Struct({
  wordEntries: Schema.Array(IndexedDb.Domain.WordEntry),
});

const ExportWordsResultSchema = Schema.Struct({
  copiedCount: Schema.Number,
});

const FuriganaNotationDescription =
  "Furigana notation: add each reading in square brackets immediately after the character it belongs to, with no spaces, for example 資[し]金[きん]. Do not group readings after a multi-character word. For kana-only words, write the word as-is.";

const WordImportJsonWordSchema = Schema.Struct({
  description: Schema.optionalKey(
    Schema.NullOr(Schema.String).annotate({
      description:
        "Optional Japanese definition-style clue for recall: clear meaning, natural contexts, register or formality, tone, common pairings, and contrast with similar words, phrased without naming the target word.",
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
          "事業や活動など、特定の目的のために用意するお金。日常的なお金より改まった響きがあり、運営や投資の元手という感じがある。",
        text: "資[し]金[きん]",
        translation: "funds; capital",
      },
      {
        description:
          "予定していない相手と偶然出くわすこと。単なる遭遇より突然の感じが強く、会話でも自然に使える。",
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
  const wordEntries = yield* store.listWordEntries();

  return {
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
        cancelDeleteAllWords: Schema.toStandardSchemaV1(Schema.Void),
        cancelWordDeletion: Schema.toStandardSchemaV1(Schema.Void),
        cancelWordEdit: Schema.toStandardSchemaV1(Schema.Void),
        changeDeleteAllWordsConfirmation: Schema.toStandardSchemaV1(
          Schema.Struct({ confirmation: Schema.String })
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
        deleteAllWords: Schema.toStandardSchemaV1(Schema.Void),
        deleteWord: Schema.toStandardSchemaV1(
          Schema.Struct({ text: Schema.String })
        ),
        editWord: Schema.toStandardSchemaV1(
          Schema.Struct({ text: Schema.String })
        ),
        exportWords: Schema.toStandardSchemaV1(Schema.Void),
        importWords: Schema.toStandardSchemaV1(Schema.Void),
        refresh: Schema.toStandardSchemaV1(Schema.Void),
        resetWordImport: Schema.toStandardSchemaV1(Schema.Void),
        saveWord: Schema.toStandardSchemaV1(Schema.Void),
        selectWordView: Schema.toStandardSchemaV1(
          Schema.Struct({ view: WordLibraryViewSchema })
        ),
        updateWord: Schema.toStandardSchemaV1(Schema.Void),
      },
    },
    actorSources: {
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
      exportWordEntries: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(ExportWordsInputSchema),
          output: Schema.toStandardSchemaV1(ExportWordsResultSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              if (!EffectArray.isReadonlyArrayNonEmpty(input.wordEntries)) {
                return yield* Effect.fail(new Error("No words to export."));
              }

              const clipboard = globalThis.navigator?.clipboard;

              if (clipboard === undefined) {
                return yield* Effect.fail(
                  new Error("Could not access the clipboard.")
                );
              }

              const exportText = input.wordEntries
                .map((entry) => FuriganaText.toPlainText({ text: entry.text }))
                .join("\n");

              yield* Effect.tryPromise({
                catch: () => new Error("Could not copy the words."),
                try: () => clipboard.writeText(exportText),
              });

              return {
                copiedCount: input.wordEntries.length,
              };
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
                skippedCount: skippedReasons.length,
                skippedReasons: skippedReasons.slice(0, 5),
                wordEntries: libraryData.wordEntries,
              };
            })
          ),
      }),
      loadLibrary: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(LibraryDataSchema),
        },
        run: () => runtime.runPromise(_loadLibraryData),
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
    },
  }).createMachine({
    context: {
      deleteAllWordsConfirmation: "",
      editingWordDescription: "",
      editingWordText: "",
      editingWordTranslation: "",
      importedWordCount: 0,
      wordDescription: "",
      wordEntries: [],
      wordImportJsonText: "",
      wordText: "",
      wordTranslation: "",
      wordView: "batch",
    },
    initial: "Loading",
    states: {
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
      ConfirmingWordDeletion: {
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
      ExportingWords: {
        invoke: {
          src: "exportWordEntries",
          input: ({ context }) => ({
            wordEntries: context.wordEntries,
          }),
          onDone: ({ event }) => ({
            target: "Ready.Copied",
            context: {
              message: `${event.output.copiedCount} ${
                event.output.copiedCount === 1 ? "word" : "words"
              } copied to clipboard.`,
            },
          }),
          onError: ({ event }) => ({
            target: "Ready.Idle",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not copy the words.",
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
      Loading: {
        invoke: {
          src: "loadLibrary",
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
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
        initial: "Idle",
        states: {
          Copied: {
            after: {
              1800: {
                target: "Idle",
              },
            },
          },
          Idle: {},
        },
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
          changeDeleteAllWordsConfirmation: ({ event }) => ({
            context: {
              deleteAllWordsConfirmation: event.confirmation,
              message: undefined,
            },
          }),
          changeEditingWordDescription: ({ event }) => ({
            context: {
              editingWordDescription: event.description,
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
          exportWords: {
            target: "ExportingWords",
            context: {
              message: undefined,
            },
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
