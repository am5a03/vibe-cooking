# Kitchen UI architecture

## Migration status

Phase 1 established the Tailwind 4 theme and legacy CSS coexistence boundary.
Phase 2 uses actual shadcn primitives for the unlock screen, application header,
shell actions, shared error/loading feedback and shared field labels. Recipe
browsing/detail/editor/preferences/remix compositions remain otherwise unchanged.
No new route, authentication model, database migration or dark-mode feature is added.

## Configuration and ownership

- Tailwind 4 is configured in `app/globals.css` with `@theme inline`.
  There is no `tailwind.config.ts` or `@config` bridge.
- `components.json` retains New York, TypeScript, RSC, CSS variables and the existing
  aliases. `tailwind.config` is intentionally empty for Tailwind 4.
- `tailwind-merge` and `tw-animate-css` remain pinned to the Phase 1 versions.
  Additional Radix dependencies come from the generated components; use `npm ci`.
- `components/ui` contains shadcn source, its upstream MIT license and generation
  provenance. Keep this layer independent of recipes, API calls and session state.
- `components/kitchen/unlock.tsx` composes Card, Badge, Field, Input and Button.
- `components/kitchen/kitchen-header.tsx` is a controlled presentation component.
  Studio owns navigation, session state and dirty-edit decisions. The header keeps
  the four existing destinations, uses `aria-current="page"`, and is ordinary
  navigation, not a tablist or an application menu. On small screens it wraps into
  two rows rather than adding a drawer or hiding destinations.
- `components/kitchen/shared.tsx` contains product feedback and a transitional
  Field adapter. Its Label is a shadcn primitive, but the wrapper deliberately has
  no data-slot. Native recipe form controls retain their legacy styles and behavior
  until their complete compositions are migrated in Phase 3.

## Theme

Semantic values live on `:root`, including colors inherited by future body-mounted
portals. Colors are complete CSS values; do not wrap `var(--primary)` in `hsl()`.
Fonts remain Arial/Helvetica for controls and Georgia/Times New Roman for product
headings. Product headings must opt into `font-serif` inside primitive subtrees.

The warm paper background (#f8f6ee), card surface (#fffef9), green primary (#305e42),
ink (#283e30), muted text (#687362), borders and focus-ring color are retained.
`--muted` is a surface; use `text-muted-foreground` for subdued text.
`--kitchen-accent` is decorative terracotta; `--accent` is the interactive surface.
The temporary legacy aliases are removed only when their last consumer migrates.
The kitchen stays light-only regardless of OS preference.

## CSS coexistence contract

There is one stylesheet entry point: `app/layout.tsx` imports `app/globals.css`.
Do not import `kitchen.css` directly from routes or components.
The cascade is `theme -> base -> legacy -> components -> utilities`.
`kitchen-discovery.css` is imported before `kitchen.css`, both in the legacy layer.

Legacy selectors are scoped to `.kitchen-app`. The zero-specificity guard
`:not(:where([data-slot], [data-slot] *))` excludes shadcn roots and descendants,
including legacy font shorthands, min-height, and important declarations.
Keep generated data-slot attributes; do not add them to unrelated product markup.
A primitive subtree opts out as a whole: migrate its children together instead of
putting old `.field`/`.button` markup inside a new Card and expecting legacy styles.

Hidden/session protection and reduced-motion rules cross this boundary. Global
reduced-motion protection also covers body-mounted primitives. Phase 2 introduces
no portalled overlays. Native confirmation dialogs and browser-unload warnings stay
in place; custom dialog lifecycle/session-expiry handling belongs to Phase 4.

## Interaction contracts

- Every application Button specifies `type`; form actions use `type="submit"`.
- Unlock keeps the password input's required/min/max length constraints and native
  keyboard submission. Pending requests disable controls and have a ref-based
  duplicate-submission guard. Failures announce one Alert, associate it with the
  input, clear the key and return focus to the field. No browser storage is used.
- Explicit lock still asks before discarding dirty edits. Expiry still hides the
  mounted editor and re-unlock restores the draft. Studio's hash routing, dirty
  guards and API calls are unchanged by the presentation extraction.
- Shared Field labels remain siblings with matching `htmlFor`/`id`. In particular,
  option text in selects must not become part of the accessible field name.
- Loading skeletons are decorative; one polite live status provides the text.
- Use semantic colors and `cn()` overrides, not additional global control rules.

## Adding/updating primitives

Use `shadcn add`, not `init`, with the existing New York configuration. Review the
source, data-slot attributes, Radix dependencies and lockfile. Do not mix primitive
families or overwrite the kitchen theme. Add only components used by the current
migration. Preserve local adjustments and the upstream license when updating.
See `components/ui/PROVENANCE.md` for the actual generation command/version.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run db:migrations:check
npm run build:worker
npx wrangler deploy --dry-run
npx playwright install chromium
npm run test:browser
```

The browser runner creates disposable local D1 and a temporary test token; never
point it at production. Existing cookbook, review, revision-conflict and session
regression tests remain active. `ui-foundation.test.mjs` and
`browser/ui-foundation.spec.ts` retain the Phase 1 CSS contract. The latter now
waits for the accessible password input instead of an obsolete card CSS class.

`ui-shell.test.mjs` tests rendered primitive and shared-component semantics.
`browser/ui-shell.spec.ts` exercises the actual unlock/header components at 320,
390, 768 and 1360px, keyboard focus/submission, required validation, busy/error
feedback, key clearing, native label compatibility, dirty navigation/lock guards,
expiry draft retention, and reduced motion. Failure/busy responses are intercepted;
successful sessions and existing product workflows use the real local Worker.

CI retains screenshots in `kitchen-browser-results`. Review unlock, navigation,
errors and loading on mobile and desktop, then smoke-test recipe editing/saving,
preferences and remix previews. This phase intentionally changes the migrated
controls and narrow-screen header, not the rest of the product layouts.
