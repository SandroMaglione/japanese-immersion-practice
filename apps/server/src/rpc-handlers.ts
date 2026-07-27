import { Store, StoreRpc } from "@jip/data";
import { Effect } from "effect";

const _storeError =
  (operation: string) =>
  <Value>(effect: Effect.Effect<Value, unknown>) =>
    Effect.mapError(effect, (cause) =>
      cause instanceof Store.StoreError
        ? cause
        : Store.errorFromUnknown({ cause, operation })
    );

export const layer = StoreRpc.StoreRpcs.toLayer(
  Effect.gen(function* () {
    const store = yield* Store.Store;

    return {
      StoreListWords: () =>
        store.listWords().pipe(_storeError("StoreListWords")),
      StoreGetWord: ({ wordId }) =>
        store.getWord(wordId).pipe(_storeError("StoreGetWord")),
      StoreInsertWordWithMemoryState: ({ state, word }) =>
        store
          .insertWordWithMemoryState({ state, word })
          .pipe(_storeError("StoreInsertWordWithMemoryState")),
      StoreInsertWordsWithMemoryStates: ({ states, words }) =>
        store
          .insertWordsWithMemoryStates({ states, words })
          .pipe(_storeError("StoreInsertWordsWithMemoryStates")),
      StoreUpdateWord: ({ word }) =>
        store.updateWord(word).pipe(_storeError("StoreUpdateWord")),
      StoreUpdateWords: ({ words }) =>
        store.updateWords(words).pipe(_storeError("StoreUpdateWords")),
      StoreDeleteWord: ({ wordId }) =>
        store.deleteWord(wordId).pipe(_storeError("StoreDeleteWord")),
      StoreDeleteWords: ({ wordIds }) =>
        store.deleteWords(wordIds).pipe(_storeError("StoreDeleteWords")),
      StoreDeleteAllWords: () =>
        store.deleteAllWords().pipe(_storeError("StoreDeleteAllWords")),
      StoreListMemoryStates: () =>
        store.listMemoryStates().pipe(_storeError("StoreListMemoryStates")),
      StoreReplaceMemoryStates: ({ states }) =>
        store
          .replaceMemoryStates(states)
          .pipe(_storeError("StoreReplaceMemoryStates")),
      StoreGetMemoryState: ({ wordId }) =>
        store.getMemoryState(wordId).pipe(_storeError("StoreGetMemoryState")),
      StoreLoadWordSelectionPool: ({ limit, now }) =>
        store
          .loadWordSelectionPool({ limit, now })
          .pipe(_storeError("StoreLoadWordSelectionPool")),
      StoreSavePracticeResult: ({ event, state }) =>
        store
          .savePracticeResult({ event, state })
          .pipe(_storeError("StoreSavePracticeResult")),
      StoreListPracticeEvents: () =>
        store.listPracticeEvents().pipe(_storeError("StoreListPracticeEvents")),
      StoreListPracticeEventsByWord: ({ wordId }) =>
        store
          .listPracticeEventsByWord(wordId)
          .pipe(_storeError("StoreListPracticeEventsByWord")),
      StoreCountPracticeEventsBetween: ({ end, start }) =>
        store
          .countPracticeEventsBetween({ end, start })
          .pipe(_storeError("StoreCountPracticeEventsBetween")),
    };
  })
);
