import assert from "node:assert/strict";
import test from "node:test";

import { replayPracticeHistory } from "./word-memory-recalculation.ts";

const Minute = 60_000;
const start = Date.UTC(2026, 0, 1);

const _event = ({
  id,
  kind = "scheduled",
  minute,
  result = "correct",
  sessionPosition,
}: {
  readonly id: string;
  readonly kind?: "extra" | "scheduled";
  readonly minute: number;
  readonly result?: "correct" | "incorrect";
  readonly sessionPosition: number;
}) => ({
  id,
  kind,
  result,
  reviewedAtMillis: start + minute * Minute,
  sessionId: "session",
  sessionPosition,
});

test("early scheduled correctness is replayed as free practice", () => {
  const withEarlyReview = replayPracticeHistory({
    createdAtMillis: start,
    events: [
      _event({ id: "first", minute: 0, sessionPosition: 0 }),
      _event({ id: "early", minute: 1, sessionPosition: 1 }),
    ],
  });
  const withoutEarlyReview = replayPracticeHistory({
    createdAtMillis: start,
    events: [_event({ id: "first", minute: 0, sessionPosition: 0 })],
  });

  assert.deepEqual(withEarlyReview.card, withoutEarlyReview.card);
  assert.equal(withEarlyReview.reclassifiedEventCount, 1);
});

test("a scheduled correct review at the due time advances the card", () => {
  const replay = replayPracticeHistory({
    createdAtMillis: start,
    events: [
      _event({ id: "first", minute: 0, sessionPosition: 0 }),
      _event({ id: "due", minute: 10, sessionPosition: 1 }),
    ],
  });

  assert.equal(replay.card.phase, "review");
  assert.equal(replay.card.repetitions, 2);
  assert.equal(replay.reclassifiedEventCount, 0);
});

test("early incorrect practice still changes the durable card", () => {
  const beforeMiss = replayPracticeHistory({
    createdAtMillis: start,
    events: [_event({ id: "first", minute: 0, sessionPosition: 0 })],
  });
  const replay = replayPracticeHistory({
    createdAtMillis: start,
    events: [
      _event({ id: "first", minute: 0, sessionPosition: 0 }),
      _event({
        id: "early-miss",
        minute: 1,
        result: "incorrect",
        sessionPosition: 1,
      }),
    ],
  });

  assert.equal(replay.card.lapses, 0);
  assert.notDeepEqual(replay.card, beforeMiss.card);
  assert.ok(replay.card.dueAtMillis < beforeMiss.card.dueAtMillis);
  assert.equal(replay.reclassifiedEventCount, 1);
});

test("explicit extra practice remains extra even after the due time", () => {
  const replay = replayPracticeHistory({
    createdAtMillis: start,
    events: [
      _event({ id: "first", minute: 0, sessionPosition: 0 }),
      _event({
        id: "extra",
        kind: "extra",
        minute: 11,
        sessionPosition: 1,
      }),
    ],
  });

  assert.equal(replay.card.phase, "learning");
  assert.equal(replay.card.repetitions, 1);
  assert.equal(replay.reclassifiedEventCount, 0);
});

test("event replay is chronological and deterministic", () => {
  const events = [
    _event({ id: "second", minute: 10, sessionPosition: 1 }),
    _event({ id: "first", minute: 0, sessionPosition: 0 }),
  ];
  const firstReplay = replayPracticeHistory({
    createdAtMillis: start,
    events,
  });
  const secondReplay = replayPracticeHistory({
    createdAtMillis: start,
    events: [...events].reverse(),
  });

  assert.deepEqual(firstReplay, secondReplay);
});
