// Temporary, branch-only preparation script. Removed before the Phase 1 PR.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import postcss from 'postcss';

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
const oldGlobals = readFileSync('app/globals.css', 'utf8');
const marker = '/* Dish-first discovery and explicitly reviewed recipe transformations. */';
assert.ok(oldGlobals.includes(marker), 'Expected the unmigrated global stylesheet.');
const legacyVariables = new Set(['--paper', '--surface', '--ink', '--muted', '--green', '--line', '--soft', '--accent']);
const guard = ':not(:where([data-slot], [data-slot] *))';
function isolateLegacy(css) {
  const root = postcss.parse(css);
  root.walkDecls((declaration) => {
    if (declaration.parent.selector === '.kitchen-app' && legacyVariables.has(declaration.prop)) {
      declaration.remove();
      return;
    }
    declaration.value = declaration.value.replaceAll('var(--muted)', 'var(--kitchen-muted)').replaceAll('var(--accent)', 'var(--kitchen-accent)');
  });
  root.walkRules((rule) => {
    let reducedMotion = false;
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.params?.includes('prefers-reduced-motion')) reducedMotion = true;
    }
    rule.selector = postcss.list.comma(rule.selector).map((original) => {
      let selector = original.trim();
      if (selector === '.kitchen-app') return selector;
      if (!selector.includes('.kitchen-app')) selector = ':where(.kitchen-app) ' + selector;
      // Hidden/session protection and reduced motion must also apply to new controls.
      if (selector.includes('[hidden]') || reducedMotion) return selector;
      const pseudo = selector.match(/(::?(?:before|after))$/);
      return pseudo ? selector.slice(0, -pseudo[0].length) + guard + pseudo[0] : selector + guard;
    }).join(', ');
  });
  return root.toString().trimEnd() + '\n';
}
write('app/kitchen-discovery.css', '/* Transitional legacy discovery/remix styles. See docs/UI.md. */\n' + isolateLegacy(oldGlobals.slice(oldGlobals.indexOf(marker))));
write('app/kitchen.css', isolateLegacy(readFileSync('app/kitchen.css', 'utf8')));
write('app/globals.css', String.raw`/* Declare the order before Tailwind establishes its default layers. */
@layer theme, base, legacy, components, utilities;
@import "tailwindcss";
@import "tw-animate-css";
/* Keep the original discovery -> kitchen cascade order during migration. */
@import "./kitchen-discovery.css" layer(legacy);
@import "./kitchen.css" layer(legacy);

/* The kitchen remains light-only; do not activate dark utilities from the OS. */
@custom-variant dark (&:where(.dark, .dark *));

/* Complete CSS colors, not bare HSL channels. Shared by body-mounted portals. */
:root {
  color-scheme: light;
  --background: #f8f6ee;
  --foreground: #283e30;
  --card: #fffef9;
  --card-foreground: #283e30;
  --popover: #fffef9;
  --popover-foreground: #283e30;
  --primary: #305e42;
  --primary-foreground: #ffffff;
  --secondary: #e9edde;
  --secondary-foreground: #283e30;
  --muted: #e9edde;
  --muted-foreground: #687362;
  --accent: #ecefdf;
  --accent-foreground: #305e42;
  --destructive: #803f25;
  --destructive-foreground: #ffffff;
  --border: #dedfce;
  --input: #d5dacb;
  --ring: #b07a48;
  --radius: 0.5rem;

  /* Temporary legacy aliases. Never redefine the semantic tokens in a screen. */
  --paper: var(--background);
  --surface: var(--card);
  --ink: var(--foreground);
  --green: var(--primary);
  --line: var(--border);
  --soft: var(--secondary);
  --kitchen-muted: var(--muted-foreground);
  --kitchen-accent: #ad6b42;
}

@theme inline {
  --font-sans: Arial, Helvetica, sans-serif;
  --font-serif: Georgia, "Times New Roman", serif;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * { @apply border-border; }
  body {
    @apply bg-background text-foreground;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 15px;
    line-height: 1.65;
  }
  /* Include future portals outside .kitchen-app in the motion preference. */
  @media (prefers-reduced-motion: reduce) {
    [data-slot], [data-slot] * {
      scroll-behavior: auto !important;
      animation: none !important;
      transition: none !important;
    }
  }
}
`);
const config = JSON.parse(readFileSync('components.json', 'utf8'));
config.tailwind.config = '';
config.iconLibrary = 'lucide';
write('components.json', JSON.stringify(config, null, 2) + '\n');
rmSync('tailwind.config.ts');
const page = readFileSync('app/page.tsx', 'utf8');
assert.ok(page.includes("import './kitchen.css';"));
write('app/page.tsx', page.replace("import './kitchen.css';\n", ''));

write('tests/ui-foundation.test.mjs', String.raw`import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { cn } from '../lib/utils.ts';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('shadcn uses the CSS-first Tailwind 4 configuration and one stylesheet entry point', () => {
  const config = JSON.parse(read('components.json'));
  assert.equal(config.style, 'new-york');
  assert.equal(config.tailwind.config, '');
  assert.equal(config.tailwind.css, 'app/globals.css');
  assert.equal(config.tailwind.cssVariables, true);
  assert.equal(config.aliases.ui, '@/components/ui');
  assert.equal(existsSync(new URL('../tailwind.config.ts', import.meta.url)), false);
  assert.doesNotMatch(read('app/page.tsx'), /kitchen\.css/);
  const css = read('app/globals.css');
  assert.doesNotMatch(css, /@config/);
  assert.match(css, /@layer theme, base, legacy, components, utilities;/);
  assert.ok(css.indexOf('./kitchen-discovery.css') < css.indexOf('./kitchen.css'));
});

test('semantic theme values and non-colliding legacy aliases live at the root', () => {
  const css = postcss.parse(read('app/globals.css'));
  const root = css.nodes.find((node) => node.type === 'rule' && node.selector === ':root');
  assert.ok(root);
  const values = Object.fromEntries(root.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value]));
  assert.equal(values['--background'], '#f8f6ee');
  assert.equal(values['--primary'], '#305e42');
  assert.equal(values['--muted'], '#e9edde');
  assert.equal(values['--muted-foreground'], '#687362');
  assert.equal(values['--kitchen-muted'], 'var(--muted-foreground)');
  assert.notEqual(values['--accent'], values['--kitchen-accent']);
  const theme = css.nodes.find((node) => node.type === 'atrule' && node.name === 'theme');
  assert.equal(theme.params, 'inline');
  const mappings = new Map(theme.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value]));
  for (const name of ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring']) {
    assert.ok(values['--' + name], name);
    assert.equal(mappings.get('--color-' + name), 'var(--' + name + ')');
  }
});

test('legacy selectors are kitchen-scoped and exclude primitive subtrees without extra specificity', () => {
  for (const file of ['app/kitchen.css', 'app/kitchen-discovery.css']) {
    const source = read(file);
    assert.doesNotMatch(source, /var\(--muted\)/);
    assert.doesNotMatch(source, /var\(--accent\)/);
    const css = postcss.parse(source);
    css.walkDecls((declaration) => {
      assert.notEqual(declaration.prop, '--muted');
      assert.notEqual(declaration.prop, '--accent');
    });
    css.walkRules((rule) => {
      let reducedMotion = false;
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && parent.params?.includes('prefers-reduced-motion')) reducedMotion = true;
      }
      for (const selector of postcss.list.comma(rule.selector)) {
        assert.ok(selector.includes('.kitchen-app'), selector);
        if (selector.trim() === '.kitchen-app' || selector.includes('[hidden]') || reducedMotion) continue;
        assert.ok(selector.includes(':not(:where([data-slot], [data-slot] *))'), selector);
      }
    });
  }
});

test('cn resolves Tailwind 4 utilities and caller overrides', () => {
  assert.equal(cn('inset-shadow-sm', 'inset-shadow-md'), 'inset-shadow-md');
  assert.equal(cn('bg-(--first)', 'bg-(--second)'), 'bg-(--second)');
  assert.equal(cn('size-4', false, undefined, { 'size-6': true }), 'size-6');
  assert.equal(cn('px-4 text-sm', 'px-2'), 'text-sm px-2');
});

test('the production PostCSS pipeline compiles semantic utilities, layers and animation CSS', async () => {
  const source = read('app/globals.css') + '\n@source inline("bg-primary bg-card bg-muted bg-popover text-muted-foreground text-primary-foreground border-input ring-ring rounded-lg animate-in");\n';
  const result = await postcss([tailwind({ base: resolve('.'), optimize: false })]).process(source, { from: resolve('app/globals.css') });
  const selectors = new Set();
  result.root.walkRules((rule) => selectors.add(rule.selector));
  for (const selector of ['.bg-primary', '.bg-card', '.bg-muted', '.bg-popover', '.text-muted-foreground', '.text-primary-foreground', '.border-input', '.ring-ring', '.rounded-lg', '.animate-in']) {
    assert.ok(selectors.has(selector), selector);
  }
  result.root.walkAtRules((rule) => {
    assert.ok(!['import', 'config', 'theme', 'apply', 'source', 'custom-variant'].includes(rule.name), rule.toString());
  });
  assert.equal(result.warnings().length, 0);
});
`);

write('tests/browser/ui-foundation.spec.ts', String.raw`import { expect, test } from '@playwright/test';

// Fixture-only markup: no new route and no migrated product components in Phase 1.
const fixture = '<section id="ui-foundation-fixture" class="panel">' +
  '<h2 id="legacy-heading">Legacy kitchen heading</h2>' +
  '<p id="legacy-copy">Legacy muted text</p>' +
  '<button id="legacy-control" type="button" class="button primary">Legacy action</button>' +
  '<input id="legacy-input" aria-label="Legacy input" />' +
  '<div data-slot="card" id="new-card" class="rounded-xl border bg-card p-6 text-card-foreground">' +
  '<h2 id="new-heading" class="font-sans text-xl font-semibold">Primitive heading</h2>' +
  '<p id="new-copy" class="text-sm text-muted-foreground">Primitive description</p>' +
  '<button id="new-control" data-slot="button" type="button" class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">New action</button>' +
  '<input id="new-input" data-slot="input" aria-label="New input" class="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base md:text-sm" />' +
  '<button id="nested-collision" type="button" class="button primary">Legacy class inside primitive</button>' +
  '<div id="muted-surface" data-slot="skeleton" class="h-4 animate-pulse bg-muted"></div>' +
  '</div><div id="hidden-region" hidden><div data-slot="card" class="flex">Must stay hidden</div></div></section>';
const portal = '<div id="portal-fixture" data-slot="popover-content" class="rounded-lg border bg-popover p-4 text-popover-foreground">Body-mounted content</div>' +
  '<button id="outside-collision" type="button" class="button primary">Outside kitchen</button>';

test('UI foundation: legacy parity, primitive isolation and root portal theme', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.unlock-card')).toBeVisible();
  await page.locator('.kitchen-app').evaluate((element, html) => element.insertAdjacentHTML('beforeend', html), fixture);
  await page.locator('body').evaluate((element, html) => element.insertAdjacentHTML('beforeend', html), portal);

  for (const width of [1360, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(page.locator('#legacy-input')).toHaveCSS('min-height', '43px');
    await expect(page.locator('#legacy-control')).toHaveCSS('min-height', '42px');
    await expect(page.locator('#legacy-control')).toHaveCSS('background-color', 'rgb(48, 94, 66)');
    await expect(page.locator('#legacy-copy')).toHaveCSS('color', 'rgb(104, 115, 98)');
    await expect(page.locator('#legacy-heading')).toHaveCSS('font-family', /Georgia/);
    await expect(page.locator('#new-input')).toHaveCSS('min-height', '0px');
    await expect(page.locator('#new-input')).toHaveCSS('height', '36px');
    await expect(page.locator('#new-input')).toHaveCSS('padding-top', '4px');
    await expect(page.locator('#new-input')).toHaveCSS('font-size', width < 768 ? '16px' : '14px');
    await expect(page.locator('#new-control')).toHaveCSS('background-color', 'rgb(48, 94, 66)');
    await expect(page.locator('#new-control')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(page.locator('#new-control')).toHaveCSS('min-height', '0px');
    await expect(page.locator('#new-heading')).toHaveCSS('font-family', /Arial/);
    await expect(page.locator('#new-heading')).toHaveCSS('font-size', '20px');
    await expect(page.locator('#new-copy')).toHaveCSS('margin-bottom', '0px');
    await expect(page.locator('#nested-collision')).toHaveCSS('min-height', '0px');
    await expect(page.locator('#outside-collision')).toHaveCSS('min-height', '0px');
    await expect(page.locator('#muted-surface')).toHaveCSS('background-color', 'rgb(233, 237, 222)');
    await expect(page.locator('#portal-fixture')).toHaveCSS('background-color', 'rgb(255, 254, 249)');
    await expect(page.locator('#portal-fixture')).toHaveCSS('color', 'rgb(40, 62, 48)');
    await expect(page.locator('#portal-fixture')).toHaveCSS('font-family', /Arial/);
    await expect(page.locator('#hidden-region')).toHaveCSS('display', 'none');
    await page.screenshot({ path: testInfo.outputPath('foundation-' + width + '.png'), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('#portal-fixture')).toHaveCSS('background-color', 'rgb(255, 254, 249)');
  await expect(page.locator('#muted-surface')).toHaveCSS('animation-name', 'none');
  await page.locator('#new-control').focus();
  await expect(page.locator('#new-control')).toHaveCSS('outline-style', 'none');
  await expect(page.locator('#new-control')).not.toHaveCSS('box-shadow', 'none');
});
`);

write('docs/UI.md', String.raw`# UI foundation (Phase 1)

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
`);
console.log('Phase 1 files prepared; no product component or domain code changed.');
