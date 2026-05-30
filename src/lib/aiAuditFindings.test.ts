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

describe("deriveFindings — yearsRaw format variants", () => {
  it("rejects a single-year proposal that collapses the range (e.g. '1885')", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1885", en: "1885", ka: "1885" },
      },
      confidence: 0.7,
      rationale: "",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });

  it("rejects an inverted proposal where startYear > endYear (still shortens one side)", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1920-1900", en: "1920-1900", ka: "1920-1900" },
        startYear: 1920,
        endYear: 1900,
      },
      confidence: 0.6,
      rationale: "",
    };
    // pStart=1920 > curStart=1846 → wouldShorten=true
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });

  it("rejects yearsRaw with non-string / empty values", () => {
    const ai = {
      years_ok: false,
      years_correction: { yearsRaw: { ru: "", en: "", ka: "" } },
      confidence: 0.9,
      rationale: "",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });

  it("rejects yearsRaw === null", () => {
    const ai = {
      years_ok: false,
      years_correction: { yearsRaw: null },
      confidence: 0.9,
      rationale: "",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });

  it("accepts proposal when card has NO existing startYear/endYear (cannot shorten what doesn't exist)", () => {
    const cardNoYears = { ...baseCard, startYear: null, endYear: null };
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1850-1860", en: "1850-1860", ka: "1850-1860" },
        startYear: 1850,
        endYear: 1860,
      },
      confidence: 0.8,
      rationale: "",
    };
    const f = deriveFindings(cardNoYears, ai).find((x) => x.kind === "years");
    expect(f).toBeDefined();
    expect(f!.proposed.startYear).toBe(1850);
    expect(f!.proposed.endYear).toBe(1860);
  });
});

describe("deriveFindings — boundary years 1819 / 1870", () => {
  const tightCard = {
    ...baseCard,
    yearsRaw: { ru: "1819-1870", en: "1819-1870", ka: "1819-1870" },
    startYear: 1819,
    endYear: 1870,
  };

  it("rejects identical proposal exactly at catalog edges 1819-1870", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1819-1870", en: "1819-1870", ka: "1819-1870" },
        startYear: 1819,
        endYear: 1870,
      },
      confidence: 0.95,
      rationale: "совпадает с каталогом",
    };
    expect(deriveFindings(tightCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });

  it("rejects proposal that shifts past lower edge but shortens upper edge (1818-1865)", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1818-1865", en: "1818-1865", ka: "1818-1865" },
        startYear: 1818,
        endYear: 1865,
      },
      confidence: 0.7,
      rationale: "",
    };
    // pEnd=1865 < curEnd=1870 → wouldShorten=true even though startYear expands
    expect(deriveFindings(tightCard, ai).find((f) => f.kind === "years")).toBeUndefined();
  });

  it("accepts expansion that grows BOTH edges (1818-1871)", () => {
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1818-1871", en: "1818-1871", ka: "1818-1871" },
        startYear: 1818,
        endYear: 1871,
      },
      confidence: 0.85,
      rationale: "",
    };
    const f = deriveFindings(tightCard, ai).find((x) => x.kind === "years");
    expect(f).toBeDefined();
    expect(f!.proposed.startYear).toBe(1818);
    expect(f!.proposed.endYear).toBe(1871);
  });

  it("accepts proposal expanding from inside catalog edges to full 1819-1870", () => {
    const narrowCard = {
      ...baseCard,
      yearsRaw: { ru: "1825-1865", en: "1825-1865", ka: "1825-1865" },
      startYear: 1825,
      endYear: 1865,
    };
    const ai = {
      years_ok: false,
      years_correction: {
        yearsRaw: { ru: "1819-1870", en: "1819-1870", ka: "1819-1870" },
        startYear: 1819,
        endYear: 1870,
      },
      confidence: 0.9,
      rationale: "",
    };
    const f = deriveFindings(narrowCard, ai).find((x) => x.kind === "years");
    expect(f).toBeDefined();
    expect(f!.proposed.startYear).toBe(1819);
    expect(f!.proposed.endYear).toBe(1870);
    expect(f!.proposed.yearsRaw).toEqual({
      ru: "1819-1870",
      en: "1819-1870",
      ka: "1819-1870",
    });
  });
});

describe("deriveFindings — missing_years edge cases", () => {
  it("does NOT emit a missing_years finding when correction is empty string", () => {
    const ai = {
      missing_years_ok: false,
      missing_years_correction: "",
      confidence: 0.5,
      rationale: "",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "missing_years")).toBeUndefined();
  });

  it("does NOT emit when correction is null", () => {
    const ai = {
      missing_years_ok: false,
      missing_years_correction: null,
      confidence: 0.5,
      rationale: "",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "missing_years")).toBeUndefined();
  });

  it("does NOT emit when missing_years_ok=true even if correction provided", () => {
    const ai = {
      missing_years_ok: true,
      missing_years_correction: "1855",
      confidence: 0.9,
      rationale: "",
    };
    expect(deriveFindings(baseCard, ai).find((f) => f.kind === "missing_years")).toBeUndefined();
  });

  it("emits a missing_years finding for a real, non-empty correction", () => {
    const ai = {
      missing_years_ok: false,
      missing_years_correction: "1855, 1860",
      confidence: 0.8,
      rationale: "",
    };
    const f = deriveFindings(baseCard, ai).find((x) => x.kind === "missing_years");
    expect(f).toBeDefined();
    expect(f!.proposed).toEqual({ missingRaw: "1855, 1860" });
    expect(f!.severity).toBe("info");
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
