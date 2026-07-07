import { IndexedDbTable } from "@effect/platform-browser";

import * as Domain from "./domain.ts";

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
  },
}) {}

export class WordPracticeStatesTable extends IndexedDbTable.make({
  name: "word_practice_states",
  schema: Domain.WordPracticeState,
  keyPath: "wordText",
  indexes: {
    byUpdatedAt: "updatedAt",
  },
}) {}

export class WordPracticeBatchesTable extends IndexedDbTable.make({
  name: "word_practice_batches",
  schema: Domain.WordPracticeBatch,
  keyPath: "id",
  indexes: {
    byBatchNumber: "batchNumber",
    byStartedAt: "startedAt",
  },
}) {}
