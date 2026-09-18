# Drizzle Kit integration for Recipe Remix

PR #7 remains the foundation: Drizzle Kit authors SQL and journal/snapshot metadata, and **Wrangler alone applies migrations**. Do not run `drizzle-kit push`, `drizzle-kit migrate`, or an ORM runtime migrator against this database.

## One authoritative schema

The complete `kitchen_remixes` declaration is in `db/schema.ts`, which is the schema entrypoint in `drizzle.config.ts`. `db/exploration-schema.ts` only re-exports it for existing query imports. SQL column names remain snake_case so the feature's stored data and API stay compatible. The declaration includes both history foreign keys, canonical-pair and axis/revision checks, and the pair/target indexes.

## Migration sequence

| File | Role |
| --- | --- |
| `0001_kitchen.sql` | Unchanged original kitchen and history triggers |
| `0002_browser_sessions.sql` | Unchanged sessions and login limits |
| `0003_drizzle_baseline.sql` | Unchanged PR #7 no-op baseline; its original snapshot and journal entry are retained |
| `0004_recipe_remixes.sql` | Generated table/index migration and snapshot |
| `0005_recipe_remix_guards.sql` | Drizzle Kit custom migration for the two atomic review guards |

Both new entries/snapshots were produced by pinned `drizzle-kit@0.31.10`, not by starting a second baseline. The only table-SQL adjustment after generation is `IF NOT EXISTS` on the additive creates, to accept the known earlier PR #5 preview. The custom guards have the same logic as that preview and also use `IF NOT EXISTS`. Existing history, favourite snapshots, notes, sessions and preferences are not rewritten.

SQLite triggers are not represented by Drizzle snapshots. Keep the custom SQL: removing it would remove the final database-level checks against stale approvals and invalid remix relationships. Future generated migrations that rebuild a table must explicitly preserve/recreate its custom triggers and be tested with existing data.

## Upgrade an existing kitchen

Preserve your configuration, secrets and local database directory. After checking out the latest feature branch:

```sh
npm ci
npm run db:migrations:check
npm run db:migrate:local
npm run dev
```

For the deployed database, first make a backup, inspect pending migrations with `npx wrangler d1 migrations list DB --remote`, then deliberately run `npm run db:migrate:remote` from this branch before deploying it. The existing main-branch deployment workflow is unchanged and does not automatically apply migrations. Apply the remote migration before merging when merge-to-main deployment is enabled. No remote command is run by the test suite.

### Already applied the original PR #5 preview?

The original file was `0003_recipe_remixes.sql`, before PR #7 introduced the baseline. It was never merged into main, but a local or remote preview may already have recorded that filename. The new migration path works in that case too: `0004` keeps the existing table and adds the named pair index if needed; `0005` keeps the existing equivalent guards. Keep the historical record in `d1_migrations`; do not rename/delete records, drop tables, or reset your kitchen. The old SQL is retained only in `tests/fixtures/` for regression testing, outside Wrangler's migration directory.

This compatibility covers that exact preview schema, not arbitrary manually modified databases. Unexpected schema differences should be reviewed rather than repaired by deleting data.

## Maintenance checks

`npm run db:migrations:check` runs Drizzle's journal checks and generates into a **temporary copy** of the metadata. It fails if the schema would produce another migration. It never connects to D1 or changes committed files. This catches a table being added to the application schema without committing its snapshot and SQL.

`npm test` applies every current migration for API tests and includes fresh install, populated PR #7 upgrade, original PR #5 preview upgrade, immutable-history preservation and stale-remix review cases. `node scripts/check-migration-upgrade.mjs` also runs Wrangler against a separate disposable local D1, including an old applied filename absent from the current migrations folder. Existing Chromium tests then exercise discovery and remix against the full new chain on local workerd/D1.

These checks do not constitute a production deployment or a test against your actual Cloudflare database.
