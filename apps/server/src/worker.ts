import { authenticateRequest } from "./auth.ts";
import type { WorkerEnvironment } from "./environment.ts";
import { handleRpcRequest } from "./rpc-handler.ts";

export default {
  async fetch(request: Request, env: WorkerEnvironment) {
    const authenticationResponse = await authenticateRequest({ env, request });

    if (authenticationResponse !== undefined) {
      return authenticationResponse;
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/rpc/" && request.method === "POST") {
      return handleRpcRequest({ db: env.DB, request });
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
