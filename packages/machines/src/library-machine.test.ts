import assert from "node:assert/strict";
import test from "node:test";

import { Effect, Schema } from "effect";

import { WordExampleImportJsonSchema } from "./library-machine.ts";

const decodeExampleImport = Schema.decodeUnknownEffect(
  WordExampleImportJsonSchema
);

test("example enrichment accepts strict versioned entries", async () => {
  const decoded = await Effect.runPromise(
    decodeExampleImport(
      {
        formatVersion: 1,
        operation: "addExamples",
        words: [
          {
            examples: [
              {
                note: "A useful collocation.",
                template: "{{word}}を集める。",
                translation: "Raise funds.",
              },
            ],
            text: "資[し]金[きん]",
          },
        ],
      },
      {
        errors: "all",
        onExcessProperty: "error",
      }
    )
  );

  assert.equal(decoded.words[0]?.text, "資[し]金[きん]");
});

test("example enrichment rejects malformed examples", async () => {
  await assert.rejects(
    Effect.runPromise(
      decodeExampleImport(
        {
          formatVersion: 1,
          operation: "addExamples",
          words: [
            {
              examples: [
                {
                  template: "資金を集める。",
                  translation: "Raise funds.",
                },
              ],
              text: "資[し]金[きん]",
            },
          ],
        },
        {
          errors: "all",
          onExcessProperty: "error",
        }
      )
    ),
    /\{\{word\}\}/u
  );
});

test("example enrichment rejects unknown properties", async () => {
  const payload: unknown = {
    formatVersion: 1,
    operation: "addExamples",
    words: [
      {
        examples: [
          {
            template: "{{word}}を集める。",
            translation: "Raise funds.",
          },
        ],
        text: "資[し]金[きん]",
        translation: "funds",
      },
    ],
  };

  await assert.rejects(
    Effect.runPromise(
      decodeExampleImport(payload, {
        errors: "all",
        onExcessProperty: "error",
      })
    ),
    /Unexpected key/u
  );
});
