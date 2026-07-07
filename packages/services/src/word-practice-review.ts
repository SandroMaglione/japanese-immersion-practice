export type WordPracticeReviewResult = "correct" | "incorrect";

export type WordPracticeReviewSubmission = {
  readonly result: WordPracticeReviewResult;
  readonly submittedAtMillis: number;
};

export type WordPracticeReviewState = {
  readonly level: number;
  readonly levelStartedAtMillis: number;
  readonly nextReviewAtMillis?: number;
};

export type WordPracticeReviewWordState = WordPracticeReviewState & {
  readonly wordText: string;
};

type WordPracticeReviewLevel = {
  readonly correctSubmissionTarget: number;
  readonly delayMillis: number;
  readonly level: number;
};

const MillisecondsPerMinute = 60 * 1000;
const MillisecondsPerHour = 60 * MillisecondsPerMinute;
const MillisecondsPerDay = 24 * MillisecondsPerHour;

export const ReviewLevels = [
  {
    correctSubmissionTarget: 5,
    delayMillis: 0,
    level: 0,
  },
  {
    correctSubmissionTarget: 3,
    delayMillis: 15 * MillisecondsPerMinute,
    level: 1,
  },
  {
    correctSubmissionTarget: 3,
    delayMillis: MillisecondsPerDay,
    level: 2,
  },
  {
    correctSubmissionTarget: 2,
    delayMillis: 3 * MillisecondsPerDay,
    level: 3,
  },
  {
    correctSubmissionTarget: 2,
    delayMillis: 9 * MillisecondsPerDay,
    level: 4,
  },
  {
    correctSubmissionTarget: 2,
    delayMillis: 27 * MillisecondsPerDay,
    level: 5,
  },
  {
    correctSubmissionTarget: 1,
    delayMillis: 81 * MillisecondsPerDay,
    level: 6,
  },
] as const satisfies readonly WordPracticeReviewLevel[];

export const MaximumReviewLevel = ReviewLevels.length - 1;
export const MinimumReviewLevel = 0;

const FallbackReviewLevel: WordPracticeReviewLevel = {
  correctSubmissionTarget: 1,
  delayMillis: 0,
  level: 0,
};

const _clamp = ({
  max,
  min,
  value,
}: {
  readonly max: number;
  readonly min: number;
  readonly value: number;
}) => Math.min(max, Math.max(min, value));

const _nextReviewAtMillis = ({
  delayMillis,
  now,
}: {
  readonly delayMillis: number;
  readonly now: number;
}) => (delayMillis <= 0 ? undefined : now + delayMillis);

export const reviewLevelRule = ({ level }: { readonly level: number }) => {
  const clampedLevel = _clamp({
    max: MaximumReviewLevel,
    min: MinimumReviewLevel,
    value: Math.trunc(level),
  });

  return (
    ReviewLevels.find((reviewLevel) => reviewLevel.level === clampedLevel) ??
    FallbackReviewLevel
  );
};

export const initialState = ({
  now,
}: {
  readonly now: number;
}): WordPracticeReviewState => ({
  level: MinimumReviewLevel,
  levelStartedAtMillis: now,
});

export const normalizeState = ({
  state,
}: {
  readonly state: WordPracticeReviewState;
}): WordPracticeReviewState => ({
  ...state,
  level: _clamp({
    max: MaximumReviewLevel,
    min: MinimumReviewLevel,
    value: Math.trunc(state.level),
  }),
});

export const correctProgressAtLevel = ({
  state,
  submissions,
}: {
  readonly state: WordPracticeReviewState;
  readonly submissions: readonly WordPracticeReviewSubmission[];
}) =>
  submissions.filter(
    (submission) =>
      submission.submittedAtMillis > state.levelStartedAtMillis &&
      submission.result === "correct",
  ).length;

export const isDue = ({
  now,
  state,
}: {
  readonly now: number;
  readonly state: WordPracticeReviewState;
}) => state.nextReviewAtMillis === undefined || state.nextReviewAtMillis <= now;

export const reviewStateForWord = ({
  now,
  states,
  wordText,
}: {
  readonly now: number;
  readonly states: readonly WordPracticeReviewWordState[];
  readonly wordText: string;
}) => {
  const state = states.find((reviewState) => reviewState.wordText === wordText);

  return state === undefined ? initialState({ now }) : state;
};

export const nextReviewAtMillisForWordTexts = ({
  now,
  states,
  wordTexts,
}: {
  readonly now: number;
  readonly states: readonly WordPracticeReviewWordState[];
  readonly wordTexts: readonly string[];
}) =>
  states
    .filter((state) => wordTexts.includes(state.wordText))
    .flatMap((state) =>
      state.nextReviewAtMillis === undefined ? [] : [state.nextReviewAtMillis],
    )
    .filter((nextReviewAtMillis) => nextReviewAtMillis > now)
    .sort((left, right) => left - right)[0];

export const applyPracticeResult = ({
  now,
  result,
  state,
  submissions,
}: {
  readonly now: number;
  readonly result: WordPracticeReviewResult;
  readonly state: WordPracticeReviewState;
  readonly submissions: readonly WordPracticeReviewSubmission[];
}): WordPracticeReviewState => {
  const normalizedState = normalizeState({ state });

  if (result === "incorrect") {
    const level = Math.max(MinimumReviewLevel, normalizedState.level - 1);
    const rule = reviewLevelRule({ level });
    const nextReviewAtMillis = _nextReviewAtMillis({
      delayMillis: rule.delayMillis,
      now,
    });

    return {
      level,
      levelStartedAtMillis: now,
      ...(nextReviewAtMillis === undefined ? {} : { nextReviewAtMillis }),
    };
  }

  const rule = reviewLevelRule({ level: normalizedState.level });
  const correctProgress =
    correctProgressAtLevel({
      state: normalizedState,
      submissions,
    }) + 1;

  if (correctProgress < rule.correctSubmissionTarget) {
    return normalizedState;
  }

  const level = Math.min(MaximumReviewLevel, normalizedState.level + 1);
  const nextRule = reviewLevelRule({ level });
  const nextReviewAtMillis = _nextReviewAtMillis({
    delayMillis: nextRule.delayMillis,
    now,
  });

  return {
    level,
    levelStartedAtMillis: now,
    ...(nextReviewAtMillis === undefined ? {} : { nextReviewAtMillis }),
  };
};

export const stateFromSubmissions = ({
  submissions,
}: {
  readonly submissions: readonly WordPracticeReviewSubmission[];
}) => {
  const sortedSubmissions = [...submissions].sort(
    (left, right) => left.submittedAtMillis - right.submittedAtMillis,
  );
  const firstSubmission = sortedSubmissions[0];

  if (firstSubmission === undefined) {
    return initialState({ now: 0 });
  }

  let state = initialState({
    now: firstSubmission.submittedAtMillis,
  });
  const previousSubmissions: WordPracticeReviewSubmission[] = [];

  for (const submission of sortedSubmissions) {
    state = applyPracticeResult({
      now: submission.submittedAtMillis,
      result: submission.result,
      state,
      submissions: previousSubmissions,
    });
    previousSubmissions.push(submission);
  }

  return state;
};
