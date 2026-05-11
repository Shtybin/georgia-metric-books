// Pure collision-aware anchor picker.
// Given a container rect, a list of obstacle rects, and a target element size,
// returns the corner anchor that minimises overlap with obstacles.
//
// Anchor codes:
//   "br" — bottom-right, "bl" — bottom-left,
//   "tr" — top-right,    "tl" — top-left.

export type Anchor = "br" | "bl" | "tr" | "tl";

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PickAnchorInput {
  /** The container the anchored element lives in. */
  container: Rect;
  /** Rectangles of UI obstacles in the same coordinate space. */
  obstacles: Rect[];
  /** Target element size. */
  size: { width: number; height: number };
  /** Inset from the container edge in CSS pixels. Default 12. */
  margin?: number;
  /**
   * Order in which anchors are tried. The first anchor with zero overlap wins.
   * If every anchor collides, the one with the smallest total overlap area wins,
   * breaking ties by priority order. Defaults to br → bl → tr → tl.
   */
  priority?: readonly Anchor[];
}

export interface PickAnchorResult {
  anchor: Anchor;
  /** Projected rect for the chosen anchor. */
  rect: Rect;
  /** Total overlap area (in px²) at the chosen anchor. 0 means a free corner. */
  overlap: number;
  /** Per-anchor overlap totals for debugging/inspection. */
  scores: Record<Anchor, number>;
}

const DEFAULT_PRIORITY: readonly Anchor[] = ["br", "bl", "tr", "tl"];

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

export function anchorRect(
  anchor: Anchor,
  container: Rect,
  size: { width: number; height: number },
  margin = 12,
): Rect {
  const { width: w, height: h } = size;
  const right = anchor[1] === "r";
  const bottom = anchor[0] === "b";
  const left = right ? container.right - margin - w : container.left + margin;
  const top = bottom ? container.bottom - margin - h : container.top + margin;
  return { left, right: left + w, top, bottom: top + h };
}

export function pickAnchor(input: PickAnchorInput): PickAnchorResult {
  const margin = input.margin ?? 12;
  const priority = input.priority ?? DEFAULT_PRIORITY;

  const scores: Record<Anchor, number> = { br: 0, bl: 0, tr: 0, tl: 0 };
  const rects: Record<Anchor, Rect> = {
    br: anchorRect("br", input.container, input.size, margin),
    bl: anchorRect("bl", input.container, input.size, margin),
    tr: anchorRect("tr", input.container, input.size, margin),
    tl: anchorRect("tl", input.container, input.size, margin),
  };

  for (const a of priority) {
    let total = 0;
    for (const o of input.obstacles) {
      if (rectsOverlap(rects[a], o)) total += overlapArea(rects[a], o);
    }
    scores[a] = total;
  }

  let best: Anchor = priority[0];
  let bestScore = Infinity;
  for (const a of priority) {
    const s = scores[a];
    if (s === 0) {
      return { anchor: a, rect: rects[a], overlap: 0, scores };
    }
    if (s < bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return { anchor: best, rect: rects[best], overlap: bestScore, scores };
}
