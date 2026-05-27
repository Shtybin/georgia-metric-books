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
 * Карта Тифлиса 1898 г. Привязка приблизительная — по 4 угловым
 * меткам графической сетки внутренней рамки скана (от меридиана Ферро,
 * пересчитано в долготу от Гринвича: λ_Greenwich = λ_Ferro − 17°40′00″).
 *   TL  62°26′15″ / 41°45′30″   →  44.77083 / 41.75833
 *   TR  62°31′50″ / 41°44′15″   →  44.86389 / 41.73750
 *   BR  62°31′50″ / 41°40′15″   →  44.86389 / 41.67083
 *   BL  62°26′15″ / 41°41′15″   →  44.77083 / 41.68750
 * Лист слегка повёрнут относительно меридиана — поэтому
 * широты левых и правых углов отличаются (~1′).
 * Для точной привязки можно перенарезать XYZ-тайлы в QGIS
 * и заменить kind на "tiles".
 */
export const TBILISI_1898: HistoricalConfig = {
  kind: "tiles",
  tiles: "/tiles/tbilisi-1898/{z}/{x}/{y}.png",
  minzoom: 12,
  maxzoom: 17,
  attribution:
    'План города Тифлиса, 1898 г., изд. Н. Ф. Клементьева · Национальный архив Грузии',
};

/** Путь к geojson границ участков. 404 = слой не отображается. */
export const DISTRICTS_1898_URL = "/data/tbilisi-1898-districts.geojson";

export interface District1898Properties {
  name_latin: string;
  name_ru?: string;
  name_en?: string;
  name_ka?: string;
}

/* -------------------------------------------------------------------------- */
/*  Реестр исторических подложек (расширяемый)                                */
/* -------------------------------------------------------------------------- */
/**
 * Каждая запись в `HISTORICAL_MAPS` — отдельный слой, который можно выбрать
 * в выпадающем списке в админке («Тбилиси 1898» → редактор координат).
 *
 * Поля:
 *  - id            — стабильный идентификатор (используется в state и source id)
 *  - title         — отображается в дропдауне
 *  - year          — для сортировки (необязательно)
 *  - config        — конфиг растра (тайлы XYZ или 1 картинка + 4 угла). null = заготовка
 *  - districtsUrl  — путь к GeoJSON границ участков для этой эпохи (опц.)
 *  - notes         — короткая подсказка для админа
 *
 * Чтобы активировать заготовку — положите тайлы в `public/tiles/<id>/` или
 * JPG в `public/historical/<id>.jpg` и заполните `config`.
 */
export interface HistoricalMapEntry {
  id: string;
  title: string;
  year?: number;
  config: HistoricalConfig;
  districtsUrl?: string;
  notes?: string;
}

export const HISTORICAL_MAPS: HistoricalMapEntry[] = [
  {
    id: "1898",
    title: "Тифлис, 1898 (Клементьев)",
    year: 1898,
    config: TBILISI_1898,
    districtsUrl: DISTRICTS_1898_URL,
    notes: "Базовая привязанная карта. Используется и на странице /tbilisi.",
  },
  {
    id: "1735-vakhushti",
    title: "1735 — Вахушти Багратиони (заготовка)",
    year: 1735,
    config: null,
    notes:
      'Положите растр в public/historical/1735-vakhushti.jpg и впишите 4 угла в HISTORICAL_MAPS[].config: { kind: "image", url, coordinates }.',
  },
  {
    id: "1850-russian",
    title: "1850 — Русский план Тифлиса (заготовка)",
    year: 1850,
    config: null,
    notes:
      'Тайлы XYZ предпочтительнее. Положите в public/tiles/1850-russian/ и впишите config: { kind: "tiles", tiles: "/tiles/1850-russian/{z}/{x}/{y}.png" }.',
  },
  {
    id: "1920-soviet",
    title: "1920 — План Тифлиса (заготовка)",
    year: 1920,
    config: null,
    notes:
      "Для границы досоветской и советской застройки. Источник: Национальный архив Грузии / Wikimedia Commons.",
  },
];
