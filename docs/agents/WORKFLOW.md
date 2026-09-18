# Development and verification

## Establish the current baseline

Inspect the working tree before editing and preserve unrelated changes. Start new
work from current `main` on a focused branch; do not overwrite an existing working
branch, push directly to `main`, or merge a PR without an explicit request.

Use [package.json](../../package.json) and [.nvmrc](../../.nvmrc) for runtime and
commands, and the committed lockfile with `npm ci`. Let the existing TypeScript and
Biome configuration define mechanical conventions. Avoid unrelated formatting,
dependency upgrades or lockfile regeneration; dependency changes need review under
[Dependencies](../DEPENDENCIES.md).

Current code, configuration and tests establish implemented behavior. The
[README](../../README.md), [UI guide](../UI.md) and current API/domain contracts
supply product intent. Treat named feature-branch checkout instructions and
[backend foundation notes](../BACKEND-FOUNDATION.md) as historical context, not the
current startup/deployment workflow. Investigate contradictions rather than
silently changing behavior to match older prose.

For local setup, preserve an existing `.dev.vars`, key and `.wrangler` state. Use
example configuration only for first setup; follow [Local origin](../LOCAL-ORIGIN.md)
for the exact address used in the browser. An empty catalogue is not a reason to
reset the database or re-import data.

## Verification

The [CI workflow](../../.github/workflows/ci.yml) is the authoritative check list.
For code changes, run the relevant checks while iterating and the full flow when
the environment supports it:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run db:migrations:check
node scripts/check-migration-upgrade.mjs
npm run catalogue:import
npm audit --audit-level=high
npm run build:worker
npx wrangler deploy --dry-run
npx playwright install chromium
npm run test:browser
```

The catalogue command above validates only: do not append `--apply` for a check.
CI installs Chromium with `--with-deps` on its Linux runner. Build the Worker before
running browser tests. Use `npm run test:browser`, not a standalone Playwright run
against a personal kitchen: the wrapper provisions an ephemeral key and disposable
local D1 state. The migration-upgrade check also uses isolated local D1.

Node/SQLite tests, local workerd/D1 browser tests and packaging dry runs prove
different things; none verifies production. For UI changes, follow the responsive,
keyboard, focus, session and screenshot review in [UI verification](../UI.md).
Do not claim visual review without viewing the UI or resulting screenshots.

For documentation-only changes, check relative links, command names and the diff
for whitespace and unintended changes. Report runtime checks as not run when that
is the case; the existing PR CI still applies. For any change, report blocked or
failing checks with their actual errors rather than skipping tests or weakening
assertions to obtain a pass.

## PR and deployment boundary

Keep the PR focused and describe behavior changes, checks actually run, failures
or limitations, and any migration/environment steps. Leave it unmerged for review.

The [deployment workflow](../../.github/workflows/deploy.yml) publishes pushes to
`main`, including merges, and has a manual `DEPLOY` confirmation path. Opening a PR
is not a deployment. Database migrations are not automatic: coordinate reviewed
remote migrations before merging a database change, following the
[database workflow](DATABASE.md). Do not run deployment or remote database commands
as part of ordinary validation.
