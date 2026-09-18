import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tsImport } from "tsx/esm/api";

// Next preserves JSX for its compiler. These standalone render tests instead use
// the automatic JSX runtime, without changing the application's tsconfig.
const { Button, ErrorBox, Field, Loading, KitchenHeader, Unlock } = await tsImport(
  "./helpers/ui-components.ts",
  {
    parentURL: import.meta.url,
    tsconfig: fileURLToPath(new URL("./tsconfig.ui.json", import.meta.url)),
  },
);

const render = (component, props, ...children) =>
  renderToStaticMarkup(createElement(component, props, ...children));

test("Button forwards native button semantics and caller utility overrides", () => {
  const html = render(
    Button,
    { type: "submit", disabled: true, className: "h-11", "aria-label": "Save" },
    "Save",
  );
  assert.match(html, /data-slot="button"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-label="Save"/);
  assert.match(html, /\bh-11\b/);
  assert.doesNotMatch(html, /\bh-9\b/);
});

test("Field keeps native control props and an explicit sibling shadcn label", () => {
  const html = render(
    Field,
    { label: "Portions", wide: true },
    createElement(
      "select",
      { id: "portions", multiple: true, required: true, defaultValue: ["2"] },
      createElement("option", { value: "2" }, "Two portions"),
    ),
  );
  assert.match(html, /data-slot="field"/);
  assert.match(html, /col-span-full/);
  assert.match(html, /<label[^>]*data-slot="field-label"/);
  assert.match(html, /for="portions"/);
  assert.match(html, />Portions<\/label><select/);
  assert.match(html, /<select[^>]*id="portions"/);
  assert.match(html, /multiple=""/);
  assert.match(html, /required=""/);
  assert.doesNotMatch(html, /class="field wide"/);
});

test("shared feedback preserves a single alert and a text status with decorative skeletons", () => {
  assert.equal(render(ErrorBox, { message: "" }), "");
  const error = render(ErrorBox, { message: "Try again.", id: "save-error" });
  assert.equal([...error.matchAll(/role="alert"/g)].length, 1);
  assert.match(error, /id="save-error"/);
  assert.match(error, /data-slot="alert-description"/);
  assert.match(error, /Try again\./);
  const loading = render(Loading, { label: "Loading recipes…" });
  assert.match(loading, /<output[^>]*aria-live="polite"/);
  assert.match(loading, /aria-atomic="true"/);
  assert.match(loading, /aria-hidden="true"/);
  assert.equal([...loading.matchAll(/data-slot="skeleton"/g)].length, 3);
  assert.match(loading, /Loading recipes…/);
});

test("header exposes the current destination without introducing tab or menu semantics", () => {
  const props = { view: "saved", unlocked: true, locking: false, onNavigate() {}, onLock() {} };
  const header = render(KitchenHeader, props);
  assert.match(header, /<nav[^>]*aria-label="Main navigation"/);
  assert.equal([...header.matchAll(/aria-current="page"/g)].length, 1);
  assert.doesNotMatch(header, /role="(?:tab|tablist|menu|menuitem)"/);
  const locked = render(KitchenHeader, { ...props, unlocked: false });
  assert.doesNotMatch(locked, /<nav/);
  assert.match(locked, /aria-label="Vibe Cooking home"/);
});

test("unlock preserves native validation and exposes the expired-session message", () => {
  const html = render(Unlock, { expired: true, onUnlock() {} });
  assert.match(html, /<section[^>]*aria-labelledby=/);
  assert.match(html, /data-slot="card"/);
  assert.match(html, /data-slot="field"/);
  assert.match(html, /data-slot="input"/);
  assert.match(html, /type="password"/);
  assert.match(html, /minLength="32"/i);
  assert.match(html, /maxLength="256"/i);
  assert.match(html, /required=""/);
  assert.match(html, /type="submit"/);
  assert.match(html, /Welcome back\./);
  assert.match(html, /Unsaved changes are kept in this tab\./);
});
