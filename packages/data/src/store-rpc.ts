import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import * as Domain from "./domain.ts";
import * as Store from "./store.ts";

export class ListWords extends Rpc.make("StoreListWords", {
  success: Schema.Array(Domain.Word),
  error: Store.StoreError,
}) {}

export class GetWord extends Rpc.make("StoreGetWord", {
  payload: { wordId: Domain.WordId },
  success: Schema.UndefinedOr(Domain.Word),
  error: Store.StoreError,
}) {}

export class InsertWordWithMemoryState extends Rpc.make(
  "StoreInsertWordWithMemoryState",
  {
    payload: {
      state: Domain.WordMemoryState,
      word: Domain.Word,
    },
    error: Store.StoreError,
  }
) {}

export class InsertWordsWithMemoryStates extends Rpc.make(
  "StoreInsertWordsWithMemoryStates",
  {
    payload: {
      states: Schema.Array(Domain.WordMemoryState),
      words: Schema.Array(Domain.Word),
    },
    error: Store.StoreError,
  }
) {}

export class UpdateWord extends Rpc.make("StoreUpdateWord", {
  payload: { word: Domain.Word },
  error: Store.StoreError,
}) {}

export class UpdateWords extends Rpc.make("StoreUpdateWords", {
  payload: { words: Schema.Array(Domain.Word) },
  error: Store.StoreError,
}) {}

export class DeleteWord extends Rpc.make("StoreDeleteWord", {
  payload: { wordId: Domain.WordId },
  error: Store.StoreError,
}) {}

export class DeleteWords extends Rpc.make("StoreDeleteWords", {
  payload: { wordIds: Schema.Array(Domain.WordId) },
  error: Store.StoreError,
}) {}

export class DeleteAllWords extends Rpc.make("StoreDeleteAllWords", {
  error: Store.StoreError,
}) {}

export class ListMemoryStates extends Rpc.make("StoreListMemoryStates", {
  success: Schema.Array(Domain.WordMemoryState),
  error: Store.StoreError,
}) {}

export class ReplaceMemoryStates extends Rpc.make("StoreReplaceMemoryStates", {
  payload: { states: Schema.Array(Domain.WordMemoryState) },
  error: Store.StoreError,
}) {}

export class GetMemoryState extends Rpc.make("StoreGetMemoryState", {
  payload: { wordId: Domain.WordId },
  success: Schema.UndefinedOr(Domain.WordMemoryState),
  error: Store.StoreError,
}) {}

export class LoadWordSelectionPool extends Rpc.make(
  "StoreLoadWordSelectionPool",
  {
    payload: {
      limit: Schema.Number,
      now: Schema.Number,
    },
    success: Store.WordSelectionPool,
    error: Store.StoreError,
  }
) {}

export class SavePracticeResult extends Rpc.make("StoreSavePracticeResult", {
  payload: {
    event: Domain.WordPracticeEvent,
    state: Domain.WordMemoryState,
  },
  error: Store.StoreError,
}) {}

export class ListPracticeEvents extends Rpc.make("StoreListPracticeEvents", {
  success: Schema.Array(Domain.WordPracticeEvent),
  error: Store.StoreError,
}) {}

export class ListPracticeEventsByWord extends Rpc.make(
  "StoreListPracticeEventsByWord",
  {
    payload: { wordId: Domain.WordId },
    success: Schema.Array(Domain.WordPracticeEvent),
    error: Store.StoreError,
  }
) {}

export class CountPracticeEventsBetween extends Rpc.make(
  "StoreCountPracticeEventsBetween",
  {
    payload: {
      end: Schema.Number,
      start: Schema.Number,
    },
    success: Schema.Number,
    error: Store.StoreError,
  }
) {}

export const StoreRpcs = RpcGroup.make(
  ListWords,
  GetWord,
  InsertWordWithMemoryState,
  InsertWordsWithMemoryStates,
  UpdateWord,
  UpdateWords,
  DeleteWord,
  DeleteWords,
  DeleteAllWords,
  ListMemoryStates,
  ReplaceMemoryStates,
  GetMemoryState,
  LoadWordSelectionPool,
  SavePracticeResult,
  ListPracticeEvents,
  ListPracticeEventsByWord,
  CountPracticeEventsBetween
);
