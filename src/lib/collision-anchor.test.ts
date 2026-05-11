import { describe, it, expect } from "vitest";
import {
  pickAnchor,
  anchorRect,
  rectsOverlap,
  overlapArea,
  type Rect,
  type Anchor,
} from "./collision-anchor";

const C = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

const SIZE = { width: 140, height: 26 };
const MARGIN = 12;
// Common screens
const DESKTOP = C(0, 0, 1280, 800);
const MOBILE = C(0, 0, 390, 844);

describe("rectsOverlap / overlapArea", () => {
  it("returns false for disjoint rects", () => {
    expect(rectsOverlap(C(0, 0, 10, 10), C(20, 20, 30, 30))).toBe(false);
    expect(overlapArea(C(0, 0, 10, 10), C(20, 20, 30, 30))).toBe(0);
  });

  it("treats edge-touching rects as non-overlapping", () => {
    expect(rectsOverlap(C(0, 0, 10, 10), C(10, 0, 20, 10))).toBe(false);
    expect(overlapArea(C(0, 0, 10, 10), C(10, 0, 20, 10))).toBe(0);
  });

  it("computes the overlap area of intersecting rects", () => {
    expect(overlapArea(C(0, 0, 10, 10), C(5, 5, 15, 15))).toBe(25);
  });
});

describe("anchorRect", () => {
  it("places br at bottom-right inset by margin", () => {
    const r = anchorRect("br", DESKTOP, SIZE, MARGIN);
    expect(r.right).toBe(DESKTOP.right - MARGIN);
    expect(r.bottom).toBe(DESKTOP.bottom - MARGIN);
    expect(r.right - r.left).toBe(SIZE.width);
    expect(r.bottom - r.top).toBe(SIZE.height);
  });

  it("places tl at top-left inset by margin", () => {
    const r = anchorRect("tl", DESKTOP, SIZE, MARGIN);
    expect(r.left).toBe(DESKTOP.left + MARGIN);
    expect(r.top).toBe(DESKTOP.top + MARGIN);
  });
});

describe("pickAnchor — free corners", () => {
  it("returns the first priority anchor when no obstacles are present", () => {
    const res = pickAnchor({ container: DESKTOP, obstacles: [], size: SIZE });
    expect(res.anchor).toBe("br");
    expect(res.overlap).toBe(0);
  });

  it("falls through to bl when only the bottom-right corner is blocked", () => {
    // Legend in bottom-right (260×120, inset 12)
    const legend = C(1280 - 12 - 260, 800 - 12 - 120, 1280 - 12, 800 - 12);
    const res = pickAnchor({ container: DESKTOP, obstacles: [legend], size: SIZE });
    expect(res.anchor).toBe("bl");
    expect(res.overlap).toBe(0);
  });

  it("falls through to tr when bottom row is fully blocked", () => {
    const legend = C(1280 - 12 - 260, 800 - 12 - 120, 1280 - 12, 800 - 12);
    const detailCard = C(12, 800 - 12 - 200, 12 + 360, 800 - 12);
    const res = pickAnchor({
      container: DESKTOP,
      obstacles: [legend, detailCard],
      size: SIZE,
    });
    expect(res.anchor).toBe("tr");
    expect(res.overlap).toBe(0);
  });

  it("falls through to tl when bottom row + tr corner are blocked", () => {
    const legend = C(1280 - 12 - 260, 800 - 12 - 120, 1280 - 12, 800 - 12);
    const detailCard = C(12, 800 - 12 - 200, 12 + 360, 800 - 12);
    // MapLibre nav control top-right (~30×100)
    const navControl = C(1280 - 12 - 30, 12, 1280 - 12, 12 + 100);
    const res = pickAnchor({
      container: DESKTOP,
      obstacles: [legend, detailCard, navControl],
      size: SIZE,
    });
    expect(res.anchor).toBe("tl");
    expect(res.overlap).toBe(0);
  });
});

describe("pickAnchor — all corners blocked, choose minimum overlap", () => {
  it("returns the anchor with the smallest overlap area", () => {
    // Heavy occlusion at three corners, lightest at tl
    const big = (a: Anchor): Rect => {
      const r = anchorRect(a, DESKTOP, SIZE, MARGIN);
      // Expand by 50px to ensure full coverage
      return { left: r.left - 50, top: r.top - 50, right: r.right + 50, bottom: r.bottom + 50 };
    };
    // Tiny obstacle at tl — overlaps only a small slice
    const tinyAtTl: Rect = {
      left: DESKTOP.left + MARGIN,
      top: DESKTOP.top + MARGIN,
      right: DESKTOP.left + MARGIN + 10,
      bottom: DESKTOP.top + MARGIN + 10,
    };
    const res = pickAnchor({
      container: DESKTOP,
      obstacles: [big("br"), big("bl"), big("tr"), tinyAtTl],
      size: SIZE,
    });
    expect(res.anchor).toBe("tl");
    expect(res.overlap).toBeGreaterThan(0);
    expect(res.scores.tl).toBeLessThan(res.scores.br);
    expect(res.scores.tl).toBeLessThan(res.scores.bl);
    expect(res.scores.tl).toBeLessThan(res.scores.tr);
  });

  it("breaks ties by priority order", () => {
    const block = (a: Anchor) => {
      const r = anchorRect(a, DESKTOP, SIZE, MARGIN);
      return { ...r };
    };
    // Identical full-coverage obstacles at every corner
    const res = pickAnchor({
      container: DESKTOP,
      obstacles: [block("br"), block("bl"), block("tr"), block("tl")],
      size: SIZE,
      priority: ["tr", "tl", "bl", "br"],
    });
    expect(res.anchor).toBe("tr");
  });
});

describe("pickAnchor — realistic mobile layout (390×844)", () => {
  // Search bar at top (full width, ~56px tall)
  const searchBar = C(8, 8, 390 - 8, 8 + 56);
  // Chip bar at bottom (full width, ~44px tall)
  const chipBar = C(8, 844 - 8 - 44, 390 - 8, 844 - 8);

  it("falls through to a free top corner when only the chip bar blocks the bottom", () => {
    const res = pickAnchor({
      container: MOBILE,
      obstacles: [chipBar],
      size: SIZE,
    });
    // Top row is free → tr is the first free priority anchor
    expect(res.anchor).toBe("tr");
    expect(res.overlap).toBe(0);
  });

  it("picks bottom-right (priority) when every corner is blocked equally by full-width bars", () => {
    const tallSearch = C(0, 0, 390, 80);
    const res = pickAnchor({
      container: MOBILE,
      obstacles: [tallSearch, chipBar],
      size: SIZE,
    });
    // All corners overlap a full-width bar with identical area → priority wins
    expect(res.anchor).toBe("br");
    expect(res.scores.br).toBe(res.scores.bl);
    expect(res.scores.tr).toBe(res.scores.tl);
  });

  it("avoids the top bar via bottom corners when only the search bar is present", () => {
    const res = pickAnchor({
      container: MOBILE,
      obstacles: [searchBar],
      size: SIZE,
    });
    expect(res.anchor).toBe("br");
    expect(res.overlap).toBe(0);
  });
});

describe("pickAnchor — tooltips inside the container", () => {
  it("avoids a hover tooltip floating in the bottom-right region", () => {
    // Tooltip 200×80 hovering bottom-right area
    const tooltip = C(1280 - 12 - 200, 800 - 12 - 80, 1280 - 12, 800 - 12);
    const res = pickAnchor({ container: DESKTOP, obstacles: [tooltip], size: SIZE });
    expect(res.anchor).not.toBe("br");
    expect(res.overlap).toBe(0);
  });
});

describe("pickAnchor — container offset (non-origin)", () => {
  it("works when the container is not at (0,0)", () => {
    const offset: Rect = { left: 100, top: 50, right: 100 + 800, bottom: 50 + 600 };
    const legend = C(
      offset.right - 12 - 260,
      offset.bottom - 12 - 120,
      offset.right - 12,
      offset.bottom - 12,
    );
    const res = pickAnchor({ container: offset, obstacles: [legend], size: SIZE });
    expect(res.anchor).toBe("bl");
    expect(res.rect.left).toBe(offset.left + 12);
    expect(res.rect.bottom).toBe(offset.bottom - 12);
  });
});
