/**
 * Regression test: a `coord_suggestions` row approved through the AI-orchestration
 * geolocate flow must produce a map feature whose properties pass through
 * `categorizeParish` and end up under the correct legend filter on the main map.
 *
 * If this test ever breaks, approved geolocate findings will silently disappear
 * from the map or land in the wrong legend bucket.
 */
import { describe, expect, it } from "vitest";
import { approvedToFeature, type ApprovedSuggestion } from "@/lib/communityCoords";
import { categorizeParish } from "@/lib/confessionRules";
import { MAIN_MAP_CATEGORIES } from "@/lib/parishCategory";
import { BUCKET_COLORS, BUCKET_ORDER } from "@/lib/map-style";
import { bucketOf, parseYearsString } from "@/lib/userCoords";
import type { Confession } from "@/lib/i18n-tbilisi";

function mkApproved(overrides: Partial<ApprovedSuggestion> = {}): ApprovedSuggestion {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    settlement_ru: "Тестовое",
    settlement_en: "Testovoe",
    uezd_ru: "Тифлисский",
    uezd_en: "Tiflissky",
    region_ru: "Тифлисская губерния",
    region_en: "Tiflis Governorate",
    church_ru: "Церковь Св. Николая",
    church_en: "St. Nicholas Church",
    years: "1880-1890",
    start_year: 1880,
    end_year: 1890,
    lat: 41.7,
    lon: 44.8,
    ...overrides,
  };
}

function categorize(s: ApprovedSuggestion): Confession[] {
  const f = approvedToFeature(s, 1);
  return categorizeParish(f.properties);
}

describe("approved geolocate suggestions on the main map", () => {
  it("produces a Point feature with coordinates and bucket", () => {
    const f = approvedToFeature(mkApproved(), 42);
    expect(f.geometry.type).toBe("Point");
    expect(f.geometry.coordinates).toEqual([44.8, 41.7]);
    expect(f.id).toBe(42);
    expect(f.properties.startYear).toBe(1880);
    expect(f.properties.communityAdded).toBe(true);
    expect(typeof f.properties.bucket).toBe("string");
  });

  it("default Orthodox parish falls under orthodox_georgian (visible on main map)", () => {
    const cats = categorize(mkApproved());
    expect(cats).toContain("orthodox_georgian");
    expect(cats.every((c) => MAIN_MAP_CATEGORIES.includes(c))).toBe(true);
  });

  it("Armenian Surb-named church → armenian_apostolic legend", () => {
    const cats = categorize(
      mkApproved({
        church_ru: "Сурб Аствацацин",
        church_en: "Surb Astvatsatsin",
        settlement_ru: "Ахалцихе",
        settlement_en: "Akhaltsikhe",
      }),
    );
    expect(cats).toContain("armenian_apostolic");
    expect(MAIN_MAP_CATEGORIES).toContain("armenian_apostolic");
  });

  it("German colony → lutheran legend", () => {
    const cats = categorize(
      mkApproved({
        church_ru: "Кирха",
        settlement_ru: "Екатериненфельд",
        settlement_en: "Katharinenfeld",
      }),
    );
    expect(cats).toContain("lutheran");
  });

  it("Greek village → greek_orthodox legend", () => {
    const cats = categorize(
      mkApproved({
        settlement_ru: "Цалка",
        settlement_en: "Tsalka",
        church_ru: "Церковь Св. Георгия",
      }),
    );
    expect(cats).toContain("greek_orthodox");
  });

  it("Synagogue is categorized as jewish only when explicitly named", () => {
    const explicit = categorize(
      mkApproved({
        church_ru: "Синагога",
        church_en: "Synagogue",
        settlement_ru: "Ахалцихе",
      }),
    );
    expect(explicit).toContain("jewish");

    // City has a historical Jewish community, but the parish is Orthodox →
    // must NOT be tagged jewish (regression guard for the area-rule removal).
    const orthodox = categorize(
      mkApproved({
        church_ru: "Церковь Св. Николая",
        settlement_ru: "Ахалцихе",
      }),
    );
    expect(orthodox).not.toContain("jewish");
  });

  it("military garrison location → orthodox_military legend", () => {
    const cats = categorize(
      mkApproved({
        settlement_ru: "Манглиси",
        settlement_en: "Manglisi",
        church_ru: "Церковь Успения Пресвятой Богородицы",
      }),
    );
    expect(cats).toContain("orthodox_military");
  });

  it("every categorized confession is a known legend key", () => {
    const samples = [
      mkApproved(),
      mkApproved({ church_ru: "Сурб Саркис" }),
      mkApproved({ church_ru: "Костёл Святой Марии", church_en: "Roman Catholic church" }),
      mkApproved({ settlement_ru: "Гореловка" }),
    ];
    for (const s of samples) {
      const cats = categorize(s);
      expect(cats.length).toBeGreaterThan(0);
      for (const c of cats) {
        // Confession union — categorizeParish never returns an unknown string.
        expect([
          "orthodox_georgian",
          "orthodox_russian",
          "orthodox_military",
          "armenian_apostolic",
          "greek_orthodox",
          "roman_catholic",
          "lutheran",
          "jewish",
          "molokan",
          "baptist",
          "assyrian",
          "other",
        ]).toContain(c);
      }
    }
  });
});

describe("approved geolocate suggestions on the period legend (size + color)", () => {
  // Bucket = legend filter key; BUCKET_COLORS[bucket] drives circle color;
  // properties.coverage drives Flannery-scaled circle radius on the map.
  const cases: Array<{ years: string; start: number; bucket: string; coverage: number }> = [
    { years: "1810-1815", start: 1810, bucket: "pre-1820", coverage: 6 },
    { years: "1825-1830", start: 1825, bucket: "1820-1835", coverage: 6 },
    { years: "1840-1855", start: 1840, bucket: "1835-1860", coverage: 16 },
    { years: "1865-1875", start: 1865, bucket: "1860-1880", coverage: 11 },
    { years: "1885-1895", start: 1885, bucket: "1880-1900", coverage: 11 },
    { years: "1905-1916", start: 1905, bucket: "post-1900", coverage: 12 },
  ];

  it.each(cases)(
    "years '$years' → bucket $bucket with color and coverage-driven radius",
    ({ years, start, bucket, coverage }) => {
      const f = approvedToFeature(
        {
          id: "x",
          settlement_ru: "S", settlement_en: "S",
          uezd_ru: "", uezd_en: "", region_ru: "", region_en: "",
          church_ru: "Церковь Св. Николая", church_en: "St. Nicholas",
          years,
          start_year: start,
          end_year: start + (coverage - 1),
          lat: 41.7, lon: 44.8,
        },
        1,
      );

      // Bucket assigned from start_year and matches bucketOf().
      expect(f.properties.bucket).toBe(bucket);
      expect(bucketOf(start)).toBe(bucket);
      // Bucket is a real legend filter key.
      expect(BUCKET_ORDER).toContain(bucket);
      // Has a color in the period palette (size + color legend driver).
      expect(BUCKET_COLORS[bucket]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      // Coverage matches the parsed years length → used by circle-radius expr.
      expect(f.properties.coverage).toBe(parseYearsString(years).length);
      expect(f.properties.coverage).toBeGreaterThan(0);
    },
  );

  it("missing start_year falls back to parsed years and still gets a bucket", () => {
    const f = approvedToFeature(
      {
        id: "y",
        settlement_ru: "S", settlement_en: "S",
        uezd_ru: "", uezd_en: "", region_ru: "", region_en: "",
        church_ru: "Ц", church_en: "C",
        years: "1872, 1873, 1875",
        start_year: null,
        end_year: null,
        lat: 0, lon: 0,
      },
      1,
    );
    expect(f.properties.startYear).toBe(1872);
    expect(f.properties.bucket).toBe("1860-1880");
    expect(f.properties.coverage).toBe(3);
    expect(BUCKET_COLORS[f.properties.bucket]).toBeTruthy();
  });
});

describe("missing years / gaps in metric-book coverage", () => {
  // The "years" string for a church may contain gaps (lost or never-kept books).
  // Coverage counts only the years actually preserved — that's what drives the
  // circle radius. The bucket is keyed on the EARLIEST preserved year.
  function feat(years: string) {
    return approvedToFeature(
      {
        id: "z",
        settlement_ru: "S", settlement_en: "S",
        uezd_ru: "", uezd_en: "", region_ru: "", region_en: "",
        church_ru: "Ц", church_en: "C",
        years,
        start_year: null,
        end_year: null,
        lat: 0, lon: 0,
      },
      1,
    );
  }

  it("range with mid-gap: coverage = sum of segments, bucket = earliest year", () => {
    // Real case: Дихашхо — 1842-1846, 1848-1851, 1853-1855, 1857-1859,
    // 1861-1866, 1869-1870 → 24 years preserved, bucket '1835-1860'.
    const f = feat("1842-1846, 1848-1851, 1853-1855, 1857-1859, 1861-1866, 1869-1870");
    expect(f.properties.startYear).toBe(1842);
    expect(f.properties.endYear).toBe(1870);
    expect(f.properties.bucket).toBe("1835-1860");
    expect(f.properties.coverage).toBe(5 + 4 + 3 + 3 + 6 + 2);
    expect(BUCKET_COLORS[f.properties.bucket]).toBe("#009E73");
  });

  it("single isolated years + gaps (Лакатхеви pattern)", () => {
    const years = "1827-1828, 1830-1836, 1838-1845, 1847-1853, 1858, 1860-1861, 1865, 1867-1870";
    const f = feat(years);
    expect(f.properties.startYear).toBe(1827);
    expect(f.properties.bucket).toBe("1820-1835");
    // Coverage = parsed unique years.
    expect(f.properties.coverage).toBe(parseYearsString(years).length);
    expect(f.properties.coverage).toBeGreaterThan(20);
  });

  it("partial overlap across two buckets uses earliest year for bucket", () => {
    // 1855-1865 straddles 1835-1860 and 1860-1880 → must pick the earlier bucket.
    const f = feat("1855-1865");
    expect(f.properties.startYear).toBe(1855);
    expect(f.properties.bucket).toBe("1835-1860");
    expect(f.properties.coverage).toBe(11);
  });

  it("only sparse isolated years still yields valid bucket and coverage>=1", () => {
    const f = feat("1881, 1884, 1899");
    expect(f.properties.coverage).toBe(3);
    expect(f.properties.bucket).toBe("1880-1900");
    expect(BUCKET_COLORS[f.properties.bucket]).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("empty / unparseable years string → coverage clamped to 1, fallback bucket", () => {
    // Defensive: bucketOf(1900) → 'post-1900' (note: <1901 boundary is exclusive
    // of 1901, but communityCoords uses startYear ?? 1900, and bucketOf(1900)
    // returns '1880-1900'). This pins the fallback so a UI change can't
    // silently shift the default into 'post-1900'.
    const f = feat("");
    expect(f.properties.coverage).toBe(1);
    expect(f.properties.startYear).toBe(1900);
    expect(f.properties.bucket).toBe("1880-1900");
  });

  it("bucket boundary years map exactly per bucketOf() contract", () => {
    // Boundary regression: each table entry is the FIRST year of its bucket.
    expect(bucketOf(1819)).toBe("pre-1820");
    expect(bucketOf(1820)).toBe("1820-1835");
    expect(bucketOf(1835)).toBe("1820-1835");
    expect(bucketOf(1836)).toBe("1835-1860");
    expect(bucketOf(1860)).toBe("1835-1860");
    expect(bucketOf(1861)).toBe("1860-1880");
    expect(bucketOf(1880)).toBe("1860-1880");
    expect(bucketOf(1881)).toBe("1880-1900");
    expect(bucketOf(1900)).toBe("1880-1900");
    expect(bucketOf(1901)).toBe("post-1900");
    // Every bucket has a unique color in the legend.
    const colors = BUCKET_ORDER.map((b) => BUCKET_COLORS[b]);
    expect(new Set(colors).size).toBe(BUCKET_ORDER.length);
  });
});
