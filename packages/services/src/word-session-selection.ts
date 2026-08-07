import type {
  WordMemoryPhase,
  WordMemoryPracticeKind,
} from "./word-memory-scheduler.ts";

export type WordSessionCandidateSource =
  | "new"
  | "learning"
  | "review"
  | "relearning"
  | "extra";

export type WordSessionSelectionCandidate = {
  readonly difficulty: number;
  readonly dueAtMillis: number;
  readonly lastPracticedAtMillis?: number;
  readonly phase: WordMemoryPhase;
  readonly retrievability: number;
  readonly scheduledDays: number;
  readonly wordId: string;
};

export type WordSessionSelection = {
  readonly candidate: WordSessionSelectionCandidate;
  readonly kind: WordMemoryPracticeKind;
  readonly source: WordSessionCandidateSource;
};

export type WordSessionSelectionPools = {
  readonly activeLearningCount: number;
  readonly dueLearning: readonly WordSessionSelectionCandidate[];
  readonly dueReview: readonly WordSessionSelectionCandidate[];
  readonly earlyLearning: readonly WordSessionSelectionCandidate[];
  readonly extra: readonly WordSessionSelectionCandidate[];
  readonly newWords: readonly WordSessionSelectionCandidate[];
};

export type WordSessionSelectionState = {
  readonly consecutiveLearningSelections: number;
  readonly dueReviewSelectionsSinceForced: number;
  readonly missCounts: Readonly<Record<string, number>>;
  readonly newWordCredit: number;
  readonly recentWordIds: readonly string[];
};

const _oldest = (
  candidates: readonly WordSessionSelectionCandidate[]
): WordSessionSelectionCandidate | undefined =>
  [...candidates].sort(
    (left, right) =>
      left.dueAtMillis - right.dueAtMillis ||
      left.wordId.localeCompare(right.wordId)
  )[0];

export const selectNextWord = ({
  now,
  pools,
  randomFraction,
}: {
  readonly now: number;
  readonly pools: WordSessionSelectionPools;
  readonly randomFraction: number;
  readonly state: WordSessionSelectionState;
}): WordSessionSelection | undefined => {
  const dueLearning = _oldest(
    pools.dueLearning.filter((candidate) => candidate.dueAtMillis <= now)
  );

  if (dueLearning !== undefined) {
    return {
      candidate: dueLearning,
      kind: "scheduled",
      source: dueLearning.phase === "relearning" ? "relearning" : "learning",
    };
  }

  const dueReview = _oldest(
    pools.dueReview.filter((candidate) => candidate.dueAtMillis <= now)
  );

  if (dueReview !== undefined) {
    return {
      candidate: dueReview,
      kind: "scheduled",
      source: "review",
    };
  }

  const newWords = pools.newWords.filter(
    (candidate) => candidate.dueAtMillis <= now
  );
  const candidate =
    newWords[
      Math.min(
        newWords.length - 1,
        Math.floor(randomFraction * newWords.length)
      )
    ];

  return candidate === undefined
    ? undefined
    : {
        candidate,
        kind: "scheduled",
        source: "new",
      };
};

export const sessionStateAfterSelection = ({
  state,
}: {
  readonly selection: WordSessionSelection;
  readonly state: WordSessionSelectionState;
}): WordSessionSelectionState => state;

export const sessionStateAfterResult = ({
  state,
}: {
  readonly dueReviewCount: number;
  readonly result: "correct" | "incorrect";
  readonly state: WordSessionSelectionState;
  readonly wordId: string;
}): WordSessionSelectionState => state;
