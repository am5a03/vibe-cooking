# Testing

Read this before selecting checks or diagnosing CI. Commands run from the
repository root. [package.json](../../package.json) defines commands; the
[CI workflow](../../.github/workflows/ci.yml) is authoritative for the full gate.

## Match checks to the change

For documentation-only changes, inspect the diff, run `git diff --check`, and
verify links and command names against current files. No database setup or
catalogue import is needed. CI still runs its normal checks on the PR.

For application code, start with:

```sh
npm ci
npm run typecheck
npm test
npm run lint
```

The Node tests use `tsx` and Node's experimental SQLite support; use the supported
Node 22 version. Follow the adjacent test patterns rather than adding another
runner. `npm run format` rewrites files; it is not a read-only verification step.

For schema, migration, API/data-integrity, or catalogue changes, also run the
relevant data checks:

```sh
npm run db:migrations:check
node scripts/check-migration-upgrade.mjs
npm run catalogue:import
```

The last command validates the default catalogue without writing; do not append
`--apply` as part of testing. See [DATABASE.md](DATABASE.md) for migration safety.

For UI, sessions, browser workflows, Worker integration, or build changes:

```sh
npm run build:worker
npx wrangler deploy --dry-run
npx playwright install chromium
npm run test:browser
```

Build the Worker before the browser check. Linux/CI may need
`npx playwright install --with-deps chromium` instead. A Next.js-only build does
not replace the Worker build and packaging dry run.

## Isolation is part of the test contract

Use [scripts/browser-check.mjs](../../scripts/browser-check.mjs), exposed as
`npm run test:browser`. It creates an ephemeral key, temporary Wrangler config,
and disposable local D1 state, then cleans up. Do not invoke the browser specs
against a real kitchen or replace this isolation with the user's `.wrangler`
directory. The migration-upgrade runner likewise uses isolated local D1.

UI changes should follow [UI.md](../UI.md), including keyboard/focus, responsive
layout, hidden drafts, session expiry, confirmation, and authored-portion checks
relevant to the change. Review screenshots; do not equate Chromium checks with
cross-browser or accessibility certification. Preserve private test credentials
and do not include them in artifacts.

## Report evidence, not assumptions

The full CI gate additionally runs `npm audit --audit-level=high` and retains
dependency-lock and browser-results artifacts. Keep these gates intact; consult
[DEPENDENCIES.md](../DEPENDENCIES.md) rather than applying an automatic audit fix.

Report exact commands and outcomes. Distinguish a source review, local test pass,
Worker dry run, and GitHub CI result. When dependencies, a browser, networking, or
runtime support are unavailable, state what was skipped and why; do not substitute
a remote database or a deployment to obtain a passing result.
