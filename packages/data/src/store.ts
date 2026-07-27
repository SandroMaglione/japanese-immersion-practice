import { Context, Effect, Schema } from "effect";

import * as Domain from "./domain.ts";

export class StoreError extends Schema.ErrorClass<StoreError>(
  "@jip/data/StoreError"
)({
  _tag: Schema.tag("StoreError"),
  message: Schema.String,
  operation: Schema.String,
}) {}

export const errorFromUnknown = ({
  cause,
  operation,
}: {
  readonly cause: unknown;
  readonly operation: string;
}) =>
  new StoreError({
    message:
      cause instanceof Error ? cause.message : "The data operation failed.",
    operation,
  });

export class WordSelectionPool extends Schema.Class<WordSelectionPool>(
  "WordSelectionPool"
)({
  activeLearningCount: Schema.Number,
  dueLearning: Schema.Array(Domain.WordMemoryState),
  dueReview: Schema.Array(Domain.WordMemoryState),
  dueReviewCount: Schema.Number,
  earlyLearning: Schema.Array(Domain.WordMemoryState),
  extra: Schema.Array(Domain.WordMemoryState),
  newWords: Schema.Array(Domain.WordMemoryState),
}) {}

type StoreEffect<Value> = Effect.Effect<Value, unknown>;

export type StoreService = {
  readonly listWords: () => StoreEffect<readonly Domain.Word[]>;
  readonly getWord: (
    wordId: Domain.WordId
  ) => StoreEffect<Domain.Word | undefined>;
  readonly insertWordWithMemoryState: (input: {
    readonly state: Domain.WordMemoryState;
    readonly word: Domain.Word;
  }) => StoreEffect<void>;
  readonly insertWordsWithMemoryStates: (input: {
    readonly states: readonly Domain.WordMemoryState[];
    readonly words: readonly Domain.Word[];
  }) => StoreEffect<void>;
  readonly updateWord: (word: Domain.Word) => StoreEffect<void>;
  readonly updateWords: (words: readonly Domain.Word[]) => StoreEffect<void>;
  readonly deleteWord: (wordId: Domain.WordId) => StoreEffect<void>;
  readonly deleteWords: (
    wordIds: readonly Domain.WordId[]
  ) => StoreEffect<void>;
  readonly deleteAllWords: () => StoreEffect<void>;
  readonly listMemoryStates: () => StoreEffect<
    readonly Domain.WordMemoryState[]
  >;
  readonly replaceMemoryStates: (
    states: readonly Domain.WordMemoryState[]
  ) => StoreEffect<void>;
  readonly getMemoryState: (
    wordId: Domain.WordId
  ) => StoreEffect<Domain.WordMemoryState | undefined>;
  readonly loadWordSelectionPool: (input: {
    readonly limit: number;
    readonly now: number;
  }) => StoreEffect<WordSelectionPool>;
  readonly savePracticeResult: (input: {
    readonly event: Domain.WordPracticeEvent;
    readonly state: Domain.WordMemoryState;
  }) => StoreEffect<void>;
  readonly listPracticeEvents: () => StoreEffect<
    readonly Domain.WordPracticeEvent[]
  >;
  readonly listPracticeEventsByWord: (
    wordId: Domain.WordId
  ) => StoreEffect<readonly Domain.WordPracticeEvent[]>;
  readonly countPracticeEventsBetween: (input: {
    readonly end: number;
    readonly start: number;
  }) => StoreEffect<number>;
};

export class Store extends Context.Service<Store, StoreService>()(
  "@jip/data/Store"
) {}
