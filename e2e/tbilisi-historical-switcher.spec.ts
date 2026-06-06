import { test, expect, type Page } from "@playwright/test";

/**
 * UX checks for the Tbilisi historical-map switcher.
 *
 * Per .lovable/plan.md:
 *  - one <select> drives map choice (none / 1898 / 1904)
 *  - desktop (≥1024px): panel pinned bottom-left, always visible
 *  - tablet/mobile (<1024px): collapsed into a pill button, opens on tap
 *  - selection round-trips through the URL (?hm=…)
 *
 * We don't wait for tiles to load (they may 404 in CI); we only assert UI
 * geometry + URL state.
 */

async function waitForOverlay(page: Page) {
  await page
    .locator(".pointer-events-none.absolute.inset-x-0.top-0")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(250);
}

/** Locator for the switcher's <select>. There is exactly one on the page. */
function selectLocator(page: Page) {
  return page.locator("select").first();
}

/** Locator for the mobile/tablet pill toggle. Hidden on lg+. */
function pillLocator(page: Page) {
  // The pill is the only button with aria-pressed reflecting historicalOn
  // inside the bottom-left switcher container.
  return page.locator("button[aria-expanded][aria-pressed]").first();
}

test.describe("/tbilisi historical switcher", () => {
  test("select round-trips through ?hm= and toggles raster on/off", async ({
    page,
    viewport,
  }) => {
    await page.goto("/tbilisi?lang=ru");
    await waitForOverlay(page);

    // On <lg viewports the panel is collapsed; open it first.
    if ((viewport?.width ?? 0) < 1024) {
      await pillLocator(page).click();
    }

    const select = selectLocator(page);
    await expect(select).toBeVisible();

    // Options must include exactly: none, 1898, 1904 (in some order).
    const optionValues = await select.locator("option").evaluateAll((els) =>
      (els as HTMLOptionElement[]).map((o) => o.value).sort(),
    );
    expect(optionValues).toEqual(["1898", "1904", "none"]);

    // Pick 1904 → URL gains hm=1904 and h=1.
    await select.selectOption("1904");
    await expect.poll(() => new URL(page.url()).searchParams.get("hm")).toBe("1904");
    await expect.poll(() => new URL(page.url()).searchParams.get("h")).toBe("1");

    // Pick "none" → h flips back to 0 (raster off). hm value is preserved
    // (it's the *last selected* map id, the raster is just hidden).
    await select.selectOption("none");
    await expect.poll(() => new URL(page.url()).searchParams.get("h")).toBe("0");
  });

  test("pill button is visible on <lg and hidden on lg+", async ({
    page,
    viewport,
  }) => {
    await page.goto("/tbilisi?lang=ru");
    await waitForOverlay(page);

    const pill = pillLocator(page);
    if ((viewport?.width ?? 0) < 1024) {
      await expect(pill).toBeVisible();
    } else {
      // On desktop the pill has `lg:hidden`; it must NOT be visible.
      await expect(pill).toBeHidden();
    }
  });

  test("switcher panel stays inside the viewport when open", async ({
    page,
    viewport,
  }) => {
    await page.goto("/tbilisi?lang=ru&hm=1904&h=1");
    await waitForOverlay(page);

    if ((viewport?.width ?? 0) < 1024) {
      await pillLocator(page).click();
    }

    const panel = page.locator("select").first().locator("..").locator("..");
    const box = await panel.boundingBox();
    const vp = viewport!;
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  });

  test("reload preserves the selected historical map", async ({
    page,
    viewport,
  }) => {
    await page.goto("/tbilisi?lang=ru&hm=1904&h=1");
    await waitForOverlay(page);

    if ((viewport?.width ?? 0) < 1024) {
      await pillLocator(page).click();
    }

    await expect(selectLocator(page)).toHaveValue("1904");

    await page.reload();
    await waitForOverlay(page);
    if ((viewport?.width ?? 0) < 1024) {
      await pillLocator(page).click();
    }
    await expect(selectLocator(page)).toHaveValue("1904");
  });
});
