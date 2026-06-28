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

/**
 * Карта Тифлиса 1904 г., составлена Строительным отделением Городской управы
 * по указаниям инж. Т. Энфиаджианца. Привязка — XYZ-тайлы (zoom 12–17),
 * получены готовыми из архивного источника.
 */
export const TBILISI_1904: HistoricalConfig = {
  kind: "tiles",
  tiles: "/tiles/tbilisi-1904/{z}/{x}/{y}.png",
  minzoom: 12,
  maxzoom: 17,
  attribution:
    'План города Тифлиса, 1904 г., изд. Строительным отделением городской управы по указаниям инж. Т. Энфиаджианца · Национальный архив Грузии',
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
export interface LocalizedText {
  ru: string;
  en: string;
  ka: string;
}

export interface HistoricalMapEntry {
  id: string;
  /** Локализованное название. Используется в дропдауне выбора подложки. */
  title: LocalizedText;
  year?: number;
  config: HistoricalConfig;
  districtsUrl?: string;
  /** Локализованная подсказка для админа / пользователя. */
  notes?: LocalizedText;
}

export const HISTORICAL_MAPS: HistoricalMapEntry[] = [
  {
    id: "1898",
    title: {
      ru: "Тифлис, 1898 (Клементьев)",
      en: "Tiflis, 1898 (Klementyev)",
      ka: "ტიფლისი, 1898 (კლემენტიევი)",
    },
    year: 1898,
    config: TBILISI_1898,
    districtsUrl: DISTRICTS_1898_URL,
    notes: {
      ru: "Базовая привязанная карта. Используется и на странице /tbilisi.",
      en: "Primary georeferenced map. Also used on the /tbilisi page.",
      ka: "ძირითადი გეორეფერენცირებული რუკა. ასევე გამოიყენება /tbilisi გვერდზე.",
    },
  },
  {
    id: "1904",
    title: {
      ru: "Тифлис, 1904 (Городская управа)",
      en: "Tiflis, 1904 (City Council)",
      ka: "ტიფლისი, 1904 (საქალაქო გამგეობა)",
    },
    year: 1904,
    config: TBILISI_1904,
    notes: {
      ru: "План с проектируемыми избирательными участками. Границы полицейских участков отрисованы на скане; GeoJSON оцифруем отдельно.",
      en: "Plan with proposed electoral districts. Police district borders are drawn on the scan; GeoJSON to be digitised separately.",
      ka: "გეგმა დაპროექტებული საარჩევნო უბნებით. პოლიციის უბნების საზღვრები დატანილია სკანზე; GeoJSON ცალკე ციფრულდება.",
    },
  },
  {
    id: "1735-vakhushti",
    title: {
      ru: "1735 — Вахушти Багратиони (заготовка)",
      en: "1735 — Vakhushti Bagrationi (draft)",
      ka: "1735 — ვახუშტი ბაგრატიონი (მონახაზი)",
    },
    year: 1735,
    config: null,
    notes: {
      ru: 'Положите растр в public/historical/1735-vakhushti.jpg и впишите 4 угла в HISTORICAL_MAPS[].config: { kind: "image", url, coordinates }.',
      en: 'Place the raster at public/historical/1735-vakhushti.jpg and set 4 corners in HISTORICAL_MAPS[].config: { kind: "image", url, coordinates }.',
      ka: 'მოათავსეთ რასტრი public/historical/1735-vakhushti.jpg-ში და მიუთითეთ 4 კუთხე HISTORICAL_MAPS[].config-ში: { kind: "image", url, coordinates }.',
    },
  },
  {
    id: "1850-russian",
    title: {
      ru: "1850 — Русский план Тифлиса (заготовка)",
      en: "1850 — Russian plan of Tiflis (draft)",
      ka: "1850 — ტიფლისის რუსული გეგმა (მონახაზი)",
    },
    year: 1850,
    config: null,
    notes: {
      ru: 'Тайлы XYZ предпочтительнее. Положите в public/tiles/1850-russian/ и впишите config: { kind: "tiles", tiles: "/tiles/1850-russian/{z}/{x}/{y}.png" }.',
      en: 'XYZ tiles preferred. Place them in public/tiles/1850-russian/ and set config: { kind: "tiles", tiles: "/tiles/1850-russian/{z}/{x}/{y}.png" }.',
      ka: 'XYZ ფილები სასურველია. მოათავსეთ public/tiles/1850-russian/-ში და მიუთითეთ config: { kind: "tiles", tiles: "/tiles/1850-russian/{z}/{x}/{y}.png" }.',
    },
  },
  {
    id: "1920-soviet",
    title: {
      ru: "1920 — План Тифлиса (заготовка)",
      en: "1920 — Plan of Tiflis (draft)",
      ka: "1920 — ტიფლისის გეგმა (მონახაზი)",
    },
    year: 1920,
    config: null,
    notes: {
      ru: "Для границы досоветской и советской застройки. Источник: Национальный архив Грузии / Wikimedia Commons.",
      en: "For the boundary between pre-Soviet and Soviet development. Source: National Archives of Georgia / Wikimedia Commons.",
      ka: "წინასაბჭოთა და საბჭოთა განაშენიანების საზღვრისთვის. წყარო: საქართველოს ეროვნული არქივი / Wikimedia Commons.",
    },
  },
];

export type HistoricalLang = keyof LocalizedText;

export function localizeHistorical(
  text: LocalizedText | string | undefined,
  lang: HistoricalLang,
): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[lang] ?? text.ru ?? text.en ?? "";
}
