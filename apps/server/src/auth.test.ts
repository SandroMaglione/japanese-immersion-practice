import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticateRequest,
  makeSession,
  passwordMatches,
  sessionCookie,
  validSession,
} from "./auth.ts";
import { renderLoginPage } from "./login-page.ts";

test("password comparison accepts only the configured password", async () => {
  assert.equal(
    await passwordMatches({ actual: "correct", expected: "correct" }),
    true
  );
  assert.equal(
    await passwordMatches({ actual: "incorrect", expected: "correct" }),
    false
  );
});

test("session tokens reject tampering and expiration", async () => {
  const now = 1_800_000_000_000;
  const secret = "a sufficiently long signing secret";
  const token = await makeSession({ now, secret });

  assert.equal(await validSession({ now, secret, token }), true);
  assert.equal(
    await validSession({ now, secret, token: `${token}tampered` }),
    false
  );
  assert.equal(
    await validSession({
      now: now + 366 * 24 * 60 * 60 * 1000,
      secret,
      token,
    }),
    false
  );
});

test("session cookies are secure in production and usable in local HTTP", () => {
  const production = sessionCookie({
    token: "token",
    url: new URL("https://example.com"),
  });
  const local = sessionCookie({
    token: "token",
    url: new URL("http://127.0.0.1:5173"),
  });

  assert.match(production, /; Secure;/);
  assert.doesNotMatch(local, /; Secure;/);
  assert.match(production, /HttpOnly/);
  assert.match(production, /SameSite=Lax/);
});

test("the login page escapes the redirect path", async () => {
  const response = renderLoginPage({
    invalidPassword: false,
    next: '/"><script>alert(1)</script>',
  });
  const html = await response.text();

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
});

test("authenticated login redirects reject backslash authorities", async () => {
  const now = Date.now();
  const secret = "a sufficiently long signing secret";
  const token = await makeSession({ now, secret });
  const response = await authenticateRequest({
    env: {
      AUTH_PASSWORD: "password",
      AUTH_SIGNING_SECRET: secret,
    },
    request: new Request(
      "https://app.example/login?next=%2F%5Cattacker.example",
      {
        headers: {
          Cookie: `jip_session=${token}`,
        },
      }
    ),
  });

  assert.equal(response?.status, 303);
  assert.equal(response?.headers.get("Location"), "/");
});
