# Dependency baseline and release checks

This initial foundation keeps the existing Next.js 15 maintenance line, uses OpenNext 1.20.6 for Cloudflare Workers, and aligns Wrangler 4.134.0 with its required workers-types package. Do not bypass peer conflicts using --force or --legacy-peer-deps.

## Explicit security updates

- Drizzle ORM is pinned to 0.45.2, the patched release for GHSA-gpj5-g38j-94v9. The application's SQL identifiers are static and input values are bound; the dependency is still updated rather than relying on that constraint indefinitely.
- PostCSS is pinned to 8.5.28. Next.js 15.5.24 otherwise installs a vulnerable nested PostCSS version. The narrow `overrides.next.postcss` entry updates that nested dependency without forcing a Next.js major-version migration.
- Next.js is pinned to 15.5.27, the same-maintenance-line patch for the SSG/ISR cache-poisoning advisories GHSA-4jqv-mc3x-m676 and GHSA-mcj8-r9mp-w47p.
- The lockfile resolves source-map-js 1.2.2 for GHSA-68fv-2mgg-jv7q and sharp 0.35.5 (with its patched native image dependencies) for GHSA-wq5f-xc86-pv6w.
- Miniflare 5.20260917.0-alpha pins sharp and undici to vulnerable versions. The version-scoped override selects sharp 0.35.5 and undici 7.29.1 without downgrading Wrangler or changing the Worker runtime. Review/remove this override when upgrading Miniflare to a release that includes these patches. Undici 7.29.1 addresses its WebSocket, retry, cache, and TLS advisories, including GHSA-rfgv-xxqx-mfg5 and GHSA-w293-vg96-wgc3.
- The overrides are not risk waivers: type checking, tests, lint, catalogue validation, a full OpenNext build, Worker dry-run and npm audit must run together. Review/remove the PostCSS override when a later Next.js maintenance release carries the patched dependency itself.

Sources checked during bootstrap:
- https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9
- https://github.com/advisories/GHSA-fxqj-rqcc-2cmp
- https://github.com/postcss/postcss/releases

## Remaining development-tool advisory

Drizzle Kit 0.31.10 still brings esbuild 0.18.20 through @esbuild-kit/esm-loader and @esbuild-kit/core-utils. GHSA-67mh-4wv8-2f99 concerns the esbuild development server and remains a moderate audit finding (including its three affected ancestors). The project does not start that server. Do not force npm's proposed Drizzle Kit downgrade or override an incompatible esbuild release just to suppress it; review a compatible upstream migration separately. The high/critical audit gate remains unchanged.

## Lockfile and deployment gate

The input repository had no lockfile, and the authoring environment could not resolve npm's registry. CI resolves dependencies and uploads the actual package-lock.json as the `dependency-lock` artifact. Review and commit the lockfile from the latest passing run (or generate and verify it with npm install locally). Thereafter CI uses npm ci. Do not fabricate a lockfile or commit a lockfile from a different package.json revision.

The manual production workflow refuses to deploy without a committed lockfile. CI has read-only repository permissions; it does not auto-commit files or publish Workers. npm audit fails the check for high/critical findings. An audit with no current findings is not proof that a product is vulnerability-free.

Before deployment, also test the local Worker preview with actual D1 bindings. A successful bundle dry-run is not an HTTP integration test and is not a production deployment. Back up any real database before applying new SQL migrations.
