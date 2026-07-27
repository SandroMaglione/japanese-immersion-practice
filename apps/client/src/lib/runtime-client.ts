import { BrowserHttpClient } from "@effect/platform-browser";
import { Store, StoreRpc } from "@jip/data";
import { Effect, Layer, ManagedRuntime } from "effect";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";

const FetchRequestInitLayer = Layer.succeed(BrowserHttpClient.RequestInit)({
  credentials: "include",
});

const BrowserHttpLayer = BrowserHttpClient.layerFetch.pipe(
  Layer.provideMerge(FetchRequestInitLayer)
);

const RpcProtocolLayer = RpcClient.layerProtocolHttp({
  url: "/api/rpc",
}).pipe(Layer.provide([RpcSerialization.layerJson, BrowserHttpLayer]));

const RemoteStoreLayer = Layer.effect(
  Store.Store,
  Effect.gen(function* () {
    const client = yield* RpcClient.make(StoreRpc.StoreRpcs);

    return Store.Store.of({
      listWords: () => client.StoreListWords(),
      getWord: (wordId) => client.StoreGetWord({ wordId }),
      insertWordWithMemoryState: ({ state, word }) =>
        client.StoreInsertWordWithMemoryState({ state, word }),
      insertWordsWithMemoryStates: ({ states, words }) =>
        client.StoreInsertWordsWithMemoryStates({ states, words }),
      updateWord: (word) => client.StoreUpdateWord({ word }),
      updateWords: (words) => client.StoreUpdateWords({ words }),
      deleteWord: (wordId) => client.StoreDeleteWord({ wordId }),
      deleteWords: (wordIds) => client.StoreDeleteWords({ wordIds }),
      deleteAllWords: () => client.StoreDeleteAllWords(),
      listMemoryStates: () => client.StoreListMemoryStates(),
      replaceMemoryStates: (states) =>
        client.StoreReplaceMemoryStates({ states }),
      getMemoryState: (wordId) => client.StoreGetMemoryState({ wordId }),
      loadWordSelectionPool: ({ limit, now }) =>
        client.StoreLoadWordSelectionPool({ limit, now }),
      savePracticeResult: ({ event, state }) =>
        client.StoreSavePracticeResult({ event, state }),
      listPracticeEvents: () => client.StoreListPracticeEvents(),
      listPracticeEventsByWord: (wordId) =>
        client.StoreListPracticeEventsByWord({ wordId }),
      countPracticeEventsBetween: ({ end, start }) =>
        client.StoreCountPracticeEventsBetween({ end, start }),
    });
  })
).pipe(Layer.provide(RpcProtocolLayer));

const ClientLayer = RemoteStoreLayer;

export const RuntimeClient = ManagedRuntime.make(ClientLayer);

export type RuntimeClient = typeof RuntimeClient;
