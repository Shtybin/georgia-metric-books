/**
 * Категоризация приходов основной карты по конфессии/общине —
 * аналог категорий, используемых на карте Тбилиси. Источник данных
 * (`parishes.geojson`) не содержит явного поля «конфессия», поэтому
 * категория выводится эвристически из названий церкви, селения,
 * уезда и региона. По умолчанию (Грузинский экзархат РПЦ) — «грузинская».
 */
export const CATEGORY_ORDER = [
  "georgian",
  "armenian",
  "russian",
  "military",
  "jewish",
  "catholic",
  "lutheran",
  "other",
] as const;

export type ParishCategory = (typeof CATEGORY_ORDER)[number];

// Палитра — синхронизирована с цветами Тбилиси, где это возможно
export const CATEGORY_COLORS: Record<ParishCategory, string> = {
  georgian: "#0072B2",
  armenian: "#D55E00",
  russian: "#56B4E9",
  military: "#009E73",
  jewish: "#117733",
  catholic: "#E69F00",
  lutheran: "#882255",
  other: "#999999",
};

const RX_ARMENIAN = /армян|григориан|armenian|armenia/i;
const RX_CATHOLIC = /католич|римско|catholic|roman cath/i;
const RX_LUTHERAN = /лютеран|кирх|lutheran|kirch/i;
const RX_JEWISH = /синагог|иудей|еврейск|synago|jewish|hebrew/i;
const RX_MILITARY = /военн|полков|гарнизон|казач|military|regiment|garrison|cossack/i;
const RX_RUSSIAN = /единовер|старообряд|русский приход|русская церк|russian parish/i;

export function categorizeParish(p: any): ParishCategory {
  if (!p) return "georgian";
  const parts: string[] = [];
  for (const k of ["church", "settlement", "region", "uezd"]) {
    const v = p[k];
    if (!v) continue;
    if (typeof v === "string") parts.push(v);
    else {
      if (v.ru) parts.push(v.ru);
      if (v.en) parts.push(v.en);
      if (v.ka) parts.push(v.ka);
    }
  }
  const blob = parts.join(" ");
  if (RX_ARMENIAN.test(blob)) return "armenian";
  if (RX_CATHOLIC.test(blob)) return "catholic";
  if (RX_LUTHERAN.test(blob)) return "lutheran";
  if (RX_JEWISH.test(blob)) return "jewish";
  if (RX_MILITARY.test(blob)) return "military";
  if (RX_RUSSIAN.test(blob)) return "russian";
  return "georgian";
}
