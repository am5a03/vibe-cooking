# Backend boundaries

Read the [API contract](../API.md) for payloads, errors and concurrency, and
[Browser access](../BROWSER-ACCESS.md) for credential/session mechanics. Use
[Discovery and Remix](../DISCOVERY-REMIX.md) for current preference behavior;
the older browser-access summary predates live discovery filtering.

## Private, single-user access

Keep the existing Workers/OpenNext and D1 architecture. Accounts, tenants, roles,
public publishing, AI generation and uploads are not implicit requirements of a
recipe feature. Keep server data access out of UI primitives; follow
[UI ownership](../UI.md) when changing both layers.

The public shell must not contain recipe data or server credentials. Browser data
access uses protected, non-cacheable endpoints and revocable sessions; explicit
bearer access remains available to scripts. Preserve cookie, expiry, revocation,
rate-limit and CSRF checks, including validation of a supplied bearer credential
rather than falling back to a cookie after an invalid token.

Keep API_TOKEN out of client bundles, NEXT_PUBLIC variables, browser persistence,
logs and committed files. Fix local-origin mismatches through the configuration in
[Local origin](../LOCAL-ORIGIN.md), not by disabling same-origin validation or
broadening allowed origins. Keep temporary session-expiry draft retention distinct
from explicit Lock, which discards state after confirmation.

## Data integrity

Preserve ETag/If-Match preconditions and explicit conflict recovery. A failed save
must not silently overwrite a newer revision. Recipe history is immutable;
favourites retain the exact saved version and authored serving profile. Archiving
a recipe and removing a bookmark are different operations.

Serving profiles contain authored quantities, capacity, steps and timing. Do not
invent profiles or linearly scale cooking times. Preserve editor row identities
and profile-review requirements described in [UI contracts](../UI.md).

Discovery and remix suggestions apply exclusions before selection; All recipes
keeps its separate library/editing contract. Do not relax exclusions to fill
results, automatically approve variations, or return demo recipes on an API error.
Ingredient validation and recorded exclusions are not allergy or food-safety
certification.

Add regression coverage at the affected API/domain/session boundary and use the
[verification workflow](WORKFLOW.md). Schema or trigger changes also require the
[database workflow](DATABASE.md).
