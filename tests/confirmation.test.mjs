import assert from "node:assert/strict";
import test from "node:test";
import { ConfirmationController } from "../components/kitchen/confirmation-state.ts";

const options = {
  title: "Discard edits?",
  description: "Unsaved changes will be lost.",
  confirmLabel: "Discard",
  destructive: true,
};
const enabled = () => {
  const controller = new ConfirmationController();
  controller.setContext(true, "edit/one");
  return controller;
};

test("confirmations fail closed while locked and never replay when enabled", async () => {
  const controller = new ConfirmationController();
  assert.equal(await controller.request(options), false);
  controller.setContext(true, "edit/one");
  assert.equal(controller.getSnapshot(), null);
});

test("a decision is single-flight and an affirmative response resolves only once", async () => {
  const controller = enabled();
  const first = controller.request(options);
  const id = controller.getSnapshot().id;
  assert.equal(await controller.request({ ...options, title: "Second action" }), false);
  assert.equal(controller.getSnapshot().id, id);
  controller.respond(id, true);
  controller.respond(id, false);
  assert.equal(await first, true);
  assert.equal(controller.getSnapshot(), null);
});

test("cancelling a decision makes stale handlers harmless", async () => {
  const controller = enabled();
  const first = controller.request(options);
  const oldId = controller.getSnapshot().id;
  controller.cancel();
  const second = controller.request(options);
  const newId = controller.getSnapshot().id;
  controller.respond(oldId, true);
  assert.equal(controller.getSnapshot().id, newId);
  controller.respond(newId, false);
  assert.equal(await first, false);
  assert.equal(await second, false);
});

test("session expiry cancels pending decisions without replay on re-unlock", async () => {
  const controller = enabled();
  const decision = controller.request(options);
  const id = controller.getSnapshot().id;
  controller.setContext(false, "edit/one");
  controller.setContext(true, "edit/one");
  controller.respond(id, true);
  assert.equal(await decision, false);
  assert.equal(controller.getSnapshot(), null);
});

test("scope changes cancel pending decisions even while the session remains active", async () => {
  const controller = enabled();
  const decision = controller.request(options);
  controller.setContext(true, "all");
  assert.equal(await decision, false);
});

test("expiry in the same turn as approval invalidates the deferred continuation", async () => {
  const controller = enabled();
  const decision = controller.request(options);
  controller.respond(controller.getSnapshot().id, true);
  controller.setContext(false, "edit/one");
  controller.setContext(true, "edit/one");
  assert.equal(await decision, false);
});

test("owner unmount aborts its pending decision but never a later owner decision", async () => {
  const controller = enabled();
  const owner = new AbortController();
  const first = controller.request(options, owner.signal);
  owner.abort();
  assert.equal(await first, false);
  assert.equal(await controller.request(options, owner.signal), false);
  const second = controller.request(options);
  owner.abort();
  controller.respond(controller.getSnapshot().id, true);
  assert.equal(await second, true);
});

test("unchanged context does not cancel an in-progress confirmation", async () => {
  const controller = enabled();
  const decision = controller.request(options);
  controller.setContext(true, "edit/one");
  controller.respond(controller.getSnapshot().id, true);
  assert.equal(await decision, true);
});

test("all application confirmations use the shared service and native unload protection remains", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const files = readdirSync(new URL("../components/kitchen/", import.meta.url)).filter((file) =>
    file.endsWith(".tsx"),
  );
  for (const file of files)
    assert.doesNotMatch(
      readFileSync(new URL(`../components/kitchen/${file}`, import.meta.url), "utf8"),
      /window\.confirm\s*\(/,
      file,
    );
  const studio = readFileSync(new URL("../components/kitchen/studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /addEventListener\(['"]beforeunload['"]/);
  assert.match(studio, /event\.returnValue/);
});
