# Vibe Cooking — your connected personal kitchen

A single-user recipe studio on Next.js, Cloudflare Workers/OpenNext, D1 and Drizzle. Browse your real catalogue, save exact recipe versions, keep cooking notes, and create/edit recipes in the browser. No accounts, AI service or R2 bucket required.

## Working with coding agents

Start with [AGENTS.md](AGENTS.md) for project essentials and task-specific guidance.
Detailed workflow, testing, and database instructions live in `docs/agents/` and
link to the existing product contracts. `CLAUDE.md` is a symlink to `AGENTS.md`,
keeping the instructions shared rather than duplicated.

## UI architecture

The interface uses source-owned shadcn/ui New York/Radix components with Tailwind 4
and a single semantic kitchen theme. The five-phase UI migration is complete;
legacy stylesheets and transitional class/color aliases are removed. See the
[UI architecture and contribution guide](docs/UI.md) for component ownership,
style/selector contracts, session-safe confirmations, and regression checks.
This UI migration adds no environment variables or database migrations.

## Discover and Recipe Remix

The kitchen now has separate **Discover** and **All recipes** views. Discover uses saved likes/exclusions and your selected meal, portion count, time ceiling and required ingredient. Recipe pages offer reviewed variations with an ingredient/step comparison. **Manage variations** lets you confirm connections yourself; recipe edits hide affected connections until you review them again.

Upgrade from the connected kitchen without resetting data:

```sh
git fetch origin
git switch feat/discovery-remixes
npm ci
npm run db:migrate:local
npm run dev
```

Preserve `.dev.vars`, API_TOKEN, KITCHEN_ORIGIN and your database configuration. Your PR #7 baseline remains `0003_drizzle_baseline.sql`. Migrations `0004_recipe_remixes.sql` and `0005_recipe_remix_guards.sql` add the remix table and its custom guards, with generated Drizzle metadata. No re-import is required. For an optional ten-recipe expansion, first run the read-only import preview described in [Discovery and Remix](docs/DISCOVERY-REMIX.md). The pack never reuses the starter recipe IDs and does not automatically approve connections.

An earlier checkout of this PR used `0003_recipe_remixes.sql`. The replacement migrations also support a database where that exact preview was already applied, preserving existing connections. Do not delete data or edit `d1_migrations`. See [migration compatibility](docs/DRIZZLE-REMIX-UPGRADE.md).

## Original connected-kitchen setup

Use Node 22.16+ in the Node 22 line. Stop your current dev server. Keep your existing `.dev.vars`, API_TOKEN and database configuration. Do not delete `.wrangler` or rerun a catalogue import to make the interface appear.

```sh
git fetch origin
git switch feat/connected-personal-kitchen
npm install
npm run db:migrate:local
```

Add or update this **non-secret** setting in your existing `.dev.vars`:

```dotenv
KITCHEN_ORIGIN="http://localhost:3000"
```

Then run `npm run dev` and open **http://localhost:3000**. Enter the existing API_TOKEN from `.dev.vars` into the site's **Private kitchen key** field. This entry is for your own application, not this chat. No second secret is required. Keep the key out of source control, NEXT_PUBLIC variables and browser localStorage.

The origin must match the address you actually use: localhost and 127.0.0.1 are different, as are different ports. For Worker preview opened at http://localhost:8787, set KITCHEN_ORIGIN to that address before starting preview. For production, use your actual HTTPS origin in Worker variables. See [public-origin setup](docs/LOCAL-ORIGIN.md). Origin checks are not disabled to accommodate runtime adapters.

Migration `0002_browser_sessions.sql` only adds browser-session and login-rate-limit tables. It does not change recipes, preferences or favourites. For a remote database, apply reviewed migrations with the remote command instead; the local command never updates production.

On first setup only, copy `.dev.vars.example` to `.dev.vars`, generate a random key with `npm run token:create`, and set API_TOKEN before applying migrations. The explicit placeholder database ID is for local development; deployment requires your real database ID.

## Everyday use

- **Recipes:** search titles, choose breakfast/dinner or a main ingredient, and include archived recipes when needed. Results come from D1, not a bundled fallback catalogue.
- **Recipe details:** choose a supported portion profile, tick ingredients temporarily, save a version, and record a cooking note.
- **My kitchen:** open the exact bookmarked recipe and portions even if the current recipe has changed. Notes belong to the recipe across versions. Removing a bookmark does not delete the recipe.
- **Editor:** create a new recipe, change an existing one, or make an independent copy. Add catalogue ingredients explicitly. Quantities and instructions remain authored; a new portion profile requires review, not automatic time scaling.
- **Preferences:** stored in D1 and editable; used by Discover and live remix suggestions, but not by All recipes. Recorded components are checked; this is not an allergy-safety tool.

An empty database displays a real empty state and an Add recipe action. The two draft samples are optional: `npm run catalogue:import` validates, and `npm run catalogue:import -- --apply` imports with API_TOKEN exported in the terminal. The importer is additive and refuses conflicting IDs. Do not blindly import the full old seed after the reduced samples; reconcile differing serving profiles explicitly.

## Private access

The existing bearer API remains available to scripts. Browser access uses iron-session sealing plus a revocable session record in D1. Sessions expire after eight hours; Lock deletes the server record and clears the cookie. Cookies are HttpOnly, SameSite=Strict, and Secure with a __Host prefix on HTTPS. Plain HTTP is allowed only on loopback hosts. Cookie writes, unlock and lock require a matching Origin and the interface's custom request header. Unlock attempts are rate-limited in D1.

An expired session hides the workspace while keeping unsaved form state in memory for re-unlocking. Explicit Lock discards it after confirmation. Unsaved edits are not persisted across page closes or server restarts. Failed requests never silently overwrite a newer revision; resolve stale edits using the reload/copy controls. Changing API_TOKEN invalidates existing cookies.

The HTML/JS shell is public but contains no recipe data or server key. All recipe data is fetched from protected, no-store endpoints. This is personal-use access, not a multi-user identity system. Configure Cloudflare edge rate limits as additional protection before a wider launch.

## Checks

```sh
npm run typecheck
npm test
npm run lint
npm run build:worker
npx playwright install chromium
npm run test:browser
```

The browser runner creates a temporary Wrangler config, ephemeral key and isolated local D1 database, then runs the built Worker and Chromium against it. It never resets your normal local database or accesses remote D1. Do not run the test specs manually against your own kitchen.

The browser suites cover saving a recipe version, editing notes and recipes, reload persistence, independent copies, preference edits, narrow-screen layout, logout, ingredient/recipe creation, stale-edit recovery and retaining an unsaved draft through a revoked session. Unit tests cover API/session validation and editor data integrity. Passing tests are not a food-safety review.

CI runs these checks, validates the Drizzle journal and schema/snapshot parity, checks the old-preview upgrade on isolated local D1, runs a high-severity dependency-audit gate, and a Worker packaging dry run. It uploads `dependency-lock` and `kitchen-browser-results` artifacts. The reviewed package-lock.json pins dependencies; use npm ci. Review dependency updates as code changes. Deployment remains guarded; the existing main-branch workflow deploys on merge. Apply reviewed remote migrations before merging a database change.

## Boundaries

Discovery and reviewed recipe remixes are connected to D1. Shared prep sessions, unrestricted recipe generation, images and public accounts remain deferred. No production resources or migrations are created automatically by this branch.

See the [API contract](docs/API.md), [browser access contract](docs/BROWSER-ACCESS.md), [public-origin setup](docs/LOCAL-ORIGIN.md), and [previous backend setup notes](docs/BACKEND-FOUNDATION.md) for migration/export/deployment details. This README supersedes the old notes about the placeholder homepage.
