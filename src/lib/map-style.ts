import type { StyleSpecification } from "maplibre-gl";

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

// ---------------------------------------------------------------------------
// Подложка карты: Stadia Maps — Alidade Smooth.
//
// Готовый хостинг тайлов + стиль; визуально близок к Positron/CARTO Light,
// без необходимости самим заливать pmtiles.
//
// Лимиты бесплатного тарифа Stadia (на момент 2025):
//   - 200 000 запросов тайлов в месяц
//   - без карты у пользователя → нужен API ключ для прод-домена
//   - localhost / *.lovable.app / *.netlify.app работают БЕЗ ключа
//     (разрешённые dev-домены)
//
// Регистрация: https://client.stadiamaps.com/signup/
// После регистрации в Property → "Authentication Configuration" добавить:
//   - metrics.datatells.info
//   - georgia-metric-books.lovable.app
// Ключ положить в env как VITE_STADIA_API_KEY.
//
// Если ключ не задан — стиль грузится без него (работает на dev-доменах).
// ---------------------------------------------------------------------------

const STADIA_API_KEY = (import.meta.env.VITE_STADIA_API_KEY as string | undefined) || "";

const STADIA_STYLE_URL = STADIA_API_KEY
  ? `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${STADIA_API_KEY}`
  : "https://tiles.stadiamaps.com/styles/alidade_smooth.json";

// MapLibre принимает либо StyleSpecification, либо строку с URL стиля.
// Стиль Alidade Smooth — это полноценный JSON, который MapLibre сам скачает.
export const BASEMAP_STYLE: StyleSpecification | string = STADIA_STYLE_URL;

// Совместимость со старыми вызовами — больше не нужен фолбэк, оставляем no-op.
export function attachBasemapFallback(_map: unknown) {
  // intentionally empty
}

/**
 * Force-collapse MapLibre's compact attribution control.
 *
 * MapLibre renders the attribution as a <details> element (and/or applies
 * `.maplibregl-compact-show`). Recent versions default to expanded on first
 * paint and re-expand on style/source changes, which covers the bottom of
 * the map — particularly bad on mobile. This helper closes it whenever the
 * map re-renders the control.
 */
export function collapseAttribution(map: any) {
  if (!map || typeof map.getContainer !== "function") return;
  const close = () => {
    const root: HTMLElement | null = map.getContainer();
    if (!root) return;
    root
      .querySelectorAll<HTMLElement>(".maplibregl-ctrl-attrib")
      .forEach((el) => {
        el.classList.remove("maplibregl-compact-show");
        if (el instanceof HTMLDetailsElement) el.open = false;
        const inner = el.querySelector("details");
        if (inner instanceof HTMLDetailsElement) inner.open = false;
      });
  };
  // Run after current frame, then again after style/source events that can
  // rebuild the control.
  requestAnimationFrame(close);
  map.on("load", close);
  map.on("styledata", close);
  map.on("sourcedata", close);
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
