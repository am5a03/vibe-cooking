# Discover and maintained recipe remixes

This is a single-kitchen feature, not unrestricted recipe generation. It uses the same protected API, session cookies and D1 database as the connected cookbook.

## Upgrade

Keep `.dev.vars`, API_TOKEN, KITCHEN_ORIGIN and the existing D1 configuration/state. Switch to this feature branch, install the locked dependencies, and apply the pending migrations (`0003_drizzle_baseline.sql`, `0004_recipe_remixes.sql`, and `0005_recipe_remix_guards.sql`) with `npm run db:migrate:local`. Use reviewed remote migrations only for an actual remote instance. Do not reset or re-seed a kitchen to enable these screens.

The PR #7 baseline remains a no-op. The next two migrations create a connection table and validation triggers only. They do not update recipes, ingredients, preferences, notes, saved versions or previous migrations.

Older preview databases that already applied `0003_recipe_remixes.sql` can run the new migrations without resetting their reviewed connections. See [Drizzle integration and upgrade checks](DRIZZLE-REMIX-UPGRADE.md).

## Two different entry points

**Discover** offers at most three complete meals. It uses saved likes and exclusions and defaults portions/time from Preferences. You may explicitly change the meal type, portions, time ceiling and required ingredient. A blank time field explicitly removes the time preference for this search; it does not remove exclusions. Filters apply before ranking. If a portion profile does not exist, the meal is ineligible rather than automatically scaled.

**All recipes** is the editing library. It remains searchable even when recipes contain excluded ingredients. My kitchen continues to preserve saved snapshots independently. Viewing a recipe is not a claim that it satisfies current preferences.

Required ingredients must be directly listed with the role main, base, vegetables or fruit. A garnish, sauce ingredient or hidden component does not satisfy the requirement. Amounts and roles are authored data; the app does not infer nutritional significance or certify allergies. Exclusion checks walk the entire recorded composition graph, including sauces. Missing definitions, cycles or malformed records fail closed for affected meals. Compound definitions must still be checked against product labels.

Likes increase a recipe's selection weight, but never override exclusions. Previously shown IDs are held only in the current Discover view, not logged permanently. Unseen candidates are ranked before repeats. A new seed changes the weighted ordering; the same seed, catalogue, preferences, filters and seen IDs produce the same order. A small pool can return familiar recipes, and the UI explains this.

Changing filters clears old suggestions immediately; Find meal ideas applies the new choices. A clicked suggestion carries the selected portions, time and required ingredient into its remix view while the app stays open. Opening All recipes, Preferences or My kitchen clears that temporary discovery context. Saved preferences still apply when exploring from the library. This temporary context is not persisted across a page reload.

## Reviewing connections

Open a recipe, choose Explore variations, then Manage variations. A saved recipe can also be reached through the recipe editor's Related variations section.

Candidates are complete active recipes with the same meal type, exactly one different axis (main/flavour/method or breakfast format), and at least one shared authored portion size. Matching metadata only identifies a candidate. It is not approval.

Review ingredients, units, preparation states, equipment, timing and complete steps for the shared profiles, then explicitly confirm. The resulting connection is bidirectional and pinned to both reviewed revisions. Confirmation does not edit, copy, combine or publish either recipe. It is a personal review, not a kitchen-test certification.

If either recipe changes, its connections disappear from live suggestions and appear as Needs review in management. Reconfirmation references the new recipe revisions and requires the connection's latest ETag. An atomic database trigger rechecks the two recipe revisions and single-axis relationship during the write; a concurrent change yields a conflict instead of approving an unseen version. Removing a connection never deletes a recipe or bookmark.

Remix suggestions apply the same exclusion and exact-portion rules as Discover. Time/required-ingredient constraints are carried from Discover when present. A recipe that does not itself meet these choices stays readable but does not provide recommendations under those choices. The editor's management list intentionally does not apply taste restrictions, and is labelled accordingly.

## API

All endpoints retain existing authentication, same-origin browser mutation protection, body limits and no-store responses.

- `POST /api/discover`: `{mode?, portions?, maxMinutes?, requiredIngredient?, seen?, seed?}`. Defaults are resolved from Preferences; null time explicitly means any duration. Returns items with full snapshots, effective constraints, preference revision, recorded exclusions, eligibility counts, invalid-record count and repeat information. Unknown fields/IDs are errors.
- `POST /api/recipes/:id/remix-options`: same filters plus required `sourceRevision`. The starting revision must match the displayed recipe. Only reviewed current connections and eligible target profiles are returned. Stale and filtered connection counts are explicit.
- `GET /api/recipes/:id/variations`: current source, approved/stale connections and unapproved candidates. This is an editing endpoint, not a filtered recommendation endpoint.
- `POST /api/remixes`: `{sourceId, sourceRevision, targetId, targetRevision, axis}`. IDs are canonicalised to one bidirectional pair. Existing pairs are not overwritten.
- `PUT /api/remixes/:id`: same body plus the connection's `If-Match` header; reconfirms the existing pair only.
- `DELETE /api/remixes/:id`: connection's `If-Match` required; returns `{data:{removed:true}}`.

The first personal-use implementation evaluates at most 500 active recipes per meal type and 2,000 ingredient definitions. More data causes an explicit limit error, never a silent partial pool. Management supports up to 100 links per source recipe. All recipes remains paginated and usable. Large catalogues will need database-side eligibility projections; do not raise these bounds without measuring Worker memory/query costs.

## Optional expansion

`examples/exploration-pack.json` provides **10 additional recipe drafts**: four three-portion broccoli dinners and six one-portion breakfasts. It uses new `EXP-*` recipe IDs and does not include D01/D03, so importing it does not try to replace the two starter recipes. Ingredient definitions are reused only if identical. These are fixed authored drafts, not live AI output, and are not kitchen-tested.

With the app running and API_TOKEN securely exported in the terminal:

```sh
# Offline validation only.
npm run catalogue:import -- examples/exploration-pack.json
# Read-only comparison against your configured KITCHEN_URL (defaults to localhost:3000).
npm run catalogue:import -- examples/exploration-pack.json --preview
# Explicitly add new records. Any conflicting record stops the import before writes.
npm run catalogue:import -- examples/exploration-pack.json --apply
```

The preview labels every entry NEW, UNCHANGED or CONFLICT. It never writes. Apply remains additive and is not an atomic restore: network interruption or a concurrent change can leave earlier additions committed, and it reports that fact. No import approves remix connections automatically. Use Manage variations after reviewing the pack.

## Tests and boundaries

Unit/API tests cover recursive exclusions, incomplete graphs, selected-profile times, required-ingredient roles, deterministic selection, small pools, candidate/approval separation, duplicate and bidirectional links, stale source/target edits, ETags and database race guards. Import tests cover read-only previews and no-write conflict handling. Chromium tests exercise the same built Worker and isolated local D1, not API mocks.

No production deployment, automatic migration, multi-user identity, unrestricted weekly planner or automatic recipe creation is added. Prep Board and shared-preparation quantities remain a separate feature.
