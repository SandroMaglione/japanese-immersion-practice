import { IndexedDb } from "@jip/indexeddb";
import { Array as EffectArray, Effect, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const PracticeAttemptViewSchema = Schema.Struct({
  attempt: IndexedDb.Domain.PracticeAttempt,
  practiceImport: IndexedDb.Domain.PracticeImport,
});

const PracticeHistoryContextSchema = Schema.Struct({
  attempts: Schema.Array(PracticeAttemptViewSchema),
  matchingAttempts: Schema.Array(PracticeAttemptViewSchema),
  message: Schema.optionalKey(Schema.String),
  query: Schema.String,
});

function _filterPracticeAttempts({
  attempts,
  query,
}: {
  readonly attempts: readonly (typeof PracticeAttemptViewSchema.Type)[];
  readonly query: string;
}) {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

  if (!EffectArray.isReadonlyArrayNonEmpty(tokens)) {
    return attempts;
  }

  return attempts.filter((view) => {
    const searchable = [
      view.attempt.sentence,
      view.attempt.response,
      view.attempt.result,
      view.attempt.correction,
      view.attempt.reason,
      view.attempt.patternTag,
      view.practiceImport.sourceFileName,
    ]
      .filter((value): value is string => value !== undefined)
      .join(" ")
      .toLocaleLowerCase();

    return tokens.every((token) => searchable.includes(token));
  });
}

export const makePracticeHistoryMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<IndexedDb.Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(PracticeHistoryContextSchema),
      events: {
        changeQuery: Schema.toStandardSchemaV1(
          Schema.Struct({
            query: Schema.String,
          })
        ),
        refresh: Schema.toStandardSchemaV1(Schema.Void),
      },
    },
    actorSources: {
      loadPracticeHistory: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(
            Schema.Array(PracticeAttemptViewSchema)
          ),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const imports = yield* store.listPracticeImports();
              const attempts = yield* store.listPracticeAttempts();

              return imports.flatMap((practiceImport) =>
                attempts
                  .filter((attempt) => attempt.importId === practiceImport.id)
                  .map((attempt) => ({
                    attempt,
                    practiceImport,
                  }))
              );
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      attempts: [],
      matchingAttempts: [],
      query: "",
    },
    initial: "Loading",
    states: {
      Loading: {
        invoke: {
          src: "loadPracticeHistory",
          onDone: ({ context, event }) => {
            const attempts = event.output;

            return {
              target: "Ready",
              context: {
                attempts,
                matchingAttempts: _filterPracticeAttempts({
                  attempts,
                  query: context.query,
                }),
                message: undefined,
              },
            };
          },
          onError: ({ event }) => ({
            target: "Failure",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not load practice history.",
            },
          }),
        },
      },
      Ready: {
        on: {
          changeQuery: ({ context, event }) => ({
            context: {
              matchingAttempts: _filterPracticeAttempts({
                attempts: context.attempts,
                query: event.query,
              }),
              query: event.query,
            },
          }),
          refresh: {
            target: "Loading",
          },
        },
      },
      Failure: {
        on: {
          changeQuery: ({ event }) => ({
            context: {
              query: event.query,
            },
          }),
          refresh: {
            target: "Loading",
          },
        },
      },
    },
  });
