import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { deriveFindings } from "./aiAuditFindings";

/**
 * Property-based regression tests for the "years" finding pipeline.
 *
 * Invariants we want to GUARANTEE for every (card, ai_response) input:
 *
 *  I1. A "years" finding is NEVER emitted when the proposed range would
 *      shorten any side of the existing [startYear, endYear].
 *  I2. A "years" finding is NEVER emitted unless yearsRaw is a fully
 *      trilingual object with ru, en, ka all present and non-empty.
 *  I3. When a "years" finding IS emitted, the resulting proposed
 *      startYear/endYear must be at least as wide as the card's existing
 *      range (i.e. proposed.startYear <= card.startYear and
 *      proposed.endYear >= card.endYear).
 *  I4. yearsRaw on the emitted finding is preserved byte-for-byte across
 *      ru/en/ka (no language is silently dropped).
 *  I5. Non-years-related keys are not produced as a side-effect of a
 *      years_correction payload.
 */

const yearStr = (a: number, b: number) =>
  a === b ? String(a) : `${a}-${b}`;

const cardArb = fc.record({
  startYear: fc.integer({ min: 1800, max: 1920 }),
  endYear: fc.integer({ min: 1800, max: 1920 }),
}).map(({ startYear, endYear }) => {
  const lo = Math.min(startYear, endYear);
  const hi = Math.max(startYear, endYear);
  return {
    settlement: { ru: "x", en: "x", ka: "x" },
    church: { ru: "y", en: "y", ka: "y" },
    region: { ru: "Тифлисская губ.", en: "Tiflis" },
    uezd: { ru: "Тифлисский уезд", en: "Tbilisskiy uezd" },
    yearsRaw: { ru: yearStr(lo, hi), en: yearStr(lo, hi), ka: yearStr(lo, hi) },
    startYear: lo,
    endYear: hi,
    missingRaw: { ru: "", en: "", ka: "" },
  };
});

// Multiple plausible shapes of yearsRaw the AI might emit
const yearsRawArb = fc.oneof(
  // Full trilingual same-string
  fc.tuple(fc.integer({ min: 1700, max: 2000 }), fc.integer({ min: 1700, max: 2000 })).map(
    ([a, b]) => {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const s = yearStr(lo, hi);
      return { ru: s, en: s, ka: s };
    },
  ),
  // Trilingual but languages disagree (still parseable from .ru)
  fc.tuple(
    fc.integer({ min: 1700, max: 2000 }),
    fc.integer({ min: 1700, max: 2000 }),
    fc.integer({ min: 1700, max: 2000 }),
    fc.integer({ min: 1700, max: 2000 }),
  ).map(([a, b, c, d]) => ({
    ru: yearStr(Math.min(a, b), Math.max(a, b)),
    en: yearStr(Math.min(c, d), Math.max(c, d)),
    ka: yearStr(Math.min(a, b), Math.max(a, b)),
  })),
  // Single-year string
  fc.integer({ min: 1700, max: 2000 }).map((y) => ({
    ru: String(y), en: String(y), ka: String(y),
  })),
  // Missing one language
  fc.tuple(fc.integer({ min: 1700, max: 2000 }), fc.integer({ min: 1700, max: 2000 })).map(
    ([a, b]) => {
      const s = yearStr(Math.min(a, b), Math.max(a, b));
      return { ru: s, en: s, ka: "" };
    },
  ),
  // Garbage (no year at all)
  fc.constant({ ru: "n/a", en: "n/a", ka: "n/a" }),
  // Empty object
  fc.constant({}),
  // null
  fc.constant(null),
);

const aiArb = fc.record({
  years_ok: fc.constant(false),
  confidence: fc.float({ min: 0, max: 1, noNaN: true }),
  rationale: fc.string(),
  years_correction: fc.record({
    yearsRaw: yearsRawArb,
    // Sometimes omit / sometimes provide independent start/end
    startYear: fc.option(fc.integer({ min: 1700, max: 2000 }), { nil: undefined }),
    endYear: fc.option(fc.integer({ min: 1700, max: 2000 }), { nil: undefined }),
  }),
});

function parseProposedRange(
  yc: any,
): { pStart: number | null; pEnd: number | null } {
  let pStart = typeof yc.startYear === "number" ? yc.startYear : null;
  let pEnd = typeof yc.endYear === "number" ? yc.endYear : null;
  if ((pStart == null || pEnd == null) && yc.yearsRaw && typeof yc.yearsRaw === "object") {
    const sample = yc.yearsRaw.ru || yc.yearsRaw.en || yc.yearsRaw.ka || "";
    const m = String(sample).match(/(\d{4})/g);
    if (m && m.length) {
      const nums = m.map(Number);
      pStart = pStart ?? Math.min(...nums);
      pEnd = pEnd ?? Math.max(...nums);
    }
  }
  return { pStart, pEnd };
}

describe("deriveFindings — property-based fuzz over years", () => {
  it("I1+I2+I3+I4: never shortens, requires trilingual yearsRaw, preserves languages", () => {
    fc.assert(
      fc.property(cardArb, aiArb, (card, ai) => {
        const out = deriveFindings(card, ai);
        const years = out.find((f) => f.kind === "years");
        if (!years) return; // accepted: rejection path

        const yc = ai.years_correction as any;
        const yr = yc.yearsRaw;

        // I2: trilingual & non-empty
        expect(yr).toBeTruthy();
        expect(typeof yr).toBe("object");
        expect(yr.ru).toBeTruthy();
        expect(yr.en).toBeTruthy();
        expect(yr.ka).toBeTruthy();

        // I4: yearsRaw preserved verbatim
        expect(years.proposed.yearsRaw).toEqual(yr);

        // I1+I3: emitted range must not shorten either side
        const { pStart, pEnd } = parseProposedRange(yc);
        expect(pStart).not.toBeNull();
        expect(pEnd).not.toBeNull();
        // The committed finding range may be widened by deriveFindings via
        // min/max with the card range — so the EFFECTIVE proposal is what
        // we check, not the raw AI numbers.
        expect(years.proposed.startYear).toBeLessThanOrEqual(card.startYear);
        expect(years.proposed.endYear).toBeGreaterThanOrEqual(card.endYear);
      }),
      { numRuns: 500 },
    );
  });

  it("I5: a years_correction payload never produces non-years finding kinds", () => {
    fc.assert(
      fc.property(cardArb, aiArb, (card, ai) => {
        const out = deriveFindings(card, ai);
        for (const f of out) {
          // Only "years" is allowed because the AI object only sets years_*
          expect(f.kind).toBe("years");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("legacy string years_correction is ALWAYS ignored regardless of content", () => {
    fc.assert(
      fc.property(
        cardArb,
        fc.string(),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (card, s, conf) => {
          const ai = {
            years_ok: false,
            years_correction: s,
            confidence: conf,
            rationale: "",
          };
          expect(deriveFindings(card, ai).find((f) => f.kind === "years")).toBeUndefined();
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("deriveFindings — fuzz over missing_years", () => {
  it("emits missing_years iff correction is a non-empty, truthy string", () => {
    fc.assert(
      fc.property(
        cardArb,
        fc.oneof(fc.string(), fc.constant(""), fc.constant(null), fc.constant(undefined)),
        fc.boolean(),
        (card, correction, ok) => {
          const ai = {
            missing_years_ok: ok,
            missing_years_correction: correction,
            confidence: 0.5,
            rationale: "",
          };
          const f = deriveFindings(card, ai).find((x) => x.kind === "missing_years");
          const shouldEmit = ok === false && !!correction;
          if (shouldEmit) {
            expect(f).toBeDefined();
            expect(f!.proposed).toEqual({ missingRaw: correction });
          } else {
            expect(f).toBeUndefined();
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
