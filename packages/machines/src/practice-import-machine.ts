import { IndexedDb } from "@jip/indexeddb";
import {
  Array as EffectArray,
  DateTime,
  Effect,
  Formatter,
  Schema,
} from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const PracticeImportContextSchema = Schema.Struct({
  importedCount: Schema.Number,
  jsonText: Schema.String,
  message: Schema.optionalKey(Schema.String),
  sourceFileName: Schema.String,
});

const ImportJsonInputSchema = Schema.Struct({
  jsonText: Schema.String,
  sourceFileName: Schema.String,
});

const PracticeImportResultSchema = Schema.Struct({
  attemptCount: Schema.Number,
  sourceFileName: Schema.String,
});

const PracticeImportJsonAttemptSchema = Schema.Struct({
  correction: Schema.optional(
    Schema.String.annotate({
      description:
        "Corrected Japanese sentence when the attempt is not fully correct.",
    })
  ),
  englishCue: IndexedDb.Domain.NonEmptyString.annotate({
    description: "English prompt or cue that the user responded to.",
  }),
  no: Schema.optional(
    Schema.Int.annotate({
      description:
        "Optional source item number. It is not stored after import.",
    })
  ),
  patternTag: Schema.optional(
    Schema.String.annotate({
      description: "Short grammar or expression tag for the practice item.",
    })
  ),
  reason: Schema.optional(
    Schema.String.annotate({
      description: "Brief explanation of why the attempt received its result.",
    })
  ),
  result: IndexedDb.Domain.PracticeResult.annotate({
    description: "Assessment result for the user attempt.",
  }),
  userAttempt: IndexedDb.Domain.NonEmptyString.annotate({
    description: "Japanese sentence or response written by the user.",
  }),
});

export const PracticeImportJsonSchema = Schema.Struct({
  attempts: Schema.Array(PracticeImportJsonAttemptSchema)
    .check(Schema.isNonEmpty())
    .annotate({
      description: "Practice attempts to import.",
    }),
}).annotate({
  description:
    "JSON payload for importing Japanese immersion practice attempts.",
  title: "Practice import JSON",
});

export const PracticeImportJsonSchemaDocument = Schema.toJsonSchemaDocument(
  PracticeImportJsonSchema
);

export const PracticeImportJsonSchemaDefinition =
  PracticeImportJsonSchemaDocument.schema;

export const PracticeImportJsonSchemaDefinitionText = Formatter.formatJson(
  PracticeImportJsonSchemaDefinition,
  {
    space: 2,
  }
);

export const PracticeImportJsonExample = Formatter.formatJson(
  {
    attempts: [
      {
        correction: "たまたま昔の友達にばったり会った。",
        englishCue: "I ran into an old friend by chance.",
        no: 1,
        patternTag: "たまたま〜にばったり会う",
        reason:
          "「きっかけで」は because of / triggered by。「すれ違った」は会わずに通り過ぎた感じ。",
        result: "incorrect",
        userAttempt: "きっかけで長い付き合いの友達とすれ違った",
      },
    ],
  },
  {
    space: 2,
  }
);

export const makePracticeImportMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<IndexedDb.Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(PracticeImportContextSchema),
      events: {
        changeJsonText: Schema.toStandardSchemaV1(
          Schema.Struct({ jsonText: Schema.String })
        ),
        changeSourceFileName: Schema.toStandardSchemaV1(
          Schema.Struct({ sourceFileName: Schema.String })
        ),
        importJson: Schema.toStandardSchemaV1(Schema.Void),
        reset: Schema.toStandardSchemaV1(Schema.Void),
      },
    },
    actorSources: {
      importPracticeJson: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(ImportJsonInputSchema),
          output: Schema.toStandardSchemaV1(PracticeImportResultSchema),
        },
        run: ({ input }) =>
          runtime.runPromise(
            Effect.gen(function* () {
              const sourceFileName = input.sourceFileName.trim();

              if (sourceFileName === "") {
                return yield* Effect.fail(
                  new Error("Add a source file name before importing.")
                );
              }

              const importData = yield* Schema.decodeEffect(
                Schema.fromJsonString(PracticeImportJsonSchema)
              )(input.jsonText.replace(/^\uFEFF/, ""));

              const parsedAttempts = importData.attempts.flatMap((attempt) => {
                const correction = attempt.correction?.trim() ?? "";
                const patternTag = attempt.patternTag?.trim() ?? "";
                const reason = attempt.reason?.trim() ?? "";
                const response = attempt.userAttempt.trim();
                const sentence = attempt.englishCue.trim();

                return [
                  {
                    ...(correction === "" ? {} : { correction }),
                    ...(patternTag === "" ? {} : { patternTag }),
                    ...(reason === "" ? {} : { reason }),
                    response,
                    result: attempt.result,
                    sentence,
                  },
                ];
              });

              if (!EffectArray.isReadonlyArrayNonEmpty(parsedAttempts)) {
                return yield* Effect.fail(
                  new Error(
                    "JSON did not contain any complete practice attempts."
                  )
                );
              }

              const store = yield* IndexedDb.Store.Store;
              const importedAt = DateTime.toEpochMillis(yield* DateTime.now);
              const practiceImport = yield* Schema.decodeEffect(
                IndexedDb.Domain.PracticeImport
              )({
                id: crypto.randomUUID(),
                importedAt,
                sourceFileName,
              });
              const attempts = yield* Effect.all(
                parsedAttempts.map((attempt) =>
                  Schema.decodeEffect(IndexedDb.Domain.PracticeAttempt)({
                    ...attempt,
                    id: crypto.randomUUID(),
                    importId: practiceImport.id,
                  })
                )
              );

              yield* store.importPractice({
                attempts,
                practiceImport,
              });

              return {
                attemptCount: attempts.length,
                sourceFileName,
              };
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      importedCount: 0,
      jsonText: "",
      sourceFileName: "",
    },
    initial: "Editing",
    states: {
      Editing: {
        on: {
          changeJsonText: ({ event }) => ({
            context: {
              jsonText: event.jsonText,
              message: undefined,
            },
          }),
          changeSourceFileName: ({ event }) => ({
            context: {
              sourceFileName: event.sourceFileName,
              message: undefined,
            },
          }),
          importJson: {
            target: "Importing",
          },
          reset: {
            context: {
              importedCount: 0,
              jsonText: "",
              message: undefined,
              sourceFileName: "",
            },
          },
        },
      },
      Importing: {
        invoke: {
          src: "importPracticeJson",
          input: ({ context }) => ({
            jsonText: context.jsonText,
            sourceFileName: context.sourceFileName,
          }),
          onDone: ({ event }) => ({
            target: "Imported",
            context: {
              importedCount: event.output.attemptCount,
              jsonText: "",
              message: `${event.output.attemptCount} attempts imported from ${event.output.sourceFileName}.`,
              sourceFileName: "",
            },
          }),
          onError: ({ event }) => ({
            target: "Editing",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not import the JSON.",
            },
          }),
        },
      },
      Imported: {
        on: {
          changeJsonText: ({ event }) => ({
            target: "Editing",
            context: {
              jsonText: event.jsonText,
              message: undefined,
            },
          }),
          changeSourceFileName: ({ event }) => ({
            target: "Editing",
            context: {
              message: undefined,
              sourceFileName: event.sourceFileName,
            },
          }),
          reset: {
            target: "Editing",
            context: {
              importedCount: 0,
              jsonText: "",
              message: undefined,
              sourceFileName: "",
            },
          },
        },
      },
    },
  });
