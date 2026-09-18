import { expect, test, type APIRequestContext, type Page, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { RecipeDocument } from "../../lib/kitchen/client";

const key = process.env.KITCHEN_TEST_TOKEN;
if (!key) throw new Error("Run via npm run test:browser against disposable local D1.");
const headers = { Authorization: `Bearer ${key}` };

async function fixture(request: APIRequestContext) {
  const prefix = `ui3-${randomUUID().slice(0, 8)}`;
  const ids = ["main", "base", "vegetable"].map((role) => `${prefix}-${role}`);
  for (const [index, id] of ids.entries()) {
    const response = await request.post("/api/ingredients", {
      headers,
      data: {
        id,
        ingredient: { name: `${prefix} ingredient ${index + 1}`, aliases: [], components: [] },
      },
    });
    expect(response.status(), await response.text()).toBe(201);
  }
  const recipe: RecipeDocument = {
    schemaVersion: 1,
    title: `${prefix} original`,
    description: "A test-only recipe with independently authored portions.",
    mode: "dinner",
    main: ids[0],
    flavor: "herb",
    method: "pan",
    status: "active",
    reviewStatus: "draft",
    prep: "good",
    prepNote: "Automated test fixture, not for cooking.",
    rationale: "Test rationale.",
    safetyNotes: [],
    storageNote: "",
    source: "Automated UI test.",
    servings: [2, 3].map((portions) => ({
      portions,
      activeMinutes: portions === 2 ? 12 : 15,
      totalMinutes: portions === 2 ? 19 : 27,
      equipment: ["pan"],
      capacity: "Test-only capacity.",
      batches: 1,
      trays: 0,
      ingredients: ids.map((ingredientId, index) => ({
        ingredientId,
        quantity: portions === 2 ? 100 : 175,
        unit: "g",
        role: (["main", "base", "vegetables"] as const)[index],
        preparation: "Test preparation.",
      })),
      steps: [
        { title: "First step", instruction: "Test-only first instruction." },
        { title: "Second step", instruction: "Test-only second instruction." },
      ],
    })),
  };
  const id = `${prefix}-original`;
  const alternative = { ...recipe, title: `${prefix} alternative`, flavor: "smoky" };
  for (const entry of [
    { id, recipe },
    { id: `${prefix}-alternative`, recipe: alternative },
  ]) {
    const response = await request.post("/api/recipes", { headers, data: entry });
    expect(response.status(), await response.text()).toBe(201);
  }
  return { prefix, ids, id, recipe, alternative };
}
async function unlock(page: Page, route = "all") {
  await page.goto(`/#${route}`);
  await page.getByLabel("Private kitchen key").fill(key as string);
  await page.getByRole("button", { name: "Unlock my kitchen" }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test("recipe screens use shadcn controls at mobile, tablet and desktop widths", async ({
  page,
  request,
}, info) => {
  test.setTimeout(180000);
  const data = await fixture(request);
  await unlock(page);
  for (const width of [320, 390, 768, 1360]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/#all");
    await page.getByLabel("Search recipe titles").fill(data.prefix);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator('.recipe-card[data-slot="card"]')).toHaveCount(2);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`catalogue-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: data.recipe.title, exact: true }).click();
    const portions = page.getByLabel("Portions", { exact: true });
    await expect(portions).toHaveAttribute("data-slot", "native-select");
    await expect(portions.locator("option")).toHaveCount(2);
    const check = page.getByRole("checkbox").first();
    await check.check();
    await expect(check).toHaveAttribute("data-slot", "checkbox");
    await portions.selectOption("3");
    await expect(check).not.toBeChecked();
    await expect(page.getByText("~27 min total", { exact: true })).toBeVisible();
    await expect(page.locator(".dish-art")).toHaveCSS("height", width < 640 ? "235px" : "280px");
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`detail-${width}.png`), fullPage: true });

    await page.goto(`/#variations/${data.id}`);
    await page.getByRole("button", { name: new RegExp(data.alternative.title) }).click();
    await expect(
      page.getByRole("button", { name: "Confirm connection", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Compare complete cooking steps" }).click();
    await expect(page.locator('[data-slot="collapsible-content"]')).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`variations-${width}.png`), fullPage: true });

    await page.goto("/#preferences");
    await expect(page.getByLabel("Breakfast portions", { exact: true })).toHaveAttribute(
      "data-slot",
      "input",
    );
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`preferences-${width}.png`), fullPage: true });

    await page.goto(`/#edit/${data.id}`);
    await expect(page.getByLabel("Recipe title", { exact: true })).toHaveValue(data.recipe.title);
    await page.getByRole("button", { name: "Add an ingredient to your catalogue" }).click();
    const multi = page.getByLabel("Contains these catalogue ingredients (optional)", {
      exact: true,
    });
    await expect(multi).toHaveAttribute("multiple", "");
    await expect(multi.locator("..").locator('[data-slot="native-select-icon"]')).toHaveCount(0);
    await expect(page.getByLabel("Description", { exact: true })).toHaveAttribute(
      "data-slot",
      "textarea",
    );
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`editor-${width}.png`), fullPage: true });

    await page.goto("/#discover");
    const ingredient = page.getByLabel("Include an ingredient");
    await expect(ingredient).toBeEnabled();
    await ingredient.selectOption(data.ids[0]);
    await page.getByLabel("Discovery portions").fill("3");
    await page.getByLabel("Maximum minutes", { exact: true }).fill("");
    await page.getByRole("button", { name: "Find meal ideas" }).click();
    await expect(page.locator('.recipe-card[data-slot="card"]')).toHaveCount(2);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`discovery-${width}.png`), fullPage: true });
  }
});

test("editor retains row identity, multiple ingredient selection, portion review and failed-save drafts", async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  await unlock(page, `edit/${data.id}`);
  const title = page.getByLabel("Recipe title", { exact: true });
  await expect(title).toHaveValue(data.recipe.title);
  await title.fill("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(await title.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  await title.fill(`${data.recipe.title} edited`);
  await page.getByRole("button", { name: "Add ingredient row", exact: true }).click();
  await page.getByRole("button", { name: "Add ingredient row", exact: true }).click();
  const fifth = page.getByLabel("Ingredient 5", { exact: true });
  await fifth.selectOption(data.ids[2]);
  const stableId = await fifth.getAttribute("id");
  await page.getByLabel("Remove ingredient 4", { exact: true }).click();
  await expect(page.getByLabel("Ingredient 4", { exact: true })).toHaveAttribute(
    "id",
    stableId as string,
  );
  await expect(page.getByLabel("Ingredient 4", { exact: true })).toHaveValue(data.ids[2]);
  await page.getByLabel("Remove ingredient 4", { exact: true }).click();

  await page.getByRole("button", { name: "Add an ingredient to your catalogue" }).click();
  await page.getByLabel("New ingredient name", { exact: true }).fill(`${data.prefix} compound`);
  await page
    .getByLabel("Contains these catalogue ingredients (optional)", { exact: true })
    .selectOption(data.ids.slice(0, 2));
  const creation = page.waitForRequest(
    (req) => req.url().endsWith("/api/ingredients") && req.method() === "POST",
  );
  await page.getByRole("button", { name: "Create ingredient", exact: true }).click();
  expect((await creation).postDataJSON().ingredient.components.sort()).toEqual(
    data.ids.slice(0, 2).sort(),
  );
  await expect(
    page.getByRole("status").filter({ hasText: `Added ${data.prefix} compound` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add portion size" }).click();
  await expect(page.getByLabel("Total minutes", { exact: true })).toHaveValue("19");
  const save = page.getByRole("button", { name: "Save changes", exact: true });
  await expect(save).toBeDisabled();
  await page.getByLabel("Number of portions", { exact: true }).fill("4");
  await page
    .getByLabel(
      "I have reviewed the quantities, timings, and steps for every new or changed portion size.",
    )
    .check();
  await expect(save).toBeEnabled();

  let pending: Route | undefined;
  const pattern = `**/api/recipes/${data.id}`;
  await page.route(pattern, (route) => {
    if (route.request().method() === "PUT") pending = route;
    else return route.continue();
  });
  await save.click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(title).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add an ingredient to your catalogue" }),
  ).toBeDisabled();
  await pending?.fulfill({
    status: 412,
    contentType: "application/json",
    body: JSON.stringify({ error: { message: "Version conflict." } }),
  });
  await expect(page.getByRole("alert").filter({ hasText: "changed in another tab" })).toBeVisible();
  await expect(title).toHaveValue(`${data.recipe.title} edited`);
  await expect(title).toBeEnabled();
  await page.unroute(pattern);
  await save.click();
  await expect(
    page.getByRole("heading", { name: `${data.recipe.title} edited`, exact: true }),
  ).toBeVisible();
  const response = await request.get(`/api/recipes/${data.id}`, { headers });
  const saved = (await response.json()).data.recipe as RecipeDocument;
  expect(saved.servings.find((serving) => serving.portions === 4)?.totalMinutes).toBe(19);
  expect(saved.servings).toHaveLength(3);
});

test("preference checkboxes preserve mutual exclusion, busy disabling and failed-save state", async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  await unlock(page, "preferences");
  const love = page.getByLabel(`Love ${data.prefix} ingredient 1`, { exact: true });
  const exclude = page.getByLabel(`Exclude ${data.prefix} ingredient 1`, { exact: true });
  await love.check();
  await exclude.check();
  await expect(love).not.toBeChecked();
  await love.focus();
  await page.keyboard.press("Space");
  await expect(love).toBeChecked();
  await expect(exclude).not.toBeChecked();
  let pending: Route | undefined;
  await page.route("**/api/preferences", (route) => {
    if (route.request().method() === "PUT") pending = route;
    else return route.continue();
  });
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(love).toBeDisabled();
  await expect(exclude).toBeDisabled();
  await pending?.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: { message: "Temporary preference failure." } }),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary preference failure." }),
  ).toBeVisible();
  await expect(love).toBeChecked();
  await expect(exclude).not.toBeChecked();
  await page.unroute("**/api/preferences");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preferences saved." })).toBeVisible();
  await page.reload();
  await expect(love).toBeChecked();
  await expect(exclude).not.toBeChecked();
});

test("catalogue search, pagination, empty state and retry work with shared recipe cards", async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  for (let index = 0; index < 26; index++) {
    const response = await request.post("/api/recipes", {
      headers,
      data: {
        id: `${data.prefix}-page-${index}`,
        recipe: { ...data.recipe, title: `Paging ${data.prefix} ${index}` },
      },
    });
    expect(response.status(), await response.text()).toBe(201);
  }
  await unlock(page);
  const search = page.getByLabel("Search recipe titles");
  await search.fill(`Paging ${data.prefix}`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(24);
  await page.getByRole("button", { name: "Load more recipes" }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(26);
  await search.fill(`no-match-${data.prefix}`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A fresh page in your cookbook." })).toBeVisible();
  await expect(page.locator(".recipe-card")).toHaveCount(0);
  let fail = true;
  await page.route("**/api/recipes?*", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Catalogue temporarily unavailable." } }),
      });
    } else await route.continue();
  });
  await search.fill(`Paging ${data.prefix}`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Catalogue temporarily unavailable." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry loading recipes" }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(24);
});
