export type WordPracticeSelectionSubmission = {
  readonly result: "correct" | "incorrect";
  readonly submittedAtMillis: number;
  readonly wordText: string;
};

type WordPracticeSelectionBatch = {
  readonly batchNumber: number;
  readonly startedAtMillis: number;
  readonly wordOrder: readonly string[];
};

type WordPracticeSelectionWord = {
  readonly text: string;
};

const RecentSubmissionResultLimit = 8;
const RecentSubmissionResultDecay = 0.7;
const MillisecondsPerMinute = 60 * 1000;
const MillisecondsPerHour = 60 * MillisecondsPerMinute;
const PracticeBatchSize = 10;
const BaseSelectionWeight = 10;
const NewWordSelectionWeight = 45;
const UnderPracticedSubmissionTarget = 3;
const UnderPracticedSubmissionWeight = 8;
const DifficultyMissRateWeight = 70;
const DifficultyIncorrectStreakLimit = 3;
const DifficultyIncorrectStreakWeight = 14;
const DifficultyLastIncorrectWeight = 18;
const DifficultyCorrectStreakLimit = 4;
const DifficultyCorrectStreakPenalty = 8;
const MinimumSelectionWeight = 1;
const MaximumElapsedTimeWeight = 28;
const ElapsedTimeWeightStartsAfterMillis = 10 * MillisecondsPerMinute;
const ElapsedTimeWeightMaxesAfterMillis = 6 * MillisecondsPerHour;
const CooldownMaxesBeforeMillis = 60 * MillisecondsPerMinute;
const TimeCooldownPenalty = 80;
const RecentSubmissionCooldownLimit = 20;
const RecentSubmissionCooldownPenalty = 50;
const RecentBatchCooldownLimit = 3;
const RecentBatchCooldownPenalty = 40;

const _clamp = ({
  max,
  min,
  value,
}: {
  readonly max: number;
  readonly min: number;
  readonly value: number;
}) => Math.min(max, Math.max(min, value));

const _sortSubmissionsBySubmittedAt = ({
  submissions,
}: {
  readonly submissions: readonly WordPracticeSelectionSubmission[];
}) =>
  [...submissions].sort(
    (left, right) => left.submittedAtMillis - right.submittedAtMillis
  );

export const correctStreak = ({
  submissions,
}: {
  readonly submissions: readonly WordPracticeSelectionSubmission[];
}) => {
  const sortedSubmissions = _sortSubmissionsBySubmittedAt({ submissions });
  let streak = 0;

  for (let index = sortedSubmissions.length - 1; index >= 0; index -= 1) {
    const submission = sortedSubmissions[index];

    if (submission === undefined) {
      return streak;
    }

    if (submission.result !== "correct") {
      return streak;
    }

    streak += 1;
  }

  return streak;
};

export const incorrectStreak = ({
  submissions,
}: {
  readonly submissions: readonly WordPracticeSelectionSubmission[];
}) => {
  const sortedSubmissions = _sortSubmissionsBySubmittedAt({ submissions });
  let streak = 0;

  for (let index = sortedSubmissions.length - 1; index >= 0; index -= 1) {
    const submission = sortedSubmissions[index];

    if (submission === undefined) {
      return streak;
    }

    if (submission.result !== "incorrect") {
      return streak;
    }

    streak += 1;
  }

  return streak;
};

const _difficultyScore = ({
  submissions,
}: {
  readonly submissions: readonly WordPracticeSelectionSubmission[];
}) => {
  if (submissions[0] === undefined) {
    return 0;
  }

  const sortedSubmissions = _sortSubmissionsBySubmittedAt({ submissions });
  const latestSubmission = sortedSubmissions[sortedSubmissions.length - 1];
  const latestSubmissionWasIncorrect = latestSubmission?.result === "incorrect";
  const recentSubmissions = sortedSubmissions
    .slice(-RecentSubmissionResultLimit)
    .reverse();
  let missedWeight = 0;
  let totalWeight = 0;
  let weight = 1;

  for (const submission of recentSubmissions) {
    totalWeight += weight;

    if (submission.result === "incorrect") {
      missedWeight += weight;
    }

    weight *= RecentSubmissionResultDecay;
  }

  const weightedRecentMissRate =
    totalWeight === 0 ? 0 : missedWeight / totalWeight;

  return (
    weightedRecentMissRate * DifficultyMissRateWeight +
    Math.min(incorrectStreak({ submissions }), DifficultyIncorrectStreakLimit) *
      DifficultyIncorrectStreakWeight +
    (latestSubmissionWasIncorrect ? DifficultyLastIncorrectWeight : 0) -
    Math.min(correctStreak({ submissions }), DifficultyCorrectStreakLimit) *
      DifficultyCorrectStreakPenalty
  );
};

export const priorityScore = ({
  submissions,
}: {
  readonly submissions: readonly WordPracticeSelectionSubmission[];
}) =>
  BaseSelectionWeight +
  (submissions[0] === undefined
    ? NewWordSelectionWeight
    : _difficultyScore({ submissions }));

const _randomFraction = () => {
  const values = new Uint32Array(1);

  crypto.getRandomValues(values);

  return (values[0] ?? 0) / 0x100000000;
};

export const buildWordOrder = ({
  batches,
  now,
  submissions,
  words,
}: {
  readonly batches: readonly WordPracticeSelectionBatch[];
  readonly now: number;
  readonly submissions: readonly WordPracticeSelectionSubmission[];
  readonly words: readonly WordPracticeSelectionWord[];
}) => {
  const candidates = buildSelectionCandidates({
    batches,
    now,
    submissions,
    words,
  });
  const remainingCandidates = [...candidates];
  const selectedWordTexts: string[] = [];

  while (
    selectedWordTexts.length < PracticeBatchSize &&
    remainingCandidates[0] !== undefined
  ) {
    const totalWeight = remainingCandidates.reduce(
      (total, candidate) => total + candidate.selectionWeight,
      0
    );
    let remainingWeight = _randomFraction() * totalWeight;
    let selectedIndex = remainingCandidates.length - 1;

    for (let index = 0; index < remainingCandidates.length; index += 1) {
      const candidate = remainingCandidates[index];

      if (candidate === undefined) {
        continue;
      }

      remainingWeight -= candidate.selectionWeight;

      if (remainingWeight <= 0) {
        selectedIndex = index;
        break;
      }
    }

    const selectedCandidate = remainingCandidates[selectedIndex];

    if (selectedCandidate === undefined) {
      break;
    }

    remainingCandidates.splice(selectedIndex, 1);
    selectedWordTexts.push(selectedCandidate.word.text);
  }

  const shuffledWordOrder = [...selectedWordTexts];

  for (let index = shuffledWordOrder.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(_randomFraction() * (index + 1));
    const currentWordText = shuffledWordOrder[index];
    const swapWordText = shuffledWordOrder[swapIndex];

    if (currentWordText === undefined || swapWordText === undefined) {
      continue;
    }

    shuffledWordOrder[index] = swapWordText;
    shuffledWordOrder[swapIndex] = currentWordText;
  }

  return shuffledWordOrder;
};

export const buildSelectionCandidates = ({
  batches,
  now,
  submissions,
  words,
}: {
  readonly batches: readonly WordPracticeSelectionBatch[];
  readonly now: number;
  readonly submissions: readonly WordPracticeSelectionSubmission[];
  readonly words: readonly WordPracticeSelectionWord[];
}) => {
  const sortedSubmissions = _sortSubmissionsBySubmittedAt({ submissions });
  const latestBatchNumber = batches.reduce(
    (highestBatchNumber, batch) =>
      Math.max(highestBatchNumber, batch.batchNumber),
    0
  );
  const recentSubmissions = sortedSubmissions
    .slice(-RecentSubmissionCooldownLimit)
    .reverse();
  const candidates = words.map((word) => {
    const wordSubmissions = submissions.filter(
      (submission) => submission.wordText === word.text
    );
    const sortedWordSubmissions = _sortSubmissionsBySubmittedAt({
      submissions: wordSubmissions,
    });
    const latestSubmission =
      sortedWordSubmissions[sortedWordSubmissions.length - 1];
    const lastSubmittedAtMillis = latestSubmission?.submittedAtMillis;
    const lastBatch = batches
      .filter((batch) => batch.wordOrder.includes(word.text))
      .sort((left, right) => right.batchNumber - left.batchNumber)[0];
    const lastBatchStartedAtMillis = lastBatch?.startedAtMillis;
    const lastSeenAtMillis =
      lastBatchStartedAtMillis === undefined &&
      lastSubmittedAtMillis === undefined
        ? undefined
        : Math.max(lastBatchStartedAtMillis ?? 0, lastSubmittedAtMillis ?? 0);
    const elapsedMillis =
      lastSeenAtMillis === undefined
        ? undefined
        : Math.max(0, now - lastSeenAtMillis);
    const elapsedWeightRange =
      ElapsedTimeWeightMaxesAfterMillis - ElapsedTimeWeightStartsAfterMillis;
    const elapsedTimeWeight =
      elapsedMillis === undefined
        ? 0
        : _clamp({
            max: MaximumElapsedTimeWeight,
            min: 0,
            value:
              ((elapsedMillis - ElapsedTimeWeightStartsAfterMillis) /
                elapsedWeightRange) *
              MaximumElapsedTimeWeight,
          });
    const cooldownFactor =
      elapsedMillis === undefined
        ? 0
        : _clamp({
            max: 1,
            min: 0,
            value: 1 - elapsedMillis / CooldownMaxesBeforeMillis,
          });
    const recentSubmissionIndex = recentSubmissions.findIndex(
      (submission) => submission.wordText === word.text
    );
    const recentSubmissionCooldownPenalty =
      recentSubmissionIndex < 0
        ? 0
        : ((RecentSubmissionCooldownLimit - recentSubmissionIndex) /
            RecentSubmissionCooldownLimit) *
          RecentSubmissionCooldownPenalty;
    const batchesSinceLastSeen =
      lastBatch === undefined
        ? undefined
        : latestBatchNumber - lastBatch.batchNumber;
    const recentBatchCooldownPenalty =
      batchesSinceLastSeen === undefined ||
      batchesSinceLastSeen < 0 ||
      batchesSinceLastSeen >= RecentBatchCooldownLimit
        ? 0
        : ((RecentBatchCooldownLimit - batchesSinceLastSeen) /
            RecentBatchCooldownLimit) *
          RecentBatchCooldownPenalty;
    const submissionCount = wordSubmissions.length;
    const underPracticedWeight =
      Math.max(0, UnderPracticedSubmissionTarget - submissionCount) *
      UnderPracticedSubmissionWeight;
    const cooldownPenalty =
      (TimeCooldownPenalty +
        recentSubmissionCooldownPenalty +
        recentBatchCooldownPenalty) *
      cooldownFactor;
    const rawSelectionWeight =
      BaseSelectionWeight +
      (submissionCount === 0 ? NewWordSelectionWeight : 0) +
      underPracticedWeight +
      _difficultyScore({ submissions: wordSubmissions }) +
      elapsedTimeWeight -
      cooldownPenalty;

    return {
      selectionWeight: Math.max(MinimumSelectionWeight, rawSelectionWeight),
      word,
    };
  });

  return candidates;
};
