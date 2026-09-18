# Kitchen UI architecture (through Phase 4)

The UI uses shadcn/ui New York components backed by Radix, with the original warm
kitchen theme. Phase 1 established the theme and CSS boundary. Phase 2 migrated
unlock, navigation and shared feedback. Phase 3 migrates browsing, discovery,
recipe details, preferences, the editor and variation comparisons.

API calls, recipe snapshots, authored serving profiles, editor row identities,
revision tags, dirty-edit guards and session handling remain owned by the existing
application/domain code. This is not a routing or form-state rewrite. Native
beforeunload warnings remain native; application confirmations use shadcn AlertDialog.

## Ownership

- `components/ui`: reviewed, source-owned shadcn primitives. No kitchen data or API
  calls belong here. Keep `data-slot`, accessible props and caller `className`
  merging. See `PROVENANCE.md` and the retained upstream license.
- `components/kitchen`: screens and product compositions. `RecipeCard` is shared
  by discovery, the catalogue and saved snapshots. Its caller supplies the exact
  recipe and authored serving; the card performs no scaling or data fetching.
- `DishArt` is a self-contained product illustration using utilities. It works
  inside a Card without relying on the excluded legacy illustration selectors.
- `Notice` composes Alert/AlertDescription for non-urgent information, with the
  alert role removed. `ErrorBox` is the live error component. `Loading` keeps a
  native output status and decorative, hidden-from-assistive-tech skeletons.
- `lib/kitchen`: domain logic, validation, API access and the stable editor model.

## Theme and configuration

Tailwind 4 is CSS-first in `app/globals.css`, using `@theme inline`.
`components.json` retains New York, TypeScript, RSC, CSS variables and existing
aliases. Its `tailwind.config` field is intentionally empty. Use shadcn `add`,
not `init`, and do not replace the kitchen palette with generated defaults.

Semantic values live on `:root`, including future body-mounted overlays. They are
complete CSS colors; never wrap `var(--primary)` in `hsl()`. Paper is `#f8f6ee`,
card surfaces `#fffef9`, primary green `#305e42`, and ink `#283e30`. Controls use
Arial/Helvetica; product headings use Georgia/Times New Roman.

`--muted` is a surface; `--muted-foreground` is text. The decorative terracotta
`--kitchen-accent` is distinct from the interactive `--accent`. The app remains
light-only, regardless of OS preference. Dependencies stay lockfile-controlled;
use `npm ci`. Phase 3 adds no new package family or framework upgrade.

## CSS coexistence

There is one stylesheet entry point: the root layout imports `app/globals.css`.
The cascade remains `theme -> base -> legacy -> components -> utilities`, with
legacy discovery CSS loaded before legacy kitchen CSS.

Legacy selectors are kitchen-scoped and exclude `[data-slot]` roots and their
subtrees using a zero-specificity guard. Migrated Card/Field compositions must
style all children explicitly; old `.panel`, `.field` or `.button` styles will not
work inside them. Do not add `data-slot` to unrelated product markup to bypass CSS.

The remaining `recipe-card`, `taste-row`, `remix-option`, `review-badge`,
`comparison-meals`, `ingredient-check` and `diff-*` class names in migrated
compositions are compatibility hooks, not the source of their styling. Keep the
legacy files for the still-unmigrated shell/fixtures until the Phase 5 cleanup.
Hidden-content/session protections and reduced-motion rules deliberately cross
the CSS boundary. Phase 4 adds one controlled, session-scoped AlertDialog portal.

## Control contracts

- Kitchen `Field` now composes shadcn Field/FieldLabel. It preserves a child's
  existing ID or assigns one with `useId`, keeping the label a sibling so select
  option text is not included in its accessible name. `wide` spans all grid columns.
- Text fields and textareas retain native `required`, ranges, patterns, maximum
  lengths, rows and change handlers. Editor textareas use fixed field sizing with
  user-controlled vertical resizing rather than implicit content-sized growth.
- `NativeSelect` retains native events, options, validation and mobile pickers.
  Multiple selects and numeric `size` values render real listboxes with no dropdown
  chevron. The generated `sm`/`default` sizes remain supported. Wrappers are fluid
  and min-width-safe; controls use 16px text on small screens.
- Map Checkbox changes using `value === true`, not truthiness (Radix also supports
  an indeterminate value). Composite controls receive explicit busy/disabled props.
  Preferences still make Love and Exclude mutually exclusive.
- Portion-profile buttons remain pressed-state selectors, without changing the
  editor model or mounting independent copies of the fields. `EDIT_KEY` remains
  the key for editable rows, never an array index or serialized recipe property.
- New portion profiles copy authored values unchanged and block saving until the
  existing review acknowledgement is satisfied. No automated time scaling.
- Collapsible is used for optional ingredient creation and complete-step
  comparisons. Product state remains in the parent; closing an optional panel
  does not discard its controlled field values.
- Buttons have explicit types. Informational notices must not impersonate urgent
  validation errors. Save statuses remain native output elements.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run db:migrations:check
npm run build:worker
npx wrangler deploy --dry-run
npx playwright install chromium
npm run test:browser
```

Browser checks run on disposable local D1 through the existing runner, not the
user's database. Existing saved-version, notes, conflicts, expiry and remix tests
remain, with Phase 2 control-size/label assertions updated to the migrated UI.
New tests cover all six feature screens at 320/390/768/1360px, authored portions,
checkboxes, multi-select, editor row identity and review guards, failed-save drafts,
mutual exclusion and busy disabling, catalogue paging, empty state and retry.

CI keeps screenshots in `kitchen-browser-results`. The migration does not claim
pixel-identical screenshots or comprehensive assistive-technology certification.
Manual review should include long text, mobile layouts and the complete editor.

## Phase 4: confirmation and session lifecycle

`components/ui/alert-dialog.tsx` owns the shadcn/Radix primitive; the kitchen's
`ConfirmationController`, `useConfirm` and `KitchenConfirmation` own product policy.
There is exactly one outstanding decision. Concurrent requests are rejected rather
than queued. Every decision has an ID; duplicate or stale handlers do nothing.
`useConfirm` binds requests to the calling component's lifetime with AbortSignal.

Await confirmation before changing any draft, issuing a mutation or committing a
route. Supply a specific title, consequence, action label and destructive variant.
Cancel and Escape are non-destructive. Radix focuses Cancel, traps modal focus and
prevents outside clicks from approving or dismissing the decision. On closing,
focus returns to the invoker only when it is still visible and enabled; otherwise
it moves to the visible unlock input or destination heading. All buttons explicitly
use type=button. Mobile content is viewport-bounded and scrollable. Global theme
and reduced-motion tokens apply outside the kitchen root.

Studio restores the committed hash while a dirty navigation decision is pending.
Cancel leaves the mounted view and dirty state intact. A later hash request
invalidates the older destination. As before, cancelled history traversal restores
the current hash with replaceState; this is still the existing hash router, not a
new history/router library. Native browser refresh/close beforeunload protection
remains in place and is not replaced by an HTML modal.

Every expiry path synchronously disables confirmations and invalidates pending
navigation. The portal and overlay unmount immediately (no exit-animation delay),
while the editor remains mounted but hidden. Hash changes while locked cannot
replace that retained draft. Unlock never replays an old decision. Session polling
is aborted on cleanup, and an old logout response cannot overwrite a newer session
or discard a draft preserved by expiry.

Approval closes the confirmation, then uses each screen's existing busy/error and
revision-conflict handling. Failed mutations retain their error and draft instead
of silently retrying. A new destructive attempt requires a new confirmation.

Coverage includes all nine former confirmation call sites: dirty navigation/lock,
recipe/note/preferences reload, archive/restore, bookmark removal, portion-profile
removal, and variation unlinking. The final CSS cleanup remains Phase 5. Database,
authentication protocol, API payloads and deployment settings are unchanged.
