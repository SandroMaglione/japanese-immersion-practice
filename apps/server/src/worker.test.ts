import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL as NodeUrl } from "node:url";

import { Miniflare } from "miniflare";

import type { WorkerEnvironment } from "./environment.ts";
import worker from "./worker.ts";

const _rpcRequestBody =
  '{"_tag":"Request","headers":[],"id":"1","payload":null,"tag":"StoreListWords"}';

test("the Worker protects assets and serves authenticated RPC routes", async (context) => {
  const miniflare = new Miniflare({
    d1Databases: ["DB"],
    modules: true,
    script: "export default { fetch() { return new Response('test worker') } }",
  });
  context.after(() => miniflare.dispose());

  const db = await miniflare.getD1Database("DB");
  const migration = await readFile(
    new NodeUrl("../migrations/0001-initial.sql", import.meta.url),
    "utf8"
  );

  for (const statement of migration.split(";")) {
    const sql = statement.trim();

    if (sql !== "") {
      await db.prepare(sql).run();
    }
  }

  const assets: Fetcher = {
    connect: () => {
      throw new Error("The test asset binding does not support sockets.");
    },
    fetch: async (input) => {
      const request =
        input instanceof Request ? input : new Request(input.toString());

      return new Response(`asset:${new URL(request.url).pathname}`);
    },
  };
  const env: WorkerEnvironment = {
    ASSETS: assets,
    AUTH_PASSWORD: "test-password",
    AUTH_SIGNING_SECRET: "test-signing-secret-that-is-long-enough",
    DB: db,
  };

  const navigationResponse = await worker.fetch(
    new Request("https://app.example/practice"),
    env
  );
  assert.equal(navigationResponse.status, 303);
  assert.equal(
    navigationResponse.headers.get("Location"),
    "/login?next=%2Fpractice"
  );

  const unauthorizedRpcResponse = await worker.fetch(
    new Request("https://app.example/api/rpc/", {
      body: _rpcRequestBody,
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    env
  );
  assert.equal(unauthorizedRpcResponse.status, 401);

  const loginResponse = await worker.fetch(
    new Request("https://app.example/login", {
      body: new URLSearchParams({
        next: "/practice",
        password: "test-password",
      }),
      method: "POST",
    }),
    env
  );
  const setCookie = loginResponse.headers.get("Set-Cookie");
  assert.equal(loginResponse.status, 303);
  assert.equal(loginResponse.headers.get("Location"), "/practice");
  if (setCookie === null) {
    throw new Error("The login response did not set a session cookie.");
  }
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  const cookie = setCookie.split(";")[0];

  if (cookie === undefined) {
    throw new Error("The login response set an invalid session cookie.");
  }

  const rpcResponse = await worker.fetch(
    new Request("https://app.example/api/rpc/", {
      body: _rpcRequestBody,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      method: "POST",
    }),
    env
  );
  assert.equal(rpcResponse.status, 200);
  assert.deepEqual(await rpcResponse.json(), [
    {
      _tag: "Exit",
      exit: {
        _tag: "Success",
        value: [],
      },
      requestId: "1",
    },
  ]);

  const assetResponse = await worker.fetch(
    new Request("https://app.example/practice", {
      headers: { Cookie: cookie },
    }),
    env
  );
  assert.equal(assetResponse.status, 200);
  assert.equal(await assetResponse.text(), "asset:/practice");

  const missingApiResponse = await worker.fetch(
    new Request("https://app.example/api/missing", {
      headers: { Cookie: cookie },
    }),
    env
  );
  assert.equal(missingApiResponse.status, 404);
});
