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
