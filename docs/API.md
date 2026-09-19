# Personal Kitchen API v1

Origin-relative `/api`. JSON responses are `{data: ...}` or `{error:{code,message,requestId,details?}}`, never cacheable. Data requests require a private bearer token or an authenticated browser session; see BROWSER-ACCESS.md for the cookie and origin rules. GET /api/health is public liveness only. The body limit is 128 KiB of actual UTF-8 bytes. Write JSON with Content-Type: application/json. API_TOKEN is the personal credential, not a multi-user account system.

| Endpoint | Method | Request / result |
|---|---|---|
| /api/ingredients | GET | `limit=1..100`, `after=id`; `{items,nextAfter}` |
| /api/ingredients | POST | `{id,ingredient:{name,aliases:[],components:[]}}`; 201 or 409 |
| /api/recipes | GET | `limit=1..50`, `after`, `mode=breakfast|dinner`, `main`, `status=active|archived|all`, `q`; `{items,nextAfter}` |
| /api/recipes | POST | `{id?,recipe:RecipeDocument}`; created snapshot and ETag |
| /api/recipes/:id | GET | Snapshot `{id,revision,createdAt,updatedAt,recipe}` and ETag |
| /api/recipes/:id | PUT | Complete RecipeDocument; **If-Match required** |
| /api/recipes/:id | DELETE | No body; **If-Match required**; archives and returns new snapshot |
| /api/recipes/:id/history | GET | `after=revision` (default 0); up to 20 immutable revisions plus nextAfter |
| /api/preferences | GET / PUT | Preference document; PUT requires **If-Match** |
| /api/recipes/:id/note | GET / PUT | `{text,verdict:untried|repeat|adjust}`; PUT requires **If-Match** |
| /api/favourites | GET | `limit=1..50`, `after=recipeId`; saved snapshots |
| /api/favourites/:id | PUT | `{recipeRevision,portions}`; preserves exact historical version; does not overwrite an existing favourite |
| /api/favourites/:id | DELETE | Removes only the bookmark; 204 |

## ETags and edits

Read the actual ETag header; send it unchanged in If-Match. Do not manufacture a revision from a remembered number. A missing precondition gives 428; a stale one gives 412. Fetch, reconcile, and explicitly retry rather than silently replacing a newer edit. Notes start at revision 0 until first saved. A note-creation race is also checked.

PUT recipes uses the **recipe document alone**, whereas POST wraps it in `{id?,recipe}`. PUT the same recipe with `status:"active"` to unarchive it. History is kept, and a favourite can reference the version actually viewed even after a concurrent edit. Saved recipe JSON contains all authored serving profiles; the bookmark also records the selected portions.

## Recipe document

See `examples/catalogue.json` and `lib/kitchen/types.ts`. SchemaVersion is 1. A document has title, description, meal mode, main/flavour/method IDs, status, draft review status, prep notes, rationale, source/safety/storage text, and at least one complete serving profile. Each profile supplies quantities, preparation states, ordered steps, equipment, capacity and timing. The API does not invent instructions or linearly scale cooking time. Unknown fields and unknown ingredient IDs are errors. This bootstrap accepts only reviewStatus="draft"; validation is not culinary review.

## Preferences

```json
{
 "likedIngredientIds": [],
 "excludedIngredientIds": [],
 "defaultDinnerPortions": 3,
 "defaultBreakfastPortions": 1,
 "maxMinutes": null
}
```

Preferences are applied to Discover and remix suggestions, not automatically applied to the All recipes list endpoint. That list rejects undocumented filters, including exclude/portions/maxMinutes. The discovery and remix-options endpoints resolve recorded ingredient composition and apply hard exclusions before selection; they never relax exclusions to fill a result set.

## Expected failures

400 invalid data/query; 401 missing/wrong credential; 403 disallowed Origin; 404 absent record/version; 405 wrong method; 409 existing ID; 412 stale update; 413 body too large; 415 wrong content type; 422 unresolved ingredients; 428 missing If-Match; 503 missing secret/binding/setup. Generic 500s carry a request ID without leaking database contents or tokens.

No bulk destructive import, public write route, user accounts, image fetcher, remote URL importer, prep planner, or recipe-generation endpoint is included. Use the validating CLI importer for additive catalogue growth.

## Discovery and recipe variations

See [Discovery and Remix](DISCOVERY-REMIX.md#api) for the authenticated discovery, remix-options and connection-management contracts. Preferences now affect these recommendation endpoints; the paginated recipe library deliberately retains its original unfiltered editing contract.

## Flavour combinations

`/api/flavor-profiles` provides authenticated list/create and custom-profile
read/update operations. See [Flavour library](FLAVOUR-LIBRARY.md) for the schema,
ETags, seed migrations and legacy-ID compatibility. Profile descriptions are
reference guidance, never a substitute for recipe ingredient/exclusion checks.

## Optional cover metadata

Recipe documents can include optional `image: {src, alt, width, height, kind,
credit}`. `kind` is `photo` or `illustration`. `src` is a plain same-origin public
path under `/images/recipes/`, not an arbitrary URL; see [covers](RECIPE-COVERS.md).
Omit `image` to remove it. The existing PUT/ETag/history/favourite semantics apply;
there is no media API, upload endpoint or database migration. Old recipe documents
without images and the add-only importer retain their previous behaviour.
