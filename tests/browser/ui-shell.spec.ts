import { expect, test, type Route } from "@playwright/test";

const key = process.env.KITCHEN_TEST_TOKEN;
if (!key) throw new Error("Use npm run test:browser with isolated local D1.");

// These exercise real rendered components. Only the failure/busy responses are
// intercepted; successful unlock, navigation and relocking use the local Worker.
test("shadcn unlock: responsive card, labelled native input and visible keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Private kitchen key", { exact: true });
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("data-slot", "input");
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveAttribute("autocomplete", "current-password");
  await expect(input).toHaveAttribute("minlength", "32");
  await expect(input).toHaveAttribute("maxlength", "256");
  await expect(input).toHaveAttribute("required", "");
  const region = page.getByRole("region", { name: "Come on in." });
  const card = region.locator('[data-slot="card"]');
  await expect(card).toBeVisible();
  const submit = page.getByRole("button", { name: "Unlock my kitchen" });
  await expect(submit).toHaveAttribute("type", "submit");
  await expect(submit).toHaveAttribute("data-slot", "button");
  for (const width of [1360, 1001, 1000, 768, 681, 680, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(submit).toHaveCSS("height", "44px");
    await expect(input).toHaveCSS("height", "44px");
    await expect(input).toHaveCSS("font-size", width < 768 ? "16px" : "15px");
    await expect(card).toHaveCSS("background-color", "rgb(255, 254, 249)");
    // These are the original shell breakpoints, not Tailwind's sm/lg defaults.
    const layout = page.locator("[data-kitchen-unlock-layout]");
    const story = page.locator("[data-kitchen-unlock-story]");
    await expect(layout).toHaveCSS("display", width <= 680 ? "block" : "grid");
    await expect(layout).toHaveCSS("margin-top", width <= 680 ? "35px" : "70px");
    await expect(layout).toHaveCSS("padding-left", width <= 680 ? "18px" : "30px");
    await expect(layout).toHaveCSS("max-width", width <= 680 ? "480px" : "1080px");
    await expect(story.locator("p")).toHaveCSS("display", width <= 680 ? "none" : "block");
    await expect(story.locator("h1")).toHaveCSS("font-family", /Georgia/);
    await expect(story.locator("em")).toHaveCSS("color", "rgb(111, 128, 91)");
    if (width > 680) await expect(layout).toHaveCSS("column-gap", width <= 1000 ? "45px" : "90px");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/unlock-after-${width}.png`, fullPage: true });
  }
  await input.focus();
  await expect(input).toBeFocused();
  await expect(input).not.toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await expect(submit).not.toHaveCSS("box-shadow", "none");
  await page.getByText("First time here?", { exact: true }).click();
  await expect(card.locator("details")).toHaveAttribute("open", "");
  await expect(card.getByText("npm run db:migrate:local", { exact: true })).toBeVisible();
});

test("unlock retains required validation, guards repeated submission, announces errors and clears the key", async ({
  page,
}) => {
  let posts = 0;
  let pending: Route | undefined;
  await page.route("**/api/session", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1;
    pending = route;
    // Held deliberately until the assertions have observed the loading state.
  });
  await page.goto("/");
  const input = page.getByLabel("Private kitchen key", { exact: true });
  await expect(input).toBeVisible();
  await page.getByRole("button", { name: "Unlock my kitchen" }).click();
  expect(await input.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(
    true,
  );
  expect(posts).toBe(0);
  await input.fill("x".repeat(32));
  await input.press("Enter");
  await expect.poll(() => posts).toBe(1);
  try {
    await expect(page.getByRole("button", { name: "Unlocking…", exact: true })).toBeDisabled();
    await expect(input).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("status")).toHaveText("Unlocking your kitchen…");
    await page.locator("form").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    expect(posts).toBe(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("form svg.animate-spin")).toHaveCSS("animation-name", "none");
  } finally {
    if (pending)
      await pending.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "unauthorized", message: "That kitchen key was not accepted." },
        }),
      });
  }
  // Next also renders a global route-announcer alert. Assert only form feedback.
  const alert = page.getByRole("region", { name: "Come on in." }).getByRole("alert");
  await expect(alert).toHaveCount(1);
  await expect(alert).toHaveText("That kitchen key was not accepted.");
  await expect(alert).toHaveAttribute("data-slot", "alert");
  await expect(input).toHaveValue("");
  await expect(input).toBeEnabled();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  expect(await input.getAttribute("aria-describedby")).toBe(await alert.getAttribute("id"));
  await expect(page.getByRole("button", { name: "Unlock my kitchen" })).toBeEnabled();
  await page.screenshot({ path: "test-results/unlock-error.png", fullPage: true });
  await page.unroute("**/api/session");
  await input.fill(key);
  await input.press("Enter");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
});

test("shell keeps navigation, native field labels and dirty-route protection through lock and expiry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Private kitchen key").fill(key);
  await page.getByRole("button", { name: "Unlock my kitchen" }).click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toBeVisible();
  for (const width of [1360, 1001, 1000, 768, 681, 680, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await nav.getByRole("button", { name: "Preferences", exact: true }).click();
    await expect(nav.getByRole("button", { name: "Preferences", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("button", { name: "Discover", exact: true })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
    const portions = page.getByLabel("Breakfast portions", { exact: true });
    await expect(portions).toBeVisible();
    await expect(portions).toHaveAttribute("data-slot", "input");
    await expect(portions).toHaveCSS("height", width < 768 ? "44px" : "40px");
    const workspace = page.locator("main[data-kitchen-workspace]");
    const footer = page.locator("[data-kitchen-footer]");
    await expect(workspace).toHaveCSS(
      "padding-left",
      width <= 680 ? "18px" : width <= 1000 ? "25px" : "40px",
    );
    await expect(workspace).toHaveCSS(
      "padding-top",
      width <= 680 ? "32px" : width <= 1000 ? "35px" : "45px",
    );
    await expect(workspace).toHaveCSS(
      "padding-bottom",
      width <= 680 ? "45px" : width <= 1000 ? "55px" : "70px",
    );
    await expect(footer).toHaveCSS("flex-direction", width <= 680 ? "column" : "row");
    await expect(footer).toHaveCSS("color", "rgb(104, 115, 98)");
    const linkedLabel = page.locator("label").filter({ hasText: /^Breakfast portions$/ });
    await expect(linkedLabel).toHaveAttribute("data-slot", "field-label");
    for (const button of await nav.getByRole("button").all()) await expect(button).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/shell-after-${width}.png`, fullPage: true });
  }
  await nav.getByRole("button", { name: "All recipes", exact: true }).click();
  await page.getByRole("button", { name: "Add a recipe", exact: true }).click();
  const title = page.getByLabel("Recipe title", { exact: true });
  await title.fill("Phase 2 unsaved draft");
  await nav.getByRole("button", { name: "Discover", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(page).toHaveURL(/#new$/);
  await expect(title).toHaveValue("Phase 2 unsaved draft");
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(title).toHaveValue("Phase 2 unsaved draft");
  await page.evaluate(() => window.dispatchEvent(new Event("kitchen:expired")));
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(title).toBeHidden();
  await expect(nav).toBeHidden();
  await page.getByLabel("Private kitchen key").fill(key);
  await page.getByRole("button", { name: "Unlock my kitchen" }).click();
  await expect(title).toHaveValue("Phase 2 unsaved draft");
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Lock and discard", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Come on in." })).toBeVisible();
  await expect(nav).toBeHidden();
});

test("shared loading uses decorative skeletons and an announced status", async ({ page }) => {
  let pending: Route | undefined;
  await page.route("**/api/session", (route) => {
    pending = route;
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Opening your kitchen…");
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(3);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const skeleton of await page.locator('[data-slot="skeleton"]').all())
    await expect(skeleton).toHaveCSS("animation-name", "none");
  await expect.poll(() => Boolean(pending)).toBe(true);
  await pending?.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { authenticated: false } }),
  });
  await expect(page.getByLabel("Private kitchen key")).toBeVisible();
});
