import { IndexedDb } from "@jip/indexeddb";
import { FuriganaText, WordPracticeReview } from "@jip/services";
import { Array as EffectArray, DateTime, Effect, Schema } from "effect";
import { createAsyncLogic, setup } from "xstate";

import type { MachineRuntime } from "./runtime.ts";

const WordPracticeLevelWordSchema = Schema.Struct({
  isDue: Schema.Boolean,
  nextReviewAt: Schema.optionalKey(Schema.DateTimeUtcFromMillis),
  reviewLevel: Schema.Number,
  reviewProgress: Schema.Number,
  reviewProgressTarget: Schema.Number,
  word: IndexedDb.Domain.WordEntry,
});

const WordPracticeLevelSchema = Schema.Struct({
  correctSubmissionTarget: Schema.Number,
  level: Schema.Number,
  words: Schema.Array(WordPracticeLevelWordSchema),
});

const WordPracticeLevelsContextSchema = Schema.Struct({
  levels: Schema.Array(WordPracticeLevelSchema),
  message: Schema.optionalKey(Schema.String),
  selectedLevel: Schema.Number,
});

const WordPracticeLevelsDataSchema = Schema.Struct({
  levels: Schema.Array(WordPracticeLevelSchema),
});

const _toEpochMillis = ({ dateTime }: { readonly dateTime: DateTime.Utc }) =>
  DateTime.toEpochMillis(dateTime);

const _wordPracticeReviewSubmissions = ({
  submissions,
  wordText,
}: {
  readonly submissions: readonly (typeof IndexedDb.Domain.WordPracticeSubmission.Type)[];
  readonly wordText: string;
}) =>
  submissions
    .filter((submission) => submission.wordText === wordText)
    .map((submission) => ({
      result:
        submission.result ??
        (FuriganaText.normalizePlainText({
          text: submission.submittedText,
        }) ===
        FuriganaText.normalizePlainText({
          text: submission.wordText,
        })
          ? "correct"
          : "incorrect"),
      submittedAtMillis: _toEpochMillis({ dateTime: submission.submittedAt }),
    }));

export const makeWordPracticeLevelsMachine = ({
  runtime,
}: {
  readonly runtime: MachineRuntime<IndexedDb.Store.Store>;
}) =>
  setup({
    schemas: {
      context: Schema.toStandardSchemaV1(WordPracticeLevelsContextSchema),
      events: {
        refresh: Schema.toStandardSchemaV1(Schema.Void),
        selectLevel: Schema.toStandardSchemaV1(
          Schema.Struct({
            level: Schema.Number,
          })
        ),
      },
    },
    actorSources: {
      loadWordPracticeLevels: createAsyncLogic({
        schemas: {
          output: Schema.toStandardSchemaV1(WordPracticeLevelsDataSchema),
        },
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const store = yield* IndexedDb.Store.Store;
              const words = yield* store.listWordEntries();
              const submissions = yield* store.listWordPracticeSubmissions();
              const storedStates = yield* store.listWordPracticeStates();
              const now = DateTime.toEpochMillis(yield* DateTime.now);
              const persistedStates = storedStates.map((state) => {
                const nextReviewAtMillis =
                  state.nextReviewAt === undefined
                    ? undefined
                    : _toEpochMillis({ dateTime: state.nextReviewAt });

                return {
                  level: state.level,
                  levelStartedAtMillis: _toEpochMillis({
                    dateTime: state.levelStartedAt,
                  }),
                  ...(nextReviewAtMillis === undefined
                    ? {}
                    : { nextReviewAtMillis }),
                  wordText: state.wordText,
                };
              });
              const derivedStates = words.flatMap((word) => {
                const persistedState = persistedStates.find(
                  (state) => state.wordText === word.text
                );

                if (persistedState !== undefined) {
                  return [];
                }

                const wordSubmissions = _wordPracticeReviewSubmissions({
                  submissions,
                  wordText: word.text,
                });

                if (!EffectArray.isReadonlyArrayNonEmpty(wordSubmissions)) {
                  return [];
                }

                return [
                  {
                    ...WordPracticeReview.stateFromSubmissions({
                      submissions: wordSubmissions,
                    }),
                    wordText: word.text,
                  },
                ];
              });
              const states = [...persistedStates, ...derivedStates];
              const levelWords = words.map((word) => {
                const reviewState = WordPracticeReview.reviewStateForWord({
                  now,
                  states,
                  wordText: word.text,
                });
                const reviewSubmissions = _wordPracticeReviewSubmissions({
                  submissions,
                  wordText: word.text,
                });
                const reviewProgress =
                  WordPracticeReview.correctProgressAtLevel({
                    state: reviewState,
                    submissions: reviewSubmissions,
                  });
                const reviewProgressTarget = WordPracticeReview.reviewLevelRule(
                  {
                    level: reviewState.level,
                  }
                ).correctSubmissionTarget;
                const nextReviewAt =
                  reviewState.nextReviewAtMillis === undefined
                    ? undefined
                    : DateTime.makeUnsafe(reviewState.nextReviewAtMillis);

                return {
                  isDue: WordPracticeReview.isDue({
                    now,
                    state: reviewState,
                  }),
                  ...(nextReviewAt === undefined ? {} : { nextReviewAt }),
                  reviewLevel: reviewState.level,
                  reviewProgress,
                  reviewProgressTarget,
                  word,
                };
              });

              return {
                levels: WordPracticeReview.ReviewLevels.map((reviewLevel) => ({
                  correctSubmissionTarget: reviewLevel.correctSubmissionTarget,
                  level: reviewLevel.level,
                  words: levelWords
                    .filter((word) => word.reviewLevel === reviewLevel.level)
                    .sort((left, right) => {
                      const reviewProgressDifference =
                        right.reviewProgress - left.reviewProgress;

                      if (reviewProgressDifference !== 0) {
                        return reviewProgressDifference;
                      }

                      if (left.isDue !== right.isDue) {
                        return left.isDue ? -1 : 1;
                      }

                      if (
                        left.nextReviewAt !== undefined &&
                        right.nextReviewAt !== undefined
                      ) {
                        const nextReviewDifference =
                          _toEpochMillis({ dateTime: left.nextReviewAt }) -
                          _toEpochMillis({ dateTime: right.nextReviewAt });

                        if (nextReviewDifference !== 0) {
                          return nextReviewDifference;
                        }
                      }

                      if (
                        left.nextReviewAt !== undefined &&
                        right.nextReviewAt === undefined
                      ) {
                        return 1;
                      }

                      if (
                        left.nextReviewAt === undefined &&
                        right.nextReviewAt !== undefined
                      ) {
                        return -1;
                      }

                      const updatedAtDifference =
                        _toEpochMillis({ dateTime: right.word.updatedAt }) -
                        _toEpochMillis({ dateTime: left.word.updatedAt });

                      if (updatedAtDifference !== 0) {
                        return updatedAtDifference;
                      }

                      return left.word.text.localeCompare(right.word.text);
                    }),
                })),
              };
            })
          ),
      }),
    },
  }).createMachine({
    context: {
      levels: WordPracticeReview.ReviewLevels.map((reviewLevel) => ({
        correctSubmissionTarget: reviewLevel.correctSubmissionTarget,
        level: reviewLevel.level,
        words: [],
      })),
      selectedLevel: WordPracticeReview.MinimumReviewLevel,
    },
    initial: "Loading",
    states: {
      Failure: {
        on: {
          refresh: {
            target: "Loading",
          },
          selectLevel: ({ event }) => ({
            context: {
              selectedLevel: event.level,
            },
          }),
        },
      },
      Loading: {
        invoke: {
          src: "loadWordPracticeLevels",
          onDone: ({ event }) => ({
            target: "Ready",
            context: {
              levels: event.output.levels,
              message: undefined,
            },
          }),
          onError: ({ event }) => ({
            target: "Failure",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not load word practice levels.",
            },
          }),
        },
      },
      Ready: {
        on: {
          refresh: {
            target: "Loading",
          },
          selectLevel: ({ event }) => ({
            context: {
              selectedLevel: event.level,
            },
          }),
        },
      },
    },
  });
