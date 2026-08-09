import {
  applyDeterministicPracticeResult,
  initialCard,
  type WordMemoryCard,
} from "./word-memory-scheduler.ts";

export type WordPracticeStage =
  | "recognition"
  | "meaningRecall"
  | "contextRecall";

export type WordPracticeRating = "again" | "hard" | "good" | "easy";

export type WordPracticeStageTransition = {
  readonly card: WordMemoryCard;
  readonly promotedTo?: WordPracticeStage;
  readonly stage: WordPracticeStage;
  readonly stageAttemptCount: number;
  readonly stageMasteryStreak: number;
  readonly stageStartedAtMillis: number;
};

export const MinimumPromotionIntervalMillis = 3 * 86_400_000;
export const RequiredMasteryReviews = 2;
export const PromotionDelayMillis = 86_400_000;

export const transitionAfterRating = ({
  card,
  hasExamples,
  lastReviewAtMillis,
  now,
  phaseBefore,
  rating,
  stage,
  stageAttemptCount,
  stageMasteryStreak,
  stageStartedAtMillis,
}: {
  readonly card: WordMemoryCard;
  readonly hasExamples: boolean;
  readonly lastReviewAtMillis?: number;
  readonly now: number;
  readonly phaseBefore: WordMemoryCard["phase"];
  readonly rating: WordPracticeRating;
  readonly stage: WordPracticeStage;
  readonly stageAttemptCount: number;
  readonly stageMasteryStreak: number;
  readonly stageStartedAtMillis: number;
}): WordPracticeStageTransition => {
  const masteryRating = rating === "good" || rating === "easy";
  const ratedReview = phaseBefore === "review";
  const nextMasteryStreak =
    rating === "again" || rating === "hard"
      ? 0
      : ratedReview && masteryRating
        ? stageMasteryStreak + 1
        : stageMasteryStreak;
  const delayedReview =
    lastReviewAtMillis !== undefined &&
    now - lastReviewAtMillis >= MinimumPromotionIntervalMillis;
  const nextStage =
    stage === "recognition"
      ? "meaningRecall"
      : stage === "meaningRecall" && hasExamples
        ? "contextRecall"
        : undefined;
  const promotedTo =
    ratedReview &&
    masteryRating &&
    delayedReview &&
    nextMasteryStreak >= RequiredMasteryReviews
      ? nextStage
      : undefined;

  if (promotedTo === undefined) {
    return {
      card,
      stage,
      stageAttemptCount: stageAttemptCount + 1,
      stageMasteryStreak: nextMasteryStreak,
      stageStartedAtMillis,
    };
  }

  const nextStageStartsAt = now + PromotionDelayMillis;

  return {
    card: initialCard({ now: nextStageStartsAt }),
    promotedTo,
    stage: promotedTo,
    stageAttemptCount: 0,
    stageMasteryStreak: 0,
    stageStartedAtMillis: nextStageStartsAt,
  };
};

export const previewRating = ({
  card,
  hasExamples,
  lastReviewAtMillis,
  now,
  rating,
  stage,
  stageAttemptCount,
  stageMasteryStreak,
  stageStartedAtMillis,
}: {
  readonly card: WordMemoryCard;
  readonly hasExamples: boolean;
  readonly lastReviewAtMillis?: number;
  readonly now: number;
  readonly rating: WordPracticeRating;
  readonly stage: WordPracticeStage;
  readonly stageAttemptCount: number;
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
    hasExamples,
    ...(lastReviewAtMillis === undefined ? {} : { lastReviewAtMillis }),
    now,
    phaseBefore: card.phase,
    rating,
    stage,
    stageAttemptCount,
    stageMasteryStreak,
    stageStartedAtMillis,
  });
};
