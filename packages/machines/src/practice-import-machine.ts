import { IndexedDb } from "@jip/indexeddb";
import { Array as EffectArray, DateTime, Effect, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const PracticeImportContextSchema = Schema.Struct({
  csvText: Schema.String,
  importedCount: Schema.Number,
  message: Schema.optionalKey(Schema.String),
  sourceFileName: Schema.String,
});

const ImportCsvInputSchema = Schema.Struct({
  csvText: Schema.String,
  sourceFileName: Schema.String,
});

const PracticeImportResultSchema = Schema.Struct({
  attemptCount: Schema.Number,
  sourceFileName: Schema.String,
});

function _findCsvHeaderIndex({
  header,
  names,
}: {
  readonly header: readonly string[];
  readonly names: readonly string[];
}) {
  return header.findIndex((value) =>
    names.includes(value.trim().toLocaleLowerCase())
  );
}

function _csvCell({
  index,
  row,
}: {
  readonly index: number;
  readonly row: readonly string[];
}) {
  return row[index]?.trim() ?? "";
}

export const makePracticeImportMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<IndexedDb.Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(PracticeImportContextSchema),
      events: {
        changeCsvText: Schema.toStandardSchemaV1(
          Schema.Struct({ csvText: Schema.String })
        ),
        changeSourceFileName: Schema.toStandardSchemaV1(
          Schema.Struct({ sourceFileName: Schema.String })
        ),
        importCsv: Schema.toStandardSchemaV1(Schema.Void),
        reset: Schema.toStandardSchemaV1(Schema.Void),
      },
    },
    actorSources: {
      importPracticeCsv: createAsyncLogic({
        schemas: {
          input: Schema.toStandardSchemaV1(ImportCsvInputSchema),
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

              const normalizedText = input.csvText
                .replace(/^\uFEFF/, "")
                .replace(/\r\n/g, "\n")
                .replace(/\r/g, "\n");
              const rows: string[][] = [];
              let row: string[] = [];
              let field = "";
              let insideQuotes = false;

              for (let index = 0; index < normalizedText.length; index += 1) {
                const char = normalizedText[index] ?? "";
                const nextChar = normalizedText[index + 1] ?? "";

                if (insideQuotes && char === '"' && nextChar === '"') {
                  field += '"';
                  index += 1;
                  continue;
                }

                if (char === '"') {
                  insideQuotes = !insideQuotes;
                  continue;
                }

                if (!insideQuotes && char === ",") {
                  row.push(field);
                  field = "";
                  continue;
                }

                if (!insideQuotes && char === "\n") {
                  row.push(field);
                  rows.push(row);
                  row = [];
                  field = "";
                  continue;
                }

                field += char;
              }

              row.push(field);

              if (row.some((cell) => cell.trim() !== "")) {
                rows.push(row);
              }

              const header = rows[0] ?? [];
              const sentenceIndex = _findCsvHeaderIndex({
                header,
                names: ["english cue", "sentence"],
              });
              const responseIndex = _findCsvHeaderIndex({
                header,
                names: ["user attempt", "response", "attempt"],
              });
              const resultIndex = _findCsvHeaderIndex({
                header,
                names: ["result"],
              });
              const correctionIndex = _findCsvHeaderIndex({
                header,
                names: ["correction"],
              });
              const reasonIndex = _findCsvHeaderIndex({
                header,
                names: ["reason"],
              });
              const patternTagIndex = _findCsvHeaderIndex({
                header,
                names: ["pattern tag", "pattern"],
              });

              if (sentenceIndex < 0 || responseIndex < 0 || resultIndex < 0) {
                return yield* Effect.fail(
                  new Error(
                    "CSV must include English cue, User attempt, and Result columns."
                  )
                );
              }

              const parsedAttempts = rows.slice(1).flatMap((row) => {
                const sentence = _csvCell({ index: sentenceIndex, row });
                const response = _csvCell({ index: responseIndex, row });
                const normalizedResult = _csvCell({
                  index: resultIndex,
                  row,
                }).toLocaleLowerCase();
                let result: IndexedDb.Domain.PracticeResult | undefined;

                if (
                  normalizedResult.includes("incorrect") ||
                  normalizedResult.includes("❌")
                ) {
                  result = "incorrect";
                } else if (
                  normalizedResult.includes("usable") ||
                  normalizedResult.includes("🟡")
                ) {
                  result = "usable";
                } else if (
                  normalizedResult.includes("correct") ||
                  normalizedResult.includes("✅")
                ) {
                  result = "correct";
                }

                if (
                  sentence === "" ||
                  response === "" ||
                  result === undefined
                ) {
                  return [];
                }

                const correction =
                  correctionIndex < 0
                    ? ""
                    : _csvCell({ index: correctionIndex, row });
                const reason =
                  reasonIndex < 0 ? "" : _csvCell({ index: reasonIndex, row });
                const patternTag =
                  patternTagIndex < 0
                    ? ""
                    : _csvCell({ index: patternTagIndex, row });

                return [
                  {
                    ...(correction === "" ? {} : { correction }),
                    ...(patternTag === "" ? {} : { patternTag }),
                    ...(reason === "" ? {} : { reason }),
                    response,
                    result,
                    sentence,
                  },
                ];
              });

              if (!EffectArray.isReadonlyArrayNonEmpty(parsedAttempts)) {
                return yield* Effect.fail(
                  new Error(
                    "CSV did not contain any complete practice attempts."
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
      csvText: "",
      importedCount: 0,
      sourceFileName: "",
    },
    initial: "Editing",
    states: {
      Editing: {
        on: {
          changeCsvText: ({ event }) => ({
            context: {
              csvText: event.csvText,
              message: undefined,
            },
          }),
          changeSourceFileName: ({ event }) => ({
            context: {
              sourceFileName: event.sourceFileName,
              message: undefined,
            },
          }),
          importCsv: {
            target: "Importing",
          },
          reset: {
            context: {
              csvText: "",
              importedCount: 0,
              message: undefined,
              sourceFileName: "",
            },
          },
        },
      },
      Importing: {
        invoke: {
          src: "importPracticeCsv",
          input: ({ context }) => ({
            csvText: context.csvText,
            sourceFileName: context.sourceFileName,
          }),
          onDone: ({ event }) => ({
            target: "Imported",
            context: {
              csvText: "",
              importedCount: event.output.attemptCount,
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
                  : "Could not import the CSV.",
            },
          }),
        },
      },
      Imported: {
        on: {
          changeCsvText: ({ event }) => ({
            target: "Editing",
            context: {
              csvText: event.csvText,
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
              csvText: "",
              importedCount: 0,
              message: undefined,
              sourceFileName: "",
            },
          },
        },
      },
    },
  });
