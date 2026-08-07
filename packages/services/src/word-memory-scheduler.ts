import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  type Card,
  type CardInput,
} from "ts-fsrs";

export type WordMemoryPhase = "new" | "learning" | "review" | "relearning";

export type WordMemoryCard = {
  readonly difficulty: number;
  readonly dueAtMillis: number;
  readonly elapsedDays: number;
  readonly lapses: number;
  readonly lastReviewAtMillis?: number;
  readonly learningSteps: number;
  readonly phase: WordMemoryPhase;
  readonly repetitions: number;
  readonly scheduledDays: number;
  readonly stability: number;
};

export type WordMemoryPracticeKind = "scheduled" | "extra";
export type WordMemoryPracticeResult = "correct" | "incorrect";
export type WordMemoryPracticeRating = "again" | "hard" | "good" | "easy";

export type WordMemoryTransition = {
  readonly card: WordMemoryCard;
  readonly changedSchedule: boolean;
  readonly previousDueAtMillis: number;
};

export const SchedulerVersion = "fsrs-config-1";

export const SchedulerParameters = {
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  maximum_interval: 36_500,
  relearning_steps: ["5m"],
  request_retention: 0.9,
} as const;

const _scheduler = fsrs(SchedulerParameters);
const _deterministicScheduler = fsrs({
  ...SchedulerParameters,
  enable_fuzz: false,
});

const _fromFsrsCard = ({ card }: { readonly card: Card }): WordMemoryCard => ({
  difficulty: card.difficulty,
  dueAtMillis: card.due.getTime(),
  elapsedDays: card.elapsed_days,
  lapses: card.lapses,
  ...(card.last_review === undefined
    ? {}
    : { lastReviewAtMillis: card.last_review.getTime() }),
  learningSteps: card.learning_steps,
  phase:
    card.state === State.Learning
      ? "learning"
      : card.state === State.Review
        ? "review"
        : card.state === State.Relearning
          ? "relearning"
          : "new",
  repetitions: card.reps,
  scheduledDays: card.scheduled_days,
  stability: card.stability,
});

const _toFsrsCard = ({
  card,
}: {
  readonly card: WordMemoryCard;
}): CardInput => ({
  difficulty: card.difficulty,
  due: card.dueAtMillis,
  elapsed_days: card.elapsedDays,
  lapses: card.lapses,
  last_review: card.lastReviewAtMillis ?? null,
  learning_steps: card.learningSteps,
  reps: card.repetitions,
  scheduled_days: card.scheduledDays,
  stability: card.stability,
  state:
    card.phase === "learning"
      ? State.Learning
      : card.phase === "review"
        ? State.Review
        : card.phase === "relearning"
          ? State.Relearning
          : State.New,
});

export const initialCard = ({
  now,
}: {
  readonly now: number;
}): WordMemoryCard =>
  _fromFsrsCard({
    card: createEmptyCard(new Date(now)),
  });

const _applyPracticeResultWithScheduler = ({
  card,
  deterministic,
  kind,
  now,
  rating,
}: {
  readonly card: WordMemoryCard;
  readonly deterministic: boolean;
  readonly kind: WordMemoryPracticeKind;
  readonly now: number;
  readonly rating: WordMemoryPracticeRating;
}): WordMemoryTransition => {
  if (kind === "extra" && rating !== "again") {
    return {
      card,
      changedSchedule: false,
      previousDueAtMillis: card.dueAtMillis,
    };
  }

  const scheduler = deterministic ? _deterministicScheduler : _scheduler;
  const next = scheduler.next(
    _toFsrsCard({ card }),
    new Date(now),
    rating === "again"
      ? Rating.Again
      : rating === "hard"
        ? Rating.Hard
        : rating === "easy"
          ? Rating.Easy
          : Rating.Good
  );

  return {
    card: _fromFsrsCard({ card: next.card }),
    changedSchedule: true,
    previousDueAtMillis: card.dueAtMillis,
  };
};

export const applyPracticeResult = ({
  card,
  kind,
  now,
  rating,
}: {
  readonly card: WordMemoryCard;
  readonly kind: WordMemoryPracticeKind;
  readonly now: number;
  readonly rating: WordMemoryPracticeRating;
}) =>
  _applyPracticeResultWithScheduler({
    card,
    deterministic: false,
    kind,
    now,
    rating,
  });

export const applyDeterministicPracticeResult = ({
  card,
  kind,
  now,
  rating,
}: {
  readonly card: WordMemoryCard;
  readonly kind: WordMemoryPracticeKind;
  readonly now: number;
  readonly rating: WordMemoryPracticeRating;
}) =>
  _applyPracticeResultWithScheduler({
    card,
    deterministic: true,
    kind,
    now,
    rating,
  });

export const previewRatings = ({
  card,
  now,
}: {
  readonly card: WordMemoryCard;
  readonly now: number;
}) => ({
  again: applyDeterministicPracticeResult({
    card,
    kind: "scheduled",
    now,
    rating: "again",
  }).card.dueAtMillis,
  hard: applyDeterministicPracticeResult({
    card,
    kind: "scheduled",
    now,
    rating: "hard",
  }).card.dueAtMillis,
  good: applyDeterministicPracticeResult({
    card,
    kind: "scheduled",
    now,
    rating: "good",
  }).card.dueAtMillis,
  easy: applyDeterministicPracticeResult({
    card,
    kind: "scheduled",
    now,
    rating: "easy",
  }).card.dueAtMillis,
});

export const retrievability = ({
  card,
  now,
}: {
  readonly card: WordMemoryCard;
  readonly now: number;
}) =>
  card.phase === "new"
    ? 0
    : _deterministicScheduler.get_retrievability(
        _toFsrsCard({ card }),
        new Date(now),
        false
      );

export const isDue = ({
  card,
  now,
}: {
  readonly card: WordMemoryCard;
  readonly now: number;
}) => card.phase !== "new" && card.dueAtMillis <= now;
