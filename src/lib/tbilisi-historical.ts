/**
 * Конфигурация исторического слоя «Тифлис 1898».
 *
 * Когда у вас будет привязанный растр — заполните ОДИН из вариантов:
 *
 * 1) Тайлы XYZ (рекомендовано, лучшее качество на больших зумах):
 *    tiles: "/tiles/tbilisi-1898/{z}/{x}/{y}.png"
 *    minzoom: 10, maxzoom: 17
 *    Положите тайлы в public/tiles/tbilisi-1898/
 *
 * 2) Одна картинка с координатами 4 углов (быстрый старт, без QGIS):
 *    image: "/historical/tbilisi-1898.jpg"
 *    coordinates: [[lon,lat]TL, [lon,lat]TR, [lon,lat]BR, [lon,lat]BL]
 *    Положите файл в public/historical/
 *
 * Полигоны участков (полицейских частей) — GeoJSON по адресу:
 *    public/data/tbilisi-1898-districts.geojson
 * с properties: { name_latin, name_ru, name_en, name_ka }
 *
 * Если ни тайлы, ни картинка не указаны — UI-контролы скрываются.
 */
export interface HistoricalTilesConfig {
  kind: "tiles";
  tiles: string;
  minzoom?: number;
  maxzoom?: number;
  attribution?: string;
}

export interface HistoricalImageConfig {
  kind: "image";
  url: string;
  /** Углы в порядке: top-left, top-right, bottom-right, bottom-left. [lon, lat] */
  coordinates: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ];
  attribution?: string;
}

export type HistoricalConfig = HistoricalTilesConfig | HistoricalImageConfig | null;

/**
 * ⚠️ Замените на ваш растр, когда будет готов.
 * Сейчас null — слой не отображается, контролы скрыты.
 */
export const TBILISI_1898: HistoricalConfig = null;

/** Путь к geojson границ участков. 404 = слой не отображается. */
export const DISTRICTS_1898_URL = "/data/tbilisi-1898-districts.geojson";

export interface District1898Properties {
  name_latin: string;
  name_ru?: string;
  name_en?: string;
  name_ka?: string;
}
