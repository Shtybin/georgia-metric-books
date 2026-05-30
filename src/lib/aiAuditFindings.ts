// Pure logic extracted from aiAudit.functions.ts so it can be unit-tested
// without pulling the server-only Supabase admin client into the test runner.

export const GENERIC_REGIONS = new Set(
  [
    "имеретия", "гурия", "абхазия", "мегрелия", "сванетия", "кахетия",
    "картли", "имерети", "imereti", "guria", "abkhazia", "samegrelo",
    "svaneti", "kakheti", "kartli", "megreliya", "imeretiya", "guriya",
    "abkhaziya", "osetiya",
  ].map((s) => s.toLowerCase()),
);

export type FindingRow = {
  kind: string;
  severity: "info" | "warn" | "error";
  current: any;
  proposed: any;
  rationale: string;
};

export function deriveFindings(card: any, ai: any): FindingRow[] {
  const out: FindingRow[] = [];
  const isGenericRegion = GENERIC_REGIONS.has(
    String(card.region?.ru || card.region?.en || "").toLowerCase().trim(),
  );

  if (ai.settlement_ok === false && ai.settlement_correction) {
    out.push({
      kind: "settlement",
      severity: "warn",
      current: card.settlement,
      proposed: { suggestion: ai.settlement_correction },
      rationale: ai.rationale ?? "",
    });
  }
  if (
    !isGenericRegion &&
    ai.uezd_ok === false &&
    ai.uezd_correction &&
    String(ai.uezd_correction).trim()
  ) {
    out.push({
      kind: "uezd",
      severity: "warn",
      current: card.uezd,
      proposed: { suggestion: ai.uezd_correction },
      rationale: ai.rationale ?? "",
    });
  }
  if (
    ai.church_ok === false &&
    Array.isArray(ai.church_corrections) &&
    ai.church_corrections.length
  ) {
    out.push({
      kind: "church",
      severity: "warn",
      current: card.church,
      proposed: { suggestions: ai.church_corrections },
      rationale: ai.rationale ?? "",
    });
  }
  if (ai.years_ok === false && ai.years_correction && typeof ai.years_correction === "object") {
    const yc = ai.years_correction as {
      yearsRaw?: { ru?: string; en?: string; ka?: string };
      startYear?: number;
      endYear?: number;
    };
    const curStart = typeof card.startYear === "number" ? card.startYear : null;
    const curEnd = typeof card.endYear === "number" ? card.endYear : null;

    let pStart = typeof yc.startYear === "number" ? yc.startYear : null;
    let pEnd = typeof yc.endYear === "number" ? yc.endYear : null;
    if ((pStart == null || pEnd == null) && yc.yearsRaw) {
      const sample = yc.yearsRaw.ru || yc.yearsRaw.en || yc.yearsRaw.ka || "";
      const m = sample.match(/(\d{4})/g);
      if (m && m.length >= 1) {
        const nums = m.map(Number);
        pStart = pStart ?? Math.min(...nums);
        pEnd = pEnd ?? Math.max(...nums);
      }
    }

    const triLang =
      !!yc.yearsRaw?.ru && !!yc.yearsRaw?.en && !!yc.yearsRaw?.ka;
    const wouldShorten =
      curStart != null && curEnd != null && pStart != null && pEnd != null &&
      (pStart > curStart || pEnd < curEnd);
    const sameRange = curStart === pStart && curEnd === pEnd;

    if (triLang && !wouldShorten && !sameRange) {
      const proposed: Record<string, any> = { yearsRaw: yc.yearsRaw };
      if (pStart != null) proposed.startYear = Math.min(curStart ?? pStart, pStart);
      if (pEnd != null) proposed.endYear = Math.max(curEnd ?? pEnd, pEnd);
      out.push({
        kind: "years",
        severity: "warn",
        current: { yearsRaw: card.yearsRaw, startYear: card.startYear, endYear: card.endYear },
        proposed,
        rationale: ai.rationale ?? "",
      });
    }
  }
  if (ai.missing_years_ok === false && ai.missing_years_correction) {
    out.push({
      kind: "missing_years",
      severity: "info",
      current: { missingRaw: card.missingRaw },
      proposed: { missingRaw: ai.missing_years_correction },
      rationale: ai.rationale ?? "",
    });
  }
  return out;
}
