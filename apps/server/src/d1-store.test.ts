import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Domain, Store } from "@jip/data";
import { DateTime, Effect, Schema } from "effect";
import { Miniflare } from "miniflare";

import * as D1Store from "./d1-store.ts";

test("the D1 store round-trips camel-case domain values through snake-case rows", async (context) => {
  const miniflare = new Miniflare({
    d1Databases: ["DB"],
    modules: true,
    script: "export default { fetch() { return new Response('test worker') } }",
  });
  context.after(() => miniflare.dispose());

  const db = await miniflare.getD1Database("DB");
  const migration = await readFile(
    fileURLToPath(
      new URL("../migrations/0001-initial.sql", import.meta.url).href
    ),
    "utf8"
  );

  for (const statement of migration.split(";")) {
    const sql = statement.trim();

    if (sql !== "") {
      await db.prepare(sql).run();
    }
  }

  const now = Date.now();
  const word = await Effect.runPromise(
    Schema.decodeEffect(Domain.Word)({
      id: "348b0a9e-8979-43d1-9e7f-f477d9ac792a",
      text: "日[に]本[ほん]",
      translation: "Japan",
      description: "A country",
      examples: [
        {
          template: "{{word}}へ行[い]く。",
          translationTarget: "Japan",
          translationTemplate: "Go to {{target}}.",
        },
      ],
      createdAt: now,
      updatedAt: now,
    })
  );
  const state = await Effect.runPromise(
    Schema.decodeEffect(Domain.WordMemoryState)({
      wordId: word.id,
      phase: "new",
      dueAt: now,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      repetitions: 0,
      lapses: 0,
      attemptCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      lastPracticedAt: now,
      schedulerVersion: "test",
      createdAt: now,
      updatedAt: now,
    })
  );

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* Store.Store;
      yield* store.insertWordWithMemoryState({ state, word });
      const words = yield* store.listWords();
      const storedState = yield* store.getMemoryState(word.id);

      return { storedState, words };
    }).pipe(Effect.provide(D1Store.layer(db)))
  );

  assert.equal(result.words.length, 1);
  assert.equal(result.words[0]?.text, word.text);
  assert.equal(
    result.words[0]?.examples?.[0]?.template,
    word.examples?.[0]?.template
  );
  assert.equal(
    result.words[0]?.examples?.[0]?.translationTarget,
    word.examples?.[0]?.translationTarget
  );
  assert.equal(result.storedState?.phase, "new");
  assert.equal(
    result.storedState === undefined
      ? undefined
      : DateTime.toEpochMillis(result.storedState.updatedAt),
    now
  );

  await db
    .prepare(
      `INSERT INTO words (
        id, text, translation, description, examples, archived_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      "9bb54e79-82d9-44ae-9179-5c5b12e6597b",
      "資[し]金[きん]",
      "funds",
      null,
      '[{"template":"{{word}}を集める。","translation":"Raise funds."}]',
      null,
      now,
      now
    )
    .run();

  const wordsWithLegacyExample = await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* Store.Store;

      return yield* store.listWords();
    }).pipe(Effect.provide(D1Store.layer(db)))
  );
  const migratedExample = wordsWithLegacyExample.find(
    (entry) => entry.text === "資[し]金[きん]"
  )?.examples?.[0];

  assert.equal(migratedExample?.translationTarget, "Raise funds.");
  assert.equal(migratedExample?.translationTemplate, "{{target}}");
});
