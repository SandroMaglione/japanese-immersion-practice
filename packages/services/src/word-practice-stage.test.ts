import assert from "node:assert/strict";
import test from "node:test";

import { initialCard } from "./word-memory-scheduler.ts";
import {
  RequiredContextFailures,
  StageTransitionDelayMillis,
  previewRating,
  transitionAfterRating,
} from "./word-practice-stage.ts";

const now = Date.UTC(2026, 0, 1);

const _input = ({
  kind = "scheduled",
  rating = "good",
  stage = "recognition",
  stageFailureStreak = 0,
  stageMasteryStreak = 1,
}: {
  readonly kind?: "scheduled" | "extra";
  readonly rating?: "again" | "hard" | "good" | "easy";
  readonly stage?: "recognition" | "meaningRecall" | "contextRecall";
  readonly stageFailureStreak?: number;
  readonly stageMasteryStreak?: number;
} = {}) => ({
  card: initialCard({ now }),
  kind,
  now,
  rating,
  stage,
  stageAttemptCount: 4,
  stageFailureStreak,
  stageMasteryStreak,
  stageStartedAtMillis: now - 20 * 86_400_000,
});

test("a second scheduled Good promotes recognition without waiting for review", () => {
  const result = transitionAfterRating(_input());

  assert.equal(result.promotedTo, "meaningRecall");
  assert.equal(result.stage, "meaningRecall");
  assert.equal(result.card.phase, "new");
  assert.equal(result.card.dueAtMillis, now + StageTransitionDelayMillis);
  assert.equal(result.stageAttemptCount, 0);
  assert.equal(result.stageMasteryStreak, 0);
});

test("two Good ratings per acquisition stage reach context in about two days", () => {
  let card = initialCard({ now });
  let stage: "recognition" | "meaningRecall" | "contextRecall" = "recognition";
  let stageStartedAtMillis = now;

  for (const expectedStage of ["meaningRecall", "contextRecall"] as const) {
    const first = previewRating({
      card,
      now: card.dueAtMillis,
      rating: "good",
      stage,
      stageAttemptCount: 0,
      stageFailureStreak: 0,
      stageMasteryStreak: 0,
      stageStartedAtMillis,
    });
    const second = previewRating({
      card: first.card,
      now: first.card.dueAtMillis,
      rating: "good",
      stage,
      stageAttemptCount: first.stageAttemptCount,
      stageFailureStreak: first.stageFailureStreak,
      stageMasteryStreak: first.stageMasteryStreak,
      stageStartedAtMillis,
    });

    assert.equal(second.promotedTo, expectedStage);
    card = second.card;
    stage = second.stage;
    stageStartedAtMillis = second.stageStartedAtMillis;
  }

  assert.equal(stage, "contextRecall");
  assert.ok(card.dueAtMillis - now < 3 * 86_400_000);
});

test("a first scheduled Good earns one mastery review", () => {
  const result = transitionAfterRating(_input({ stageMasteryStreak: 0 }));

  assert.equal(result.promotedTo, undefined);
  assert.equal(result.stage, "recognition");
  assert.equal(result.stageMasteryStreak, 1);
});

test("Easy immediately promotes an acquisition stage", () => {
  const result = transitionAfterRating(
    _input({ rating: "easy", stageMasteryStreak: 0 })
  );

  assert.equal(result.promotedTo, "meaningRecall");
  assert.equal(result.card.dueAtMillis, now + StageTransitionDelayMillis);
});

test("Hard and Again reset acquisition mastery", () => {
  for (const rating of ["hard", "again"] as const) {
    const result = transitionAfterRating(_input({ rating }));

    assert.equal(result.promotedTo, undefined);
    assert.equal(result.stageMasteryStreak, 0);
  }
});

test("extra practice cannot promote an acquisition stage", () => {
  const result = transitionAfterRating(_input({ kind: "extra" }));

  assert.equal(result.promotedTo, undefined);
  assert.equal(result.stageMasteryStreak, 1);
});

test("meaning recall promotes without requiring examples", () => {
  const result = transitionAfterRating(_input({ stage: "meaningRecall" }));

  assert.equal(result.promotedTo, "contextRecall");
  assert.equal(result.stage, "contextRecall");
});

test("context recall stays on FSRS after isolated failures", () => {
  const result = transitionAfterRating(
    _input({
      rating: "again",
      stage: "contextRecall",
      stageFailureStreak: RequiredContextFailures - 2,
    })
  );

  assert.equal(result.demotedTo, undefined);
  assert.equal(result.stage, "contextRecall");
  assert.equal(result.stageFailureStreak, RequiredContextFailures - 1);
  assert.equal(result.card.phase, "new");
});

test("three unresolved context failures demote to meaning recall", () => {
  const result = transitionAfterRating(
    _input({
      rating: "again",
      stage: "contextRecall",
      stageFailureStreak: RequiredContextFailures - 1,
    })
  );

  assert.equal(result.demotedTo, "meaningRecall");
  assert.equal(result.stage, "meaningRecall");
  assert.equal(result.card.phase, "new");
  assert.equal(result.card.dueAtMillis, now + StageTransitionDelayMillis);
  assert.equal(result.stageFailureStreak, 0);
});

test("Hard preserves context failures while Good and Easy clear them", () => {
  const hard = transitionAfterRating(
    _input({ rating: "hard", stage: "contextRecall", stageFailureStreak: 2 })
  );

  assert.equal(hard.demotedTo, undefined);
  assert.equal(hard.stageFailureStreak, 2);

  for (const rating of ["good", "easy"] as const) {
    const result = transitionAfterRating(
      _input({ rating, stage: "contextRecall", stageFailureStreak: 2 })
    );

    assert.equal(result.demotedTo, undefined);
    assert.equal(result.stageFailureStreak, 0);
  }
});

test("extra context failures do not count toward demotion", () => {
  const result = transitionAfterRating(
    _input({
      kind: "extra",
      rating: "again",
      stage: "contextRecall",
      stageFailureStreak: RequiredContextFailures - 1,
    })
  );

  assert.equal(result.demotedTo, undefined);
  assert.equal(result.stageFailureStreak, RequiredContextFailures - 1);
});
