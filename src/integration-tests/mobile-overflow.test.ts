/**
 * Static guard tests for mobile overlay containment.
 *
 * Rendering MapView / TbilisiMap in jsdom is impractical (Leaflet, MapLibre,
 * fetches, async data). Instead we assert the source contains the exact
 * Tailwind class patterns that keep buttons, legends, banners and the donate
 * dialog from spilling past viewport edges on phones (<= 414px wide).
 *
 * If a future edit removes one of these clamps (e.g. drops `inset-x-`, swaps
 * `max-w-[92vw]` for a fixed `w-[…]`, or removes `truncate` from a long
 * label container), these tests fail and surface the regression before it
 * ships.
 *
 * Targeted invariants per surface:
 *   - Top toolbars span via `inset-x-0` with padded gutter (`p-3` / `p-4`).
 *   - Floating centered pills cap at `max-w-[92vw]` (or `w-[min(...vw,...)]`).
 *   - Bottom mobile rows use symmetric `inset-x-*` + `sm:hidden`.
 *   - Desktop side panels use `w-[min(NNvw,NNNpx)]` (vw-bounded).
 *   - DonateDialog crypto address container uses `max-w-full` + `break-all`.
 *   - Long confession labels are `truncate` with explicit `max-w-[...]`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, "..", rel), "utf8");

const mapView = read("components/map/MapView.tsx");
const tbilisi = read("components/map/TbilisiMap.tsx");
const donate = read("components/DonateButton.tsx");

// Helper: assert a Tailwind utility appears with proper edge-clamping context.
const hasClamp = (src: string, re: RegExp) => expect(src).toMatch(re);

describe("MapView — mobile overlays stay inside the viewport", () => {
  it("top toolbar spans inset-x-0 with gutter padding (no horizontal overflow)", () => {
    hasClamp(
      mapView,
      /pointer-events-none absolute inset-x-0 top-0[^"]*p-3[^"]*sm:p-4/,
    );
  });

  it("centered status pills cap at max-w-[92vw]", () => {
    // Two banner pills (search results + zoom hint) both clamp width.
    const matches = mapView.match(/max-w-\[92vw\]/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("bottom mobile bucket row uses symmetric inset and is mobile-only", () => {
    hasClamp(
      mapView,
      /pointer-events-auto absolute inset-x-2 bottom-2[^"]*sm:hidden/,
    );
  });

  it("desktop legend column is vw-bounded (won't exceed 92vw on narrow desktops)", () => {
    hasClamp(mapView, /w-\[min\(92vw,260px\)\]/);
  });

  it("mobile detail card is vw-bounded with min() clamp", () => {
    hasClamp(mapView, /w-\[min\(92vw,360px\)\]/);
  });
});

describe("TbilisiMap — mobile overlays stay inside the viewport", () => {
  it("top toolbar spans inset-x-0 with gutter padding", () => {
    hasClamp(
      tbilisi,
      /pointer-events-none absolute inset-x-0 top-0[^"]*p-3[^"]*sm:p-4/,
    );
  });

  it("bottom toolbar spans inset-x-0 with gutter padding", () => {
    hasClamp(
      tbilisi,
      /pointer-events-none absolute inset-x-0 bottom-0[^"]*p-3[^"]*sm:p-4/,
    );
  });

  it("confession filter row uses symmetric left-3 right-3 clamp", () => {
    hasClamp(tbilisi, /left-3 right-3 top-\[3\.25rem\][^"]*overflow-auto/);
  });

  it("centered mobile detail card uses w-[min(420px,calc(100%-1.5rem))]", () => {
    hasClamp(tbilisi, /w-\[min\(420px,calc\(100%-1\.5rem\)\)\]/);
  });

  it("long confession labels truncate with explicit max-w", () => {
    expect(tbilisi).toMatch(/max-w-\[120px\] truncate/);
    expect(tbilisi).toMatch(/max-w-\[160px\] truncate/);
  });
});

describe("DonateButton/Dialog — crypto address stays inside the modal", () => {
  it("address container uses max-w-full + break-all to avoid horizontal overflow", () => {
    hasClamp(donate, /max-w-full break-all[^"]*font-mono/);
  });
});

describe("Regression sentinels — patterns that would break mobile layout", () => {
  it("MapView never anchors a mobile overlay at a fixed pixel width > 360", () => {
    // Catch e.g. `w-[420px]` on a mobile-visible element. Allowed: w-[min(...)].
    const fixedWideMobile = mapView.match(
      /className="[^"]*\bw-\[(?:36[1-9]|3[7-9]\d|[4-9]\d{2,}|\d{4,})px\][^"]*"/g,
    );
    // Filter out the ones gated by sm:/md:/lg: (desktop-only).
    const offenders = (fixedWideMobile ?? []).filter(
      (c) => !/\b(?:sm|md|lg|xl):/.test(c),
    );
    expect(offenders).toEqual([]);
  });

  it("TbilisiMap never anchors a mobile overlay at a fixed pixel width > 360", () => {
    const fixedWideMobile = tbilisi.match(
      /className="[^"]*\bw-\[(?:36[1-9]|3[7-9]\d|[4-9]\d{2,}|\d{4,})px\][^"]*"/g,
    );
    const offenders = (fixedWideMobile ?? []).filter(
      (c) => !/\b(?:sm|md|lg|xl):/.test(c),
    );
    expect(offenders).toEqual([]);
  });
});
