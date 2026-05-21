import type { Lang } from "@/lib/i18n";

export type Confession =
  | "orthodox_georgian"
  | "orthodox_russian"
  | "orthodox_military"
  | "armenian_apostolic"
  | "greek_orthodox"
  | "roman_catholic"
  | "lutheran"
  | "jewish"
  | "molokan"
  | "baptist"
  | "assyrian"
  | "other";

export type Confidence = "high" | "medium" | "low" | "low_district" | "low_approx" | "unknown";
export type YesNo = "yes" | "no" | "uncertain";

export const CONFESSION_COLORS: Record<Confession, string> = {
  orthodox_georgian: "#0072B2",
  orthodox_russian: "#56B4E9",
  orthodox_military: "#009E73",
  armenian_apostolic: "#D55E00",
  greek_orthodox: "#CC79A7",
  roman_catholic: "#E69F00",
  lutheran: "#882255",
  jewish: "#117733",
  molokan: "#AA4499",
  baptist: "#44AA99",
  assyrian: "#999933",
  other: "#888888",
};

export const CONFESSION_ORDER: Confession[] = [
  "orthodox_georgian",
  "orthodox_russian",
  "orthodox_military",
  "armenian_apostolic",
  "greek_orthodox",
  "roman_catholic",
  "lutheran",
  "jewish",
  "molokan",
  "baptist",
  "assyrian",
  "other",
];

export const TBILISI_STRINGS = {
  ru: {
    metaTitle: "Церкви Тбилиси (Тифлиса) · Карта приходов 1818–1924",
    metaDesc:
      "Интерактивная карта 108 церквей Тбилиси (Тифлиса) разных конфессий — годы метрических книг, состояние храмов, фильтры по эпохе и вере.",
    h1: "Церкви Тбилиси",
    subtitle: "108 приходов разных конфессий · метрические книги 1818–1924",
    backToMap: "К общей карте",
    open: "Открыть карту церквей Тбилиси",
    openShort: "Карта Тбилиси",
    search: "Поиск по названию церкви…",
    confessionFilter: "Конфессия / община",
    yearRange: "Период метрических книг",
    onlyPreserved: "Только сохранившиеся",
    onlyActive: "Только действующие",
    reset: "Сбросить фильтры",
    foundCount: (n: number, total: number) => `Показано: ${n} из ${total}`,
    showFilters: "Фильтры",
    hideFilters: "Скрыть",
    showAll: "Показать все",
    hideAll: "Убрать все",
    confessions: {
      orthodox_georgian: "Православие (Грузинский экзархат)",
      orthodox_russian: "Православие (Русский приход)",
      orthodox_military: "Православие (Военные храмы)",
      armenian_apostolic: "Армянская апостольская",
      greek_orthodox: "Греческая православная",
      roman_catholic: "Римско-Католическая",
      lutheran: "Лютеранская (кирха)",
      jewish: "Иудаизм (синагога)",
      molokan: "Молоканская",
      baptist: "Баптистская",
      assyrian: "Ассирийская (айсорская)",
      other: "Прочие",
    },
    confessionsShort: {
      orthodox_georgian: "грузины",
      orthodox_russian: "русские",
      orthodox_military: "военные",
      armenian_apostolic: "армяне",
      greek_orthodox: "греки",
      roman_catholic: "католики",
      lutheran: "лютеране",
      jewish: "иудеи",
      molokan: "молокане",
      baptist: "баптисты",
      assyrian: "ассирийцы",
      other: "прочие",
    },
    fields: {
      address: "Адрес",
      district: "Район",
      recordYears: "Годы метрических книг",
      missingYears: "Пропущенные годы",
      preserved: "Сохранилась",
      active: "Действует сегодня",
      note: "Примечание",
      historicalNote: "История",
      confession: "Конфессия",
    },
    yesNo: { yes: "да", no: "нет", uncertain: "неясно" } as Record<YesNo, string>,
    confidenceWarn: {
      low_district: "Точное местоположение неизвестно — точка поставлена по центру района.",
      low_approx: "Координаты приблизительные — точка поставлена ориентировочно.",
      low: "Низкая точность координат — точка может быть смещена.",
    } as Partial<Record<Confidence, string>>,
    archiveButton: "Где искать оригиналы метрических книг?",
    reportButton: "Сообщить о проблеме",
    legendTitle: "Легенда: конфессии",
    cityZoomCta: "Открыть карту церквей Тбилиси",
  },
  en: {
    metaTitle: "Churches of Tbilisi (Tiflis) · Parish map 1818–1924",
    metaDesc:
      "Interactive map of 108 churches of Tbilisi (Tiflis) across confessions — parish-register years, preservation status, filters by period and faith.",
    h1: "Churches of Tbilisi",
    subtitle: "108 parishes across confessions · parish registers 1818–1924",
    backToMap: "Back to main map",
    open: "Open the Tbilisi churches map",
    openShort: "Tbilisi map",
    search: "Search by church name…",
    confessionFilter: "Confession / community",
    yearRange: "Register period",
    onlyPreserved: "Preserved only",
    onlyActive: "Active only",
    reset: "Reset filters",
    foundCount: (n: number, total: number) => `Showing: ${n} of ${total}`,
    showFilters: "Filters",
    hideFilters: "Hide",
    showAll: "Show all",
    hideAll: "Hide all",
    confessions: {
      orthodox_georgian: "Orthodox (Georgian Exarchate)",
      orthodox_russian: "Orthodox (Russian parish)",
      orthodox_military: "Orthodox (Military churches)",
      armenian_apostolic: "Armenian Apostolic",
      greek_orthodox: "Greek Orthodox",
      roman_catholic: "Roman Catholic",
      lutheran: "Lutheran (Kirche)",
      jewish: "Jewish (Synagogue)",
      molokan: "Molokan",
      baptist: "Baptist",
      assyrian: "Assyrian (Aysor)",
      other: "Other",
    },
    fields: {
      address: "Address",
      district: "District",
      recordYears: "Register years",
      missingYears: "Missing years",
      preserved: "Preserved",
      active: "Active today",
      note: "Note",
      historicalNote: "History",
      confession: "Confession",
    },
    yesNo: { yes: "yes", no: "no", uncertain: "unclear" } as Record<YesNo, string>,
    confidenceWarn: {
      low_district: "Exact location unknown — point placed at the district centre.",
      low_approx: "Approximate coordinates — point placed indicatively.",
      low: "Low coordinate accuracy — the point may be slightly off.",
    } as Partial<Record<Confidence, string>>,
    archiveButton: "Where to find the original parish registers?",
    reportButton: "Report a problem",
    legendTitle: "Legend: confessions",
    cityZoomCta: "Open the Tbilisi churches map",
  },
  ka: {
    metaTitle: "თბილისის ეკლესიები · სამრევლოების რუკა 1818–1924",
    metaDesc:
      "თბილისის 108 ეკლესიის ინტერაქტიული რუკა სხვადასხვა კონფესიის მიხედვით — მეტრიკული წიგნების წლები, შენარჩუნების სტატუსი, ფილტრები.",
    h1: "თბილისის ეკლესიები",
    subtitle: "108 სამრევლო სხვადასხვა კონფესიის · მეტრიკული წიგნები 1818–1924",
    backToMap: "მთავარ რუკაზე",
    open: "თბილისის ეკლესიების რუკის გახსნა",
    openShort: "თბილისის რუკა",
    search: "ეკლესიის სახელით ძიება…",
    confessionFilter: "კონფესია / თემი",
    yearRange: "მეტრიკული წიგნების პერიოდი",
    onlyPreserved: "მხოლოდ შენარჩუნებული",
    onlyActive: "მხოლოდ მოქმედი",
    reset: "ფილტრების გასუფთავება",
    foundCount: (n: number, total: number) => `ნაჩვენებია: ${n} / ${total}`,
    showFilters: "ფილტრები",
    hideFilters: "დამალვა",
    showAll: "ყველას ჩვენება",
    hideAll: "ყველას დამალვა",
    confessions: {
      orthodox_georgian: "მართლმადიდებლური (ქართული ეგზარქატი)",
      orthodox_russian: "მართლმადიდებლური (რუსული სამრევლო)",
      orthodox_military: "მართლმადიდებლური (სამხედრო)",
      armenian_apostolic: "სომხური სამოციქულო",
      greek_orthodox: "ბერძნული მართლმადიდებლური",
      roman_catholic: "რომაულ-კათოლიკური",
      lutheran: "ლუთერანული (კირხა)",
      jewish: "იუდაიზმი (სინაგოგა)",
      molokan: "მოლოკანური",
      baptist: "ბაპტისტური",
      assyrian: "ასირიული (აისორების)",
      other: "სხვა",
    },
    fields: {
      address: "მისამართი",
      district: "უბანი",
      recordYears: "მეტრიკული წიგნების წლები",
      missingYears: "გამოტოვებული წლები",
      preserved: "შენარჩუნებულია",
      active: "მოქმედია დღეს",
      note: "შენიშვნა",
      historicalNote: "ისტორია",
      confession: "კონფესია",
    },
    yesNo: { yes: "კი", no: "არა", uncertain: "გაურკვეველი" } as Record<YesNo, string>,
    confidenceWarn: {
      low_district: "ზუსტი მდებარეობა უცნობია — წერტილი დასმულია უბნის ცენტრში.",
      low_approx: "კოორდინატები სავარაუდოა — წერტილი დასმულია მიახლოებით.",
      low: "კოორდინატების სიზუსტე დაბალია — წერტილი შესაძლოა ოდნავ გადახრილი იყოს.",
    } as Partial<Record<Confidence, string>>,
    archiveButton: "სად ვიპოვო მეტრიკული წიგნების ორიგინალები?",
    reportButton: "პრობლემის შეტყობინება",
    legendTitle: "ლეგენდა: კონფესიები",
    cityZoomCta: "თბილისის ეკლესიების რუკის გახსნა",
  },
} as const;

export const tT = (lang: Lang) => TBILISI_STRINGS[lang];

/** Tbilisi bbox: roughly (lon_min, lat_min, lon_max, lat_max) */
export const TBILISI_BBOX: [number, number, number, number] = [44.70, 41.63, 44.92, 41.80];

export function isInsideTbilisi(lon: number, lat: number): boolean {
  const [x1, y1, x2, y2] = TBILISI_BBOX;
  return lon >= x1 && lon <= x2 && lat >= y1 && lat <= y2;
}
