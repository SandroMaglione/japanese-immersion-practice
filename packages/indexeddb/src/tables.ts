import { IndexedDbTable } from "@effect/platform-browser";

import * as Domain from "./domain.ts";

export class PracticeImportsTable extends IndexedDbTable.make({
  name: "practice_imports",
  schema: Domain.PracticeImport,
  keyPath: "id",
  indexes: {
    byImportedAt: "importedAt",
  },
}) {}

export class PracticeAttemptsTable extends IndexedDbTable.make({
  name: "practice_attempts",
  schema: Domain.PracticeAttempt,
  keyPath: "id",
  indexes: {
    byImport: "importId",
    byResult: "result",
  },
}) {}

export class KanjiEntriesTable extends IndexedDbTable.make({
  name: "kanji_entries",
  schema: Domain.KanjiEntry,
  keyPath: "symbol",
  indexes: {
    byUpdatedAt: "updatedAt",
  },
}) {}

export class WordEntriesTable extends IndexedDbTable.make({
  name: "word_entries",
  schema: Domain.WordEntry,
  keyPath: "text",
  indexes: {
    byUpdatedAt: "updatedAt",
  },
}) {}

export class WordPracticeSubmissionsTable extends IndexedDbTable.make({
  name: "word_practice_submissions",
  schema: Domain.WordPracticeSubmission,
  keyPath: "id",
  indexes: {
    byWordText: "wordText",
    bySubmittedAt: "submittedAt",
    byNextReviewAt: "nextReviewAt",
  },
}) {}
