# Public recipe covers

Optional `recipe.image` metadata points to a source-owned file in
`public/images/recipes/`. The files are public, served by the existing Next.js /
OpenNext static assets setup. There is no R2, upload endpoint, proxy, Cloudflare
Images binding, image optimisation service, new secret or database migration.
The recipe API is still private.

## Use a cover

Edit any recipe → **Recipe cover** → **Choose a cover** → Save changes.
Twelve original illustrated serving suggestions are bundled. These are vector
illustrations, not photos of cooked/kitchen-tested meals. You can replace an illustration with a photo without changing the storage or rendering architecture.

To use your own photo, commit a WebP, PNG or JPEG to `public/images/recipes/`, deploy
it, and choose **My public image file**. Enter its root-relative path, description,
dimensions and credit. For example `/images/recipes/my-salmon-v1.webp`. The editor
previews the image and can remove it; removing a cover does not delete the file.
Use only images you own or have permission to publish. Never place private photos
or credentials in public assets. Files are reachable without unlocking the app.

Cards and details use a 4:3 frame with object-fit cover; prefer a centred subject.
No cover or a failed image request uses the existing dish artwork. Changing the
source retries display. Preset selection does not alter cooking instructions.
SVGs are source-owned and reviewed; there is no user SVG-upload service.

## Attach covers to recipes already imported

The command targets only the twelve `PK26-*` recipes from the personal seed pack.
It does not invent covers for the different `D01`/`EXP-*` recipes. For those, use
the editor to choose an appropriate cover yourself.

Start the updated app with `npm run dev`. In another terminal, from the repository:

```sh
# Read the local key from your existing .dev.vars; never print or paste it here.
env -u API_TOKEN KITCHEN_URL=http://localhost:3000 \
  node --env-file=.dev.vars --import tsx scripts/attach-seed-images.ts --preview

# After reviewing the preview:
env -u API_TOKEN KITCHEN_URL=http://localhost:3000 \
  node --env-file=.dev.vars --import tsx scripts/attach-seed-images.ts --apply
```

`npm run covers:attach` is the equivalent preview command when API_TOKEN and
KITCHEN_URL are already set. No flag also means preview. `--apply` is the explicit
write opt-in. This command never creates/deletes recipes, runs SQL, or migrates D1.

The preflight reads each current recipe and checks that its public file exists.
It skips absent/archived recipes, existing covers, and cooking content that differs
from the authored seed. Personal title/description/notes are retained. It uses the
latest recipe plus its actual ETag to change only `image`; a concurrent edit stops
the operation without being overwritten. All preflight checks happen before the
first write. The operation is not one transaction: an interrupted run retains its
earlier additions. Preview again and rerun to add the remaining missing covers.

Each attachment is a normal recipe revision. Old saved snapshots remain exact
(their old cover, or no cover, remains); existing remix links require re-review
under the unchanged revision-pinning rules. This is deliberate, not a DB bypass.

The original personal seed pack is now in `examples/personal-kitchen-seed-v1.json`
with **no image fields**, preserving its existing add-only import comparison.
For a new kitchen, preview/import that file with `scripts/import-catalogue.ts`
first, then attach covers. Do not reimport an image-enriched version over existing
recipes to update them. The current recipe importer still refuses differences.

For production, deploy/merge the code and static files **before** running attachment
against the HTTPS production origin. Use its API_TOKEN, not your Cloudflare token.
Back up valuable content first. No migrations are required for this feature. Old
application versions do not understand image metadata, so do not downgrade the
application and edit image-bearing recipes with the older schema.

## Metadata and content ownership

```json
{
  "image": {
    "src": "/images/recipes/ginger-sesame-tofu-v1.svg",
    "alt": "Ginger–sesame tofu with broccoli, carrots and rice",
    "width": 1200,
    "height": 900,
    "kind": "illustration",
    "credit": "Vibe Cooking"
  }
}
```

`image` is optional in recipe schemaVersion 1. Omit it to remove a cover; null is
not accepted. Description, dimensions and kind are validated. Only plain paths
under `/images/recipes/` with SVG/WebP/PNG/JPEG extensions are allowed: no external
URLs, query parameters, traversal, data URLs, or API paths. Image bytes never enter
D1. Unoptimised Next Image serves the original file, including SVG via an img, not
inline untrusted markup. Exact image references/metadata are saved in recipe
history and favourites. Keep versioned filenames immutable; use `-v2` for new art.

`lib/kitchen/seed-covers.json` is the picker/attachment mapping, not a render-time
fallback by ID. `scripts/draw-seed-covers.mjs` is the original artwork source;
committed SVGs are used directly. Regeneration is a deliberate maintenance action,
never part of an application request, import or deployment.

References checked during implementation:
- https://nextjs.org/docs/app/api-reference/components/image (unoptimized)
- https://opennext.js.org/cloudflare/howtos/assets (public static assets)

Tests cover metadata rejection, legacy import preservation, deterministic static
assets, exact saved versions, attachment preflight/races/interruption, missing-image
fallback, editor saving, session expiry and real local Worker/D1 attachment.
