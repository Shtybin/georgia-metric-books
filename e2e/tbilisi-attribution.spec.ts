import { test, expect, type Page } from "@playwright/test";

/**
 * MapLibre's compact attribution control sometimes starts expanded. We
 * force-collapse it on init (TbilisiMap removes `maplibregl-compact-show`
 * after attaching the control). This spec guards that behaviour.
 */

async function waitForMap(page: Page) {
  await page
    .locator(".maplibregl-ctrl-attrib")
    .first()
    .waitFor({ state: "attached", timeout: 20_000 });
  await page.waitForTimeout(500);
}

test.describe("/tbilisi attribution control", () => {
  test("starts collapsed (no maplibregl-compact-show)", async ({ page }) => {
    await page.goto("/tbilisi?lang=ru");
    await waitForMap(page);

    const expanded = await page
      .locator(".maplibregl-ctrl-attrib.maplibregl-compact-show")
      .count();
    expect(expanded, "attribution must not start expanded").toBe(0);
  });

  test("clicking the (i) toggle expands and collapses the attribution", async ({
    page,
  }) => {
    await page.goto("/tbilisi?lang=ru");
    await waitForMap(page);

    const attrib = page.locator(".maplibregl-ctrl-attrib").first();
    // The compact toggle button is rendered by MapLibre inside the control.
    const toggle = attrib.locator("button.maplibregl-ctrl-attrib-button").first();
    // Some MapLibre versions render the button as the container itself; if
    // the inner button is missing, fall back to clicking the container.
    const target = (await toggle.count()) > 0 ? toggle : attrib;

    await target.click();
    await expect(attrib).toHaveClass(/maplibregl-compact-show/);

    await target.click();
    await expect(attrib).not.toHaveClass(/maplibregl-compact-show/);
  });
});
