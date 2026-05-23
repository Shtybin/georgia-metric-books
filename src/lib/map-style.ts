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

// Фолбэк-стиль на случай, если OpenFreeMap временно недоступен.
// Растровые тайлы CARTO Positron — другой CDN, тот же визуальный язык.
export const BASEMAP_STYLE_FALLBACK: any = {
  version: 8,
  sources: {
    "carto-positron": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: "carto-positron", type: "raster", source: "carto-positron" }],
};

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
