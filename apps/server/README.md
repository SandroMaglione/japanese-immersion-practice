# Cloudflare server

The production application is one Cloudflare Worker containing the Effect RPC
API and the built React assets. D1 stores the application data.

Cloudflare serves the immutable Vite files under `/assets/*` directly from its
free static asset layer. Compiled JavaScript and CSS are therefore public, as
they are for any browser application. All document routes, authentication
routes, and API routes run through the Worker, so opening the application and
accessing its data still require the password.

## Local development

Create `apps/server/.dev.vars` with two private values:

```dotenv
AUTH_PASSWORD=choose-a-password
AUTH_SIGNING_SECRET=choose-a-long-random-value
```

Then prepare the local D1 database and start the combined Vite and Workers
development server:

```sh
pnpm db:migrate:local
pnpm dev
```

The local database and authentication session persist between development
runs. Use `/logout` to clear the session cookie.

## Production deployment

The production Worker, D1 database, bindings, secrets, and initial migration
are already provisioned. Apply pending migrations before every deployment:

```sh
pnpm db:migrate:remote
pnpm deploy
```

When provisioning a different Cloudflare account from scratch, authenticate
Wrangler, create a new D1 database, replace `database_id` in `wrangler.jsonc`,
and set the two runtime secrets interactively:

```sh
pnpm exec wrangler login
pnpm db:create
pnpm --filter @jip/server exec wrangler secret put AUTH_PASSWORD
pnpm --filter @jip/server exec wrangler secret put AUTH_SIGNING_SECRET
```

Changing `AUTH_PASSWORD` does not invalidate an existing browser session.
Changing `AUTH_SIGNING_SECRET` immediately invalidates every existing session.

## Automatic deployments

Connect the existing `japanese-immersion-practice` Worker to this repository
with Workers Builds. Use the repository root and `main` as the production
branch, then set:

```text
Build command: pnpm build
Deploy command: pnpm db:migrate:remote && pnpm --filter @jip/client exec wrangler deploy
```

The build creates the Cloudflare Vite plugin's redirected Wrangler
configuration before the deploy command runs. Select a custom build API token
that can edit this account's Workers Scripts and D1 databases so the migration
step is authorized. Runtime secrets stay on the Worker and are not added as
build variables.

Keep non-production branch builds disabled. The committed Wrangler
configuration binds the production D1 database, so previews require a separate
Cloudflare environment and D1 database before they can be enabled safely.
