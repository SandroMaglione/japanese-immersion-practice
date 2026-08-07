import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDeterministicPracticeResult,
  initialCard,
  retrievability,
} from "./word-memory-scheduler.ts";

const Minute = 60_000;
const Day = 86_400_000;

test("a correct new word enters learning", () => {
  const now = Date.UTC(2026, 0, 1);
  const transition = applyDeterministicPracticeResult({
    card: initialCard({ now }),
    kind: "scheduled",
    now,
    rating: "good",
  });

  assert.equal(transition.card.phase, "learning");
  assert.equal(transition.card.dueAtMillis, now + 10 * Minute);
  assert.equal(transition.changedSchedule, true);
});

test("extra correctness preserves the durable schedule", () => {
  const now = Date.UTC(2026, 0, 1);
  const initial = initialCard({ now });
  const learning = applyDeterministicPracticeResult({
    card: initial,
    kind: "scheduled",
    now,
    rating: "good",
  }).card;
  const transition = applyDeterministicPracticeResult({
    card: learning,
    kind: "extra",
    now: now + Minute,
    rating: "good",
  });

  assert.deepEqual(transition.card, learning);
  assert.equal(transition.changedSchedule, false);
});

test("extra failure changes the durable schedule", () => {
  const now = Date.UTC(2026, 0, 1);
  const initial = initialCard({ now });
  const learning = applyDeterministicPracticeResult({
    card: initial,
    kind: "scheduled",
    now,
    rating: "good",
  }).card;
  const transition = applyDeterministicPracticeResult({
    card: learning,
    kind: "extra",
    now: now + Minute,
    rating: "again",
  });

  assert.equal(transition.changedSchedule, true);
  assert.notDeepEqual(transition.card, learning);
});

test("retrievability falls as review time passes", () => {
  const now = Date.UTC(2026, 0, 1);
  let card = initialCard({ now });

  card = applyDeterministicPracticeResult({
    card,
    kind: "scheduled",
    now,
    rating: "good",
  }).card;
  card = applyDeterministicPracticeResult({
    card,
    kind: "scheduled",
    now: card.dueAtMillis,
    rating: "good",
  }).card;

  const initialRetrievability = retrievability({
    card,
    now: card.lastReviewAtMillis ?? now,
  });
  const laterRetrievability = retrievability({
    card,
    now: (card.lastReviewAtMillis ?? now) + Day,
  });

  assert.ok(initialRetrievability > laterRetrievability);
});
