# Vibe Cooking

Connected single-user cookbook for MealSpin on Next.js, OpenNext/Cloudflare Workers, D1 and Drizzle.

Browse, create, duplicate, edit and archive real recipes; save exact versions; persist personal cooking notes and preferences. One private kitchen, no accounts or OAuth. Browser unlock uses iron-session with a revocable D1 record. All data endpoints still enforce access; never put API_TOKEN in a public bundle.

Migrations 0001 (kitchen) and 0002 (sessions) are additive, reviewed SQL applied by Wrangler. Do not edit applied migrations or reset the user's database. The UI has no silently populated catalogue or demo fallback. Existing sample/full seed conflicts require explicit reconciliation.

Automatic preference ranking, live exclusion filtering, remix links and shared prep sessions are not yet part of this connected slice. Recipes remain drafts. See README.md, docs/API.md and docs/BROWSER-ACCESS.md.
