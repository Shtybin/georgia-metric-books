import { Protocol } from "pmtiles";
import maplibregl from "maplibre-gl";
import layers from "protomaps-themes-base";
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
// Self-hosted Protomaps basemap (план Б).
//
// Подложка раздаётся одним файлом `.pmtiles` с нашего собственного хранилища
// (Cloudflare R2). Это убирает зависимость от чужих тайл-серверов
// (OpenFreeMap, CARTO) — карта работает даже если они лежат.
//
// Конфигурация — через одну переменную окружения:
//   VITE_BASEMAP_BASE_URL = https://tiles.datatells.info
// На этом домене должны лежать:
//   /georgia.pmtiles
//   /fonts/{fontstack}/{range}.pbf
//   /sprites/v4/light(.json|.png|@2x.json|@2x.png)
//
// Подробная инструкция по заливке на R2: docs/self-hosted-basemap-setup.md
// ---------------------------------------------------------------------------

const BASEMAP_BASE_URL =
  (import.meta.env.VITE_BASEMAP_BASE_URL as string | undefined)?.replace(/\/$/, "") || "";

// Регистрируем `pmtiles://` протокол для MapLibre один раз на загрузку модуля.
let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

function buildStyle(): StyleSpecification {
  // Стиль слоёв (земля, вода, дороги, подписи) генерируется готовым пресетом
  // protomaps-themes-base — он визуально близок к Positron.
  const sourceName = "protomaps";
  const styleLayers = layers(sourceName, "light", "en");
  return {
    version: 8,
    glyphs: `${BASEMAP_BASE_URL}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${BASEMAP_BASE_URL}/sprites/v4/light`,
    sources: {
      [sourceName]: {
        type: "vector",
        url: `pmtiles://${BASEMAP_BASE_URL}/georgia.pmtiles`,
        attribution:
          '© <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>',
      },
    },
    layers: styleLayers,
  };
}

// Пустой стиль — используется, если VITE_BASEMAP_BASE_URL не задан.
// Карта остаётся белой, ничего не падает.
const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#ffffff" } },
  ],
};

export const BASEMAP_STYLE: StyleSpecification = (() => {
  if (!BASEMAP_BASE_URL) {
    if (typeof console !== "undefined") {
      console.warn(
        "[basemap] VITE_BASEMAP_BASE_URL is not set — map will render blank. " +
          "See docs/self-hosted-basemap-setup.md to configure the self-hosted Protomaps basemap.",
      );
    }
    return EMPTY_STYLE;
  }
  ensurePmtilesProtocol();
  return buildStyle();
})();

// Совместимость: ранее этот хелпер подключал автоматический фолбэк на CARTO,
// сейчас не нужен — собственная подложка надёжна. Оставляем no-op чтобы не
// ломать существующие вызовы в TbilisiMap / MapView / mini-map компонентах.
export function attachBasemapFallback(_map: unknown) {
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
