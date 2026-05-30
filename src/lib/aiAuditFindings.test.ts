import { describe, it, expect } from "vitest";
import { deriveFindings } from "./aiAuditFindings";

const baseCard = {
  settlement: { ru: "Тифлис", en: "Tiflis", ka: "თბილისი" },
  church: { ru: "Сионский собор", en: "Sioni", ka: "სიონი" },
  region: { ru: "Тифлисская губ.", en: "Tiflis gov." },
  uezd: { ru: "Тифлисский уезд", en: "Tbilisskiy uezd" },
  yearsRaw: { ru: "1846-1916", en: "1846-1916", ka: "1846-1916" },
  startYear: 1846,
  endYear: 1916,
  missingRaw: { ru: "", en: "", ka: "" },
};

describe("deriveFindings — years range guards", () => {
  it("rejects proposals that would SHORTEN the existing range", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1846-1870", en: "1846-1870", ka: "1846-1870" },
        startYear: 1846,
        endYear: 1870,
      },
      confidence: 0.8,
      rationale: "в каталоге только до 1870",
    };
    const out = deriveFindings(baseCard, ai);
    expect(out.find((f) => f.kind === "years")).toBeUndefined();
  });

  it("rejects proposals that would shift startYear forward (later start)", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1860-1916", en: "1860-1916", ka: "1860-1916" },
        startYear: 1860,
        endYear: 1916,
      },
      confidence: 0.7,
      rationale: "",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });

  it("rejects proposals that drop one of ru/en/ka", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1820-1916", en: "1820-1916" }, // ka missing
        startYear: 1820,
        endYear: 1916,
      },
      confidence: 0.9,
      rationale: "",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });

  it("rejects proposals identical to the current range", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1846-1916", en: "1846-1916", ka: "1846-1916" },
        startYear: 1846,
        endYear: 1916,
      },
      confidence: 0.5,
      rationale: "",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });

  it("accepts a strict EXPANSION and preserves trilingual yearsRaw", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1820-1916", en: "1820-1916", ka: "1820-1916" },
        startYear: 1820,
        endYear: 1916,
      },
      confidence: 0.9,
      rationale: "каталог содержит 1820 для этого селения",
    };
    const f = deriveFindings(baseCard, ai).find((x) => x.kind === "years");
    expect(f).toBeDefined();
    expect(f!.proposed.yearsRaw).toEqual({
      ru: "1820-1916",
      en: "1820-1916",
      ka: "1820-1916",
    });
    expect(f!.proposed.startYear).toBe(1820);
    expect(f!.proposed.endYear).toBe(1916);
    expect(f!.current).toEqual({
      yearsRaw: { ru: "1846-1916", en: "1846-1916", ka: "1846-1916" },
      startYear: 1846,
      endYear: 1916,
    });
  });

  it("parses range from yearsRaw string when startYear/endYear are omitted", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1820-1916", en: "1820-1916", ka: "1820-1916" },
      },
      confidence: 0.8,
      rationale: "",
    };
    const f = deriveFindings(baseCard, ai).find((x) => x.kind === "years");
    expect(f).toBeDefined();
    expect(f!.proposed.startYear).toBe(1820);
    expect(f!.proposed.endYear).toBe(1916);
  });

  it("never shortens even when AI proposes a narrower string-only range", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1846-1870", en: "1846-1870", ka: "1846-1870" },
      },
      confidence: 0.9,
      rationale: "каталог 1819-1870",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });

  it("ignores legacy string-only years_correction (old schema)", () => {
    const ai = {
      years_ok: false,
      years_correction: "1846-1870",
      confidence: 0.9,
      rationale: "",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });
});

describe("deriveFindings — other kinds untouched", () => {
  it("still emits settlement / church / missing_years findings", () => {
    const ai = {
      settlement_ok: false,
      settlement_correction: "Тбилиси",
      church_ok: false,
      church_corrections: ["Сиони"],
      missing_years_ok: false,
      missing_years_correction: "1855",
      years_ok: true,
      confidence: 0.6,
      rationale: "r",
    };
    const kinds = deriveFindings(baseCard, ai).map((f) => f.kind).sort();
    expect(kinds).toEqual(["church", "missing_years", "settlement"]);
  });
});
