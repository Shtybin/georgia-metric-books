/**
 * Эвристическая классификация приходов основной карты по конфессии/общине.
 * Источник `public/data/parishes.geojson` не содержит явного поля «конфессия»,
 * поэтому категория выводится из:
 *   1) явных ключевых слов в названии церкви (RU/EN/KA),
 *   2) ареальных подсказок (армянские, греческие, немецкие, молоканские
 *      сёла и т. п. — см. LOCATION_HINTS),
 *   3) дефолта `orthodox_georgian` (Грузинский экзархат РПЦ).
 *
 * Возвращается массив (`Confession[]`): точка с несколькими церквями разных
 * конфессий подсвечивается под каждый соответствующий фильтр.
 */
import type { Confession } from "@/lib/i18n-tbilisi";

// ---------------------------------------------------------------------------
// Ключевые слова в названии церкви
// ---------------------------------------------------------------------------

type KeywordRule = { re: RegExp; cat: Confession };

const KEYWORD_RULES: KeywordRule[] = [
  { re: /армян|григориан|haykakan|armenian|სომხ/i, cat: "armenian_apostolic" },
  { re: /католич|римско-католич|римско\s*-?\s*католич|catholic|roman cath|კათოლიკ/i, cat: "roman_catholic" },
  { re: /лютеран|кирх|lutheran|kirche|kirch|ლუთერ/i, cat: "lutheran" },
  { re: /синагог|еврейск|иудей|jewish|hebrew|synagogue|სინაგოგ|იუდე/i, cat: "jewish" },
  { re: /молокан|molokan|მოლოკან/i, cat: "molokan" },
  { re: /баптист|baptist|ბაპტისტ/i, cat: "baptist" },
  { re: /ассир|айсор|assyrian|aysor|ასირი/i, cat: "assyrian" },
  { re: /греческ|греч\.|greek|ბერძნ/i, cat: "greek_orthodox" },
  { re: /военн|полков|гарнизон|казач|military|regimental|garrison|cossack|სამხედრო/i, cat: "orthodox_military" },
  { re: /единовер|старообряд|русский приход|русская церк|old believer|russian parish/i, cat: "orthodox_russian" },
];

// ---------------------------------------------------------------------------
// Ареальные подсказки
//
// Каждая запись — нормализованное селение / уезд / регион → набор конфессий,
// который добавляется к категориям точки. В смешанных ареалах (армянский +
// православный) обе категории сохраняются, чтобы не «потерять» точки под
// фильтром.
// ---------------------------------------------------------------------------

const norm = (s: string | undefined | null): string =>
  (s || "")
    .toString()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\s\-‐‑‒–—_().,;]+/g, " ")
    .trim();

type AreaRule = {
  // matcher receives normalized settlement|uezd|region tokens
  match: (s: string, u: string, r: string) => boolean;
  add: Confession[];
  /** keep default `orthodox_georgian` alongside? (mixed areas) */
  keepDefault?: boolean;
};

// Lists of normalized place tokens
const ARM_SETTLEMENTS = new Set([
  "хертвиси", "хизабавра", "цхалтбила", "ниноцминда", "богдановка",
  "александрополь", "лори", "гюмри",
]);

const GERMAN_COLONIES = new Set([
  "екатериненфельд", "katharinenfeld", "болниси",
  "элизабетталь", "elisabethtal", "асурети",
  "мариенфельд", "marienfeld", "сартичала",
  "александерсхильф", "alexanderhilf",
  "петерсдорф", "petersdorf",
  "анненфельд", "annenfeld",
  "тифлисская колония", "новотифлисская колония",
]);

const MOLOKAN_DUHOBOR = new Set([
  "гореловка", "орловка", "ефремовка", "спасовка",
  "ново михайловка", "новомихайловка", "михайловка молокан",
  "воронцовка", "башкичет", "башкечет", "привольное",
  "родионовка", "терновка", "тамбовка",
]);

const GREEK_VILLAGES = new Set([
  "цалка", "бешташени", "авранло", "триалет", "сантас",
  "квемо хараба", "земо хараба", "цинцкаро", "тарсон",
]);

const JEWISH_TOWNS = new Set([
  "ахалцихе", "они", "кулаши", "лайлаши", "сачхере",
  "цхинвал", "цхинвали", "карели",
]);

const RUS_PEASANT = new Set([
  "бомборы", "анастасиевка", "свободное", "михайловское",
  "новогеоргиевское", "александровское",
]);

const MILITARY_FORTS = new Set([
  "ананури", "сурам", "сурами", "ахалкалаки крепость",
  "хорошани", "цхинвал гарнизон",
]);

const AREA_RULES: AreaRule[] = [
  // Ахалкалакский уезд — преимущественно армянское население.
  {
    match: (_s, u) => /ахалкалак/i.test(u),
    add: ["armenian_apostolic"],
    keepDefault: false,
  },
  // Борчалинский уезд / Лорийский участок — смешанный (армяне + грузины + молокане).
  // По селению не определяем — оставляем дефолт, отдельные случаи закроют именные правила.
  // Армянские сёла в других уездах
  { match: (s) => ARM_SETTLEMENTS.has(s), add: ["armenian_apostolic"], keepDefault: false },
  // Немецкие колонии — лютеране (некоторые позже отошли к католикам, но базово лютеране)
  { match: (s) => GERMAN_COLONIES.has(s), add: ["lutheran"], keepDefault: false },
  // Молоканские/духоборские сёла — молокане (категорию `duhobor` отдельно не вводим)
  { match: (s) => MOLOKAN_DUHOBOR.has(s), add: ["molokan"], keepDefault: false },
  // Греческие сёла Цалки/Тетрицкаро
  { match: (s) => GREEK_VILLAGES.has(s), add: ["greek_orthodox"], keepDefault: false },
  // Еврейские общины — в этих городах синагога была наряду с православными храмами
  { match: (s) => JEWISH_TOWNS.has(s), add: ["jewish"], keepDefault: true },
  // Русские крестьянские поселения
  { match: (s) => RUS_PEASANT.has(s), add: ["orthodox_russian"], keepDefault: false },
  // Военные крепости
  { match: (s) => MILITARY_FORTS.has(s), add: ["orthodox_military"], keepDefault: true },
];

// ---------------------------------------------------------------------------
// Разбиение строки `church` на отдельные токены
// ---------------------------------------------------------------------------

const SPLIT_RE = /\s*[|;/]\s*|\s+–\s+/g;

function tokenizeChurch(s: string | undefined | null): string[] {
  if (!s) return [];
  return s.split(SPLIT_RE).map((t) => t.trim()).filter(Boolean);
}

function classifyToken(token: string): Confession | null {
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(token)) return rule.cat;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Главная функция
// ---------------------------------------------------------------------------

export function categorizeParish(props: any): Confession[] {
  if (!props) return ["orthodox_georgian"];
  const cats = new Set<Confession>();

  // 1) Токены по полю `church` для всех языков
  const churchObj = props.church;
  const churchStrs: string[] = [];
  if (typeof churchObj === "string") churchStrs.push(churchObj);
  else if (churchObj && typeof churchObj === "object") {
    for (const k of ["ru", "en", "ka"]) {
      if (churchObj[k]) churchStrs.push(String(churchObj[k]));
    }
  }
  let hasOrthodoxToken = false;
  for (const s of churchStrs) {
    for (const token of tokenizeChurch(s)) {
      const c = classifyToken(token);
      if (c) cats.add(c);
      else if (token.length > 0) hasOrthodoxToken = true; // нейтральное «Св. X»
    }
  }

  // 2) Ареальные подсказки
  const sNorm = norm(props.settlement?.ru || props.settlement?.en);
  const uNorm = norm(props.uezd?.ru || props.uezd?.en);
  const rNorm = norm(props.region?.ru || props.region?.en);
  let areaApplied: AreaRule | null = null;
  for (const rule of AREA_RULES) {
    if (rule.match(sNorm, uNorm, rNorm)) {
      for (const c of rule.add) cats.add(c);
      areaApplied = rule;
      break;
    }
  }

  // 3) Дефолт: грузинский экзархат — если нет явных маркеров и не отменён ареальной
  if (cats.size === 0) {
    cats.add("orthodox_georgian");
  } else if (hasOrthodoxToken) {
    // В смешанных ареалах (areaApplied?.keepDefault === true) или когда токены
    // включают и нейтральные православные названия, добавляем грузинский экзархат.
    if (!areaApplied || areaApplied.keepDefault !== false) {
      cats.add("orthodox_georgian");
    }
  }

  return Array.from(cats);
}

// Удобный экспорт для скрипта аудита
export const __internals = { tokenizeChurch, classifyToken, norm, AREA_RULES, KEYWORD_RULES };
