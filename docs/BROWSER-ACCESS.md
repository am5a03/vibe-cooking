# Browser access and connected UI

## Session endpoints

- GET `/api/session`: `{data:{authenticated,expiresAt}}`; expiresAt is epoch seconds or null. No secrets in the response. An unauthenticated result does not imply D1 is initialized.
- POST `/api/session`: JSON `{key: API_TOKEN}`; requires same Origin and `X-Kitchen-Request: 1`; returns an HttpOnly cookie after checking the existing credential. 10 attempts per IP-derived key per 15-minute window. No raw IP or submitted key is stored.
- DELETE `/api/session`: same Origin and custom header; revokes the specific D1 session and expires the cookie. Repeat logout is safe.

Existing `/api` data endpoints now accept a valid browser cookie in addition to explicit bearer authorization. A provided bearer header is validated as-is; a bad token does not fall back to a cookie. Cookie-based mutations require same-origin CSRF checks. Browser CORS is intentionally not used for credentialed sessions; a separate frontend should continue to use the documented bearer approach only with an appropriate private credential flow.

The encryption library is iron-session (https://github.com/vvo/iron-session). Its sealing password is domain-separated from API_TOKEN. Cookie payloads contain only a random session ID, expiration and origin. D1 stores the ID's SHA-256 digest and expiration so a copied cookie is revoked after logout. A key rotation invalidates old seals. Expired session records are pruned during successful unlocks; rate-limit records are pruned at unlock attempts.

Auth database tables are managed by reviewed migration 0002. Session code uses small native D1 statements for atomic rate-limit updates; the recipe API continues to use Drizzle. There is one Wrangler migration system.

## Data and UI behavior

No fallback to demo data on a network error. The list uses server pagination and supported filters only. Supported portion profiles are displayed explicitly. Preferences are editable but are not a live recommendation/exclusion feature. Recipe/favourite details distinguish a saved snapshot from the current document. Ingredient ticks are temporary; favourites and notes persist in D1.

The editor sends the complete validated document with the latest ETag. A conflict keeps the local draft; reloading is explicit and asks before discarding dirty changes. Duplicate creates a different ID. Adding ingredient definitions is a separate, visible write and may persist even if the recipe form is later abandoned. New/changed portion counts require the author's review of quantities, capacity, timing and instructions.

Session expiry hides, but does not erase, the previously authorised workspace state in that tab. Unlock restores it. Explicit logout clears the workspace. Browser close/reload prompts about unsaved changes where supported; this is not offline storage or draft recovery.

## Runtime testing

Run `node scripts/browser-check.mjs` after building the Worker and installing Chromium. The runner uses a generated test-only Wrangler config with remote=false, a temporary D1 state directory, and a temporary key. Unit tests separately cover session expiry, tampering, logout revocation, origin checks, credential rotation and throttling. Browser tests perform actual HTTP calls through local workerd and D1, not an intercepted API. Remote Cloudflare deployment is still a separate manual verification step.
