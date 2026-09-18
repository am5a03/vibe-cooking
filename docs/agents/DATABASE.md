# Database changes and data safety

## One migration system

[drizzle.config.ts](../../drizzle.config.ts) identifies `db/schema.ts` as the schema
source and `drizzle/migrations` as the output. Drizzle Kit authors SQL and
journal/snapshot metadata; Wrangler is the only D1 migration runner. Do not add a
competing runner or use `drizzle-kit push` / `drizzle-kit migrate` here.

For a schema change, edit the schema and generate a named migration:

```sh
npm run db:generate -- --name=describe_change
```

For custom triggers or backfills that Drizzle cannot model, generate a custom
migration instead:

```sh
npm run db:generate:custom -- --name=describe_change
```

Review and commit the SQL with its generated metadata. Preserve recipe-history
and remix-review triggers when generated SQL rebuilds tables: snapshots alone do
not represent these guards. Keep SQL line endings consistent with `.gitattributes`.
Do not hand-edit snapshots to conceal drift.

New changes normally add migrations, not rename or rewrite already-applied files.
The no-op `0003` baseline and earlier migration history must stay intact. Consult
[remix upgrade compatibility](../DRIZZLE-REMIX-UPGRADE.md) when touching this area.
The narrowly documented pending-migration correction in
[D1 trigger recovery](../D1-TRIGGER-RECOVERY.md) is not permission to rewrite other
migration history.

## Verify without touching the user's kitchen

```sh
npm run db:migrations:check
npm test
node scripts/check-migration-upgrade.mjs
```

Also run the built-Worker/browser checks in [Verification](WORKFLOW.md). Cover both
fresh databases and populated upgrades where relevant, including preserved
history, favourites, sessions and custom guards. Local SQLite/workerd success does
not prove compatibility with the remote D1 query parser.

`npm run db:migrate:local` changes the user's configured local database; it is not
the disposable test runner. Do not delete `.wrangler`, reset tables, or re-import a
catalogue to make a test or migration pass. Never manually edit `d1_migrations` or
mark a failed migration as applied. Use the recovery guide for the matching failure
and inspect unexpected states before proposing a repair.

## Remote operations and catalogue writes

Remote D1 access, backups, imports and migrations require explicit authorization
and confirmation of the intended Cloudflare account/database. Before an authorized
remote migration, make a timestamped backup, inspect pending migrations and review
the SQL. Apply through the guarded `npm run db:migrate:remote` command, then verify
migration state and relevant guards. Do not bypass the guard or migration ledger.

Deployment does not apply migrations. Coordinate the database step before merging
code that depends on it; see the [deployment boundary](WORKFLOW.md).

Catalogue import is separate from migration. `npm run catalogue:import` is a
read-only validation; `--apply` writes data. Preserve stable IDs and the additive,
conflict-refusing importer. Review [Recipe pack](../RECIPE-PACK.md) before adding
content. Keep exports, real credentials and local state out of Git.
