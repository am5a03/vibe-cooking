import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tsImport } from "tsx/esm/api";

const { NativeSelect, NativeSelectOption, Checkbox, Textarea, RecipeCard, Notice } = await tsImport(
  "./helpers/ui-components.ts",
  {
    parentURL: import.meta.url,
    tsconfig: fileURLToPath(new URL("./tsconfig.ui.json", import.meta.url)),
  },
);
const render = (component, props, ...children) =>
  renderToStaticMarkup(createElement(component, props, ...children));

test("native select forwards multiple selection, row count and required/disabled semantics without a misleading chevron", () => {
  const html = render(
    NativeSelect,
    {
      id: "parts",
      multiple: true,
      size: 5,
      required: true,
      disabled: true,
      defaultValue: ["a", "b"],
    },
    createElement(NativeSelectOption, { value: "a" }, "Part A"),
    createElement(NativeSelectOption, { value: "b" }, "Part B"),
  );
  assert.match(html, /<select[^>]*id="parts"/);
  assert.match(html, /multiple=""/);
  assert.match(html, /size="5"/);
  assert.match(html, /required=""/);
  assert.match(html, /disabled=""/);
  assert.equal([...html.matchAll(/selected=""/g)].length, 2);
  assert.doesNotMatch(html, /native-select-icon/);
  assert.match(html, /text-base/);
});

test("single native selects retain their decorative chevron and an explicit label target", () => {
  const html = render(
    NativeSelect,
    { id: "meal", "aria-label": "Meal", value: "a", onChange() {} },
    createElement(NativeSelectOption, { value: "a" }, "Part A"),
  );
  assert.match(html, /data-slot="native-select-icon"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /<select[^>]*id="meal"/);
});

test("checkboxes stay non-submit buttons and textarea constraints are forwarded", () => {
  const checkbox = render(Checkbox, { checked: true, disabled: true, "aria-label": "Reviewed" });
  assert.match(checkbox, /type="button"/);
  assert.match(checkbox, /role="checkbox"/);
  assert.match(checkbox, /aria-checked="true"/);
  assert.match(checkbox, /disabled=""/);
  const textarea = render(Textarea, {
    rows: 4,
    maxLength: 12000,
    required: true,
    defaultValue: "A cooking note.",
  });
  assert.match(textarea, /rows="4"/);
  assert.match(textarea, /maxLength="12000"/i);
  assert.match(textarea, /required=""/);
  assert.match(textarea, /A cooking note\./);
});

test("shared recipe cards display the caller-selected snapshot and authored serving without scaling", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("../examples/catalogue.json", import.meta.url), "utf8"),
  );
  const recipe = {
    ...fixture.recipes[0].recipe,
    title: "Saved snapshot title",
    status: "archived",
  };
  const html = render(RecipeCard, {
    recipe,
    serving: { portions: 7, totalMinutes: 41 },
    eyebrow: "Saved version",
    actionLabel: "Open saved version",
    saved: true,
    onOpen() {},
  });
  assert.match(html, /<article/);
  assert.match(html, /data-slot="card"/);
  assert.match(html, /Saved snapshot title/);
  assert.match(html, /~41 min/);
  assert.match(html, /7 portions/);
  assert.match(html, /Archived/);
  assert.match(html, /Open saved version/);
  assert.match(html, /aria-hidden="true"/);
});

test("informational notices do not announce themselves as urgent errors", () => {
  const html = render(Notice, {}, "Your choices changed.");
  assert.match(html, /data-slot="alert-description"/);
  assert.doesNotMatch(html, /role="alert"/);
});

test("all recipe feature screens use shared UI controls rather than native styled replacements", () => {
  for (const name of ["browser", "discovery", "recipe", "preferences", "editor", "remixes"]) {
    const source = readFileSync(
      new URL(`../components/kitchen/${name}.tsx`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /<(?:input|select|textarea|button|details)\b/, name);
    assert.doesNotMatch(source, /className="(?:panel|button|field)(?:\s|")/, name);
  }
});
