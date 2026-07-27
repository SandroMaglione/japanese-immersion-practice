import { StoreRpc } from "@jip/data";
import { Layer } from "effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

import * as D1Store from "./d1-store.ts";
import * as RpcHandlers from "./rpc-handlers.ts";

const _handlers = new WeakMap<
  D1Database,
  (request: Request) => Promise<Response>
>();

export const handleRpcRequest = ({
  db,
  request,
}: {
  readonly db: D1Database;
  readonly request: Request;
}) => {
  const existing = _handlers.get(db);

  if (existing !== undefined) {
    return existing(request);
  }

  const handlersLayer = RpcHandlers.layer.pipe(
    Layer.provide(D1Store.layer(db))
  );
  const rpcLayer = RpcServer.layerHttp({
    group: StoreRpc.StoreRpcs,
    path: "/api/rpc/",
    protocol: "http",
  }).pipe(
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(handlersLayer)
  );
  const handler = HttpRouter.toWebHandler(rpcLayer, {
    disableLogger: true,
  }).handler;
  _handlers.set(db, handler);

  return handler(request);
};
