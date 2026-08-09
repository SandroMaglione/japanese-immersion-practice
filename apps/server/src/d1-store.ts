import { D1Client } from "@effect/sql-d1";
import { Domain, Store } from "@jip/data";
import {
  Array as EffectArray,
  DateTime,
  Effect,
  HashSet,
  Layer,
  Result,
  Schema,
  String as EffectString,
} from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const _WordRow = Schema.Struct({
  archivedAt: Schema.NullOr(Schema.Number),
  createdAt: Schema.Number,
  description: Schema.NullOr(Schema.String),
  examples: Schema.NullOr(Schema.String),
  id: Schema.String,
  text: Schema.String,
  translation: Schema.String,
  updatedAt: Schema.Number,
});

const _MemoryStateRow = Schema.Struct({
  attemptCount: Schema.Number,
  correctCount: Schema.Number,
  createdAt: Schema.Number,
  difficulty: Schema.Number,
  dueAt: Schema.Number,
  elapsedDays: Schema.Number,
  incorrectCount: Schema.Number,
  introducedAt: Schema.NullOr(Schema.Number),
  lapses: Schema.Number,
  lastPracticedAt: Schema.Number,
  lastReviewAt: Schema.NullOr(Schema.Number),
  learningSteps: Schema.Number,
  phase: Domain.WordMemoryPhase,
  repetitions: Schema.Number,
  scheduledDays: Schema.Number,
  schedulerVersion: Schema.String,
  stage: Domain.WordPracticeStage,
  stageAttemptCount: Schema.Number,
  stageMasteryStreak: Schema.Number,
  stageStartedAt: Schema.Number,
  stability: Schema.Number,
  updatedAt: Schema.Number,
  wordId: Schema.String,
});

const _PracticeEventRow = Schema.Struct({
  changedSchedule: Schema.Number,
  difficultyAfter: Schema.Number,
  id: Schema.String,
  kind: Domain.WordPracticeKind,
  legacyBatchNumber: Schema.NullOr(Schema.Number),
  nextDueAt: Schema.Number,
  phaseBefore: Domain.WordMemoryPhase,
  phaseAfter: Domain.WordMemoryPhase,
  promotedTo: Schema.NullOr(Domain.WordPracticeStage),
  previousDueAt: Schema.Number,
  result: Domain.WordPracticeResult,
  rating: Domain.WordPracticeRating,
  reviewedAt: Schema.Number,
  schedulerVersion: Schema.String,
  sessionId: Schema.String,
  sessionPosition: Schema.Number,
  source: Domain.WordPracticeSource,
  stage: Domain.WordPracticeStage,
  stabilityAfter: Schema.Number,
  submittedText: Schema.String,
  wordId: Schema.String,
});

const _ExamplesJson = Schema.fromJsonString(
  Schema.Array(Domain.WordPracticeExample)
);

const _LegacyWordPracticeExample = Schema.Struct({
  note: Schema.optional(Domain.NonEmptyString),
  template: Domain.NonEmptyString,
  translation: Domain.NonEmptyString,
});

const _PreviousWordPracticeExample = Schema.Struct({
  note: Schema.optional(Domain.NonEmptyString),
  template: Domain.NonEmptyString,
  translationTarget: Domain.NonEmptyString,
  translationTemplate: Domain.NonEmptyString,
});

const _StoredExamplesJson = Schema.fromJsonString(Schema.Array(Schema.Unknown));

const _wordInsertSql = `INSERT INTO words (
  id, text, translation, description, examples, archived_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const _wordUpsertSql = `${_wordInsertSql}
ON CONFLICT(id) DO UPDATE SET
  text = excluded.text,
  translation = excluded.translation,
  description = excluded.description,
  examples = excluded.examples,
  archived_at = excluded.archived_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at`;

const _memoryStateInsertSql = `INSERT INTO word_memory_states (
  word_id, stage, stage_started_at, stage_attempt_count, stage_mastery_streak,
  phase, due_at, stability, difficulty, elapsed_days, scheduled_days,
  learning_steps, repetitions, lapses, attempt_count, correct_count,
  incorrect_count, introduced_at, last_review_at, last_practiced_at,
  scheduler_version, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const _memoryStateUpsertSql = `${_memoryStateInsertSql}
ON CONFLICT(word_id) DO UPDATE SET
  stage = excluded.stage,
  stage_started_at = excluded.stage_started_at,
  stage_attempt_count = excluded.stage_attempt_count,
  stage_mastery_streak = excluded.stage_mastery_streak,
  phase = excluded.phase,
  due_at = excluded.due_at,
  stability = excluded.stability,
  difficulty = excluded.difficulty,
  elapsed_days = excluded.elapsed_days,
  scheduled_days = excluded.scheduled_days,
  learning_steps = excluded.learning_steps,
  repetitions = excluded.repetitions,
  lapses = excluded.lapses,
  attempt_count = excluded.attempt_count,
  correct_count = excluded.correct_count,
  incorrect_count = excluded.incorrect_count,
  introduced_at = excluded.introduced_at,
  last_review_at = excluded.last_review_at,
  last_practiced_at = excluded.last_practiced_at,
  scheduler_version = excluded.scheduler_version,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at`;

const _practiceEventInsertSql = `INSERT INTO word_practice_events (
  id, word_id, submitted_text, reviewed_at, result, rating, stage, promoted_to,
  kind, source, previous_due_at, next_due_at, changed_schedule, phase_before,
  phase_after, stability_after,
  difficulty_after, scheduler_version, session_id, session_position,
  legacy_batch_number
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const _toMillis = (dateTime: DateTime.Utc) => DateTime.toEpochMillis(dateTime);

const _wordParameters = Effect.fn("D1Store.wordParameters")(function* (
  word: Domain.Word
) {
  const examples =
    word.examples === undefined
      ? null
      : yield* Schema.encodeEffect(_ExamplesJson)(word.examples);

  return [
    word.id,
    word.text,
    word.translation,
    word.description ?? null,
    examples,
    word.archivedAt === undefined ? null : _toMillis(word.archivedAt),
    _toMillis(word.createdAt),
    _toMillis(word.updatedAt),
  ] as const;
});

const _memoryStateParameters = (state: Domain.WordMemoryState) =>
  [
    state.wordId,
    state.stage,
    _toMillis(state.stageStartedAt),
    state.stageAttemptCount,
    state.stageMasteryStreak,
    state.phase,
    _toMillis(state.dueAt),
    state.stability,
    state.difficulty,
    state.elapsedDays,
    state.scheduledDays,
    state.learningSteps,
    state.repetitions,
    state.lapses,
    state.attemptCount,
    state.correctCount,
    state.incorrectCount,
    state.introducedAt === undefined ? null : _toMillis(state.introducedAt),
    state.lastReviewAt === undefined ? null : _toMillis(state.lastReviewAt),
    _toMillis(state.lastPracticedAt),
    state.schedulerVersion,
    _toMillis(state.createdAt),
    _toMillis(state.updatedAt),
  ] as const;

const _decodeWords = (rows: readonly unknown[]) =>
  Effect.forEach(
    rows,
    Effect.fn("D1Store.decodeWord")(function* (input) {
      const row = yield* Schema.decodeUnknownEffect(_WordRow)(input);
      const storedExampleInputs =
        row.examples === null
          ? undefined
          : yield* Schema.decodeEffect(_StoredExamplesJson)(row.examples);
      const examples =
        storedExampleInputs === undefined
          ? undefined
          : yield* Effect.forEach(
              storedExampleInputs,
              Effect.fn("D1Store.decodeWordExample")(function* (input) {
                const currentExample = Schema.decodeUnknownResult(
                  Domain.WordPracticeExample
                )(input);

                if (Result.isSuccess(currentExample)) {
                  return currentExample.success;
                }

                const previousExample = Schema.decodeUnknownResult(
                  _PreviousWordPracticeExample
                )(input);

                if (Result.isSuccess(previousExample)) {
                  return yield* Schema.decodeEffect(Domain.WordPracticeExample)(
                    {
                      ...previousExample.success,
                      answer: row.text,
                    }
                  );
                }

                const legacyExample = yield* Schema.decodeUnknownEffect(
                  _LegacyWordPracticeExample
                )(input);

                return yield* Schema.decodeEffect(Domain.WordPracticeExample)({
                  answer: row.text,
                  ...(legacyExample.note === undefined
                    ? {}
                    : { note: legacyExample.note }),
                  template: legacyExample.template,
                  translationTarget: legacyExample.translation,
                  translationTemplate: "{{target}}",
                });
              })
            );

      return yield* Schema.decodeEffect(Domain.Word)({
        id: row.id,
        text: row.text,
        translation: row.translation,
        ...(row.description === null ? {} : { description: row.description }),
        ...(examples === undefined ? {} : { examples }),
        ...(row.archivedAt === null ? {} : { archivedAt: row.archivedAt }),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    })
  );

const _decodeMemoryStates = (rows: readonly unknown[]) =>
  Effect.forEach(
    rows,
    Effect.fn("D1Store.decodeMemoryState")(function* (input) {
      const row = yield* Schema.decodeUnknownEffect(_MemoryStateRow)(input);

      return yield* Schema.decodeEffect(Domain.WordMemoryState)({
        wordId: row.wordId,
        stage: row.stage,
        stageStartedAt: row.stageStartedAt,
        stageAttemptCount: row.stageAttemptCount,
        stageMasteryStreak: row.stageMasteryStreak,
        phase: row.phase,
        dueAt: row.dueAt,
        stability: row.stability,
        difficulty: row.difficulty,
        elapsedDays: row.elapsedDays,
        scheduledDays: row.scheduledDays,
        learningSteps: row.learningSteps,
        repetitions: row.repetitions,
        lapses: row.lapses,
        attemptCount: row.attemptCount,
        correctCount: row.correctCount,
        incorrectCount: row.incorrectCount,
        ...(row.introducedAt === null
          ? {}
          : { introducedAt: row.introducedAt }),
        ...(row.lastReviewAt === null
          ? {}
          : { lastReviewAt: row.lastReviewAt }),
        lastPracticedAt: row.lastPracticedAt,
        schedulerVersion: row.schedulerVersion,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    })
  );

const _decodePracticeEvents = (rows: readonly unknown[]) =>
  Effect.forEach(
    rows,
    Effect.fn("D1Store.decodePracticeEvent")(function* (input) {
      const row = yield* Schema.decodeUnknownEffect(_PracticeEventRow)(input);

      return yield* Schema.decodeEffect(Domain.WordPracticeEvent)({
        id: row.id,
        wordId: row.wordId,
        submittedText: row.submittedText,
        reviewedAt: row.reviewedAt,
        result: row.result,
        rating: row.rating,
        stage: row.stage,
        ...(row.promotedTo === null ? {} : { promotedTo: row.promotedTo }),
        kind: row.kind,
        source: row.source,
        previousDueAt: row.previousDueAt,
        nextDueAt: row.nextDueAt,
        changedSchedule: row.changedSchedule === 1,
        phaseBefore: row.phaseBefore,
        phaseAfter: row.phaseAfter,
        stabilityAfter: row.stabilityAfter,
        difficultyAfter: row.difficultyAfter,
        schedulerVersion: row.schedulerVersion,
        sessionId: row.sessionId,
        sessionPosition: row.sessionPosition,
        ...(row.legacyBatchNumber === null
          ? {}
          : { legacyBatchNumber: row.legacyBatchNumber }),
      });
    })
  );

const _runBatch = ({
  db,
  operation,
  statements,
}: {
  readonly db: D1Database;
  readonly operation: string;
  readonly statements: readonly D1PreparedStatement[];
}) =>
  EffectArray.isReadonlyArrayNonEmpty(statements)
    ? Effect.tryPromise({
        try: async () => {
          const results = await db.batch([...statements]);

          if (!results.every((result: D1Result<unknown>) => result.success)) {
            throw new Error("D1 did not apply the complete atomic batch.");
          }
        },
        catch: (cause) => Store.errorFromUnknown({ cause, operation }),
      })
    : Effect.void;

const _withStoreError =
  (operation: string) =>
  <Value, Error, Requirements>(
    effect: Effect.Effect<Value, Error, Requirements>
  ) =>
    Effect.mapError(effect, (cause) =>
      cause instanceof Store.StoreError
        ? cause
        : Store.errorFromUnknown({ cause, operation })
    );

export const makeD1Store = Effect.gen(function* () {
  const client = yield* D1Client.D1Client;
  const sql = yield* SqlClient.SqlClient;
  const db = client.config.db;

  const listWords = Effect.fn("D1Store.listWords")(function* () {
    const rows =
      yield* sql`SELECT * FROM words ORDER BY updated_at DESC, id DESC`;
    return yield* _decodeWords(rows);
  });

  const getWord = Effect.fn("D1Store.getWord")(function* (
    wordId: Domain.WordId
  ) {
    const rows = yield* sql`SELECT * FROM words WHERE id = ${wordId} LIMIT 1`;
    const words = yield* _decodeWords(rows);
    return words[0];
  });

  const listMemoryStates = Effect.fn("D1Store.listMemoryStates")(function* () {
    const rows =
      yield* sql`SELECT * FROM word_memory_states ORDER BY updated_at DESC, word_id DESC`;
    return yield* _decodeMemoryStates(rows);
  });

  const getMemoryState = Effect.fn("D1Store.getMemoryState")(function* (
    wordId: Domain.WordId
  ) {
    const rows =
      yield* sql`SELECT * FROM word_memory_states WHERE word_id = ${wordId} LIMIT 1`;
    const states = yield* _decodeMemoryStates(rows);
    return states[0];
  });

  const listPracticeEvents = Effect.fn("D1Store.listPracticeEvents")(
    function* () {
      const rows =
        yield* sql`SELECT * FROM word_practice_events ORDER BY reviewed_at DESC, id DESC`;
      return yield* _decodePracticeEvents(rows);
    }
  );

  const service: Store.StoreService = {
    listWords: () => listWords().pipe(_withStoreError("listWords")),

    getWord: (wordId) => getWord(wordId).pipe(_withStoreError("getWord")),

    insertWordWithMemoryState: ({ state, word }) =>
      Effect.gen(function* () {
        const wordParameters = yield* _wordParameters(word);
        yield* _runBatch({
          db,
          operation: "insertWordWithMemoryState",
          statements: [
            db.prepare(_wordInsertSql).bind(...wordParameters),
            db
              .prepare(_memoryStateInsertSql)
              .bind(..._memoryStateParameters(state)),
          ],
        });
      }).pipe(_withStoreError("insertWordWithMemoryState")),

    insertWordsWithMemoryStates: ({ states, words }) =>
      Effect.gen(function* () {
        if (!EffectArray.isReadonlyArrayNonEmpty(words)) {
          return;
        }

        const wordParameters = yield* Effect.forEach(words, _wordParameters);
        const statements = [
          ...wordParameters.map((parameters) =>
            db.prepare(_wordInsertSql).bind(...parameters)
          ),
          ...states.map((state) =>
            db
              .prepare(_memoryStateInsertSql)
              .bind(..._memoryStateParameters(state))
          ),
        ];

        yield* _runBatch({
          db,
          operation: "insertWordsWithMemoryStates",
          statements,
        });
      }).pipe(_withStoreError("insertWordsWithMemoryStates")),

    updateWord: (word) =>
      Effect.gen(function* () {
        const examples =
          word.examples === undefined
            ? null
            : yield* Schema.encodeEffect(_ExamplesJson)(word.examples);

        yield* sql`INSERT INTO words (
          id, text, translation, description, examples, archived_at, created_at, updated_at
        ) VALUES (
          ${word.id}, ${word.text}, ${word.translation}, ${word.description ?? null},
          ${examples}, ${
            word.archivedAt === undefined ? null : _toMillis(word.archivedAt)
          }, ${_toMillis(word.createdAt)}, ${_toMillis(word.updatedAt)}
        )
        ON CONFLICT(id) DO UPDATE SET
          text = excluded.text,
          translation = excluded.translation,
          description = excluded.description,
          examples = excluded.examples,
          archived_at = excluded.archived_at,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at`;
      }).pipe(_withStoreError("updateWord")),

    updateWords: (words) =>
      Effect.gen(function* () {
        if (!EffectArray.isReadonlyArrayNonEmpty(words)) {
          return;
        }

        const parameters = yield* Effect.forEach(words, _wordParameters);
        yield* _runBatch({
          db,
          operation: "updateWords",
          statements: parameters.map((values) =>
            db.prepare(_wordUpsertSql).bind(...values)
          ),
        });
      }).pipe(_withStoreError("updateWords")),

    deleteWord: (wordId) =>
      Effect.gen(function* () {
        yield* sql`DELETE FROM words WHERE id = ${wordId}`;
      }).pipe(_withStoreError("deleteWord")),

    deleteWords: (wordIds) =>
      _runBatch({
        db,
        operation: "deleteWords",
        statements: wordIds.map((wordId) =>
          db.prepare("DELETE FROM words WHERE id = ?").bind(wordId)
        ),
      }).pipe(_withStoreError("deleteWords")),

    deleteAllWords: () =>
      Effect.gen(function* () {
        yield* sql`DELETE FROM words`;
      }).pipe(_withStoreError("deleteAllWords")),

    listMemoryStates: () =>
      listMemoryStates().pipe(_withStoreError("listMemoryStates")),

    replaceMemoryStates: (states) =>
      _runBatch({
        db,
        operation: "replaceMemoryStates",
        statements: states.map((state) =>
          db
            .prepare(_memoryStateUpsertSql)
            .bind(..._memoryStateParameters(state))
        ),
      }).pipe(_withStoreError("replaceMemoryStates")),

    getMemoryState: (wordId) =>
      getMemoryState(wordId).pipe(_withStoreError("getMemoryState")),

    loadWordSelectionPool: ({ limit, now }) =>
      Effect.gen(function* () {
        const [stateRows, wordRows] = yield* Effect.all([
          sql`SELECT * FROM word_memory_states ORDER BY word_id`,
          sql`SELECT * FROM words ORDER BY id`,
        ]);
        const states = yield* _decodeMemoryStates(stateRows);
        const words = yield* _decodeWords(wordRows);
        let activeWordIds = HashSet.empty<Domain.WordId>();

        for (const word of words) {
          if (word.archivedAt === undefined) {
            activeWordIds = HashSet.add(activeWordIds, word.id);
          }
        }

        const activeStates = states.filter((state) =>
          HashSet.has(activeWordIds, state.wordId)
        );
        const dueLearning = activeStates
          .filter(
            (state) =>
              (state.phase === "learning" || state.phase === "relearning") &&
              _toMillis(state.dueAt) <= now
          )
          .sort((left, right) => _toMillis(left.dueAt) - _toMillis(right.dueAt))
          .slice(0, limit);
        const dueReviewStates = activeStates
          .filter(
            (state) => state.phase === "review" && _toMillis(state.dueAt) <= now
          )
          .sort(
            (left, right) => _toMillis(left.dueAt) - _toMillis(right.dueAt)
          );
        const newWords = activeStates
          .filter(
            (state) => state.phase === "new" && _toMillis(state.dueAt) <= now
          )
          .slice(0, limit);

        return new Store.WordSelectionPool({
          activeWordCount: activeStates.length,
          activeLearningCount: activeStates.filter(
            (state) =>
              state.phase === "learning" || state.phase === "relearning"
          ).length,
          dueLearning,
          dueReview: dueReviewStates.slice(0, limit),
          dueReviewCount: dueReviewStates.length,
          earlyLearning: [],
          extra: [],
          newWords,
        });
      }).pipe(_withStoreError("loadWordSelectionPool")),

    savePracticeResult: ({ event, state }) =>
      _runBatch({
        db,
        operation: "savePracticeResult",
        statements: [
          db
            .prepare(_memoryStateUpsertSql)
            .bind(..._memoryStateParameters(state)),
          db
            .prepare(_practiceEventInsertSql)
            .bind(
              event.id,
              event.wordId,
              event.submittedText,
              _toMillis(event.reviewedAt),
              event.result,
              event.rating,
              event.stage,
              event.promotedTo ?? null,
              event.kind,
              event.source,
              _toMillis(event.previousDueAt),
              _toMillis(event.nextDueAt),
              event.changedSchedule ? 1 : 0,
              event.phaseBefore,
              event.phaseAfter,
              event.stabilityAfter,
              event.difficultyAfter,
              event.schedulerVersion,
              event.sessionId,
              event.sessionPosition,
              event.legacyBatchNumber ?? null
            ),
        ],
      }).pipe(_withStoreError("savePracticeResult")),

    listPracticeEvents: () =>
      listPracticeEvents().pipe(_withStoreError("listPracticeEvents")),

    listPracticeEventsByWord: (wordId) =>
      Effect.gen(function* () {
        const rows =
          yield* sql`SELECT * FROM word_practice_events WHERE word_id = ${wordId} ORDER BY reviewed_at DESC, id ASC`;
        return yield* _decodePracticeEvents(rows);
      }).pipe(_withStoreError("listPracticeEventsByWord")),

    countPracticeEventsBetween: ({ end, start }) =>
      Effect.gen(function* () {
        const rows =
          yield* sql`SELECT COUNT(*) AS count FROM word_practice_events
            WHERE reviewed_at >= ${start} AND reviewed_at < ${end}`;
        const counts = yield* Schema.decodeUnknownEffect(
          Schema.Array(Schema.Struct({ count: Schema.Number }))
        )(rows);
        return counts[0]?.count ?? 0;
      }).pipe(_withStoreError("countPracticeEventsBetween")),
  };

  return service;
});

export const layer = (db: D1Database) =>
  Layer.effect(Store.Store)(makeD1Store).pipe(
    Layer.provide(
      D1Client.layer({
        db,
        transformResultNames: EffectString.snakeToCamel,
      })
    )
  );
