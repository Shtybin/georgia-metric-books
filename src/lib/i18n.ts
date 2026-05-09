export type Lang = "ru" | "en";

export const STRINGS = {
  ru: {
    title: "Метрические книги Грузии",
    subtitle: "Архивный атлас 1819–1930",
    search: "Поиск селения, церкви, уезда…",
    legend: "Период начала книги",
    bucket: {
      "pre-1840": "до 1840",
      "1840-1860": "1840–1860",
      "1860-1880": "1860–1880",
      "1880-1900": "1880–1900",
      "post-1900": "после 1900",
    },
    settlement: "Селение",
    church: "Церковь",
    region: "Регион",
    uezd: "Уезд",
    years: "Годы",
    missing: "Пропущенные годы",
    noGaps: "Нет пропусков",
    coverage: "лет данных",
    showRadius: "Показать в радиусе 50 км",
    nearbyCount: (n: number) => `Найдено в радиусе 50 км: ${n}`,
    clear: "Сбросить",
    stats: "Статистика",
    total: "Всего записей",
    withCoords: "С координатами",
    withoutCoords: "Без координат",
    confidence: "Уверенность геокода",
    open: "Открыть карту",
    home: "На главную",
    embed: "Встроить",
    notFoundTitle: "Ничего не найдено",
    churches: "Церкви",
    unlocatedButton: "Без координат",
    unlocatedTitle: "Селения без координат",
    unlocatedHint: "Записи, для которых не удалось установить координаты. Можно искать и фильтровать по уезду.",
    unlocatedSearch: "Поиск по селению, церкви, уезду…",
    unlocatedAllUezds: "Все уезды",
    unlocatedEmpty: "Ничего не найдено",
    unlocatedShowingFirst: (n: number, total: number) => `Показаны первые ${n} из ${total}. Уточните запрос.`,
    findOnMap: "Найти на карте",
    noCoordsTooltip: "Координаты неизвестны",
  },
  en: {
    title: "Georgian Parish Registers",
    subtitle: "Archival atlas 1819–1930",
    search: "Search settlement, church, uezd…",
    legend: "Start-year period",
    bucket: {
      "pre-1840": "before 1840",
      "1840-1860": "1840–1860",
      "1860-1880": "1860–1880",
      "1880-1900": "1880–1900",
      "post-1900": "after 1900",
    },
    settlement: "Settlement",
    church: "Church",
    region: "Region",
    uezd: "Uezd",
    years: "Years",
    missing: "Missing Years",
    noGaps: "No gaps",
    coverage: "years of data",
    showRadius: "Show within 50 km",
    nearbyCount: (n: number) => `Within 50 km: ${n}`,
    clear: "Clear",
    stats: "Statistics",
    total: "Total records",
    withCoords: "With coordinates",
    withoutCoords: "Without coordinates",
    confidence: "Geocoding confidence",
    open: "Open the map",
    home: "Home",
    embed: "Embed",
    notFoundTitle: "No matches",
    churches: "Churches",
  },
} as const;

export const t = (lang: Lang) => STRINGS[lang];

export function compactYears(years: number[]): string {
  if (!years.length) return "—";
  const sorted = [...years].sort((a, b) => a - b);
  const ranges: string[] = [];
  let s = sorted[0], p = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === p + 1) p = sorted[i];
    else { ranges.push(s === p ? `${s}` : `${s}–${p}`); s = p = sorted[i]; }
  }
  ranges.push(s === p ? `${s}` : `${s}–${p}`);
  return ranges.join(", ");
}
