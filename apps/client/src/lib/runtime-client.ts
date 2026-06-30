import { IndexedDb } from "@jip/indexeddb";
import { Layer, ManagedRuntime } from "effect";

const ClientLayer = IndexedDb.Store.Store.Default.pipe(
  Layer.provideMerge(IndexedDb.Database.browserLayer)
);

export const RuntimeClient = ManagedRuntime.make(ClientLayer);

export type RuntimeClient = typeof RuntimeClient;
