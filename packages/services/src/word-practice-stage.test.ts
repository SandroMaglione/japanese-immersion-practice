import assert from "node:assert/strict";
import test from "node:test";

import { initialCard } from "./word-memory-scheduler.ts";
import {
  MinimumPromotionIntervalMillis,
  transitionAfterRating,
} from "./word-practice-stage.ts";

const now = Date.UTC(2026, 0, 1);

const _input = ({
  hasExamples = true,
  rating = "good",
  stage = "recognition",
  stageMasteryStreak = 1,
}: {
  readonly hasExamples?: boolean;
  readonly rating?: "again" | "hard" | "good" | "easy";
  readonly stage?: "recognition" | "meaningRecall" | "contextRecall";
  readonly stageMasteryStreak?: number;
} = {}) => ({
  card: { ...initialCard({ now }), phase: "review" as const },
  hasExamples,
  lastReviewAtMillis: now - MinimumPromotionIntervalMillis,
  now,
  phaseBefore: "review" as const,
  rating,
  stage,
  stageAttemptCount: 4,
  stageMasteryStreak,
  stageStartedAtMillis: now - 20 * 86_400_000,
});

test("a second delayed mastery review promotes recognition", () => {
  const result = transitionAfterRating(_input());

  assert.equal(result.promotedTo, "meaningRecall");
  assert.equal(result.stage, "meaningRecall");
  assert.equal(result.card.phase, "new");
  assert.equal(result.card.dueAtMillis, now + 86_400_000);
  assert.equal(result.stageAttemptCount, 0);
});

test("hard and again reset mastery without promotion", () => {
  for (const rating of ["hard", "again"] as const) {
    const result = transitionAfterRating(_input({ rating }));

    assert.equal(result.promotedTo, undefined);
    assert.equal(result.stageMasteryStreak, 0);
  }
});

test("learning answers do not count toward promotion", () => {
  const result = transitionAfterRating({
    ..._input(),
    phaseBefore: "learning",
  });

  assert.equal(result.promotedTo, undefined);
  assert.equal(result.stageMasteryStreak, 1);
});

test("meaning recall waits for examples before contextual promotion", () => {
  const result = transitionAfterRating(
    _input({ hasExamples: false, stage: "meaningRecall" })
  );

  assert.equal(result.promotedTo, undefined);
  assert.equal(result.stage, "meaningRecall");
});

test("context recall remains the permanent stage", () => {
  const result = transitionAfterRating(_input({ stage: "contextRecall" }));

  assert.equal(result.promotedTo, undefined);
  assert.equal(result.stage, "contextRecall");
});
