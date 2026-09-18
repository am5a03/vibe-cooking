import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RecipeDocument } from "../../lib/kitchen/client";

const key = process.env.KITCHEN_TEST_TOKEN;
const state = process.env.KITCHEN_TEST_STATE;
if (!key || !state) throw new Error("Run through npm run test:browser on disposable local D1.");
const headers = { Authorization: `Bearer ${key}` };
// Share the real screen-test session, not login attempts. Never write cookies to artifacts.
const cookiePath = join(state, "ui-phase3-cookies.json");
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
test.beforeAll(async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Missing isolated browser baseURL.");
  const session = await browser.newContext({ baseURL });
  try {
    if (existsSync(cookiePath))
      await session.addCookies(JSON.parse(readFileSync(cookiePath, "utf8")));
    const current = await session.request.get("/api/session");
    if (!(await current.json()).data.authenticated) {
      const response = await session.request.post("/api/session", {
        headers: { Origin: new URL(baseURL).origin, "X-Kitchen-Request": "1" },
        data: { key },
      });
      expect(response.status(), await response.text()).toBe(200);
    }
    cookies = await session.cookies();
    writeFileSync(cookiePath, JSON.stringify(cookies), { mode: 0o600 });
  } finally {
    await session.close();
  }
});
test.beforeEach(async ({ context, page }) => {
  await context.addCookies(cookies);
  const session = await context.request.get("/api/session");
  expect(session.ok(), "The shared screen-test session must remain valid.").toBe(true);
  expect((await session.json()).data.authenticated).toBe(true);
  page.on("dialog", async (dialog) => {
    // App confirmations must no longer use native dialogs. Keep native unload warnings.
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
  });
});
test.afterEach(async ({ context }) => {
  // The real re-unlock flow revokes its previous cookie. Carry the verified
  // replacement into the next serial test, including a restarted worker.
  // Do not manufacture sessions, weaken throttling, or log cookie values.
  const session = await context.request.get("/api/session");
  expect(session.ok(), "Could not verify the session after the confirmation workflow.").toBe(true);
  if (!(await session.json()).data.authenticated) return;
  const current = await context.cookies();
  expect(current.some((cookie) => cookie.httpOnly)).toBe(true);
  cookies = current;
  writeFileSync(cookiePath, JSON.stringify(current), { mode: 0o600 });
});

async function fixture(request: APIRequestContext) {
  const id = `confirm-${randomUUID().slice(0, 8)}`;
  const response = await request.get("/api/recipes?limit=1", { headers });
  expect(response.ok()).toBe(true);
  const recipe = (await response.json()).data.items[0].recipe as RecipeDocument;
  const copy = { ...recipe, title: `${id} original`, status: "active" as const };
  const created = await request.post("/api/recipes", { headers, data: { id, recipe: copy } });
  expect(created.status(), await created.text()).toBe(201);
  return { id, recipe: copy };
}
async function open(page: Page, route: string) {
  await page.goto(`/#${route}`);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
}
async function accept(page: Page, name: string) {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function cancel(page: Page, name = "Cancel") {
  await page.getByRole("alertdialog").getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

test("dirty navigation keeps the committed route, traps focus, and supports cancel/confirm at all widths", async ({
  page,
  request,
}, info) => {
  const { id } = await fixture(request);
  await open(page, `edit/${id}`);
  const title = page.getByLabel("Recipe title", { exact: true });
  await title.fill("A draft that stays until confirmed");
  const destination = page
    .getByRole("navigation")
    .getByRole("button", { name: "Discover", exact: true });
  for (const width of [320, 390, 768, 1360]) {
    await page.setViewportSize({ width, height: 800 });
    await destination.click();
    const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
    await expect(dialog).toBeVisible();
    // Review the settled surface, not an intermediate translucent entrance frame.
    await expect(dialog).toHaveCSS("opacity", "1");
    await expect(page.locator('[data-slot="alert-dialog-overlay"]')).toHaveCSS("opacity", "1");
    await expect(page).toHaveURL(new RegExp(`#edit/${id}$`));
    await expect(dialog).toHaveCSS("background-color", "rgb(255, 254, 249)");
    expect(await dialog.evaluate((element) => element.closest(".kitchen-app") === null)).toBe(true);
    const keep = dialog.getByRole("button", { name: "Keep editing", exact: true });
    await expect(keep).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "Leave without saving", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(keep).toBeFocused();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`confirmation-${width}.png`), fullPage: false, animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(destination).toBeFocused();
    await expect(title).toHaveValue("A draft that stays until confirmed");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await destination.click();
  await expect(page.getByRole("alertdialog")).toHaveCSS("animation-name", "none");
  await accept(page, "Leave without saving");
  await expect(page).toHaveURL(/#discover$/);
  await expect(page.getByRole("heading", { name: "What sounds good?" })).toBeVisible();
});

test("expiry dismisses body-mounted dialogs, preserves drafts, and does not replay a cancelled destination", async ({
  page,
  request,
}, info) => {
  const { id } = await fixture(request);
  await open(page, `edit/${id}`);
  const title = page.getByLabel("Recipe title", { exact: true });
  await title.fill("Preserved through modal expiry");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "All recipes", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("kitchen:expired")));
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(
    page.locator('[data-slot="alert-dialog-content"], [data-slot="alert-dialog-overlay"]'),
  ).toHaveCount(0);
  await expect(title).toBeHidden();
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
  await expect(page.getByLabel("Private kitchen key")).toBeFocused();
  await page.evaluate(() => {
    window.location.hash = "preferences";
  });
  await expect(page).toHaveURL(new RegExp(`#edit/${id}$`));
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("expired-dialog-dismissed.png") });
  await page.getByLabel("Private kitchen key").fill(key as string);
  await page.getByRole("button", { name: "Unlock my kitchen" }).click();
  await expect(title).toBeVisible();
  await expect(title).toHaveValue("Preserved through modal expiry");
  await expect(page).toHaveURL(new RegExp(`#edit/${id}$`));
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Preferences", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await cancel(page, "Keep editing");
});

test("hash and history navigation cancel safely and a newer destination invalidates the older decision", async ({
  page,
  request,
}) => {
  const { id } = await fixture(request);
  await open(page, `recipe/${id}`);
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  const title = page.getByLabel("Recipe title", { exact: true });
  await title.fill("History-safe draft");
  await page.evaluate(() => history.back());
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await cancel(page, "Keep editing");
  await expect(page).toHaveURL(new RegExp(`#edit/${id}$`));
  await expect(title).toHaveValue("History-safe draft");
  await page.evaluate(() => {
    window.location.hash = "all";
  });
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "preferences";
  });
  await expect(page).toHaveURL(new RegExp(`#edit/${id}$`));
  await accept(page, "Leave without saving");
  await expect(page).toHaveURL(/#preferences$/);
  await expect(page.getByLabel("Breakfast portions", { exact: true })).toBeVisible();
});

test("archive and restore require approval, report failed mutations, and never submit twice", async ({
  page,
  request,
}) => {
  const { id } = await fixture(request);
  await open(page, `recipe/${id}`);
  const archive = page.getByRole("button", { name: "Archive recipe", exact: true });
  let writes = 0;
  let pending: Route | undefined;
  await page.route(`**/api/recipes/${id}`, async (route) => {
    if (route.request().method() === "DELETE") {
      writes++;
      pending = route;
    } else await route.continue();
  });
  await archive.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  expect(writes).toBe(0);
  await cancel(page);
  await expect(archive).toBeFocused();
  expect(writes).toBe(0);
  await archive.click();
  const confirm = page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Archive recipe", exact: true });
  await confirm.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(() => writes).toBe(1);
  await expect(archive).toBeDisabled();
  await pending?.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ error: { message: "Test archive failure." } }),
  });
  await expect(page.getByRole("alert").filter({ hasText: "Test archive failure." })).toBeVisible();
  await expect(archive).toBeEnabled();
  await page.unroute(`**/api/recipes/${id}`);
  await archive.click();
  await accept(page, "Archive recipe");
  const restore = page.getByRole("button", { name: "Restore recipe", exact: true });
  await expect(restore).toBeVisible();
  await restore.click();
  await accept(page, "Restore recipe");
  await expect(archive).toBeVisible();
});

test("removing a bookmark keeps the recipe and cooking note", async ({ page, request }) => {
  const { id, recipe } = await fixture(request);
  const initial = await request.get(`/api/recipes/${id}/note`, { headers });
  const tag = initial.headers().etag;
  if (!tag) throw new Error("Missing note revision.");
  const savedNote = await request.put(`/api/recipes/${id}/note`, {
    headers: { ...headers, "If-Match": tag },
    data: { text: "Keep this note after removing the bookmark.", verdict: "repeat" },
  });
  expect(savedNote.ok()).toBe(true);
  const bookmark = await request.put(`/api/favourites/${id}`, {
    headers,
    data: { recipeRevision: 1, portions: recipe.servings[0].portions },
  });
  expect(bookmark.ok()).toBe(true);
  await open(page, `favourite/${id}`);
  await expect(page.getByLabel("Your cooking note")).toHaveValue(
    "Keep this note after removing the bookmark.",
  );
  const remove = page.getByRole("button", { name: "Remove bookmark", exact: true });
  await remove.click();
  await cancel(page);
  await expect(remove).toBeFocused();
  await remove.click();
  await accept(page, "Remove bookmark");
  await expect(page).toHaveURL(/#saved$/);
  expect((await request.get(`/api/recipes/${id}`, { headers })).ok()).toBe(true);
  const note = await request.get(`/api/recipes/${id}/note`, { headers });
  expect((await note.json()).data.note.text).toBe("Keep this note after removing the bookmark.");
});

test("portion removal and note reload discard only after explicit approval", async ({
  page,
  request,
}) => {
  const { id } = await fixture(request);
  await open(page, `edit/${id}`);
  await page.getByRole("button", { name: "Add portion size", exact: true }).click();
  const portions = page.getByLabel("Number of portions", { exact: true });
  const added = await portions.inputValue();
  await page.getByRole("button", { name: "Remove this portion size", exact: true }).click();
  await cancel(page);
  await expect(portions).toHaveValue(added);
  await page.getByRole("button", { name: "Remove this portion size", exact: true }).click();
  await accept(page, "Remove portion size");
  await expect(portions).not.toHaveValue(added);
  await page.evaluate((target) => {
    window.location.hash = target;
  }, `recipe/${id}`);
  // Removing the newly added profile restores the original data. Other draft flags
  // may still require a navigation confirmation; answer it without bypassing guards.
  const leave = page.getByRole("alertdialog");
  if (await leave.isVisible()) await accept(page, "Leave without saving");
  const note = page.getByLabel("Your cooking note", { exact: true });
  await expect(note).toBeEnabled();
  const original = await note.inputValue();
  await note.fill("Unsaved note for reload testing");
  await page.route(`**/api/recipes/${id}/note`, async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Test note failure." } }),
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Test note failure." })).toBeVisible();
  await page.getByRole("button", { name: "Reload latest data", exact: true }).click();
  await cancel(page);
  await expect(note).toHaveValue("Unsaved note for reload testing");
  await page.getByRole("button", { name: "Reload latest data", exact: true }).click();
  await accept(page, "Discard and reload");
  await expect(note).toHaveValue(original);
});

test("preference reload retains unsaved values on cancel and discards on approval", async ({
  page,
}) => {
  await open(page, "preferences");
  const portions = page.getByLabel("Breakfast portions", { exact: true });
  await expect(portions).toBeVisible();
  const original = await portions.inputValue();
  const changed = original === "8" ? "9" : "8";
  await portions.fill(changed);
  await page.route("**/api/preferences", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Test preference failure." } }),
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Test preference failure." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reload preferences", exact: true }).click();
  await cancel(page);
  await expect(portions).toHaveValue(changed);
  await page.getByRole("button", { name: "Reload preferences", exact: true }).click();
  await accept(page, "Discard and reload");
  await expect(portions).toHaveValue(original);
});

test("unlinking a variation removes only the link and preserves both recipes", async ({
  page,
  request,
}) => {
  const { id, recipe } = await fixture(request);
  const targetId = `${id}-alternative`;
  const target = {
    ...recipe,
    title: `${id} alternative`,
    flavor: recipe.flavor === "smoky" ? "herb" : "smoky",
  };
  const created = await request.post("/api/recipes", {
    headers,
    data: { id: targetId, recipe: target },
  });
  expect(created.status(), await created.text()).toBe(201);
  const connection = await request.post("/api/remixes", {
    headers,
    data: { sourceId: id, sourceRevision: 1, targetId, targetRevision: 1, axis: "flavor" },
  });
  expect(connection.status(), await connection.text()).toBe(201);
  await open(page, `variations/${id}`);
  const remove = page.getByRole("button", {
    name: `Remove connection to ${target.title}`,
    exact: true,
  });
  await remove.click();
  await cancel(page);
  await expect(remove).toBeVisible();
  await remove.click();
  await accept(page, "Remove connection");
  await expect(remove).toHaveCount(0);
  for (const recipeId of [id, targetId])
    expect((await request.get(`/api/recipes/${recipeId}`, { headers })).ok()).toBe(true);
});

test("native beforeunload protection still prevents accidental refresh", async ({
  page,
  request,
}) => {
  const { id } = await fixture(request);
  await open(page, `edit/${id}`);
  const title = page.getByLabel("Recipe title", { exact: true });
  await title.fill("Do not discard on refresh");
  let warnings = 0;
  page.on("dialog", (dialog) => {
    if (dialog.type() === "beforeunload") warnings++;
  });
  await page.reload({ timeout: 5000 }).catch(() => {});
  expect(warnings).toBe(1);
  await expect(title).toHaveValue("Do not discard on refresh");
});

test("an in-flight logout cannot discard an expired draft or lock a newly unlocked session", async ({
  page,
  request,
}) => {
  const { id } = await fixture(request);
  await open(page, `edit/${id}`);
  const title = page.getByLabel("Recipe title", { exact: true });
  await title.fill("Survive an old logout response");
  let deletes = 0;
  let pending: Route | undefined;
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "DELETE") {
      deletes++;
      pending = route;
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await cancel(page, "Keep editing");
  expect(deletes).toBe(0);
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await accept(page, "Lock and discard");
  await expect.poll(() => deletes).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("kitchen:expired")));
  await expect(page.getByLabel("Private kitchen key")).toBeVisible();
  await page.getByLabel("Private kitchen key").fill(key as string);
  await page.getByRole("button", { name: "Unlock my kitchen" }).click();
  await expect(title).toBeVisible();
  if (!pending) throw new Error("Missing held logout.");
  await pending.fulfill({ status: 204 });
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(title).toHaveValue("Survive an old logout response");
  await expect(page.getByRole("button", { name: "Lock", exact: true })).toBeEnabled();
});