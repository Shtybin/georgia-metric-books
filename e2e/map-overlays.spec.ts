import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Visual / overflow checks for the map routes.
 *
 * We don't snapshot pixels (map tiles are non-deterministic). Instead we
 * assert geometry: every overlay button, legend, banner and floating panel
 * stays inside the viewport on the target device, with a small tolerance for
 * sub-pixel rounding.
 *
 * Targets:
 *   - /map        — Georgia metric books atlas (MapView)
 *   - /tbilisi    — Tbilisi historical overlay (TbilisiMap)
 *
 * At mobile widths (375, 390) the overlays MUST clamp to the viewport.
 * At desktop (1280) we only check the overlays exist and are reachable.
 */

const TOLERANCE = 1; // px — allow sub-pixel rounding

/** Assert a locator's bounding box is fully inside the viewport. */
async function expectInsideViewport(page: Page, locator: Locator, name: string) {
  const count = await locator.count();
  expect(count, `${name}: expected at least one element`).toBeGreaterThan(0);

  const vp = page.viewportSize();
  if (!vp) throw new Error("no viewport");

  for (let i = 0; i < count; i++) {
    const el = locator.nth(i);
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    if (!box) continue; // element exists but not laid out (e.g. display:none ancestor)

    expect(
      box.x,
      `${name}[${i}]: left edge ${box.x} should be >= 0`,
    ).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(
      box.y,
      `${name}[${i}]: top edge ${box.y} should be >= 0`,
    ).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(
      box.x + box.width,
      `${name}[${i}]: right edge ${box.x + box.width} should be <= viewport width ${vp.width}`,
    ).toBeLessThanOrEqual(vp.width + TOLERANCE);
    expect(
      box.y + box.height,
      `${name}[${i}]: bottom edge ${box.y + box.height} should be <= viewport height ${vp.height}`,
    ).toBeLessThanOrEqual(vp.height + TOLERANCE);
  }
}

/** Page should never produce a horizontal scrollbar on mobile. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `document scrollWidth ${overflow.scrollWidth} should not exceed clientWidth ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + TOLERANCE);
}

/**
 * Wait for the map overlay UI to settle. We don't wait for tiles (they may
 * 404 against the public tile host in CI); we just wait for the toolbar
 * to render — that's all the overflow checks need.
 */
async function waitForOverlay(page: Page) {
  // The top overlay toolbar is rendered immediately by React, regardless
  // of map tile loading state.
  await page.locator(".pointer-events-none.absolute.inset-x-0.top-0").first()
    .waitFor({ state: "visible", timeout: 15_000 });
  // Give layout a tick to settle after fonts load.
  await page.waitForTimeout(250);
}

for (const route of ["/map", "/tbilisi"] as const) {
  test.describe(`${route} overlay containment`, () => {
    test("top toolbar stays inside the viewport", async ({ page }) => {
      await page.goto(`${route}?lang=ru`);
      await waitForOverlay(page);

      await expectInsideViewport(
        page,
        page.locator(".pointer-events-none.absolute.inset-x-0.top-0").first(),
        "top toolbar",
      );
    });

    test("every interactive overlay button stays inside the viewport", async ({
      page,
    }) => {
      await page.goto(`${route}?lang=ru`);
      await waitForOverlay(page);

      // All buttons rendered inside any absolute overlay layer.
      const buttons = page.locator(
        ".pointer-events-auto button, .pointer-events-auto a[role=button], .pointer-events-auto a[href]",
      );
      await expectInsideViewport(page, buttons, "overlay button");
    });

    test("page does not produce a horizontal scrollbar", async ({ page }) => {
      await page.goto(`${route}?lang=ru`);
      await waitForOverlay(page);
      await expectNoHorizontalScroll(page);
    });
  });
}

test.describe("/map mobile-only legend row", () => {
  test("bottom bucket legend stays inside the viewport on mobile", async ({
    page,
    viewport,
  }) => {
    test.skip((viewport?.width ?? 0) >= 640, "mobile-only legend (sm:hidden)");

    await page.goto("/map?lang=ru");
    await waitForOverlay(page);

    await expectInsideViewport(
      page,
      page.locator(".pointer-events-auto.absolute.inset-x-2.bottom-2").first(),
      "mobile bucket legend",
    );
  });
});

test.describe("/tbilisi confession filter row", () => {
  test("confession filter chips stay inside the viewport", async ({ page }) => {
    await page.goto("/tbilisi?lang=ru");
    await waitForOverlay(page);

    // The confession bar uses left-3 right-3 with overflow-auto for chip scroll.
    const filter = page.locator(".left-3.right-3.overflow-auto").first();
    await expectInsideViewport(page, filter, "confession filter row");
  });
});
