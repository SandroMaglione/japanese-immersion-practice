import { IndexedDb } from "@jip/indexeddb";
import { DateTime, Effect, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const PracticeOverviewDataSchema = Schema.Struct({
  dueSubmissions: Schema.Array(IndexedDb.Domain.WordPracticeSubmission),
  submissions: Schema.Array(IndexedDb.Domain.WordPracticeSubmission),
  words: Schema.Array(IndexedDb.Domain.WordEntry),
});

const PracticeOverviewContextSchema = Schema.Struct({
  dueSubmissions: Schema.Array(IndexedDb.Domain.WordPracticeSubmission),
  message: Schema.optionalKey(Schema.String),
  submissions: Schema.Array(IndexedDb.Domain.WordPracticeSubmission),
  words: Schema.Array(IndexedDb.Domain.WordEntry),
});

export const makePracticeOverviewMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<IndexedDb.Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(PracticeOverviewContextSchema),
      events: {
        refresh: Schema.toStandardSchemaV1(Schema.Void),
      },
    },
    actorSources: {
      loadPracticeOverview: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(PracticeOverviewDataSchema),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const words = yield* store.listWordEntries();
              const submissions = yield* store.listWordPracticeSubmissions();
              const dueSubmissions =
                yield* store.listDueWordPracticeSubmissions(now);

              return {
                dueSubmissions,
                submissions,
                words,
              };
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      dueSubmissions: [],
      submissions: [],
      words: [],
    },
    initial: "Loading",
    states: {
      Loading: {
        invoke: {
          src: "loadPracticeOverview",
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              dueSubmissions: event.output.dueSubmissions,
              message: undefined,
              submissions: event.output.submissions,
              words: event.output.words,
            },
          }),
          onError: ({ event }) => ({
            target: "Failure",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not load practice data.",
            },
          }),
        },
      },
      Ready: {
        on: {
          refresh: {
            target: "Loading",
          },
        },
      },
      Failure: {
        on: {
          refresh: {
            target: "Loading",
          },
        },
      },
    },
  });
