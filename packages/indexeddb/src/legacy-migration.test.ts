import assert from "node:assert/strict";
import test from "node:test";

import { Effect, Schema } from "effect";

import * as Domain from "./domain.ts";
import { buildVersion5Data } from "./legacy-migration.ts";

const Minute = 60_000;
const start = Date.UTC(2026, 0, 1);
const BatchId = "10000000-0000-4000-8000-000000000001";

test("legacy words and attempts migrate without losing review history", async () => {
  const migrated = buildVersion5Data({
    legacyBatches: [
      {
        id: BatchId,
        batchNumber: 7,
        startedAt: start,
        completedAt: start + 20 * Minute,
        wordOrder: ["猫"],
      },
    ],
    legacySubmissions: [
      {
        id: "20000000-0000-4000-8000-000000000002",
        wordText: "猫",
        submittedText: "犬",
        submittedAt: start + 11 * Minute,
        result: "incorrect",
        batchId: BatchId,
        batchPosition: 1,
      },
      {
        id: "20000000-0000-4000-8000-000000000001",
        wordText: "猫",
        submittedText: "猫",
        submittedAt: start + Minute,
        batchId: BatchId,
        batchPosition: 0,
      },
    ],
    legacyWords: [
      {
        text: "猫",
        translation: "cat",
        createdAt: start,
        updatedAt: start + 20 * Minute,
      },
      {
        text: "犬",
        translation: "dog",
        createdAt: start,
        updatedAt: start,
      },
    ],
  });

  await Effect.runPromise(
    Effect.all([
      Schema.decodeEffect(Schema.Array(Domain.Word))(migrated.words),
      Schema.decodeEffect(Schema.Array(Domain.WordMemoryState))(
        migrated.states
      ),
      Schema.decodeEffect(Schema.Array(Domain.WordPracticeEvent))(
        migrated.events
      ),
    ])
  );

  assert.equal(migrated.words.length, 2);
  assert.equal(migrated.states.length, 2);
  assert.equal(migrated.events.length, 2);

  const practicedWord = migrated.words.find((word) => word.text === "猫");
  const unpracticedWord = migrated.words.find((word) => word.text === "犬");
  assert.ok(practicedWord !== undefined);
  assert.ok(unpracticedWord !== undefined);
  assert.notEqual(practicedWord.id, unpracticedWord.id);

  const practicedState = migrated.states.find(
    (state) => state.wordId === practicedWord.id
  );
  const unpracticedState = migrated.states.find(
    (state) => state.wordId === unpracticedWord.id
  );
  assert.ok(practicedState !== undefined);
  assert.ok(unpracticedState !== undefined);
  assert.equal(practicedState.attemptCount, 2);
  assert.equal(practicedState.correctCount, 1);
  assert.equal(practicedState.incorrectCount, 1);
  assert.notEqual(practicedState.phase, "new");
  assert.equal(practicedState.lastPracticedAt, start + 11 * Minute);
  assert.equal(unpracticedState.phase, "new");
  assert.equal(unpracticedState.attemptCount, 0);

  const [firstEvent, secondEvent] = migrated.events;
  assert.ok(firstEvent !== undefined);
  assert.ok(secondEvent !== undefined);
  assert.equal(firstEvent.result, "correct");
  assert.equal(firstEvent.source, "new");
  assert.equal(secondEvent.result, "incorrect");
  assert.equal(secondEvent.source, "learning");
  assert.equal(firstEvent.sessionId, secondEvent.sessionId);
  assert.equal(firstEvent.legacyBatchNumber, 7);
  assert.equal(secondEvent.legacyBatchNumber, 7);
  assert.equal(firstEvent.wordId, practicedWord.id);
  assert.equal(secondEvent.wordId, practicedWord.id);
});
