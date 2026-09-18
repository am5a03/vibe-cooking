# Vibe Cooking — your connected personal kitchen

A single-user recipe studio on Next.js, Cloudflare Workers/OpenNext, D1 and Drizzle. Browse your real catalogue, save exact recipe versions, keep cooking notes, and create/edit recipes in the browser. No accounts, AI service or R2 bucket required.

## Upgrading from the backend PR

Use Node 22.16+ in the Node 22 line. Keep your existing `.dev.vars`, API_TOKEN and database configuration. Do not delete `.wrangler` or rerun an import to make the interface appear.

```sh
git fetch origin
git switch feat/connected-personal-kitchen
npm install
npm run db:migrate:local
npm run dev
```

Migration `0002_browser_sessions.sql` only adds browser-session and login-rate-limit tables. It does not change recipes, preferences or favourites. For a remote database, apply reviewed migrations with the remote command instead; the local command never updates production.

Open http://localhost:3000 and enter the **existing API_TOKEN from your local `.dev.vars`** into Private kitchen key. This entry is for your own application, not for this chat. No second secret is required. Keep the key out of source control, NEXT_PUBLIC variables and browser localStorage.

On first setup only, copy `.dev.vars.example` to `.dev.vars`, generate a random key with `npm run token:create`, and set API_TOKEN before applying migrations. Keep the explicit placeholder database ID for local development; deployment requires your real database ID.

## Everyday use

- **Recipes:** search titles, choose breakfast/dinner or a main ingredient, and include archived recipes when needed. Results come from D1, not a bundled fallback catalogue.
- **Recipe details:** choose a supported portion profile, tick ingredients temporarily, save a version, and record a cooking note.
- **My kitchen:** open the exact bookmarked recipe and portions even if the current recipe has changed. Notes belong to the recipe across versions. Removing a bookmark does not delete the recipe.
- **Editor:** create a new recipe, change an existing one, or make an independent copy. Add catalogue ingredients explicitly. Quantities and instructions remain authored; a new portion profile requires review, not automatic time scaling.
- **Preferences:** stored in D1 and editable; still **not automatically applied** to recipe filtering/ranking. This is not an allergy-safety tool.

A completely empty database displays a real empty state and an Add recipe action. The two draft samples are optional: `npm run catalogue:import` validates and `npm run catalogue:import -- --apply` imports with API_TOKEN exported in the terminal. The importer is additive and refuses conflicting IDs. Do not blindly import the full old seed after the reduced samples; reconcile differing serving profiles explicitly.

## Private access

The existing bearer API remains available to scripts. Browser access uses iron-session sealing plus a revocable session record in D1. Sessions expire after eight hours; Lock deletes the server record and clears the cookie. Cookies are HttpOnly, SameSite=Strict, and Secure with a __Host prefix on HTTPS. Plain HTTP is allowed only on loopback hosts. Cookie writes, unlock and lock require a matching Origin and the interface's custom request header. Unlock attempts are rate-limited in D1.

An expired session hides the workspace while keeping unsaved form state in memory for re-unlocking. Explicit Lock discards it after confirmation. Unsaved edits are not persisted across page closes or server restarts. Requests that fail never silently overwrite a newer revision; resolve stale edits using the reload/copy controls. Changing API_TOKEN invalidates existing cookies.

The HTML/JS shell is public but contains no recipe data or server key. All recipe data is fetched from protected, no-store endpoints. This is personal-use access, not a multi-user identity system. Configure Cloudflare edge rate limits as additional protection before a wider launch.

## Checks

```sh
npm run typecheck
npm test
npm run lint
npm run build:worker
npx playwright install chromium
node scripts/browser-check.mjs
```

The browser runner creates a temporary Wrangler config, ephemeral key and isolated local D1 database, then runs the built Worker and Chromium against it. It never resets your normal local database or accesses remote D1. Do not run the test spec manually against your own kitchen.

CI runs the same checks, the high-severity dependency-audit gate, a Worker packaging dry run, and browser tests. It uploads `dependency-lock` and `kitchen-browser-results` artifacts. Review and commit the generated package-lock.json to pin transitive dependencies; deployment remains guarded and manual. Test and build results are not a food-safety review.

## Boundaries

This is the connected cookbook slice of MealSpin v2, not the full remix/prep-board engine. Automatic recommendations, remix links, shared prep sessions, images and public accounts are deliberately deferred. No production resources or migrations are created automatically by this branch.

See [API contract](docs/API.md), [browser access contract](docs/BROWSER-ACCESS.md), and the [previous backend setup notes](docs/BACKEND-FOUNDATION.md) for migration/export/deployment details. The current README supersedes the old notes about the placeholder homepage.
