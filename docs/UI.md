# UI foundation (Phase 1)

This is a behaviour-preserving setup for the incremental shadcn/ui migration.
The unlock screen, navigation, recipe screens and editor still use their existing
components. There is no new route, authentication change, database migration,
framework upgrade or dark-mode feature in this phase.

## Configuration and ownership

- Tailwind 4 is configured in app/globals.css with @theme inline. The obsolete
  tailwind.config.ts and @config bridge have been removed.
- components.json retains New York, TypeScript, RSC, CSS variables and the existing
  aliases. tailwind.config is intentionally empty for Tailwind 4.
- tailwind-merge is pinned to a Tailwind-4-compatible 3.x release. tw-animate-css
  supplies animation utilities. Both versions and integrity hashes are npm-resolved
  in package-lock.json; use npm ci. No Radix or form dependencies are added yet.
- components/ui will contain generated primitives in Phase 2. Product-specific
  composition stays in components/kitchen; API and domain code stays in lib/kitchen.

## Theme

Semantic values live on :root so future dialogs/popovers portalled to body inherit
exactly the same colors as the kitchen. Colors are complete CSS values; do not wrap
var(--primary) or similar variables in hsl(). Font families are Arial/Helvetica for
controls and Georgia/Times New Roman for product headings, matching the existing UI.

The warm paper background (#f8f6ee), card surface (#fffef9), green primary (#305e42),
ink (#283e30), muted text (#687362), borders and focus-ring color are retained.
--muted is now a surface. Use --muted-foreground or text-muted-foreground for text.
Legacy muted text uses --kitchen-muted. --kitchen-accent is the decorative terracotta
color; --accent is the interactive hover/selection surface. Do not conflate them.

The legacy --paper, --surface, --ink, --green, --line and --soft aliases resolve to
semantic tokens and are temporary. Remove each alias when its last legacy use is
migrated. The kitchen remains light-only regardless of the OS preference; a future
dark-mode feature needs deliberately reviewed token values and a theme switch.

## CSS coexistence contract

There is one stylesheet entry point: app/layout.tsx imports app/globals.css.
Do not import kitchen.css directly from routes or components.

The declared cascade is: theme -> base -> legacy -> components -> utilities.
The two legacy files are imported into the legacy layer in their original order:
kitchen-discovery.css, then kitchen.css. Keeping this order preserves existing
same-specificity overrides. Do not move these imports outside their layer.

Legacy selectors are scoped to .kitchen-app. A zero-specificity guard,
:not(:where([data-slot], [data-slot] *)), stops them from styling shadcn primitive
roots and descendants, including min-height, font shorthands and !important rules
that simply adding a later utility would not reliably override. Keep data-slot
attributes on generated components. Do not use data-slot for unrelated product
markup. A primitive subtree opts out of legacy styles as a whole: migrate the
composition's children together rather than placing old .field/.button markup
inside a new Card and expecting those old styles to apply.

Hidden/session protection and reduced-motion rules intentionally cross this
boundary. Global reduced-motion protection also covers body-mounted primitives.
This phase prepares portal theming only; closing overlays on session expiry and
preserving editor drafts remain part of the later overlay migration.

## Adding components in Phase 2

Use the shadcn CLI add command, not init, to preserve this configuration and theme.
Review generated New York / Radix-backed source, its data-slot attributes, required
dependencies and the lockfile before committing. Do not mix primitive families.
Add only primitives needed for the screen being migrated; start with the unlock
screen. Do not overwrite globals.css with a generated default palette.

Use semantic utilities such as bg-card, text-foreground, text-muted-foreground,
border-input and ring-ring, plus cn() for caller overrides. Treat the contents of
components/ui as source owned by this repository, not a place for recipe logic.
Keep native validation, explicit button types, disabled states and label bindings.

## Verification

npm run typecheck
npm run lint
npm test
npm run build:worker
npx wrangler deploy --dry-run
npx playwright install chromium
npm run test:browser

The existing API/session/migration and browser checks remain unchanged.
tests/ui-foundation.test.mjs verifies configuration, the theme contract, legacy
selector boundaries, cn() overrides and the real Tailwind/PostCSS compilation.
tests/browser/ui-foundation.spec.ts injects fixture-only primitive-shaped markup
into the test page: it checks legacy sizes/colors, primitive isolation, root portal
tokens, mobile input sizing, hidden content, keyboard focus and reduced motion.
These fixtures are not production shadcn components and create no application route.

CI preserves screenshots in its kitchen-browser-results artifact. The Phase 1
preparation run also retains pre-style-change baseline screenshots for comparison.
Manual review should cover unlock, discovery, browsing, recipe detail, preferences,
remix comparison and the long recipe editor at desktop and mobile widths. Expect
no intentional screen redesign in this PR; compare these flows before merging.
