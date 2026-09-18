# Vibe Cooking — personal kitchen backend

Single-user foundation for MealSpin. Next.js App Router runs on **Cloudflare Workers through OpenNext**, with **D1 + Drizzle ORM**. No accounts, Google OAuth, tenants, AI service, or R2 bucket is required.

The homepage is a setup landing page, not the MealSpin v2 interface. This change builds the backend; it does not silently replace the prototype's browser storage with server storage.

## Local setup

Use Node 22.16 or newer in the Node 22 line. The repository now consistently uses npm.

```sh
npm install
# First setup only; preserve an existing .dev.vars.
cp .dev.vars.example .dev.vars
npm run token:create
# Put the generated value in API_TOKEN in .dev.vars.
npm run db:migrate:local
npm run dev
```

Open http://localhost:3000. `/api/health` is public liveness; all data endpoints require `Authorization: Bearer <API_TOKEN>`. Same-origin browser requests work by default; a separate frontend needs one exact `ALLOWED_ORIGIN` in `.dev.vars`/Worker variables. No wildcard or file:// origins. Never use `NEXT_PUBLIC_API_TOKEN` or commit a real token.

`next dev` uses OpenNext's local Cloudflare bindings. A second standalone Wrangler server is not needed. `npm run preview` builds and runs the Worker locally for runtime checks. Nothing here deploys automatically.

## Start with two examples, or import the earlier catalogue

The included `examples/catalogue.json` contains two three-portion recipe drafts and their ingredients. These are not kitchen-tested.

```sh
# Validate only: does not contact a server or write data.
npm run catalogue:import

# In a terminal with the same API_TOKEN as .dev.vars (input is not echoed):
read -r -s API_TOKEN
export API_TOKEN
# Local dev server must already be running. Only this explicit flag writes data.
npm run catalogue:import -- --apply

# Alternatively, point to backend/seed from the earlier foundation ZIP:
npm run catalogue:import -- /absolute/path/to/backend/seed
npm run catalogue:import -- /absolute/path/to/backend/seed --apply
```

The importer validates the entire ingredient graph and every recipe before writing; preflights existing records; preserves stable IDs; and refuses to overwrite differing content. An interrupted import can be rerun. It is additive, not an atomic replace/restore operation. `KITCHEN_URL` defaults to localhost:3000; nonlocal targets require HTTPS. It imports **ingredients and recipes only**, not the earlier remixes or prep sessions.

## Implemented API

See [docs/API.md](docs/API.md) for bodies and concurrency rules.

- Ingredients: list and create immutable catalogue entries with compound-ingredient references.
- Recipes: create, retrieve, paginate, search, update, archive/unarchive and inspect immutable revisions.
- Personal preferences: store likes, exclusions, default portions and time preference.
- Favourites: preserve an exact viewed recipe version and supported serving profile.
- Cooking notes: one revision-protected note/verdict per recipe.

Preferences are **stored but not applied automatically** to recipe discovery in this slice. The list endpoint accepts only documented filters and rejects unsupported filters; it is not a dietary/allergen safety or recommendation service. Ingredient entries are immutable for now to avoid invalidating dependent recipes. Use a new ID for a changed ingredient definition.

## Maintenance

`db/schema.ts` describes the query model. **Wrangler is the only migration runner.** Migrations are reviewed SQL in `drizzle/migrations`; recipe history uses SQLite triggers, so schema generation alone is insufficient.

```sh
npm run db:migration:new -- describe_change
# Edit the new SQL and update db/schema.ts together; never rewrite an applied migration.
npm run db:migrate:local
npm test
```

There is deliberately no `drizzle-kit push` or second migration journal. This initial migration creates only `kitchen_*` tables; it does not drop/alter legacy `user`, `session`, `account`, `verification` or `todo` tables, nor the earlier standalone backend's tables. The unused auth helpers are removed from the source, not destructively migrated from a database.

Recipe JSON is authoritative; SQL expression indexes project its mode/status. Edits require the latest ETag via `If-Match`. A compare-and-swap update and database triggers record revisions atomically. History is immutable. DELETE archives recipes. Favourites do not silently advance to a newer version. There is no general data-restore or account-deletion API yet.

## Tests and build

```sh
npm run typecheck
npm test
npm run lint
npm run catalogue:import
npm run deploy:check
```

Tests cover auth, body limits, origins, validation, real SQLite migrations, Drizzle's D1 adapter, recipe history, stale edits, notes, preferences and snapshot saves. The SQLite adapter is **not** workerd or remote D1. Passing source tests does not prove a live deployment or recipe quality.

The initial repo had no lockfile. CI can resolve dependencies once and upload `dependency-lock`; review and commit package-lock.json, then CI uses npm ci. The manual deployment workflow requires that lockfile. Direct dependency pins were chosen against current OpenNext/Next documentation; review transitive audit findings before exposing an instance publicly.

## Cloudflare deployment — manual

```sh
npx wrangler login
npx wrangler d1 create vibe-cooking-db
# Set the returned database_id in wrangler.jsonc (not a secret).
npm run db:migrate:remote
npx wrangler secret put API_TOKEN
npm run deploy
```

The all-zero database ID is a **local bootstrap placeholder**. The deploy/migrate guard refuses it for remote commands. This repository change does not create or modify your Cloudflare resources. Do not enable public recipe access: without a valid secret, data endpoints fail closed. The homepage/health remain public. Protect any future browser admin with a proper private access flow rather than embedding the bearer token in its bundle.

Deployment through GitHub Actions is manual, default-branch-only, requires `DEPLOY`, a `production` environment, a committed lockfile, and your Cloudflare CLI credentials in GitHub environment secrets. The runtime API_TOKEN is separately configured on the Worker. Migrations are never auto-applied on PRs or deployment.

Back up before database changes:

```sh
mkdir -p backups
npm run db:export:remote
```

The export is a database SQL backup, not the prototype's JSON backup format. Choose timestamped paths for successive backups and test restore into a separate D1 database. Secrets and backups are ignored by Git.

## Deliberately later

MealSpin v2 screen integration; an in-browser editor; full 24-recipe catalogue loading by default; automatic preference filtering/ranking; version-pinned remix links; shared prep sessions; image uploads; accounts and public submissions. Keeping these separate makes this first foundation easier to inspect.

## Technical references

- OpenNext setup: https://opennext.js.org/cloudflare/get-started
- OpenNext Cloudflare bindings: https://opennext.js.org/cloudflare/bindings
- D1/Drizzle: https://orm.drizzle.team/docs/connect-cloudflare-d1
- Wrangler migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Next.js security release baseline: https://nextjs.org/blog (August 2026 release: 15.5.24 / 16.3.3)

Original repository base: `009d01dc9f3ce16236e10aafbddcfbfc1b98fb5b`. No production deployment is implied by this bootstrap.
