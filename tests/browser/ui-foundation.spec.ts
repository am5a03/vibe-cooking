import { expect, test } from "@playwright/test";

// Real unlock components cover the semantic theme. These small probes exercise
// native hidden/focus rules and root inheritance outside the kitchen/any data-slot.
const probes = `<div id="portal-probe" class="rounded-lg border bg-popover p-4 text-popover-foreground">Body-mounted content</div>
  <div id="hidden-probe" hidden class="flex"><button type="button">Hidden action</button></div>
  <button id="focus-probe" type="button">Native focus fallback</button>
  <div id="motion-probe" class="h-5 animate-pulse bg-muted transition-all before:animate-pulse before:content-['']"></div>`;

test("the final theme, hidden content, native focus and reduced motion work without legacy CSS", async ({
  page,
}, info) => {
  await page.goto("/");
  const region = page.getByRole("region", { name: "Come on in." });
  const input = region.getByLabel("Private kitchen key");
  await expect(input).toBeVisible();
  await page
    .locator("body")
    .evaluate((element, html) => element.insertAdjacentHTML("beforeend", html), probes);
  for (const width of [1360, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(page.locator(".kitchen-app")).toHaveCSS("background-color", "rgb(248, 246, 238)");
    await expect(region.locator('[data-slot="card"]')).toHaveCSS(
      "background-color",
      "rgb(255, 254, 249)",
    );
    await expect(input).toHaveCSS("height", "44px");
    await expect(input).toHaveCSS("min-height", "0px");
    await expect(input).toHaveCSS("font-size", width < 768 ? "16px" : "15px");
    await expect(region.getByRole("button", { name: "Unlock my kitchen" })).toHaveCSS(
      "background-color",
      "rgb(48, 94, 66)",
    );
    await expect(page.locator("#portal-probe")).toHaveCSS("background-color", "rgb(255, 254, 249)");
    await expect(page.locator("#portal-probe")).toHaveCSS("color", "rgb(40, 62, 48)");
    await expect(page.locator("#portal-probe")).toHaveCSS("font-family", /Arial/);
    await expect(page.locator("#hidden-probe")).toHaveCSS("display", "none");
    await expect(page.getByRole("button", { name: "Hidden action" })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`foundation-${width}.png`), fullPage: true });
  }
  await page.locator("#focus-probe").focus();
  await expect(page.locator("#focus-probe")).toHaveCSS("outline-style", "solid");
  await expect(page.locator("#focus-probe")).toHaveCSS("outline-width", "3px");
  await expect(page.locator("#focus-probe")).toHaveCSS("outline-color", "rgb(176, 122, 72)");
  await expect(page.locator("#focus-probe")).toHaveCSS("outline-offset", "3px");
  await input.focus();
  await expect(input).toHaveCSS("outline-style", "none");
  await expect(input).not.toHaveCSS("box-shadow", "none");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator("#portal-probe")).toHaveCSS("background-color", "rgb(255, 254, 249)");
  await expect(page.locator("#motion-probe")).toHaveCSS("animation-name", "none");
  await expect(page.locator("#motion-probe")).toHaveCSS("transition-property", "none");
  expect(
    await page
      .locator("#motion-probe")
      .evaluate((el) => getComputedStyle(el, "::before").animationName),
  ).toBe("none");
  await page.locator("#hidden-probe").evaluate((el) => el.removeAttribute("hidden"));
  await expect(page.locator("#hidden-probe")).toHaveCSS("display", "flex");
  await expect(page.getByRole("button", { name: "Hidden action" })).toBeVisible();
});
