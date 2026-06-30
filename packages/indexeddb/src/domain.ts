import { Schema } from "effect";

export const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

export const PracticeImportId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("PracticeImportId")
);

export type PracticeImportId = typeof PracticeImportId.Type;

export const PracticeAttemptId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("PracticeAttemptId")
);

export type PracticeAttemptId = typeof PracticeAttemptId.Type;

export const WordPracticeSubmissionId = Schema.String.check(
  Schema.isUUID(4)
).pipe(Schema.brand("WordPracticeSubmissionId"));

export type WordPracticeSubmissionId = typeof WordPracticeSubmissionId.Type;

export const PracticeResult = Schema.Literals([
  "correct",
  "usable",
  "incorrect",
]);

export type PracticeResult = typeof PracticeResult.Type;

export class PracticeImport extends Schema.Class<PracticeImport>(
  "PracticeImport"
)({
  id: PracticeImportId,
  importedAt: Schema.DateTimeUtcFromMillis,
  sourceFileName: NonEmptyString,
}) {}

export class PracticeAttempt extends Schema.Class<PracticeAttempt>(
  "PracticeAttempt"
)({
  id: PracticeAttemptId,
  importId: PracticeImportId,
  sentence: NonEmptyString,
  response: NonEmptyString,
  result: PracticeResult,
  correction: Schema.optional(NonEmptyString),
  reason: Schema.optional(NonEmptyString),
  patternTag: Schema.optional(NonEmptyString),
}) {}

export class KanjiEntry extends Schema.Class<KanjiEntry>("KanjiEntry")({
  symbol: NonEmptyString,
  readings: Schema.Array(NonEmptyString).check(Schema.isNonEmpty()),
  description: NonEmptyString,
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

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
  nextReviewAt: Schema.DateTimeUtcFromMillis,
}) {}
