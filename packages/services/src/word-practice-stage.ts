import {
  applyDeterministicPracticeResult,
  initialCard,
  type WordMemoryCard,
  type WordMemoryPracticeKind,
} from "./word-memory-scheduler.ts";

export type WordPracticeStage =
  | "recognition"
  | "meaningRecall"
  | "contextRecall";

export type WordPracticeRating = "again" | "hard" | "good" | "easy";

export type WordPracticeStageTransition = {
  readonly card: WordMemoryCard;
  readonly demotedTo?: WordPracticeStage;
  readonly promotedTo?: WordPracticeStage;
  readonly stage: WordPracticeStage;
  readonly stageAttemptCount: number;
  readonly stageFailureStreak: number;
  readonly stageMasteryStreak: number;
  readonly stageStartedAtMillis: number;
};

export const RequiredMasteryReviews = 2;
export const RequiredContextFailures = 3;
export const StageTransitionDelayMillis = 86_400_000;

export const transitionAfterRating = ({
  card,
  kind,
  now,
  rating,
  stage,
  stageAttemptCount,
  stageFailureStreak,
  stageMasteryStreak,
  stageStartedAtMillis,
}: {
  readonly card: WordMemoryCard;
  readonly kind: WordMemoryPracticeKind;
  readonly now: number;
  readonly rating: WordPracticeRating;
  readonly stage: WordPracticeStage;
  readonly stageAttemptCount: number;
  readonly stageFailureStreak: number;
  readonly stageMasteryStreak: number;
  readonly stageStartedAtMillis: number;
}): WordPracticeStageTransition => {
  const nextMasteryStreak =
    stage === "contextRecall"
      ? 0
      : kind === "extra"
        ? stageMasteryStreak
        : rating === "easy"
          ? RequiredMasteryReviews
          : rating === "good"
            ? stageMasteryStreak + 1
            : 0;
  const nextFailureStreak =
    stage === "contextRecall"
      ? kind === "extra"
        ? stageFailureStreak
        : rating === "again"
          ? stageFailureStreak + 1
          : rating === "good" || rating === "easy"
            ? 0
            : stageFailureStreak
      : 0;
  const promotedTo =
    nextMasteryStreak >= RequiredMasteryReviews
      ? stage === "recognition"
        ? "meaningRecall"
        : stage === "meaningRecall"
          ? "contextRecall"
          : undefined
      : undefined;
  const demotedTo =
    stage === "contextRecall" && nextFailureStreak >= RequiredContextFailures
      ? "meaningRecall"
      : undefined;
  const transitionedTo = promotedTo ?? demotedTo;

  if (transitionedTo === undefined) {
    return {
      card,
      stage,
      stageAttemptCount: stageAttemptCount + 1,
      stageFailureStreak: nextFailureStreak,
      stageMasteryStreak: nextMasteryStreak,
      stageStartedAtMillis,
    };
  }

  const nextStageStartsAt = now + StageTransitionDelayMillis;

  return {
    card: initialCard({ now: nextStageStartsAt }),
    ...(demotedTo === undefined ? {} : { demotedTo }),
    ...(promotedTo === undefined ? {} : { promotedTo }),
    stage: transitionedTo,
    stageAttemptCount: 0,
    stageFailureStreak: 0,
    stageMasteryStreak: 0,
    stageStartedAtMillis: nextStageStartsAt,
  };
};

export const previewRating = ({
  card,
  now,
  rating,
  stage,
  stageAttemptCount,
  stageFailureStreak,
  stageMasteryStreak,
  stageStartedAtMillis,
}: {
  readonly card: WordMemoryCard;
  readonly now: number;
  readonly rating: WordPracticeRating;
  readonly stage: WordPracticeStage;
  readonly stageAttemptCount: number;
  readonly stageFailureStreak: number;
  readonly stageMasteryStreak: number;
  readonly stageStartedAtMillis: number;
}) => {
  const scheduled = applyDeterministicPracticeResult({
    card,
    kind: "scheduled",
    now,
    rating,
  });

  return transitionAfterRating({
    card: scheduled.card,
    kind: "scheduled",
    now,
    rating,
    stage,
    stageAttemptCount,
    stageFailureStreak,
    stageMasteryStreak,
    stageStartedAtMillis,
  });
};
