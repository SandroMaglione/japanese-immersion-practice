import type { WorkerEnvironment } from "./environment.ts";
import { renderLoginPage } from "./login-page.ts";

const _cookieName = "jip_session";
const _sessionDurationSeconds = 60 * 60 * 24 * 365;
const _encoder = new TextEncoder();

const _bytesEqual = ({
  left,
  right,
}: {
  readonly left: Uint8Array;
  readonly right: Uint8Array;
}) => {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    difference |=
      (left[index % left.length] ?? 0) ^ (right[index % right.length] ?? 0);
  }

  return difference === 0;
};

const _digest = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", _encoder.encode(value)));

export const passwordMatches = async ({
  actual,
  expected,
}: {
  readonly actual: string;
  readonly expected: string;
}) =>
  _bytesEqual({
    left: await _digest(actual),
    right: await _digest(expected),
  });

const _sign = async ({
  payload,
  secret,
}: {
  readonly payload: string;
  readonly secret: string;
}) => {
  const key = await crypto.subtle.importKey(
    "raw",
    _encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    _encoder.encode(payload)
  );
  let binary = "";

  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

export const makeSession = async ({
  now,
  secret,
}: {
  readonly now: number;
  readonly secret: string;
}) => {
  const expiresAt = Math.floor(now / 1000) + _sessionDurationSeconds;
  const payload = `v1.${expiresAt}`;
  const signature = await _sign({ payload, secret });

  return `${payload}.${signature}`;
};

export const sessionCookieValue = ({
  cookieHeader,
}: {
  readonly cookieHeader: string | null;
}) => {
  if (cookieHeader === null) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();

    if (name === _cookieName) {
      return cookie.slice(separatorIndex + 1).trim();
    }
  }

  return undefined;
};

export const validSession = async ({
  now,
  secret,
  token,
}: {
  readonly now: number;
  readonly secret: string;
  readonly token: string | undefined;
}) => {
  if (token === undefined) {
    return false;
  }

  const segments = token.split(".");

  if (segments.length !== 3) {
    return false;
  }

  const version = segments[0];
  const expiresAtText = segments[1];
  const actualSignature = segments[2];

  if (
    version !== "v1" ||
    expiresAtText === undefined ||
    actualSignature === undefined
  ) {
    return false;
  }

  const expiresAt = Number(expiresAtText);

  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) {
    return false;
  }

  const expectedSignature = await _sign({
    payload: `${version}.${expiresAtText}`,
    secret,
  });

  return _bytesEqual({
    left: _encoder.encode(actualSignature),
    right: _encoder.encode(expectedSignature),
  });
};

const _safeNext = (value: unknown) =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\")
    ? value
    : "/";

const _redirect = ({
  headers,
  location,
}: {
  readonly headers?: HeadersInit;
  readonly location: string;
}) =>
  new Response(null, {
    status: 303,
    headers: { ...headers, Location: location },
  });

const _secureAttribute = (url: URL) =>
  url.protocol === "https:" ? "; Secure" : "";

export const sessionCookie = ({
  token,
  url,
}: {
  readonly token: string;
  readonly url: URL;
}) =>
  `${_cookieName}=${token}; Path=/; HttpOnly${_secureAttribute(url)}; SameSite=Lax; Max-Age=${_sessionDurationSeconds}`;

export const clearCookie = (url: URL) =>
  `${_cookieName}=; Path=/; HttpOnly${_secureAttribute(url)}; SameSite=Lax; Max-Age=0`;

export const authenticateRequest = async ({
  env,
  request,
}: {
  readonly env: Pick<
    WorkerEnvironment,
    "AUTH_PASSWORD" | "AUTH_SIGNING_SECRET"
  >;
  readonly request: Request;
}): Promise<Response | undefined> => {
  if (
    typeof env.AUTH_PASSWORD !== "string" ||
    env.AUTH_PASSWORD.length === 0 ||
    typeof env.AUTH_SIGNING_SECRET !== "string" ||
    env.AUTH_SIGNING_SECRET.length < 32
  ) {
    return new Response("Server authentication is not configured.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const url = new URL(request.url);
  const token = sessionCookieValue({
    cookieHeader: request.headers.get("Cookie"),
  });
  const authenticated = await validSession({
    now: Date.now(),
    secret: env.AUTH_SIGNING_SECRET,
    token,
  });
  if (url.pathname === "/logout") {
    return _redirect({
      headers: { "Set-Cookie": clearCookie(url) },
      location: "/login",
    });
  }

  if (url.pathname === "/login" && request.method === "GET") {
    if (authenticated) {
      return _redirect({ location: _safeNext(url.searchParams.get("next")) });
    }

    return renderLoginPage({
      invalidPassword: url.searchParams.get("invalid") === "1",
      next: _safeNext(url.searchParams.get("next")),
    });
  }

  if (url.pathname === "/login" && request.method === "POST") {
    const form = await request.formData();
    const password = form.get("password");
    const next = _safeNext(form.get("next"));
    const matches =
      typeof password === "string" &&
      (await passwordMatches({
        actual: password,
        expected: env.AUTH_PASSWORD,
      }));

    if (!matches) {
      return _redirect({
        location: `/login?invalid=1&next=${encodeURIComponent(next)}`,
      });
    }

    const session = await makeSession({
      now: Date.now(),
      secret: env.AUTH_SIGNING_SECRET,
    });

    return _redirect({
      headers: { "Set-Cookie": sessionCookie({ token: session, url }) },
      location: next,
    });
  }

  if (authenticated) {
    return undefined;
  }

  if (url.pathname.startsWith("/api/")) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const next = `${url.pathname}${url.search}`;

  return _redirect({
    location: `/login?next=${encodeURIComponent(next)}`,
  });
};
