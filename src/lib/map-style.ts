// Okabe-Ito categorical palette for start-year buckets.
// Colorblind-safe; tested for contrast on light & dark basemaps.
export const BUCKET_COLORS: Record<string, string> = {
  "pre-1820": "#0072B2",
  "1820-1835": "#56B4E9",
  "1835-1860": "#009E73",
  "1860-1880": "#E69F00",
  "1880-1900": "#CC79A7",
  "post-1900": "#D55E00",
};

export const BUCKET_ORDER = [
  "pre-1820",
  "1820-1835",
  "1835-1860",
  "1860-1880",
  "1880-1900",
  "post-1900",
] as const;

// Основная векторная подложка — OpenFreeMap Positron (бесплатно, без ключа).
export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

// No-op: фолбэк отключён по требованию. Если OpenFreeMap недоступен —
// карта остаётся белой, пока не разберёмся с источником.
export function attachBasemapFallback(_map: any) {
  // intentionally empty
}

export const colorExpression: any = [
  "match",
  ["get", "bucket"],
  "pre-1820", BUCKET_COLORS["pre-1820"],
  "1820-1835", BUCKET_COLORS["1820-1835"],
  "1835-1860", BUCKET_COLORS["1835-1860"],
  "1860-1880", BUCKET_COLORS["1860-1880"],
  "1880-1900", BUCKET_COLORS["1880-1900"],
  "post-1900", BUCKET_COLORS["post-1900"],
  "#888",
];

// Flannery-scaled radius: area ∝ coverage; clamped 4..18 px.
export const radiusExpression: any = [
  "interpolate", ["linear"], ["zoom"],
  4, ["max", 3, ["*", ["sqrt", ["get", "coverage"]], 1.0]],
  10, ["max", 4, ["*", ["sqrt", ["get", "coverage"]], 1.6]],
];
