import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import ts from "typescript";
import { cn } from "../lib/utils.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shadcn uses the CSS-first Tailwind 4 configuration and one stylesheet entry point", () => {
  const config = JSON.parse(read("components.json"));
  assert.equal(config.style, "new-york");
  assert.equal(config.tailwind.config, "");
  assert.equal(config.tailwind.css, "app/globals.css");
  assert.equal(config.tailwind.cssVariables, true);
  assert.equal(config.aliases.ui, "@/components/ui");
  assert.equal(existsSync(new URL("../tailwind.config.ts", import.meta.url)), false);
  assert.doesNotMatch(read("app/page.tsx"), /kitchen\.css/);
  const css = read("app/globals.css");
  assert.doesNotMatch(css, /@config/);
  assert.match(css, /@layer theme, base, components, utilities;/);
  assert.doesNotMatch(css, /legacy|kitchen(?:-discovery)?\.css/);
  for (const path of ["app/kitchen.css", "app/kitchen-discovery.css"]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, path);
  }
  assert.match(read("app/layout.tsx"), /import "\.\/globals\.css"/);
});

test("one semantic theme lives at the root without transitional aliases", () => {
  const css = postcss.parse(read("app/globals.css"));
  const root = css.nodes.find((node) => node.type === "rule" && node.selector === ":root");
  assert.ok(root);
  const values = Object.fromEntries(
    root.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]),
  );
  assert.equal(values["--background"], "#f8f6ee");
  assert.equal(values["--primary"], "#305e42");
  assert.equal(values["--muted"], "#e9edde");
  assert.equal(values["--muted-foreground"], "#687362");
  for (const alias of [
    "paper",
    "surface",
    "ink",
    "green",
    "line",
    "soft",
    "kitchen-muted",
    "kitchen-accent",
  ]) {
    assert.equal(values[`--${alias}`], undefined, alias);
  }
  const theme = css.nodes.find((node) => node.type === "atrule" && node.name === "theme");
  assert.equal(theme.params, "inline");
  const mappings = new Map(
    theme.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]),
  );
  for (const name of [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "destructive-foreground",
    "border",
    "input",
    "ring",
  ]) {
    assert.ok(values[`--${name}`], name);
    assert.equal(mappings.get(`--color-${name}`), `var(--${name})`);
  }
});

test("base accessibility safeguards do not rely on primitive exclusion selectors", () => {
  const css = postcss.parse(read("app/globals.css"));
  const base = css.nodes.find(
    (node) => node.type === "atrule" && node.name === "layer" && node.params === "base",
  );
  assert.ok(base);
  const rule = (selector) =>
    base.nodes.find((node) => node.type === "rule" && node.selector === selector);
  const hidden = rule('[hidden]:not([hidden="until-found"])');
  assert.ok(
    hidden.nodes.some((node) => node.prop === "display" && node.value === "none" && node.important),
  );
  assert.ok(
    rule(":focus-visible").nodes.some(
      (node) => node.prop === "outline" && node.value.includes("var(--ring)"),
    ),
  );
  const motion = base.nodes.find(
    (node) => node.type === "atrule" && node.params.includes("prefers-reduced-motion"),
  );
  const protectedProperties = new Set();
  motion.walkDecls((node) => {
    assert.ok(node.important);
    protectedProperties.add(node.prop);
  });
  assert.deepEqual([...protectedProperties].sort(), ["animation", "scroll-behavior", "transition"]);
  assert.doesNotMatch(read("app/globals.css"), /data-slot|:where\(\.kitchen-app/);
});

test("product compositions do not reference removed class names or theme aliases", () => {
  const obsolete = new Set([
    "workspace",
    "page-heading",
    "eyebrow",
    "site-footer",
    "status-dot",
    "unlock-layout",
    "unlock-story",
    "story-mark",
    "button",
    "panel",
    "field",
    "recipe-card",
    "dish-art",
    "taste-row",
    "remix-option",
    "review-badge",
    "comparison-meals",
    "ingredient-check",
  ]);
  for (const file of readdirSync(new URL("../components/kitchen", import.meta.url))) {
    if (!file.endsWith(".tsx")) continue;
    const source = read(`components/kitchen/${file}`);
    assert.doesNotMatch(
      source,
      /var\(--(?:paper|surface|ink|green|line|soft|kitchen-muted|kitchen-accent)\)/,
      file,
    );
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function checkClass(node) {
      if (ts.isStringLiteralLike(node)) {
        for (const token of node.text.split(/\s+/))
          assert.equal(obsolete.has(token), false, `${file}: ${token}`);
      }
      ts.forEachChild(node, checkClass);
    }
    function visit(node) {
      if (ts.isJsxAttribute(node) && node.name.getText(ast) === "className" && node.initializer)
        checkClass(node.initializer);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
});

test("cn resolves Tailwind 4 utilities and caller overrides", () => {
  assert.equal(cn("inset-shadow-sm", "inset-shadow-md"), "inset-shadow-md");
  assert.equal(cn("bg-(--first)", "bg-(--second)"), "bg-(--second)");
  assert.equal(cn("size-4", false, undefined, { "size-6": true }), "size-6");
  assert.equal(cn("px-4 text-sm", "px-2"), "text-sm px-2");
});

test("the production PostCSS pipeline compiles semantic utilities, layers and animation CSS", async () => {
  const source = `${read("app/globals.css")}\n@source inline("bg-primary bg-card bg-muted bg-popover text-muted-foreground text-primary-foreground border-input ring-ring rounded-lg animate-in");\n`;
  const result = await postcss([tailwind({ base: resolve("."), optimize: false })]).process(
    source,
    { from: resolve("app/globals.css") },
  );
  const selectors = new Set();
  result.root.walkRules((rule) => selectors.add(rule.selector));
  for (const selector of [
    ".bg-primary",
    ".bg-card",
    ".bg-muted",
    ".bg-popover",
    ".text-muted-foreground",
    ".text-primary-foreground",
    ".border-input",
    ".ring-ring",
    ".rounded-lg",
    ".animate-in",
  ]) {
    assert.ok(selectors.has(selector), selector);
  }
  result.root.walkAtRules((rule) => {
    assert.ok(
      !["import", "config", "theme", "apply", "source", "custom-variant"].includes(rule.name),
      rule.toString(),
    );
  });
  result.root.walkAtRules("layer", (rule) => assert.doesNotMatch(rule.params, /legacy/));
  assert.doesNotMatch(result.css, /\.unlock-story|\.page-heading|--kitchen-muted|--paper:/);
  assert.equal(result.warnings().length, 0);
});
