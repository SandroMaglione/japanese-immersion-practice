import { IndexedDb } from "@jip/indexeddb";
import {
  FuriganaText,
  WordMemoryScheduler,
  WordPracticePresentation,
} from "@jip/services";
import {
  Array as EffectArray,
  DateTime,
  Effect,
  Formatter,
  HashSet,
  Predicate,
  Result,
  Schema,
  SchemaIssue,
} from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const LibraryDataSchema = Schema.Struct({
  wordEntries: Schema.Array(IndexedDb.Domain.Word),
});

const WordLibraryViewSchema = Schema.Literals(["batch", "examples", "single"]);
const WordArchiveActionSchema = Schema.Literals(["archive", "restore"]);

export const DeleteAllWordsConfirmationText = "delete all my words";

const LibraryContextSchema = Schema.Struct({
  archiveAction: Schema.optionalKey(WordArchiveActionSchema),
  bulkDeleteConfirmation: Schema.String,
  deleteAllWordsConfirmation: Schema.String,
  deleteSelectionIncludesAllWords: Schema.Boolean,
  deletingWordText: Schema.optionalKey(Schema.String),
  editingWordDescription: Schema.String,
  editingWordOriginalText: Schema.optionalKey(Schema.String),
  editingWordText: Schema.String,
  editingWordTranslation: Schema.String,
  exampleImportJsonText: Schema.String,
  importedWordCount: Schema.Number,
  message: Schema.optionalKey(Schema.String),
  pendingWordIds: Schema.Array(IndexedDb.Domain.WordId),
  selectedWordIds: Schema.Array(IndexedDb.Domain.WordId),
  wordDescription: Schema.String,
  wordEntries: Schema.Array(IndexedDb.Domain.Word),
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

const ChangeWordArchiveInputSchema = Schema.Struct({
  action: WordArchiveActionSchema,
  wordIds: Schema.Array(IndexedDb.Domain.WordId),
});

const ChangeWordArchiveResultSchema = Schema.Struct({
  changedCount: Schema.Number,
  wordEntries: Schema.Array(IndexedDb.Domain.Word),
});

const DeleteWordsInputSchema = Schema.Struct({
  confirmation: Schema.String,
  requiresTypedConfirmation: Schema.Boolean,
  wordIds: Schema.Array(IndexedDb.Domain.WordId),
});

const DeleteWordsResultSchema = Schema.Struct({
  deletedCount: Schema.Number,
  wordEntries: Schema.Array(IndexedDb.Domain.Word),
});

const ImportWordsInputSchema = Schema.Struct({
  jsonText: Schema.String,
});

const ImportWordsResultSchema = Schema.Struct({
  importedCount: Schema.Number,
  skippedCount: Schema.Number,
  skippedReasons: Schema.Array(Schema.String),
  wordEntries: Schema.Array(IndexedDb.Domain.Word),
});

const ImportExamplesResultSchema = Schema.Struct({
  addedExampleCount: Schema.Number,
  skippedCount: Schema.Number,
  skippedReasons: Schema.Array(Schema.String),
  unchangedCount: Schema.Number,
  updatedCount: Schema.Number,
  wordEntries: Schema.Array(IndexedDb.Domain.Word),
});

const ExportWordsInputSchema = Schema.Struct({
  wordEntries: Schema.Array(IndexedDb.Domain.Word),
  wordIds: Schema.Array(IndexedDb.Domain.WordId),
});

const ExportWordsResultSchema = Schema.Struct({
  copiedCount: Schema.Number,
});

const FuriganaNotationDescription =
  "Furigana notation: add each reading in square brackets immediately after the character it belongs to, with no spaces, for example 資[し]金[きん]. Do not group readings after a multi-character word. For kana-only words, write the word as-is.";

const ImportNonEmptyStringSchema = Schema.String.check(
  Schema.isTrimmed({
    message: "Expected a value without leading or trailing whitespace.",
  }),
  Schema.isNonEmpty({
    message: "Expected a non-empty string.",
  })
);

const WordImportJsonExampleSchema = Schema.Struct({
  note: Schema.optionalKey(
    Schema.NullOr(
      ImportNonEmptyStringSchema.annotate({
        description:
          "Optional explanation shown after the answer, such as a useful collocation, register note, or nuance.",
      })
    )
  ),
  template: ImportNonEmptyStringSchema.check(
    Schema.isPattern(WordPracticePresentation.WordMarkerPattern, {
      message: `Expected exactly one ${WordPracticePresentation.WordMarker} marker.`,
    })
  ).annotate({
    description: `Japanese example sentence containing exactly one ${WordPracticePresentation.WordMarker} marker where the canonical word should be inserted. The word must fit without conjugation. ${FuriganaNotationDescription}`,
  }),
  translation: ImportNonEmptyStringSchema.annotate({
    description:
      "Intended translation for the example. It is hidden by default and shown when the learner requests a hint or reveals the answer.",
  }),
});

const WordImportJsonWordSchema = Schema.Struct({
  description: Schema.optionalKey(
    Schema.NullOr(Schema.String).annotate({
      description:
        "Optional Japanese definition-style clue for recall: clear meaning, natural contexts, register or formality, tone, common pairings, and contrast with similar words, phrased without naming the target word.",
    })
  ),
  examples: Schema.optionalKey(
    Schema.Array(WordImportJsonExampleSchema)
      .check(
        Schema.isNonEmpty({
          message:
            "Expected at least one example when the examples property is present.",
        })
      )
      .annotate({
        description:
          "Alternative contextual prompts rotated during practice. A malformed example rejects this word while other valid words remain importable.",
      })
  ),
  text: ImportNonEmptyStringSchema.annotate({
    description: `Japanese word or expression to import. ${FuriganaNotationDescription}`,
  }),
  translation: ImportNonEmptyStringSchema.annotate({
    description:
      "Plain translations for this Japanese word, separated by semicolons and a single space, with no semicolon at the end. Example: qualifications; requirements; capabilities. Do not include explanations, sentences, numbering, or extra notes.",
  }),
});

const WordImportJsonSourceSchema = Schema.Struct({
  formatVersion: Schema.Literal(1),
  words: Schema.Array(Schema.Unknown).check(Schema.isNonEmpty()),
});

const WordExampleImportJsonWordSchema = Schema.Struct({
  examples: Schema.Array(WordImportJsonExampleSchema)
    .check(
      Schema.isNonEmpty({
        message: "Expected at least one example.",
      })
    )
    .annotate({
      description:
        "Examples to append to an existing word. A malformed example rejects this word while other valid words remain importable.",
    }),
  text: ImportNonEmptyStringSchema.annotate({
    description: `Existing Japanese word or expression to enrich. Use the exact text produced by the library export. ${FuriganaNotationDescription}`,
  }),
});

const WordExampleImportJsonSourceSchema = Schema.Struct({
  formatVersion: Schema.Literal(1),
  operation: Schema.Literal("addExamples"),
  words: Schema.Array(Schema.Unknown).check(Schema.isNonEmpty()),
});

export const WordImportJsonSchema = Schema.Struct({
  formatVersion: Schema.Literal(1).annotate({
    description: "Version of the word import format.",
  }),
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
    formatVersion: 1,
    words: [
      {
        description:
          "事業や活動など、特定の目的のために用意するお金。日常的なお金より改まった響きがあり、運営や投資の元手という感じがある。",
        examples: [
          {
            note: "「資金を集める」は、活動に必要なお金を用意するときの自然な組み合わせ。",
            template: `新しい事業の${WordPracticePresentation.WordMarker}を集める。`,
            translation: "Raise funds for a new business.",
          },
          {
            note: "「資金を調達する」は、ビジネスや公的な場面でよく使う。",
            template: `銀行から${WordPracticePresentation.WordMarker}を調達した。`,
            translation: "They secured financing from a bank.",
          },
        ],
        text: "資[し]金[きん]",
        translation: "funds; capital",
      },
      {
        description:
          "予定していない相手と偶然出くわすこと。単なる遭遇より突然の感じが強く、会話でも自然に使える。",
        examples: [
          {
            template: `駅で昔の友達と${WordPracticePresentation.WordMarker}なんて思わなかった。`,
            translation:
              "I never thought I would unexpectedly run into an old friend at the station.",
          },
          {
            note: "約束して会う場合には使わない。",
            template: `旅行先で先生に${WordPracticePresentation.WordMarker}こともある。`,
            translation:
              "Sometimes you unexpectedly run into your teacher while traveling.",
          },
        ],
        text: "ばったり会[あ]う",
        translation: "to run into; to bump into",
      },
    ],
  },
  {
    space: 2,
  }
);

export const WordExampleImportJsonSchema = Schema.Struct({
  formatVersion: Schema.Literal(1).annotate({
    description: "Version of the example enrichment format.",
  }),
  operation: Schema.Literal("addExamples").annotate({
    description:
      "Explicitly identifies this payload as an update to existing words.",
  }),
  words: Schema.Array(WordExampleImportJsonWordSchema)
    .check(Schema.isNonEmpty())
    .annotate({
      description:
        "Existing words whose example catalogs should be expanded. Each word is processed independently.",
    }),
}).annotate({
  description:
    "JSON payload for appending practice examples to words already in the library.",
  title: "Word example enrichment JSON",
});

export const WordExampleImportJsonSchemaDocument = Schema.toJsonSchemaDocument(
  WordExampleImportJsonSchema
);

export const WordExampleImportJsonSchemaDefinition =
  WordExampleImportJsonSchemaDocument.schema;

export const WordExampleImportJsonSchemaDefinitionText = Formatter.formatJson(
  WordExampleImportJsonSchemaDefinition,
  {
    space: 2,
  }
);

export const WordExampleImportJsonExample = Formatter.formatJson(
  {
    formatVersion: 1,
    operation: "addExamples",
    words: [
      {
        examples: [
          {
            note: "「資金を提供する」は、事業や計画に必要なお金を出すときの自然な組み合わせ。",
            template: `政府は新しい計画に${WordPracticePresentation.WordMarker}を提供した。`,
            translation: "The government provided funding for the new plan.",
          },
          {
            template: `十分な${WordPracticePresentation.WordMarker}が集まらず、計画は延期された。`,
            translation:
              "The plan was postponed because sufficient funding could not be raised.",
          },
        ],
        text: "資[し]金[きん]",
      },
    ],
  },
  {
    space: 2,
  }
);

const _loadLibraryData = Effect.gen(function* () {
  const store = yield* IndexedDb.Store.Store;
  const storedWordEntries = yield* store.listWords();
  const wordEntries = [...storedWordEntries].sort((left, right) => {
    if ((left.archivedAt === undefined) === (right.archivedAt === undefined)) {
      return 0;
    }

    return left.archivedAt === undefined ? -1 : 1;
  });

  return {
    wordEntries,
  };
});

const _normalizeWordText = ({ text }: { readonly text: string }) =>
  FuriganaText.normalizePlainText({ text });

const WordImportIssueFormatter = SchemaIssue.makeFormatterStandardSchemaV1();

const _formatWordImportIssues = ({
  issue,
  wordIndex,
}: {
  readonly issue: SchemaIssue.Issue;
  readonly wordIndex: number;
}) => {
  const formattedIssues = WordImportIssueFormatter(issue).issues;
  const visibleIssues = formattedIssues.slice(0, 3).map((formattedIssue) => {
    const formattedPath = formattedIssue.path
      ?.map((segment) => {
        const key = Predicate.hasProperty(segment, "key")
          ? segment.key
          : segment;

        return typeof key === "number" ? `[${key}]` : `${String(key)}`;
      })
      .join(".")
      .replaceAll(".[", "[");
    const path =
      formattedPath === undefined || formattedPath === ""
        ? ""
        : `${formattedPath}: `;

    return `${path}${formattedIssue.message}`;
  });

  return `#${wordIndex + 1}: ${visibleIssues.join("; ")}${
    formattedIssues.length > visibleIssues.length ? "; more errors" : ""
  }`;
};

const _makeWordAndState = ({
  description,
  examples,
  now,
  text,
  translation,
}: {
  readonly description?: string;
  readonly examples?: readonly IndexedDb.Domain.WordPracticeExample[];
  readonly now: number;
  readonly text: string;
  readonly translation: string;
}) =>
  Effect.gen(function* () {
    const id = crypto.randomUUID();
    const word = yield* Schema.decodeEffect(IndexedDb.Domain.Word)({
      id,
      createdAt: now,
      ...(description === undefined ? {} : { description }),
      ...(examples === undefined ? {} : { examples }),
      text,
      translation,
      updatedAt: now,
    });
    const card = WordMemoryScheduler.initialCard({ now });
    const state = yield* Schema.decodeEffect(IndexedDb.Domain.WordMemoryState)({
      wordId: id,
      phase: card.phase,
      dueAt: card.dueAtMillis,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      learningSteps: card.learningSteps,
      repetitions: card.repetitions,
      lapses: card.lapses,
      attemptCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      lastPracticedAt: now,
      schedulerVersion: WordMemoryScheduler.SchedulerVersion,
      createdAt: now,
      updatedAt: now,
    });

    return {
      state,
      word,
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
        archiveWord: Schema.toStandardSchemaV1(
          Schema.Struct({ wordId: IndexedDb.Domain.WordId })
        ),
        archiveSelectedWords: Schema.toStandardSchemaV1(Schema.Void),
        cancelArchiveWords: Schema.toStandardSchemaV1(Schema.Void),
        cancelDeleteAllWords: Schema.toStandardSchemaV1(Schema.Void),
        cancelDeleteSelectedWords: Schema.toStandardSchemaV1(Schema.Void),
        cancelWordDeletion: Schema.toStandardSchemaV1(Schema.Void),
        cancelWordEdit: Schema.toStandardSchemaV1(Schema.Void),
        changeBulkDeleteConfirmation: Schema.toStandardSchemaV1(
          Schema.Struct({ confirmation: Schema.String })
        ),
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
        changeExampleImportJsonText: Schema.toStandardSchemaV1(
          Schema.Struct({ jsonText: Schema.String })
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
        deleteSelectedWords: Schema.toStandardSchemaV1(Schema.Void),
        deleteWord: Schema.toStandardSchemaV1(
          Schema.Struct({ text: Schema.String })
        ),
        editWord: Schema.toStandardSchemaV1(
          Schema.Struct({ text: Schema.String })
        ),
        exportWords: Schema.toStandardSchemaV1(Schema.Void),
        importExamples: Schema.toStandardSchemaV1(Schema.Void),
        importWords: Schema.toStandardSchemaV1(Schema.Void),
        confirmArchiveWords: Schema.toStandardSchemaV1(Schema.Void),
        confirmDeleteSelectedWords: Schema.toStandardSchemaV1(Schema.Void),
        refresh: Schema.toStandardSchemaV1(Schema.Void),
        clearWordSelection: Schema.toStandardSchemaV1(Schema.Void),
        resetExampleImport: Schema.toStandardSchemaV1(Schema.Void),
        resetWordImport: Schema.toStandardSchemaV1(Schema.Void),
        restoreWord: Schema.toStandardSchemaV1(
          Schema.Struct({ wordId: IndexedDb.Domain.WordId })
        ),
        saveWord: Schema.toStandardSchemaV1(Schema.Void),
        selectWordView: Schema.toStandardSchemaV1(
          Schema.Struct({ view: WordLibraryViewSchema })
        ),
        toggleAllWords: Schema.toStandardSchemaV1(Schema.Void),
        toggleWordSelection: Schema.toStandardSchemaV1(
          Schema.Struct({ wordId: IndexedDb.Domain.WordId })
        ),
        updateWord: Schema.toStandardSchemaV1(Schema.Void),
      },
    },
    actorSources: {
      changeWordArchive: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(ChangeWordArchiveInputSchema),
          output: Schema.toStandardSchemaV1(ChangeWordArchiveResultSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              if (!EffectArray.isReadonlyArrayNonEmpty(input.wordIds)) {
                return yield* Effect.fail(
                  new Error("Select at least one word.")
                );
              }

              const store = yield* IndexedDb.Store.Store;
              const existingWordEntries = yield* store.listWords();
              const targetedWordEntries = input.wordIds.flatMap((wordId) => {
                const word = existingWordEntries.find(
                  (entry) => entry.id === wordId
                );

                return word === undefined ? [] : [word];
              });

              if (targetedWordEntries.length !== input.wordIds.length) {
                return yield* Effect.fail(
                  new Error(
                    "One or more selected words are no longer in the library."
                  )
                );
              }

              const changedWordEntries = targetedWordEntries.filter((word) =>
                input.action === "archive"
                  ? word.archivedAt === undefined
                  : word.archivedAt !== undefined
              );
              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const updatedWords = yield* Effect.all(
                changedWordEntries.map((existingWordEntry) =>
                  Schema.decodeEffect(IndexedDb.Domain.Word)({
                    id: existingWordEntry.id,
                    ...(input.action === "archive" ? { archivedAt: now } : {}),
                    createdAt: DateTime.toEpochMillis(
                      existingWordEntry.createdAt
                    ),
                    ...(existingWordEntry.description === undefined
                      ? {}
                      : { description: existingWordEntry.description }),
                    ...(existingWordEntry.examples === undefined
                      ? {}
                      : { examples: existingWordEntry.examples }),
                    text: existingWordEntry.text,
                    translation: existingWordEntry.translation,
                    updatedAt: now,
                  })
                )
              );

              yield* store.updateWords(updatedWords);
              const libraryData = yield* _loadLibraryData;

              return {
                changedCount: updatedWords.length,
                wordEntries: libraryData.wordEntries,
              };
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
              yield* store.deleteAllWords();

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
              const existingWordEntries = yield* store.listWords();

              if (!existingWordEntries.some((entry) => entry.text === text)) {
                return yield* Effect.fail(
                  new Error("Could not find that word in your library.")
                );
              }

              const word = existingWordEntries.find(
                (entry) => entry.text === text
              );

              if (word === undefined) {
                return yield* Effect.fail(
                  new Error("Could not find that word in your library.")
                );
              }

              yield* store.deleteWord(word.id);

              return yield* _loadLibraryData;
            })
          ),
      }),
      deleteSelectedWordEntries: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(DeleteWordsInputSchema),
          output: Schema.toStandardSchemaV1(DeleteWordsResultSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              if (!EffectArray.isReadonlyArrayNonEmpty(input.wordIds)) {
                return yield* Effect.fail(
                  new Error("Select at least one word.")
                );
              }

              if (
                input.requiresTypedConfirmation &&
                input.confirmation.trim() !== DeleteAllWordsConfirmationText
              ) {
                return yield* Effect.fail(
                  new Error("Type the confirmation phrase before deleting.")
                );
              }

              const store = yield* IndexedDb.Store.Store;
              const existingWordEntries = yield* store.listWords();
              const existingTargetCount = input.wordIds.filter((wordId) =>
                existingWordEntries.some((word) => word.id === wordId)
              ).length;

              if (existingTargetCount !== input.wordIds.length) {
                return yield* Effect.fail(
                  new Error(
                    "One or more selected words are no longer in the library."
                  )
                );
              }

              yield* store.deleteWords(input.wordIds);
              const libraryData = yield* _loadLibraryData;

              return {
                deletedCount: input.wordIds.length,
                wordEntries: libraryData.wordEntries,
              };
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
              const activeWordEntries = input.wordEntries.filter(
                (word) =>
                  input.wordIds.includes(word.id) &&
                  word.archivedAt === undefined
              );

              if (!EffectArray.isReadonlyArrayNonEmpty(activeWordEntries)) {
                return yield* Effect.fail(
                  new Error("No active selected words to export.")
                );
              }

              const clipboard = globalThis.navigator?.clipboard;

              if (clipboard === undefined) {
                return yield* Effect.fail(
                  new Error("Could not access the clipboard.")
                );
              }

              const exportText = activeWordEntries
                .map((entry) => entry.text)
                .join("\n");

              yield* Effect.tryPromise({
                catch: () => new Error("Could not copy the words."),
                try: () => clipboard.writeText(exportText),
              });

              return {
                copiedCount: activeWordEntries.length,
              };
            })
          ),
      }),
      importExampleEntries: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(ImportWordsInputSchema),
          output: Schema.toStandardSchemaV1(ImportExamplesResultSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              if (input.jsonText.trim() === "") {
                return yield* Effect.fail(
                  new Error("Paste example JSON before importing.")
                );
              }

              const importData = yield* Schema.decodeEffect(
                Schema.fromJsonString(WordExampleImportJsonSourceSchema)
              )(input.jsonText.replace(/^\uFEFF/, ""), {
                errors: "all",
                onExcessProperty: "error",
              });

              const skippedReasons: string[] = [];
              const parsedWords: {
                readonly examples: readonly IndexedDb.Domain.WordPracticeExample[];
                readonly normalizedText: string;
                readonly text: string;
              }[] = [];

              for (const [
                wordIndex,
                unknownWord,
              ] of importData.words.entries()) {
                const decodedWord = Schema.decodeUnknownResult(
                  WordExampleImportJsonWordSchema,
                  {
                    errors: "all",
                    onExcessProperty: "error",
                  }
                )(unknownWord);

                if (Result.isFailure(decodedWord)) {
                  skippedReasons.push(
                    _formatWordImportIssues({
                      issue: decodedWord.failure.issue,
                      wordIndex,
                    })
                  );
                  continue;
                }

                const examples = decodedWord.success.examples.map(
                  (example) => ({
                    ...(example.note === null || example.note === undefined
                      ? {}
                      : { note: example.note }),
                    template: example.template,
                    translation: example.translation,
                  })
                );
                const text = decodedWord.success.text;
                const normalizedText = _normalizeWordText({ text });
                const displayText =
                  FuriganaText.toPlainText({ text }) || `#${wordIndex + 1}`;

                if (
                  examples.some((example, exampleIndex) =>
                    examples.some(
                      (candidate, candidateIndex) =>
                        candidateIndex < exampleIndex &&
                        candidate.template.normalize("NFKC") ===
                          example.template.normalize("NFKC")
                    )
                  )
                ) {
                  skippedReasons.push(
                    `${displayText}: repeated example template`
                  );
                  continue;
                }

                if (
                  parsedWords.some(
                    (word) => word.normalizedText === normalizedText
                  )
                ) {
                  skippedReasons.push(
                    `${displayText}: repeated in example JSON`
                  );
                  continue;
                }

                parsedWords.push({
                  examples,
                  normalizedText,
                  text,
                });
              }

              const store = yield* IndexedDb.Store.Store;
              const existingWordEntries = yield* store.listWords();
              const now = DateTime.toEpochMillis(yield* DateTime.now);
              let addedExampleCount = 0;
              let unchangedCount = 0;
              let updatedCount = 0;

              for (const parsedWord of parsedWords) {
                const existingWordEntry = existingWordEntries.find(
                  (entry) =>
                    _normalizeWordText({ text: entry.text }) ===
                    parsedWord.normalizedText
                );

                if (existingWordEntry === undefined) {
                  skippedReasons.push(
                    `${FuriganaText.toPlainText({ text: parsedWord.text })}: not in library`
                  );
                  continue;
                }

                if (existingWordEntry.archivedAt !== undefined) {
                  skippedReasons.push(
                    `${FuriganaText.toPlainText({ text: parsedWord.text })}: archived`
                  );
                  continue;
                }

                let existingTemplateKeys = HashSet.empty<string>();

                for (const example of existingWordEntry.examples ?? []) {
                  existingTemplateKeys = HashSet.add(
                    existingTemplateKeys,
                    example.template.normalize("NFKC")
                  );
                }

                const newExamples = parsedWord.examples.filter(
                  (example) =>
                    !HashSet.has(
                      existingTemplateKeys,
                      example.template.normalize("NFKC")
                    )
                );

                if (!EffectArray.isReadonlyArrayNonEmpty(newExamples)) {
                  unchangedCount += 1;
                  continue;
                }

                const wordEntry = yield* Schema.decodeEffect(
                  IndexedDb.Domain.Word
                )({
                  id: existingWordEntry.id,
                  createdAt: DateTime.toEpochMillis(
                    existingWordEntry.createdAt
                  ),
                  ...(existingWordEntry.description === undefined
                    ? {}
                    : { description: existingWordEntry.description }),
                  examples: [
                    ...(existingWordEntry.examples ?? []),
                    ...newExamples,
                  ],
                  text: existingWordEntry.text,
                  translation: existingWordEntry.translation,
                  updatedAt: now,
                });

                yield* store.updateWord(wordEntry);
                addedExampleCount += newExamples.length;
                updatedCount += 1;
              }

              const libraryData = yield* _loadLibraryData;

              return {
                addedExampleCount,
                skippedCount: skippedReasons.length,
                skippedReasons: skippedReasons.slice(0, 5),
                unchangedCount,
                updatedCount,
                wordEntries: libraryData.wordEntries,
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
              )(input.jsonText.replace(/^\uFEFF/, ""), {
                errors: "all",
                onExcessProperty: "error",
              });

              const skippedReasons: string[] = [];
              const parsedWords: {
                readonly description?: string;
                readonly examples?: readonly IndexedDb.Domain.WordPracticeExample[];
                readonly normalizedText: string;
                readonly text: string;
                readonly translation: string;
              }[] = [];

              for (const [
                wordIndex,
                unknownWord,
              ] of importData.words.entries()) {
                const decodedWord = Schema.decodeUnknownResult(
                  WordImportJsonWordSchema,
                  {
                    errors: "all",
                    onExcessProperty: "error",
                  }
                )(unknownWord);

                if (Result.isFailure(decodedWord)) {
                  skippedReasons.push(
                    _formatWordImportIssues({
                      issue: decodedWord.failure.issue,
                      wordIndex,
                    })
                  );
                  continue;
                }

                const description =
                  decodedWord.success.description?.trim() ?? "";
                const examples = decodedWord.success.examples?.map(
                  (example) => ({
                    ...(example.note === null || example.note === undefined
                      ? {}
                      : { note: example.note }),
                    template: example.template,
                    translation: example.translation,
                  })
                );
                const text = decodedWord.success.text;
                const translation = decodedWord.success.translation;
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

                if (
                  examples !== undefined &&
                  examples.some((example, exampleIndex) =>
                    examples.some(
                      (candidate, candidateIndex) =>
                        candidateIndex < exampleIndex &&
                        candidate.template.normalize("NFKC") ===
                          example.template.normalize("NFKC")
                    )
                  )
                ) {
                  skippedReasons.push(
                    `${displayText}: repeated example template`
                  );
                  continue;
                }

                parsedWords.push({
                  ...(description === "" ? {} : { description }),
                  ...(examples === undefined ? {} : { examples }),
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
              const existingWordEntries = yield* store.listWords();
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
              const wordsAndStates = yield* Effect.all(
                newWords.map((word) =>
                  _makeWordAndState({
                    description: word.description,
                    examples: word.examples,
                    now,
                    text: word.text,
                    translation: word.translation,
                  })
                )
              );
              const wordEntries = wordsAndStates.map(({ word }) => word);

              if (EffectArray.isReadonlyArrayNonEmpty(wordEntries)) {
                yield* store.insertWordsWithMemoryStates({
                  states: wordsAndStates.map(({ state }) => state),
                  words: wordEntries,
                });
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
              const existingWordEntries = yield* store.listWords();

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
              const { state, word: wordEntry } = yield* _makeWordAndState({
                ...(description === "" ? {} : { description }),
                now,
                text,
                translation,
              });

              yield* store.insertWordWithMemoryState({
                state,
                word: wordEntry,
              });

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
              const existingWordEntries = yield* store.listWords();
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
                IndexedDb.Domain.Word
              )({
                id: existingWordEntry.id,
                ...(existingWordEntry.archivedAt === undefined
                  ? {}
                  : {
                      archivedAt: DateTime.toEpochMillis(
                        existingWordEntry.archivedAt
                      ),
                    }),
                createdAt: DateTime.toEpochMillis(existingWordEntry.createdAt),
                ...(description === "" ? {} : { description }),
                ...(existingWordEntry.examples === undefined
                  ? {}
                  : { examples: existingWordEntry.examples }),
                text,
                translation,
                updatedAt: now,
              });

              yield* store.updateWord(wordEntry);

              return yield* _loadLibraryData;
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      bulkDeleteConfirmation: "",
      deleteAllWordsConfirmation: "",
      deleteSelectionIncludesAllWords: false,
      editingWordDescription: "",
      editingWordText: "",
      editingWordTranslation: "",
      exampleImportJsonText: "",
      importedWordCount: 0,
      pendingWordIds: [],
      selectedWordIds: [],
      wordDescription: "",
      wordEntries: [],
      wordImportJsonText: "",
      wordText: "",
      wordTranslation: "",
      wordView: "batch",
    },
    initial: "Loading",
    states: {
      ConfirmingArchiveWords: {
        on: {
          cancelArchiveWords: {
            target: "Ready",
            context: {
              archiveAction: undefined,
              pendingWordIds: [],
              message: undefined,
            },
          },
          confirmArchiveWords: {
            target: "ChangingWordArchive",
          },
        },
      },
      ChangingWordArchive: {
        invoke: {
          src: "changeWordArchive",
          input: ({ context }) => ({
            action: context.archiveAction ?? "archive",
            wordIds: context.pendingWordIds,
          }),
          onDone: ({ context, event }) => {
            const changedCount = event.output.changedCount;
            const action = context.archiveAction ?? "archive";

            return {
              target: "Ready",
              context: {
                archiveAction: undefined,
                message:
                  action === "restore"
                    ? `${changedCount} ${
                        changedCount === 1 ? "word" : "words"
                      } restored.`
                    : `${changedCount} ${
                        changedCount === 1 ? "word" : "words"
                      } archived.`,
                pendingWordIds: [],
                selectedWordIds: [],
                wordEntries: event.output.wordEntries,
              },
            };
          },
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              archiveAction: undefined,
              pendingWordIds: [],
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not change the word archive.",
            },
          }),
        },
      },
      ConfirmingSelectedWordsDeletion: {
        on: {
          cancelDeleteSelectedWords: {
            target: "Ready",
            context: {
              bulkDeleteConfirmation: "",
              deleteSelectionIncludesAllWords: false,
              pendingWordIds: [],
              message: undefined,
            },
          },
          changeBulkDeleteConfirmation: ({ event }) => ({
            context: {
              bulkDeleteConfirmation: event.confirmation,
              message: undefined,
            },
          }),
          confirmDeleteSelectedWords: {
            target: "DeletingSelectedWords",
          },
        },
      },
      DeletingSelectedWords: {
        invoke: {
          src: "deleteSelectedWordEntries",
          input: ({ context }) => ({
            confirmation: context.bulkDeleteConfirmation,
            requiresTypedConfirmation: context.deleteSelectionIncludesAllWords,
            wordIds: context.pendingWordIds,
          }),
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              bulkDeleteConfirmation: "",
              deleteSelectionIncludesAllWords: false,
              message: `${event.output.deletedCount} ${
                event.output.deletedCount === 1 ? "word" : "words"
              } deleted.`,
              pendingWordIds: [],
              selectedWordIds: [],
              wordEntries: event.output.wordEntries,
            },
          }),
          onError: ({ event }) => ({
            target: "ConfirmingSelectedWordsDeletion",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not delete the selected words.",
            },
          }),
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
            wordIds: context.selectedWordIds,
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
      ImportingExamples: {
        invoke: {
          src: "importExampleEntries",
          input: ({ context }) => ({
            jsonText: context.exampleImportJsonText,
          }),
          onDone: ({ event }) => {
            const messages = [
              `${event.output.updatedCount} ${
                event.output.updatedCount === 1 ? "word" : "words"
              } updated with ${event.output.addedExampleCount} ${
                event.output.addedExampleCount === 1 ? "example" : "examples"
              }.`,
            ];

            if (event.output.unchangedCount > 0) {
              messages.push(
                `${event.output.unchangedCount} unchanged because ${
                  event.output.unchangedCount === 1
                    ? "its example was"
                    : "their examples were"
                } already present.`
              );
            }

            if (event.output.skippedCount > 0) {
              messages.push(
                `${event.output.skippedCount} skipped (${event.output.skippedReasons.join("; ")}${
                  event.output.skippedCount > event.output.skippedReasons.length
                    ? "; more skipped"
                    : ""
                }).`
              );
            }

            return {
              target: "Ready",
              context: {
                exampleImportJsonText: "",
                message: messages.join(" "),
                wordEntries: event.output.wordEntries,
              },
            };
          },
          onError: ({ event }) => ({
            target: "Ready",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not add the examples.",
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
          archiveWord: ({ event }) => ({
            target: "ConfirmingArchiveWords",
            context: {
              archiveAction: "archive",
              editingWordDescription: "",
              editingWordOriginalText: undefined,
              editingWordText: "",
              editingWordTranslation: "",
              message: undefined,
              pendingWordIds: [event.wordId],
            },
          }),
          archiveSelectedWords: ({ context }) => {
            const activeSelectedWordIds = context.selectedWordIds.filter(
              (wordId) =>
                context.wordEntries.some(
                  (word) => word.id === wordId && word.archivedAt === undefined
                )
            );

            return EffectArray.isReadonlyArrayNonEmpty(activeSelectedWordIds)
              ? {
                  target: "ConfirmingArchiveWords",
                  context: {
                    archiveAction: "archive" as const,
                    message: undefined,
                    pendingWordIds: activeSelectedWordIds,
                  },
                }
              : {
                  context: {
                    message: "Select at least one active word to archive.",
                  },
                };
          },
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
          clearWordSelection: {
            context: {
              message: undefined,
              selectedWordIds: [],
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
          changeExampleImportJsonText: ({ event }) => ({
            context: {
              exampleImportJsonText: event.jsonText,
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
              selectedWordIds: [],
            },
          },
          deleteSelectedWords: ({ context }) =>
            EffectArray.isReadonlyArrayNonEmpty(context.selectedWordIds)
              ? {
                  target: "ConfirmingSelectedWordsDeletion",
                  context: {
                    bulkDeleteConfirmation: "",
                    deleteSelectionIncludesAllWords:
                      context.selectedWordIds.length ===
                      context.wordEntries.length,
                    message: undefined,
                    pendingWordIds: context.selectedWordIds,
                  },
                }
              : {
                  context: {
                    message: "Select at least one word to delete.",
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
              selectedWordIds: [],
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
                selectedWordIds: [],
              },
            };
          },
          exportWords: {
            target: "ExportingWords",
            context: {
              message: undefined,
            },
          },
          importExamples: {
            target: "ImportingExamples",
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
          restoreWord: ({ event }) => ({
            target: "ChangingWordArchive",
            context: {
              archiveAction: "restore",
              editingWordDescription: "",
              editingWordOriginalText: undefined,
              editingWordText: "",
              editingWordTranslation: "",
              message: undefined,
              pendingWordIds: [event.wordId],
            },
          }),
          resetExampleImport: {
            context: {
              exampleImportJsonText: "",
              message: undefined,
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
          toggleAllWords: ({ context }) => ({
            context: {
              message: undefined,
              selectedWordIds:
                context.selectedWordIds.length === context.wordEntries.length
                  ? []
                  : context.wordEntries.map((word) => word.id),
            },
          }),
          toggleWordSelection: ({ context, event }) => ({
            context: {
              message: undefined,
              selectedWordIds: context.selectedWordIds.includes(event.wordId)
                ? context.selectedWordIds.filter(
                    (wordId) => wordId !== event.wordId
                  )
                : [...context.selectedWordIds, event.wordId],
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
