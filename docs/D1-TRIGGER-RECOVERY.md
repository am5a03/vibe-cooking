# Recover a remote failure in 0005_recipe_remix_guards.sql

## Symptom and likely cause

Remote `wrangler d1 migrations apply` reports `incomplete input: SQLITE_ERROR [7500]` at the D1 `/query` endpoint while applying `0005_recipe_remix_guards.sql`. Earlier migrations, including the remix table in `0004`, may already have succeeded.

The original guards used `SELECT CASE WHEN ... THEN RAISE(...) END;` inside `CREATE TRIGGER ... BEGIN ... END;`. This is valid SQLite, but matches the D1 nested-terminator parsing issue reported in cloudflare/workers-sdk#4727. The query parser can mistake the inner expression terminator for the end of the trigger and submit an incomplete statement to SQLite. Reports #14991 and #15314 also identify CRLF/lowercase trigger delimiters as remote-only hazards. We cannot infer a user's checkout line endings or prove the private server's current implementation from a local test.

The correction uses `SELECT RAISE(ABORT, 'REMIX_REVIEW_CONFLICT') WHERE ...;`, retaining the same predicates and error. Uppercase trigger delimiters remain; `.gitattributes` pins deployable SQL to LF.

This is a targeted compatibility correction to the existing `0005` file, not a new schema version. Adding only `0006` would not unblock a pending `0005`: Wrangler would encounter the failed file first. The trigger names, logic, Drizzle journal and snapshots are unchanged. Existing databases that already applied the old equivalent guards need no trigger rebuild or ledger edit. `IF NOT EXISTS` preserves an existing trigger, including the known original preview guards.

## Retry without resetting data

Preserve your secrets, Wrangler configuration and local D1 state. Use the fix branch until it has been merged:

```sh
git fetch origin
git switch fix/d1-remix-trigger-migration
git pull --ff-only
npm ci
npm run db:migrations:check
npm test
```

Make a timestamped backup of the intended remote database before changing it:

```sh
mkdir -p backups
npx wrangler d1 export DB --remote --output "backups/kitchen-before-guards-$(date +%Y%m%d-%H%M%S).sql"
```

Check which files are pending and the existing guard definitions:

```sh
npx wrangler d1 migrations list DB --remote
npx wrangler d1 execute DB --remote --command "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name IN ('kitchen_remix_insert','kitchen_remix_update') ORDER BY name;"
```

Confirm that the intended database and pending files are correct, then deliberately retry:

```sh
npm run db:migrate:remote
```

Wrangler should apply the corrected pending `0005` and record success itself. Cloudflare documents that a failed migration is rolled back while previous successful migrations stay applied. Still inspect your actual state rather than assuming this response inspected your production database.

Verify after retrying:

```sh
npx wrangler d1 migrations list DB --remote
npx wrangler d1 execute DB --remote --command "SELECT name FROM d1_migrations WHERE name='0005_recipe_remix_guards.sql'; SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('kitchen_remix_insert','kitchen_remix_update') ORDER BY name;"
```

Expected: no pending `0005`, its migration-history row, and both trigger names. Run `PRAGMA foreign_key_check` separately if checking overall database integrity is desired. The application code does not change in this fix; successful migration installs the missing guards without a new frontend build.

Do **not** delete `.wrangler`, drop tables, rename applied migrations, manually mark `0005` as applied, or bypass the migration runner with a production `execute --file` import. An existing migration marker with missing/unexpected guards is a different state: inspect it and prepare a separate repair rather than editing the ledger or ignoring the guards.

## What tests do and do not prove

`tests/remote-trigger-compat.test.mjs` rejects the problematic expression shape, checks LF, compares the old and corrected SQLite behaviour across 26 insert/update cases, checks idempotent installation on old and new guards, and tests the corrected file with a migration marker in one local transaction. The existing suite exercises actual local Wrangler/workerd/D1, populated upgrades and browser flows.

These are not tests of Cloudflare's remote `/query` parser. No production database is queried or changed by this fix or these tests. The user's remote retry is needed to confirm resolution for their deployment. A local pass alone must not be described as remote verification.

## Sources

- D1 nested expression terminator report: https://github.com/cloudflare/workers-sdk/issues/4727
- Remote trigger line-ending report: https://github.com/cloudflare/workers-sdk/issues/14991
- Remote trigger delimiter report: https://github.com/cloudflare/workers-sdk/issues/15314
- Migration failure/rollback behaviour: https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply
- SQLite trigger and RAISE syntax: https://www.sqlite.org/lang_createtrigger.html
