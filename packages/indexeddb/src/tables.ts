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

export class WordsTable extends IndexedDbTable.make({
  name: "words",
  schema: Domain.Word,
  keyPath: "id",
  indexes: {
    byUpdatedAt: "updatedAt",
  },
}) {}

export class WordMemoryStatesTable extends IndexedDbTable.make({
  name: "word_memory_states",
  schema: Domain.WordMemoryState,
  keyPath: "wordId",
  indexes: {
    byDueAt: "dueAt",
    byLastPracticedAt: "lastPracticedAt",
    byPhase: "phase",
    byPhaseAndDueAt: ["phase", "dueAt"],
    byPhaseAndLastPracticedAt: ["phase", "lastPracticedAt"],
    byUpdatedAt: "updatedAt",
  },
}) {}

export class WordPracticeEventsTable extends IndexedDbTable.make({
  name: "word_practice_events",
  schema: Domain.WordPracticeEvent,
  keyPath: "id",
  indexes: {
    byReviewedAt: "reviewedAt",
    bySessionId: "sessionId",
    byWordId: "wordId",
  },
}) {}
