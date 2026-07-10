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

export const MaximumActiveLearningWords = 20;
export const MaximumMissesPerWordPerSession = 3;
export const RecentWordLimit = 6;
export const MinimumActiveLearningVariety = RecentWordLimit + 1;
export const NewWordCreditPerAttempt = 1 / 8;
export const NewWordCreditPerBacklogAttempt = 1 / 20;
export const DueBacklogThreshold = 64;
export const ForcedOldestDueFrequency = 4;

const _availableCandidates = ({
  candidates,
  ignoreRecent,
  state,
}: {
  readonly candidates: readonly WordSessionSelectionCandidate[];
  readonly ignoreRecent: boolean;
  readonly state: WordSessionSelectionState;
}) =>
  candidates.filter(
    (candidate) =>
      (state.missCounts[candidate.wordId] ?? 0) <
        MaximumMissesPerWordPerSession &&
      (ignoreRecent || !state.recentWordIds.includes(candidate.wordId))
  );

const _chooseWeighted = ({
  candidates,
  now,
  randomFraction,
  source,
}: {
  readonly candidates: readonly WordSessionSelectionCandidate[];
  readonly now: number;
  readonly randomFraction: number;
  readonly source: "review" | "extra";
}) => {
  const rankedCandidates = [...candidates]
    .map((candidate) => {
      const overdueDays = Math.max(0, now - candidate.dueAtMillis) / 86_400_000;
      const normalizedOverdue =
        overdueDays / Math.max(1, candidate.scheduledDays);
      const practiceAgeDays =
        candidate.lastPracticedAtMillis === undefined
          ? 365
          : Math.max(0, now - candidate.lastPracticedAtMillis) / 86_400_000;
      const score =
        source === "review"
          ? normalizedOverdue * 4 +
            (1 - candidate.retrievability) * 3 +
            candidate.difficulty * 0.15
          : (1 - candidate.retrievability) * 5 +
            Math.min(practiceAgeDays, 365) / 365;

      return {
        candidate,
        score: Math.max(0.01, score),
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 20);
  const totalScore = rankedCandidates.reduce(
    (total, candidate) => total + candidate.score,
    0
  );
  let remainingScore = randomFraction * totalScore;

  for (const rankedCandidate of rankedCandidates) {
    remainingScore -= rankedCandidate.score;

    if (remainingScore <= 0) {
      return rankedCandidate.candidate;
    }
  }

  return rankedCandidates[rankedCandidates.length - 1]?.candidate;
};

const _sourceForLearningPhase = ({
  phase,
}: {
  readonly phase: WordMemoryPhase;
}) => (phase === "relearning" ? "relearning" : "learning");

const _selectWithRecentRule = ({
  candidates,
  state,
}: {
  readonly candidates: readonly WordSessionSelectionCandidate[];
  readonly state: WordSessionSelectionState;
}) => {
  const withoutRecent = _availableCandidates({
    candidates,
    ignoreRecent: false,
    state,
  });

  return withoutRecent[0] === undefined
    ? _availableCandidates({ candidates, ignoreRecent: true, state })
    : withoutRecent;
};

export const selectNextWord = ({
  now,
  pools,
  randomFraction,
  state,
}: {
  readonly now: number;
  readonly pools: WordSessionSelectionPools;
  readonly randomFraction: number;
  readonly state: WordSessionSelectionState;
}): WordSessionSelection | undefined => {
  const dueLearning = _selectWithRecentRule({
    candidates: pools.dueLearning,
    state,
  });
  const dueReview = _selectWithRecentRule({
    candidates: pools.dueReview,
    state,
  });
  const newWords = _selectWithRecentRule({
    candidates: pools.newWords,
    state,
  });
  const extra = _selectWithRecentRule({
    candidates: pools.extra,
    state,
  });
  const earlyLearning = _selectWithRecentRule({
    candidates: pools.earlyLearning,
    state,
  });
  const canIntroduceNewWord =
    newWords[0] !== undefined &&
    pools.activeLearningCount < MaximumActiveLearningWords &&
    (state.newWordCredit >= 1 ||
      (pools.activeLearningCount < MinimumActiveLearningVariety &&
        dueLearning[0] === undefined &&
        dueReview[0] === undefined &&
        extra[0] === undefined));

  if (dueLearning[0] !== undefined && state.consecutiveLearningSelections < 2) {
    const candidate = dueLearning[0];

    return {
      candidate,
      kind: "scheduled",
      source: _sourceForLearningPhase({ phase: candidate.phase }),
    };
  }

  if (canIntroduceNewWord) {
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
  }

  if (dueReview[0] !== undefined) {
    const shouldForceOldest =
      state.dueReviewSelectionsSinceForced >= ForcedOldestDueFrequency - 1;
    const candidate = shouldForceOldest
      ? [...dueReview].sort(
          (left, right) => left.dueAtMillis - right.dueAtMillis
        )[0]
      : _chooseWeighted({
          candidates: dueReview,
          now,
          randomFraction,
          source: "review",
        });

    return candidate === undefined
      ? undefined
      : {
          candidate,
          kind: "scheduled",
          source: "review",
        };
  }

  if (dueLearning[0] !== undefined) {
    const candidate = dueLearning[0];

    return {
      candidate,
      kind: "scheduled",
      source: _sourceForLearningPhase({ phase: candidate.phase }),
    };
  }

  if (extra[0] !== undefined) {
    const candidate = _chooseWeighted({
      candidates: extra,
      now,
      randomFraction,
      source: "extra",
    });

    return candidate === undefined
      ? undefined
      : {
          candidate,
          kind: "extra",
          source: "extra",
        };
  }

  if (earlyLearning[0] !== undefined) {
    const candidate = earlyLearning[0];

    return {
      candidate,
      kind: "extra",
      source: _sourceForLearningPhase({ phase: candidate.phase }),
    };
  }

  if (
    newWords[0] !== undefined &&
    pools.activeLearningCount < MaximumActiveLearningWords
  ) {
    return {
      candidate: newWords[0],
      kind: "scheduled",
      source: "new",
    };
  }

  const lastResortLearning = pools.dueLearning[0] ?? pools.earlyLearning[0];

  if (lastResortLearning !== undefined) {
    return {
      candidate: lastResortLearning,
      kind: lastResortLearning.dueAtMillis <= now ? "scheduled" : "extra",
      source: _sourceForLearningPhase({
        phase: lastResortLearning.phase,
      }),
    };
  }

  const lastResortReview = pools.dueReview[0];

  if (lastResortReview !== undefined) {
    return {
      candidate: lastResortReview,
      kind: "scheduled",
      source: "review",
    };
  }

  const lastResortExtra = pools.extra[0];

  if (lastResortExtra !== undefined) {
    return {
      candidate: lastResortExtra,
      kind: "extra",
      source: "extra",
    };
  }

  return undefined;
};

export const sessionStateAfterSelection = ({
  selection,
  state,
}: {
  readonly selection: WordSessionSelection;
  readonly state: WordSessionSelectionState;
}): WordSessionSelectionState => ({
  ...state,
  consecutiveLearningSelections:
    selection.source === "learning" || selection.source === "relearning"
      ? state.consecutiveLearningSelections + 1
      : 0,
  dueReviewSelectionsSinceForced:
    selection.source === "review"
      ? state.dueReviewSelectionsSinceForced >= ForcedOldestDueFrequency - 1
        ? 0
        : state.dueReviewSelectionsSinceForced + 1
      : state.dueReviewSelectionsSinceForced,
  newWordCredit:
    selection.source === "new"
      ? Math.max(0, state.newWordCredit - 1)
      : state.newWordCredit,
  recentWordIds: [selection.candidate.wordId, ...state.recentWordIds]
    .filter((wordId, index, wordIds) => wordIds.indexOf(wordId) === index)
    .slice(0, RecentWordLimit),
});

export const sessionStateAfterResult = ({
  dueReviewCount,
  result,
  state,
  wordId,
}: {
  readonly dueReviewCount: number;
  readonly result: "correct" | "incorrect";
  readonly state: WordSessionSelectionState;
  readonly wordId: string;
}): WordSessionSelectionState => ({
  ...state,
  missCounts:
    result === "incorrect"
      ? {
          ...state.missCounts,
          [wordId]: (state.missCounts[wordId] ?? 0) + 1,
        }
      : state.missCounts,
  newWordCredit: Math.min(
    1,
    state.newWordCredit +
      (dueReviewCount >= DueBacklogThreshold
        ? NewWordCreditPerBacklogAttempt
        : NewWordCreditPerAttempt)
  ),
});
