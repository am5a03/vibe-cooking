# Kitchen UI architecture

The five-phase shadcn/ui migration is complete. The kitchen uses source-owned
New York/Radix components and Tailwind 4 utilities with its warm paper/green theme.
There is one theme and one stylesheet entry point, with no legacy kitchen stylesheets,
transitional color aliases, or primitive-exclusion selectors.

This is a UI migration, not a router, authentication or form-state rewrite. API
contracts, D1/Drizzle migrations, exact saved recipe versions, authored serving
profiles, editor row identities and revision-conflict handling retain their owners.

## Ownership

| Location | Responsibility |
| --- | --- |
| `components/ui/` | Reviewed shadcn primitives: accessible behavior, variants, forwarded props and `cn()` merging. No recipe data or API calls. |
| `components/kitchen/` | Screens and product compositions, including the shell, illustration and confirmation policy. |
| `lib/kitchen/` | API access, validation, recipe/domain logic and the stable editor model. |
| `app/globals.css` | Root semantic tokens, Tailwind mappings, base typography, focus fallback, hidden-content protection and reduced motion. |

`RecipeCard` is shared by discovery, the catalogue and saved snapshots. Its caller
supplies the exact recipe and authored serving; the card does not fetch or scale.
`DishArt` is a self-contained illustration. Its decorative colors intentionally
belong to the illustration, not to another application theme.

`Field` in `components/kitchen/shared.tsx` composes shadcn Field/FieldLabel. It
preserves an existing control ID or assigns one with `useId`. Labels are siblings,
so option text does not become part of a select's accessible name. `wide` spans the
parent grid. `Notice` uses `role="note"` for non-urgent information; `ErrorBox`
announces errors. `Loading` uses a native output status and decorative skeletons.

## Theme and styles

The root layout imports `app/globals.css`. Tailwind is CSS-first (`@theme inline`),
with the standard `theme -> base -> components -> utilities` layer order.
`components.json` retains New York, TypeScript, RSC, CSS variables and existing
aliases; its `tailwind.config` field stays empty for Tailwind 4.

Root tokens are complete CSS colors, not bare HSL channels. They are inherited by
Radix portals mounted under `body`, outside `.kitchen-app`. Paper is `#f8f6ee`, cards
are `#fffef9`, primary green is `#305e42`, and text is `#283e30`. Controls use
Arial/Helvetica; product headings use Georgia/Times New Roman. The app is light-only
regardless of OS preference; introducing dark mode requires a reviewed palette and
an actual theme control.

Use `bg-card`, `text-foreground`, `text-muted-foreground`, `border-input` and
`ring-ring`, not old variables such as `--paper` or `--kitchen-muted`. `--muted` is a
surface and `--muted-foreground` is text. Never wrap `var(--primary)` in `hsl()`.

Layouts, headings and decorative artwork are expressed explicitly in their product
components. There are no global h1/p/input/button rules or `.button`/`.panel`
classes. Do not add `data-slot` to product markup as a styling escape hatch: it is
primitive metadata, no longer a legacy-CSS exclusion boundary. For a genuine
future custom CSS requirement, use the appropriate Tailwind layer and a narrowly
owned class; do not recreate a second stylesheet/theme system.

The unlock layout and outer workspace preserve their original **680/681px** and
**1000/1001px** transitions. Individual feature compositions also use Tailwind's
standard breakpoints. Do not silently substitute `sm` or `lg` for shell transitions.

Base rules deliberately protect native semantics: ordinary `[hidden]` content
stays hidden even with a display utility (while `hidden="until-found"` retains its
native behavior), `:focus-visible` provides a fallback outline that component
utilities can override, and reduced motion disables animations/transitions on
product elements, pseudo-elements and body-mounted portals. A hidden workspace is
not an authorization mechanism; protected API endpoints still enforce access.

## Stable selectors

Prefer roles and accessible names in tests. Product `data-kitchen-*` attributes
identify the workspace, unlock layout/story, footer, recipe cards, dish art and
preference rows when structural assertions are needed. The comparison's existing
`data-change` identifies ingredient differences. These attributes have no styling
rules. Do not restore old compatibility classes just to locate elements.

`main[data-kitchen-workspace] h1` is also the confirmation focus fallback. Preserve
that contract or update its consumer and tests together. `.kitchen-app` remains a
root identifier only; it has no bespoke CSS rules.

## Adding and updating primitives

Use `shadcn add`, not `init`, to retain the configuration and palette. Check
`components/ui/PROVENANCE.md` for the recorded generator and local adaptations.
A reproducible example using the recorded CLI version is:

```sh
npx shadcn@4.21.0 add <component-name>
```

Generate on a feature branch. Review the source and dependency diff before merging;
do not blindly overwrite existing components. Keep the Radix family consistent.
Normalize generated `cn` imports to `@/lib/utils`, preserve `data-slot`, forwarded
accessibility props and ref behavior, and retain the upstream license/provenance.
Use `npm ci` with the reviewed lockfile. A newer generator or dependency upgrade
needs its own reviewed diff, not an incidental migration-wide update.

Local adaptations worth preserving include NativeSelect's fluid wrapper, 16px
mobile text and support for native multiple-selection/numeric row counts without
a misleading dropdown chevron. FieldError uses stable error-message keys. Kitchen
session policy belongs in product components, not the AlertDialog primitive.

## Control and editor contracts

Keep native `required`, min/max, patterns, maximum lengths, rows, events and labels.
Editor textareas use fixed field sizing with user-controlled vertical resizing.
NativeSelect retains options, native validation and mobile pickers. Map Radix
checkbox values with `value === true`, not truthiness: an indeterminate value is
also possible. Pass busy/disabled props explicitly to composite controls, even
inside disabled fieldsets. Love and Exclude remain mutually exclusive.

Every button has an explicit type. Portion-profile buttons retain pressed-state
semantics and the existing controlled fields. Editable rows use `EDIT_KEY`, never
array indexes or keys serialized into recipe data. Adding a portion profile copies
existing quantities/timings unchanged and blocks saving until review; there is no
automatic time scaling. Closing a Collapsible does not discard parent-owned values.

## Confirmation and session lifecycle

`ConfirmationController`, `useConfirm` and `KitchenConfirmation` own product policy.
One decision may be outstanding; concurrent requests are rejected, not queued.
Decision IDs reject duplicate/stale handlers. `useConfirm` binds each caller to its
component lifetime with AbortSignal. Await approval before changing a draft,
issuing a mutation or committing a route; provide a specific title, consequence,
action label and destructive variant.

Cancel receives initial focus. Tab remains in the modal, Escape cancels, and outside
clicks neither approve nor dismiss it. Closing restores focus only to a visible,
enabled invoker, otherwise to the unlock input or destination heading. Mobile
content is viewport-bounded and scrollable. Native refresh/close `beforeunload`
protection remains native; an HTML dialog cannot replace it.

Studio restores the committed hash while a dirty navigation is pending, leaving
the editor mounted. Cancel retains the route and draft; a newer hash request
invalidates the old destination. Session expiry synchronously cancels decisions,
unmounts the portal/overlay without an exit-animation delay, and hides rather than
unmounts the draft. Unlock does not replay old decisions. Polling aborts on cleanup;
an old logout response cannot overwrite a newer session or an expiry-retained draft.
Failed approved actions use existing error/revision handling and need new approval
to be attempted again.

## Verification and review

Use Node 22 and the existing local environment configuration:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run db:migrations:check
npm run build:worker
npx wrangler deploy --dry-run
npx playwright install chromium
npm run test:browser
```

The browser runner creates a disposable local D1 database and test key, never the
user's database. Do not point the specs at a live kitchen. Screen tests reuse a
real server-issued test session under the disposable runner state; it is not logged
or uploaded. Actual unlock/expiry tests still exercise authentication. Focused
failure/busy cases intercept only their relevant test requests.

Node/PostCSS checks protect theme mappings, primitive semantics, absence of old
styles/classes, class merging and compiled CSS. Browser checks cover feature views
at 320/390/768/1360px, shell transition boundaries, long recipe content, native
validation, keyboard focus, hidden drafts, reduced motion and real confirmations.
Saved versions/notes, ingredient creation/multiple selection, editor row identity,
authored-profile review, failed saves, conflicts, exclusions, pagination and remix
review remain covered by the existing workflow tests.

CI retains screenshots in `kitchen-browser-results`. Computed-style and layout
assertions are automated guards; screenshots support manual comparison, not a
committed pixel-snapshot test suite. Review the unlock/shell, all six feature areas,
long editor, error/empty/busy states and confirmations before merging. Passing
Chromium tests is not exhaustive cross-browser or assistive-technology certification.

References: [shadcn theming](https://ui.shadcn.com/docs/theming),
[components configuration](https://ui.shadcn.com/docs/components-json), and
[Tailwind custom styles/layers](https://tailwindcss.com/docs/adding-custom-styles).

## Flavour library

The editor's style/profile and technique/format selectors use existing NativeSelect,
Input, Field and Checkbox primitives. Flavour forms are reusable fieldsets, not
nested forms. Library state comes from protected APIs; previews do not mutate
recipe ingredients. The existing session/confirmation policy covers inline and
library drafts. See [Flavour library](FLAVOUR-LIBRARY.md) for the feature contract.

## Optional public covers

`DishArt` now chooses an explicitly supplied recipe cover or its original artwork.
It never infers an image from a recipe ID or current catalogue, preserving saved
snapshots. `CoverPicker` is controlled by the existing editor draft. It introduces
no upload, overlay or independent persistence. Image files are public; errors fall
back to the old artwork, and changing the source retries. See
[recipe covers](RECIPE-COVERS.md) for metadata and attachment semantics.
