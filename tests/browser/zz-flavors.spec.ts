import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { screenSession } from "../helpers/browser-session";
import type { IngredientEntry, RecipeDocument, Snapshot } from "../../lib/kitchen/client";
import type { FlavorEntry } from "../../lib/kitchen/flavors";
const fixture = JSON.parse(
  readFileSync(new URL("../../examples/catalogue.json", import.meta.url), "utf8"),
) as { ingredients: IngredientEntry[]; recipes: { id: string; recipe: RecipeDocument }[] };
const auth = () => ({ Authorization: `Bearer ${process.env.KITCHEN_TEST_TOKEN}` });
async function createRecipe(request: APIRequestContext, overrides: Partial<RecipeDocument> = {}) {
  const id = `flavor-test-${crypto.randomUUID()}`;
  const recipe = {
    ...structuredClone(fixture.recipes[0].recipe),
    title: `Flavour test ${id.slice(-8)}`,
    ...overrides,
  };
  const response = await request.post("/api/recipes", { headers: auth(), data: { id, recipe } });
  expect(response.status(), await response.text()).toBe(201);
  return { id, recipe };
}
async function readRecipe(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/recipes/${id}`, { headers: auth() });
  expect(response.status()).toBe(200);
  return (await response.json()).data as Snapshot;
}
test.beforeAll(async ({ request }) => {
  const pending = [...fixture.ingredients];
  const seen = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex((entry) =>
      entry.ingredient.components.every((id) => seen.has(id)),
    );
    if (index < 0) throw new Error("Invalid ingredient fixture graph.");
    const [entry] = pending.splice(index, 1);
    expect([201, 409]).toContain(
      (await request.post("/api/ingredients", { headers: auth(), data: entry })).status(),
    );
    seen.add(entry.id);
  }
});
test.beforeEach(async ({ browser, baseURL, context }) => {
  await context.addCookies(await screenSession(browser, baseURL));
});

test("friendly style search and profile preview do not silently rewrite a recipe", async ({
  page,
  request,
}) => {
  const entry = await createRecipe(request);
  await page.goto(`/#edit/${entry.id}`);
  await expect(page.getByLabel("Flavour profile", { exact: true })).toHaveValue("ginger-sesame");
  await expect(page.getByLabel("Flavour profile").locator('option[value="teriyaki"]')).toHaveCount(
    1,
  );
  await expect(page.getByLabel("Flavour profile ID", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Cooking technique", { exact: true })).toHaveValue("stir-fry");
  await page.getByLabel("Cuisine or style").selectOption("japanese");
  await expect(page.getByLabel("Flavour profile", { exact: true })).toHaveValue("ginger-sesame");
  await page.getByLabel("Search flavour combinations").fill("ginger");
  await expect(
    page.getByLabel("Flavour profile").locator('option[value="miso-ginger"]'),
  ).toHaveCount(1);
  await expect(page.getByLabel("Flavour profile").locator('option[value="teriyaki"]')).toHaveCount(
    0,
  );
  await page.getByLabel("Search flavour combinations").fill("");
  await page.getByLabel("Flavour profile", { exact: true }).selectOption("teriyaki");
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
  await page.getByRole("button", { name: "Create my combination", exact: true }).click();
  await page.getByLabel("Combination name", { exact: true }).fill(name);
  await page.getByLabel("Other seasoning names (comma-separated)").fill("Lemon zest, thyme");
  await page.getByLabel("Taste tags (comma-separated)").fill("citrusy, herby");
  await page.getByRole("button", { name: "Save combination", exact: true }).click();
  await expect(page.locator("[data-kitchen-flavor-preview]")).toContainText(name);
  await expect(page.getByLabel("Flavour profile")).toHaveValue(/^custom-/);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: entry.recipe.title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-kitchen-dish-art]").first()).toContainText(name);
  const saved = await readRecipe(request, entry.id);
  expect(saved.recipe.servings).toEqual(entry.recipe.servings);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByRole("button", { name: "Manage flavour combinations", exact: true }).click();
  await page.getByLabel("Cuisine or style").selectOption("mine");
  await page.getByLabel("Search flavour combinations").fill(name);
  await expect(page.locator("[data-kitchen-flavor-card]")).toHaveCount(1);
});

test("imported flavour and method IDs survive editing; naming an imported profile preserves its identity", async ({
  page,
  request,
}) => {
  const customId = `unusual-${crypto.randomUUID()}`;
  const entry = await createRecipe(request, { flavor: customId, method: "family-pan-method" });
  await page.goto(`/#edit/${entry.id}`);
  await expect(page.getByLabel("Flavour profile")).toHaveValue(customId);
  await expect(page.getByLabel("Cooking technique")).toHaveValue("family-pan-method");
  await page.getByRole("button", { name: "Describe this imported profile" }).click();
  await page.getByLabel("Combination name", { exact: true }).fill("Our family herb mix");
  await page.getByRole("button", { name: "Save combination", exact: true }).click();
  await expect(page.locator("[data-kitchen-flavor-preview]")).toContainText("Our family herb mix");
  // Describing the same flavour reference alone must not create a recipe revision.
  expect((await readRecipe(request, entry.id)).revision).toBe(1);
  await page.getByLabel("Recipe title", { exact: true }).fill("An imported recipe with a name");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "An imported recipe with a name", exact: true }),
  ).toBeVisible();
  const saved = await readRecipe(request, entry.id);
  expect(saved.recipe.flavor).toBe(customId);
  expect(saved.recipe.method).toBe("family-pan-method");
  expect(saved.recipe.servings).toEqual(entry.recipe.servings);
  await page.goto(`/#edit/${entry.id}`);
  await page.getByLabel("Meal type", { exact: true }).selectOption("breakfast");
  await expect(page.getByLabel("Breakfast format")).toHaveValue("family-pan-method");
  await page.getByLabel("Breakfast format").selectOption("wrap");
  await expect(page.getByLabel("Breakfast format")).toHaveValue("wrap");
});

test("custom profile conflicts retain drafts and use explicit reload; library fits narrow screens", async ({
  page,
  request,
}) => {
  await page.goto("/#flavours");
  await expect(page.getByRole("heading", { name: "Your flavour library." })).toBeVisible();
  await page.getByRole("button", { name: "Create a combination", exact: true }).click();
  const name = `Test herb mix ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Combination name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save combination", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `Saved ${name}` })).toBeVisible();
  await page.getByLabel("Search flavour combinations").fill(name);
  await page
    .locator("[data-kitchen-flavor-card]")
    .getByRole("button", { name: "Edit combination", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Save combination", exact: true })).toBeEnabled();
  await page.getByLabel("Flavour description").fill("Keep my unsaved wording");
  const list = await request.get("/api/flavor-profiles", { headers: auth() });
  const row = (await list.json()).data.items.find(
    (item: FlavorEntry) => item.profile.name === name,
  ) as FlavorEntry;
  const current = await request.get(`/api/flavor-profiles/${row.id}`, { headers: auth() });
  expect(
    (
      await request.put(`/api/flavor-profiles/${row.id}`, {
        headers: { ...auth(), "If-Match": current.headers().etag },
        data: { ...row.profile, description: "Changed in another tab" },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Save combination", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("changed in another tab");
  await expect(page.getByLabel("Flavour description")).toHaveValue("Keep my unsaved wording");
  await page.getByRole("button", { name: "Reload latest combination" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Reload latest", exact: true })
    .click();
  await expect(page.getByLabel("Flavour description")).toHaveValue("Changed in another tab");
  await page.getByRole("button", { name: "Cancel combination" }).click();
  await page.getByLabel("Cuisine or style").selectOption("korean");
  await page.getByLabel("Search flavour combinations").fill("");
  for (const width of [320, 390, 1360]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("[data-kitchen-flavor-card]")).toHaveCount(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/flavor-library-${width}.png`, fullPage: true });
  }
});

test("an unfinished combination survives session expiry, stays hidden while locked, and is not auto-saved", async ({
  page,
}) => {
  await page.goto("/#flavours");
  await page.getByRole("button", { name: "Create a combination", exact: true }).click();
  const name = `Retained flavour ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Combination name", { exact: true }).fill(name);
  expect(
    (
      await page.request.delete("/api/session", {
        headers: { Origin: "http://127.0.0.1:8787", "X-Kitchen-Request": "1" },
      })
    ).status(),
  ).toBe(204);
  await page.getByRole("button", { name: "Save combination", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByLabel("Combination name", { exact: true })).toBeHidden();
  const key = process.env.KITCHEN_TEST_TOKEN;
  if (!key) throw new Error("Use the isolated browser runner.");
  await page.getByLabel("Private kitchen key").fill(key);
  await page.getByRole("button", { name: "Unlock my kitchen" }).click();
  await expect(page.getByLabel("Combination name", { exact: true })).toHaveValue(name);
  await page.getByRole("button", { name: "Back to preferences" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(page.getByLabel("Combination name", { exact: true })).toHaveValue(name);
  await page.getByRole("button", { name: "Save combination", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `Saved ${name}` })).toBeVisible();
});
