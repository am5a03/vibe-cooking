# Vibe Cooking

Single-user MealSpin backend foundation. See README.md and docs/API.md for the current contract.

- Next.js 15.5 maintenance line + React 19 + TypeScript.
- Cloudflare Workers via OpenNext; no Pages/next-on-pages.
- Cloudflare D1 queried through Drizzle ORM.
- One private bearer secret; no application accounts or OAuth.
- SQL migrations are reviewed and applied only by Wrangler. Recipe history uses triggers.
- Two sample recipe drafts; CLI can add the earlier complete catalogue without overwriting edits.
- Preferences, favourites and cooking notes are stored server-side. The v2 browser UI is not connected yet.
- No required R2, Workers AI, paid model, or multi-tenant infrastructure.
- npm and Node 22. No migrations or deploys run automatically on PRs.

Keep runtime secrets out of NEXT_PUBLIC variables and source control. Keep private API responses no-store. Validate all incoming data and require ETags for edits. Test schema and API changes together. Ingredient, taste and safety claims are not certified by schema validation.
