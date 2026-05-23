// Localization for Tbilisi church addresses and districts.
// The source dataset stores both fields in English only; this module provides
// ru / ka renderings.
import type { Lang } from "./i18n";

// Full-string district map (14 unique values).
const DISTRICTS: Record<string, { ru: string; ka: string }> = {
  Chughureti: { ru: "Чугурети", ka: "ჩუღურეთი" },
  Didube: { ru: "Дидубе", ka: "დიდუბე" },
  "Didube/Chughureti": { ru: "Дидубе/Чугурети", ka: "დიდუბე/ჩუღურეთი" },
  Gldani: { ru: "Глдани", ka: "გლდანი" },
  Isani: { ru: "Исани", ka: "ისანი" },
  Kakheti: { ru: "Кахетия", ka: "კახეთი" },
  Krtsanisi: { ru: "Крцаниси", ka: "კრწანისი" },
  "Kvemo Kartli": { ru: "Квемо-Картли", ka: "ქვემო ქართლი" },
  Mtatsminda: { ru: "Мтацминда", ka: "მთაწმინდა" },
  Nadzaladevi: { ru: "Надзаладеви", ka: "ნაძალადევი" },
  Saburtalo: { ru: "Сабуртало", ka: "საბურთალო" },
  Samgori: { ru: "Самгори", ka: "სამგორი" },
  Tbilisi: { ru: "Тбилиси", ka: "თბილისი" },
  Vake: { ru: "Ваке", ka: "ვაკე" },
};

// Place / street name tokens (without house numbers). We translate the prefix
// before the comma; the numeric suffix (", 18", ", 41") is appended as-is.
const PLACES: Record<string, { ru: string; ka: string }> = {
  "Aghmashenebeli Ave": { ru: "пр. Агмашенебели", ka: "აღმაშენებლის გამზ." },
  "Armazi St": { ru: "ул. Армази", ka: "არმაზის ქ." },
  "Atoneli St": { ru: "ул. Атонели", ka: "ათონელის ქ." },
  "Atoneli St area": { ru: "район ул. Атонели", ka: "ათონელის ქ. მიდამო" },
  Avlabari: { ru: "Авлабари", ka: "ავლაბარი" },
  "Beglar Akhospireli St": { ru: "ул. Беглара Ахоспирели", ka: "ბეგლარ ახოსპირელის ქ." },
  "Betlemi Rise": { ru: "Бетлемский подъём", ka: "ბეთლემის აღმართი" },
  Chughureti: { ru: "Чугурети", ka: "ჩუღურეთი" },
  "Chughureti/Kukia": { ru: "Чугурети/Кукия", ka: "ჩუღურეთი/კუკია" },
  "Dedoplistskaro (Tsarskiye Kolodtsy)": {
    ru: "Дедоплисцкаро (Царские Колодцы)",
    ka: "დედოფლისწყარო (ცარსკიე კოლოდცი)",
  },
  "Didi Lilo": { ru: "Диди-Лило", ka: "დიდი ლილო" },
  Dighomi: { ru: "Дигоми", ka: "დიღომი" },
  "Gelati St": { ru: "ул. Гелати", ka: "გელათის ქ." },
  "Gia Abesadze St": { ru: "ул. Гии Абесадзе", ka: "გია აბესაძის ქ." },
  Gldani: { ru: "Глдани", ka: "გლდანი" },
  "Gomi St": { ru: "ул. Гоми", ka: "გომის ქ." },
  "Harpukhi/Gorgasali": { ru: "Харпухи/Горгасали", ka: "ხარფუხი/გორგასალი" },
  "Ioane Shavteli St": { ru: "ул. Иоане Шавтели", ka: "იოანე შავთელის ქ." },
  "Javakhishvili St": { ru: "ул. Джавахишвили", ka: "ჯავახიშვილის ქ." },
  "Jerusalem St": { ru: "ул. Иерусалимская", ka: "იერუსალიმის ქ." },
  "Ketevan Tsamebuli Ave": { ru: "пр. Кетеван Цамебули", ka: "ქეთევან წამებულის გამზ." },
  Kharpukhi: { ru: "Харпухи", ka: "ხარფუხი" },
  "Kote Abkhazi St": { ru: "ул. Коте Абхази", ka: "კოტე აფხაზის ქ." },
  Kukia: { ru: "Кукия", ka: "კუკია" },
  "Kukia Cemetery": { ru: "Кукийское кладбище", ka: "კუკიის სასაფლაო" },
  "Kvemo Avchala": { ru: "Квемо-Авчала", ka: "ქვემო ავჭალა" },
  "Leselidze/Kote Abkhazi": { ru: "Леселидзе/Коте Абхази", ka: "ლესელიძე/კოტე აფხაზი" },
  Manglisi: { ru: "Манглиси", ka: "მანგლისი" },
  "Marjanishvili St": { ru: "ул. Марджанишвили", ka: "მარჯანიშვილის ქ." },
  "Metekhi Rise": { ru: "Метехский подъём", ka: "მეტეხის აღმართი" },
  Mtatsminda: { ru: "Мтацминда", ka: "მთაწმინდა" },
  "Mtatsminda Pantheon": { ru: "Пантеон на Мтацминде", ka: "მთაწმინდის პანთეონი" },
  Nadzaladevi: { ru: "Надзаладеви", ka: "ნაძალადევი" },
  Navtlughi: { ru: "Навтлуги", ka: "ნავთლუღი" },
  Ortachala: { ru: "Ортачала", ka: "ორთაჭალა" },
  "Patara Lilo": { ru: "Патара-Лило", ka: "პატარა ლილო" },
  "Pirosmani St area": { ru: "район ул. Пиросмани", ka: "ფიროსმანის ქ. მიდამო" },
  "Pushkin Square": { ru: "Пушкинская площадь", ka: "პუშკინის მოედანი" },
  "Pushkin St": { ru: "ул. Пушкина", ka: "პუშკინის ქ." },
  "Pushkin St area": { ru: "район ул. Пушкина", ka: "პუშკინის ქ. მიდამო" },
  "Railway Area": { ru: "Железнодорожный район", ka: "სარკინიგზო უბანი" },
  "Railway Station Area": { ru: "район вокзала", ka: "სადგურის უბანი" },
  "Rustaveli Ave": { ru: "пр. Руставели", ka: "რუსთაველის გამზ." },
  Saburtalo: { ru: "Сабуртало", ka: "საბურთალო" },
  "Samghebro St": { ru: "ул. Самгебро", ka: "სამღებროს ქ." },
  "Sioni St": { ru: "ул. Сиони", ka: "სიონის ქ." },
  Sololaki: { ru: "Сололаки", ka: "სოლოლაკი" },
  "Sultanishan St": { ru: "ул. Султанишан", ka: "სულთანიშანის ქ." },
  Tbilisi: { ru: "Тбилиси", ka: "თბილისი" },
  "Tbilisi (Red Barracks)": { ru: "Тбилиси (Красные казармы)", ka: "თბილისი (წითელი ყაზარმა)" },
  "Tbilisi/Bely Klyuch": { ru: "Тбилиси/Белый Ключ", ka: "თბილისი/თეთრიწყარო" },
  "Tbilisi/Dedoplistskaro": { ru: "Тбилиси/Дедоплисцкаро", ka: "თბილისი/დედოფლისწყარო" },
  "Tbilisi/Pyatigorsk": { ru: "Тбилиси/Пятигорск", ka: "თბილისი/პიატიგორსკი" },
  Telovani: { ru: "Теловани", ka: "თელოვანი" },
  "Tetritskaro (Bely Klyuch)": { ru: "Тетрицкаро (Белый Ключ)", ka: "თეთრიწყარო (ბელი კლიუჩი)" },
  Tsavkisi: { ru: "Цавкиси", ka: "წავკისი" },
  "Tsereteli Ave": { ru: "пр. Церетели", ka: "წერეთლის გამზ." },
  Tskneti: { ru: "Цхнети", ka: "წყნეთი" },
  Vera: { ru: "Вера", ka: "ვერა" },
  "Vera Cemetery": { ru: "Верийское кладбище", ka: "ვერის სასაფლაო" },
  "Zaldastanishvili St": { ru: "ул. Залдастанишвили", ka: "ზალდასტანიშვილის ქ." },
  "Zemo Avchala": { ru: "Земо-Авчала", ka: "ზემო ავჭალა" },
};

export function localizeDistrict(value: string, lang: Lang): string {
  if (!value) return value;
  if (lang === "en") return value;
  const hit = DISTRICTS[value];
  return hit ? hit[lang] : value;
}

export function localizeAddress(value: string, lang: Lang): string {
  if (!value) return value;
  if (lang === "en") return value;
  // Split off optional ", <number>" suffix.
  const m = value.match(/^(.*?)(,\s*\d+[A-Za-zА-Яа-я]?)?$/);
  const head = (m?.[1] ?? value).trim();
  const tail = m?.[2] ?? "";
  const hit = PLACES[head];
  if (hit) return hit[lang] + tail;
  // Fallback: try full-string match (handles values without a comma split).
  const full = PLACES[value];
  if (full) return full[lang];
  return value;
}
