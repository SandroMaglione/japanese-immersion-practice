import { Schema } from "effect";

export const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

export const WordPracticeSubmissionId = Schema.String.check(
  Schema.isUUID(4)
).pipe(Schema.brand("WordPracticeSubmissionId"));

export type WordPracticeSubmissionId = typeof WordPracticeSubmissionId.Type;

export const WordPracticeBatchId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("WordPracticeBatchId")
);

export type WordPracticeBatchId = typeof WordPracticeBatchId.Type;

export const WordId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("WordId")
);

export type WordId = typeof WordId.Type;

export const WordPracticeEventId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("WordPracticeEventId")
);

export type WordPracticeEventId = typeof WordPracticeEventId.Type;

export const WordPracticeSessionId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("WordPracticeSessionId")
);

export type WordPracticeSessionId = typeof WordPracticeSessionId.Type;

export const WordPracticeResult = Schema.Literals(["correct", "incorrect"]);

export type WordPracticeResult = typeof WordPracticeResult.Type;

export class WordEntry extends Schema.Class<WordEntry>("WordEntry")({
  text: NonEmptyString,
  translation: NonEmptyString,
  description: Schema.optional(NonEmptyString),
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class WordPracticeSubmission extends Schema.Class<WordPracticeSubmission>(
  "WordPracticeSubmission"
)({
  id: WordPracticeSubmissionId,
  wordText: NonEmptyString,
  submittedText: Schema.String,
  submittedAt: Schema.DateTimeUtcFromMillis,
  result: Schema.optional(WordPracticeResult),
  batchId: Schema.optional(WordPracticeBatchId),
  batchPosition: Schema.optional(Schema.Number),
  nextReviewAt: Schema.optional(Schema.DateTimeUtcFromMillis),
}) {}

export class WordPracticeState extends Schema.Class<WordPracticeState>(
  "WordPracticeState"
)({
  wordText: NonEmptyString,
  level: Schema.Number,
  levelStartedAt: Schema.DateTimeUtcFromMillis,
  nextReviewAt: Schema.optional(Schema.DateTimeUtcFromMillis),
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class WordPracticeBatch extends Schema.Class<WordPracticeBatch>(
  "WordPracticeBatch"
)({
  id: WordPracticeBatchId,
  batchNumber: Schema.Number,
  startedAt: Schema.DateTimeUtcFromMillis,
  completedAt: Schema.optional(Schema.DateTimeUtcFromMillis),
  wordOrder: Schema.Array(NonEmptyString),
}) {}

export const WordMemoryPhase = Schema.Literals([
  "new",
  "learning",
  "review",
  "relearning",
]);

export type WordMemoryPhase = typeof WordMemoryPhase.Type;

export const WordPracticeKind = Schema.Literals(["scheduled", "extra"]);

export type WordPracticeKind = typeof WordPracticeKind.Type;

export const WordPracticeSource = Schema.Literals([
  "new",
  "learning",
  "review",
  "relearning",
  "extra",
]);

export type WordPracticeSource = typeof WordPracticeSource.Type;

export class WordPracticeExample extends Schema.Class<WordPracticeExample>(
  "WordPracticeExample"
)({
  template: NonEmptyString,
  translationTarget: NonEmptyString,
  translationTemplate: NonEmptyString,
  note: Schema.optional(NonEmptyString),
}) {}

export class Word extends Schema.Class<Word>("Word")({
  id: WordId,
  text: NonEmptyString,
  translation: NonEmptyString,
  description: Schema.optional(NonEmptyString),
  examples: Schema.optional(Schema.Array(WordPracticeExample)),
  archivedAt: Schema.optional(Schema.DateTimeUtcFromMillis),
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class WordMemoryState extends Schema.Class<WordMemoryState>(
  "WordMemoryState"
)({
  wordId: WordId,
  phase: WordMemoryPhase,
  dueAt: Schema.DateTimeUtcFromMillis,
  stability: Schema.Number,
  difficulty: Schema.Number,
  elapsedDays: Schema.Number,
  scheduledDays: Schema.Number,
  learningSteps: Schema.Number,
  repetitions: Schema.Number,
  lapses: Schema.Number,
  attemptCount: Schema.Number,
  correctCount: Schema.Number,
  incorrectCount: Schema.Number,
  introducedAt: Schema.optional(Schema.DateTimeUtcFromMillis),
  lastReviewAt: Schema.optional(Schema.DateTimeUtcFromMillis),
  lastPracticedAt: Schema.DateTimeUtcFromMillis,
  schedulerVersion: NonEmptyString,
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class WordPracticeEvent extends Schema.Class<WordPracticeEvent>(
  "WordPracticeEvent"
)({
  id: WordPracticeEventId,
  wordId: WordId,
  submittedText: Schema.String,
  reviewedAt: Schema.DateTimeUtcFromMillis,
  result: WordPracticeResult,
  kind: WordPracticeKind,
  source: WordPracticeSource,
  previousDueAt: Schema.DateTimeUtcFromMillis,
  nextDueAt: Schema.DateTimeUtcFromMillis,
  changedSchedule: Schema.Boolean,
  phaseAfter: WordMemoryPhase,
  stabilityAfter: Schema.Number,
  difficultyAfter: Schema.Number,
  schedulerVersion: NonEmptyString,
  sessionId: WordPracticeSessionId,
  sessionPosition: Schema.Number,
  legacyBatchNumber: Schema.optional(Schema.Number),
}) {}
