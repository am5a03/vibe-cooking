import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { RecipeDocument } from "../../lib/kitchen/types";
import { screenSession } from "../helpers/browser-session";

const key = process.env.KITCHEN_TEST_TOKEN;
if (!key) throw new Error("Use the isolated local browser runner.");
const headers = { Authorization: `Bearer ${key}` };
const fixture = JSON.parse(
  readFileSync(new URL("../../examples/catalogue.json", import.meta.url), "utf8"),
);

test.beforeEach(async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated test URL.");
  await screenSession(context, baseURL);
  page.on("dialog", async (dialog) => {
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
  });
});

async function createRecipe(request: APIRequestContext, changes: Partial<RecipeDocument> = {}) {
  const pending = [...fixture.ingredients];
  const inserted = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex((item) =>
      item.ingredient.components.every((id: string) => inserted.has(id)),
    );
    if (index < 0) throw new Error("Invalid ingredient fixture.");
    const [entry] = pending.splice(index, 1);
    const response = await request.post("/api/ingredients", { headers, data: entry });
    expect([201, 409]).toContain(response.status());
    inserted.add(entry.id);
  }
  const id = `flavour-test-${randomUUID()}`;
  const recipe = { ...fixture.recipes[0].recipe, title: `Flavour test ${id}`, ...changes };
  const response = await request.post("/api/recipes", { headers, data: { id, recipe } });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).data as { id: string; revision: number; recipe: RecipeDocument };
}
const readRecipe = async (request: APIRequestContext, id: string) =>
  (await (await request.get(`/api/recipes/${id}`, { headers })).json()).data;

test("friendly style search and profile preview do not silently rewrite a recipe", async ({
  page,
  request,
}) => {
  const entry = await createRecipe(request);
  await page.goto(`/#edit/${entry.id}`);
  await expect(page.getByLabel("Flavour profile", { exact: true })).toBeEnabled();
  await page.getByLabel("Cuisine or style", { exact: true }).selectOption("japanese");
  const flavour = page.getByLabel("Flavour profile", { exact: true });
  await expect(flavour).toHaveValue("ginger-sesame");
  await expect(flavour.locator("option[value=teriyaki]")).toHaveCount(1);
  await expect(flavour.locator("option[value=basil-pesto]")).toHaveCount(0);
  await page.getByLabel("Search flavour combinations").fill("miso");
  await expect(flavour.locator("option[value=teriyaki]")).toHaveCount(0);
  await expect(flavour.locator("option[value=miso-ginger]")).toHaveCount(1);
  await expect(flavour).toHaveValue("ginger-sesame");
  await page.getByLabel("Search flavour combinations").fill("");
  await flavour.selectOption("teriyaki");
  await expect(page.locator("[data-kitchen-flavor-preview]")).toContainText("Teriyaki glaze");
  await expect(page.locator("[data-kitchen-flavor-preview]")).toContainText("Mirin");
  await page.screenshot({ path: "test-results/flavor-editor-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: entry.recipe.title, exact: true })).toBeVisible();
  const saved = await readRecipe(request, entry.id);
  expect(saved.recipe.flavor).toBe("teriyaki");
  expect(saved.recipe.servings).toEqual(entry.recipe.servings);
  expect(saved.recipe.method).toBe(entry.recipe.method);
});

test("create a named combination inside the recipe editor and see its name after reload", async ({
  page,
  request,
}) => {
  const entry = await createRecipe(request);
  const name = `My citrus dressing ${entry.id.slice(-6)}`;
  await page.goto(`/#edit/${entry.id}`);
  await page.getByRole("button", { name: "Create my own combination" }).click();
  await page.getByLabel("Combination name").fill(name);
  await page.getByLabel("Other seasoning names (comma-separated)").fill("lemon zest, dill");
  await page.getByRole("button", { name: "Save combination", exact: true }).click();
  await expect(page.locator("[data-kitchen-flavor-form]")).toHaveCount(0);
  await expect(page.locator("[data-kitchen-flavor-preview]")).toContainText(name);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: entry.recipe.title, exact: true })).toBeVisible();
  const saved = await readRecipe(request, entry.id);
  expect(saved.recipe.flavor).toMatch(/^custom-/);
  expect(saved.recipe.servings).toEqual(entry.recipe.servings);
  await page.reload();
  await expect(page.locator("main")).toContainText(name);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByRole("button", { name: "Manage flavour combinations" }).click();
  await page.getByLabel("Cuisine or style", { exact: true }).selectOption("mine");
  await page.getByLabel("Search flavour combinations").fill(name);
  await expect(page.locator("[data-kitchen-flavor-card]")).toHaveCount(1);
  await expect(page.locator("[data-kitchen-flavor-card]")).toContainText(name);
});

test("imported flavour and method IDs survive editing; naming an imported profile preserves its identity", async ({
  page,
  request,
}) => {
  const legacy = `family-${randomUUID().slice(0, 8)}`;
  const entry = await createRecipe(request, { flavor: legacy, method: "family-technique" });
  await page.goto(`/#edit/${entry.id}`);
  await expect(page.getByLabel("Flavour profile", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Flavour profile", { exact: true })).toHaveValue(legacy);
  await expect(page.getByLabel("Cooking technique")).toHaveValue("family-technique");
  await page.getByRole("button", { name: "Describe this imported profile" }).click();
  await page.getByLabel("Combination name").fill("Our family herb blend");
  await page.getByRole("button", { name: "Save combination", exact: true }).click();
  await expect(page.locator("[data-kitchen-flavor-form]")).toHaveCount(0);
  expect((await readRecipe(request, entry.id)).revision).toBe(1);
  await expect(page.getByLabel("Flavour profile", { exact: true })).toHaveValue(legacy);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const saved = await readRecipe(request, entry.id);
  expect(saved.recipe.flavor).toBe(legacy);
  expect(saved.recipe.method).toBe("family-technique");
  expect(saved.recipe.servings).toEqual(entry.recipe.servings);
  const breakfast = await createRecipe(request, { mode: "breakfast", method: "toast" });
  await page.goto(`/#edit/${breakfast.id}`);
  await expect(page.getByLabel("Breakfast format")).toHaveValue("toast");
  await page.getByLabel("Breakfast format").selectOption("wrap");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: breakfast.recipe.title, exact: true })).toBeVisible();
  expect((await readRecipe(request, breakfast.id)).recipe.method).toBe("wrap");
});

test("custom profile conflicts retain drafts and use explicit reload; library fits narrow screens", async ({
  page,
  request,
}) => {
  const id = `custom-${randomUUID()}`;
  const profile = {
    name: `Test herb mix ${id.slice(-8)}`,
    description: "Original notes",
    styles: [],
    tasteTags: [],
    keyIngredients: [],
    applications: [],
    usage: "",
  };
  const created = await request.post("/api/flavor-profiles", { headers, data: { id, profile } });
  expect(created.status()).toBe(201);
  await page.goto("/#flavours");
  await page.getByLabel("Search flavour combinations").fill(profile.name);
  await page.getByRole("button", { name: "Edit combination", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save combination", exact: true })).toBeEnabled();
  await page.getByLabel("Flavour description").fill("Keep my unsaved wording");
  const current = await request.get(`/api/flavor-profiles/${id}`, { headers });
  expect(
    (
      await request.put(`/api/flavor-profiles/${id}`, {
        headers: { ...headers, "If-Match": current.headers().etag },
        data: { ...profile, description: "A newer description" },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Save combination", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Edit my combination", exact: true }).getByRole("alert"),
  ).toContainText("changed in another tab");
  await expect(page.getByLabel("Flavour description")).toHaveValue("Keep my unsaved wording");
  await page.getByRole("button", { name: "Reload latest combination" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Discard and reload", exact: true })
    .click();
  await expect(page.getByLabel("Flavour description")).toHaveValue("A newer description");
  await page.getByRole("button", { name: "Cancel combination", exact: true }).click();
  await page.getByLabel("Search flavour combinations").fill("");
  await page.getByLabel("Cuisine or style", { exact: true }).selectOption("korean");
  await expect(page.locator("[data-kitchen-flavor-card]")).toHaveCount(2);
  for (const width of [320, 390, 1360]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(page.getByRole("heading", { name: "Your flavour library." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/flavor-library-${width}.png`, fullPage: true });
  }
});

test("an unfinished combination survives session expiry, stays hidden while locked, and is not auto-saved", async ({
  page,
  context,
}) => {
  await page.goto("/#flavours");
  await page.getByRole("button", { name: "New flavour combination", exact: true }).click();
  const name = `Unsaved citrus ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Combination name").fill(name);
  const removed = await context.request.delete("/api/session", {
    headers: { Origin: "http://127.0.0.1:8787", "X-Kitchen-Request": "1" },
  });
  expect(removed.status()).toBe(204);
  await page.evaluate(() => window.dispatchEvent(new Event("kitchen:expired")));
  await expect(page.getByLabel("Private kitchen key")).toBeVisible();
  await expect(page.getByLabel("Combination name")).toBeHidden();
  await page.getByLabel("Private kitchen key").fill(key as string);
  await page.getByRole("button", { name: "Unlock my kitchen" }).click();
  await expect(page.getByLabel("Combination name")).toHaveValue(name);
  await page.getByRole("button", { name: "Back to preferences" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Combination name")).toHaveValue(name);
  await page.getByRole("button", { name: "Save combination", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toContainText(name);
});
