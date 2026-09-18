# Database changes

Read this before editing schema, migrations, or persistent catalogue data.

## Author with Drizzle; apply with Wrangler

[db/schema.ts](../../db/schema.ts) is the schema entry point in
[drizzle.config.ts](../../drizzle.config.ts). Inspect both before changing it.
Drizzle Kit generates SQL and journal/snapshot metadata; Wrangler alone applies
D1 migrations. Do not use `drizzle-kit push`, `drizzle-kit migrate`, or an ORM
runtime migrator as an alternative migration path.

For an intentional schema change, generate with:

```sh
npm run db:generate -- --name descriptive_change
```

For SQL that the schema cannot represent, such as triggers, create a custom
migration with `npm run db:generate:custom -- --name descriptive_change`, then
write and review its SQL. Commit the new SQL and generated metadata together;
do not fabricate journal/snapshot entries or start another baseline.

Preserve already-applied migrations and `d1_migrations` records. Use a new forward
migration rather than rewriting history, deleting `.wrangler`, dropping user
tables, or re-importing data to fix a schema mismatch. Table-rebuild migrations
must preserve/recreate custom triggers; snapshots do not describe those guards.

Read [DRIZZLE-REMIX-UPGRADE.md](../DRIZZLE-REMIX-UPGRADE.md) for the existing baseline
and supported old-preview upgrade. For a trigger failure, inspect
[D1-TRIGGER-RECOVERY.md](../D1-TRIGGER-RECOVERY.md) before proposing a repair; do not
turn its recovery procedure into an automatic setup step.

## Validate before applying

Run `npm run db:migrations:check`, `npm test`, and
`node scripts/check-migration-upgrade.mjs`. Add regression coverage for the changed
invariants and populated upgrades, not just a fresh database. Follow the
[testing guide](TESTING.md) for isolated Worker/browser coverage.

`npm run db:migrate:local` changes the normal local kitchen; it is not the isolated
test runner. Remote operations require explicit authorization, a reviewed backup
and migration plan, and a deliberate target check. The deployment workflow does
not apply migrations. Plan compatibility and ordering, and apply reviewed remote
migrations before merging code that depends on them when merge-to-main deployment
is enabled. Do not run remote commands simply to verify a PR.

## Preserve recipe semantics

Check [API.md](../API.md) and [DISCOVERY-REMIX.md](../DISCOVERY-REMIX.md) before
changing writes: exact saved versions, authored serving profiles, stale-write
handling, and explicit remix review are product contracts, not incidental schema
details. Keep history and user edits intact.

Catalogue validation is not import authorization. `npm run catalogue:import` is
a read-only preview; `--apply` writes data. Review the selected pack and conflicting
IDs first, and follow [RECIPE-PACK.md](../RECIPE-PACK.md). Never seed or approve remix
connections automatically to make an empty UI appear populated.
