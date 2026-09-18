import { expect, test } from '@playwright/test';

// Fixture-only markup: no new route and no migrated product components in Phase 1.
const fixture = '<section id="ui-foundation-fixture" class="panel">' +
  '<h2 id="legacy-heading">Legacy kitchen heading</h2>' +
  '<p id="legacy-copy">Legacy muted text</p>' +
  '<button id="legacy-control" type="button" class="button primary">Legacy action</button>' +
  '<input id="legacy-input" aria-label="Legacy input" />' +
  '<div data-slot="card" id="new-card" class="rounded-xl border bg-card p-6 text-card-foreground">' +
  '<h2 id="new-heading" class="font-sans text-xl font-semibold">Primitive heading</h2>' +
  '<p id="new-copy" class="text-sm text-muted-foreground">Primitive description</p>' +
  '<button id="new-control" data-slot="button" type="button" class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">New action</button>' +
  '<input id="new-input" data-slot="input" aria-label="New input" class="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base md:text-sm" />' +
  '<button id="nested-collision" type="button" class="button primary">Legacy class inside primitive</button>' +
  '<div id="muted-surface" data-slot="skeleton" class="h-4 animate-pulse bg-muted"></div>' +
  '</div><div id="hidden-region" hidden><div data-slot="card" class="flex">Must stay hidden</div></div></section>';
const portal = '<div id="portal-fixture" data-slot="popover-content" class="rounded-lg border bg-popover p-4 text-popover-foreground">Body-mounted content</div>' +
  '<button id="outside-collision" type="button" class="button primary">Outside kitchen</button>';

test('UI foundation: legacy parity, primitive isolation and root portal theme', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.unlock-card')).toBeVisible();
  await page.locator('.kitchen-app').evaluate((element, html) => element.insertAdjacentHTML('beforeend', html), fixture);
  await page.locator('body').evaluate((element, html) => element.insertAdjacentHTML('beforeend', html), portal);

  for (const width of [1360, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(page.locator('#legacy-input')).toHaveCSS('min-height', '43px');
    await expect(page.locator('#legacy-control')).toHaveCSS('min-height', '42px');
    await expect(page.locator('#legacy-control')).toHaveCSS('background-color', 'rgb(48, 94, 66)');
    await expect(page.locator('#legacy-copy')).toHaveCSS('color', 'rgb(104, 115, 98)');
    await expect(page.locator('#legacy-heading')).toHaveCSS('font-family', /Georgia/);
    await expect(page.locator('#new-input')).toHaveCSS('min-height', '0px');
    await expect(page.locator('#new-input')).toHaveCSS('height', '36px');
    await expect(page.locator('#new-input')).toHaveCSS('padding-top', '4px');
    await expect(page.locator('#new-input')).toHaveCSS('font-size', width < 768 ? '16px' : '14px');
    await expect(page.locator('#new-control')).toHaveCSS('background-color', 'rgb(48, 94, 66)');
    await expect(page.locator('#new-control')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(page.locator('#new-control')).toHaveCSS('min-height', '0px');
    await expect(page.locator('#new-heading')).toHaveCSS('font-family', /Arial/);
    await expect(page.locator('#new-heading')).toHaveCSS('font-size', '20px');
    await expect(page.locator('#new-copy')).toHaveCSS('margin-bottom', '0px');
    await expect(page.locator('#nested-collision')).toHaveCSS('min-height', '0px');
    await expect(page.locator('#outside-collision')).toHaveCSS('min-height', '0px');
    await expect(page.locator('#muted-surface')).toHaveCSS('background-color', 'rgb(233, 237, 222)');
    await expect(page.locator('#portal-fixture')).toHaveCSS('background-color', 'rgb(255, 254, 249)');
    await expect(page.locator('#portal-fixture')).toHaveCSS('color', 'rgb(40, 62, 48)');
    await expect(page.locator('#portal-fixture')).toHaveCSS('font-family', /Arial/);
    await expect(page.locator('#hidden-region')).toHaveCSS('display', 'none');
    await page.screenshot({ path: testInfo.outputPath(`foundation-${width}.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('#portal-fixture')).toHaveCSS('background-color', 'rgb(255, 254, 249)');
  await expect(page.locator('#muted-surface')).toHaveCSS('animation-name', 'none');
  await page.locator('#new-control').focus();
  await expect(page.locator('#new-control')).toHaveCSS('outline-style', 'none');
  await expect(page.locator('#new-control')).not.toHaveCSS('box-shadow', 'none');
});
