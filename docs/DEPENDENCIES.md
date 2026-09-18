# Dependency baseline and release checks

This initial foundation keeps the existing Next.js 15 maintenance line, uses OpenNext 1.20.6 for Cloudflare Workers, and aligns Wrangler 4.134.0 with its required workers-types package. Do not bypass peer conflicts using --force or --legacy-peer-deps.

## Explicit security updates

- Drizzle ORM is pinned to 0.45.2, the patched release for GHSA-gpj5-g38j-94v9. The application's SQL identifiers are static and input values are bound; the dependency is still updated rather than relying on that constraint indefinitely.
- PostCSS is pinned to 8.5.28. Next.js 15.5.24 otherwise installs a vulnerable nested PostCSS version. The narrow `overrides.next.postcss` entry updates that nested dependency without forcing a Next.js major-version migration.
- The override is not a risk waiver: type checking, tests, lint, catalogue validation, a full OpenNext build, Worker dry-run and npm audit must run together. Review/remove it when a later Next.js maintenance release carries the patched dependency itself.

Sources checked during bootstrap:
- https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9
- https://github.com/advisories/GHSA-fxqj-rqcc-2cmp
- https://github.com/postcss/postcss/releases

## Lockfile and deployment gate

The input repository had no lockfile, and the authoring environment could not resolve npm's registry. CI resolves dependencies and uploads the actual package-lock.json as the `dependency-lock` artifact. Review and commit the lockfile from the latest passing run (or generate and verify it with npm install locally). Thereafter CI uses npm ci. Do not fabricate a lockfile or commit a lockfile from a different package.json revision.

The manual production workflow refuses to deploy without a committed lockfile. CI has read-only repository permissions; it does not auto-commit files or publish Workers. npm audit fails the check for high/critical findings. An audit with no current findings is not proof that a product is vulnerability-free.

Before deployment, also test the local Worker preview with actual D1 bindings. A successful bundle dry-run is not an HTTP integration test and is not a production deployment. Back up any real database before applying new SQL migrations.
