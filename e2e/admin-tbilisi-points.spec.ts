import { test, expect, type Page } from "@playwright/test";

/**
 * Admin → Tbilisi tab smoke. We assert:
 *  - the historical-map <select> in the admin panel only lists tile-backed
 *    entries (1898 + 1904) — no placeholder years like 1735/1850/1920.
 *  - on first open, church markers render immediately (count > 0).
 *
 * If /admin redirects to /auth (no test session set up in this CI), the
 * test self-skips so it doesn't block the suite. Wire up
 * PLAYWRIGHT_ADMIN_STORAGE_STATE in CI to enable full coverage.
 */

async function ensureSignedIn(page: Page): Promise<boolean> {
  await page.goto("/admin");
  await page.waitForLoadState("domcontentloaded");
  const url = new URL(page.url());
  if (url.pathname.startsWith("/auth") || url.pathname === "/login") {
    test.skip(true, "admin requires authenticated session (set up storageState)");
    return false;
  }
  return true;
}

test.describe("/admin → Tbilisi tab", () => {
  test("historical-map dropdown lists only attached tile maps", async ({
    page,
  }) => {
    if (!(await ensureSignedIn(page))) return;

    // Try to click the Tbilisi tab. Tab label varies by lang; match by text.
    const tab = page.getByRole("tab", { name: /тбилиси|tbilisi|თბილისი/i }).first();
    if ((await tab.count()) > 0) {
      await tab.click();
    }

    // Look for any <select> on the panel that holds at least one of the
    // tile-map ids. There may be other selects (filters), so pick the one
    // whose options include "1898".
    await page.waitForTimeout(500);
    const selects = page.locator("select");
    const count = await selects.count();
    let mapSelect = null as ReturnType<typeof page.locator> | null;
    for (let i = 0; i < count; i++) {
      const values = await selects
        .nth(i)
        .locator("option")
        .evaluateAll((els) => (els as HTMLOptionElement[]).map((o) => o.value));
      if (values.includes("1898")) {
        mapSelect = selects.nth(i);
        break;
      }
    }
    expect(mapSelect, "Tbilisi map <select> not found in admin panel").not.toBeNull();
    if (!mapSelect) return;

    const values = await mapSelect
      .locator("option")
      .evaluateAll((els) => (els as HTMLOptionElement[]).map((o) => o.value).sort());

    // Must include 1898 + 1904 and MUST NOT include the placeholder years.
    expect(values).toEqual(expect.arrayContaining(["1898", "1904"]));
    for (const placeholder of ["1735", "1850", "1920"]) {
      expect(values, `placeholder ${placeholder} must be hidden`).not.toContain(
        placeholder,
      );
    }
  });

  test("church markers render on first open of the Tbilisi tab", async ({
    page,
  }) => {
    if (!(await ensureSignedIn(page))) return;

    const tab = page.getByRole("tab", { name: /тбилиси|tbilisi|თბილისი/i }).first();
    if ((await tab.count()) > 0) {
      await tab.click();
    }

    // Markers are MapLibre HTML markers — count via the maplibregl-marker class.
    const markers = page.locator(".maplibregl-marker");
    await expect.poll(() => markers.count(), { timeout: 15_000 }).toBeGreaterThan(
      0,
    );
  });
});
