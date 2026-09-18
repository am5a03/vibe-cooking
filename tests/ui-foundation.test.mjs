import assert from 'node:assert/strict';
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
