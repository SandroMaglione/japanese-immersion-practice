const _headers = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export const renderLoginPage = ({
  invalidPassword,
  next,
}: {
  readonly invalidPassword: boolean;
  readonly next: string;
}) =>
  new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Japanese Immersion Practice</title>
    <style>
      :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #09090b; color: #fafafa; }
      main { width: min(28rem, calc(100vw - 2rem)); padding: 2rem; border: 1px solid #27272a; border-radius: 1rem; background: #18181b; box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 35%); }
      h1 { margin: 0 0 .5rem; font-size: 1.5rem; }
      p { color: #a1a1aa; line-height: 1.5; }
      label { display: grid; gap: .5rem; margin-top: 1.5rem; font-weight: 700; }
      input { width: 100%; border: 1px solid #3f3f46; border-radius: .65rem; padding: .8rem .9rem; background: #09090b; color: #fafafa; font: inherit; }
      input:focus { outline: 2px solid #a78bfa; outline-offset: 2px; }
      button { width: 100%; margin-top: 1rem; border: 0; border-radius: .65rem; padding: .8rem .9rem; background: #8b5cf6; color: white; font: inherit; font-weight: 800; cursor: pointer; }
      .error { color: #fca5a5; }
    </style>
  </head>
  <body>
    <main>
      <h1>Japanese Immersion Practice</h1>
      <p>Enter the private app password to continue.</p>
      ${invalidPassword ? '<p class="error" role="alert">The password is incorrect.</p>' : ""}
      <form method="post" action="/login">
        <input type="hidden" name="next" value="${next
          .replaceAll("&", "&amp;")
          .replaceAll('"', "&quot;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")}">
        <label>
          Password
          <input name="password" type="password" autocomplete="current-password" required autofocus>
        </label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  </body>
</html>`,
    { headers: _headers }
  );
