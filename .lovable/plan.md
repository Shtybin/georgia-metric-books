# План: Карта церквей Тбилиси (`/tbilisi`)

## 1. Данные

Загруженный файл `Tiflis_Churches.txt` (107 церквей, ; как разделитель) очистить и сохранить как статический JSON для фронта.

- Скрипт `scripts/build-tbilisi.ts`:
  - Парсит CSV (учесть строки с лишними `;` внутри полей вроде `Confidence` — строки 6, где district попал в поле координат, и др. — нормализовать вручную/по эвристике).
  - Нормализует поля: `confession` (канонические ключи: `orthodox_georgian`, `orthodox_russian`, `orthodox_military`, `armenian_apostolic`, `greek_orthodox`, `roman_catholic`, `lutheran`, `jewish`, `molokan`, `baptist`, `assyrian`).
  - `confidence` → enum: `high | medium | low_district | low_approx`. Все, что не `High/Medium` → показывать предупреждение «точка приблизительная / по центру района».
  - Выход: `public/data/tbilisi-churches.json` (массив объектов с локализованными именами + всеми полями).

## 2. Маршрут и интеграция

- `src/routes/tbilisi.tsx` — новый route с `validateSearch` (`lang`), `head()` (title, description, og:title/desc/url/image, canonical) — по образцу `src/routes/map.tsx`.
- Обновить `src/routes/sitemap[.]xml.ts` — добавить `/tbilisi`.
- В `src/routes/index.tsx`: добавить заметную CTA-карточку «Карта церквей Тбилиси» рядом с инструкцией (своя иконка, ссылка на `/tbilisi`).
- В `src/components/map/MapView.tsx`:
  - В попапе фичи, у которой `settlement` ∈ {Тифлис/Тбилиси} — кнопка «Открыть карту церквей Тбилиси».
  - Дополнительно: слушатель `map.on('zoomend')` — если центр в bbox Тбилиси и `zoom ≥ 11`, показывать всплывающий floating-button (анимация fade+slide) в углу карты со ссылкой на `/tbilisi`.

## 3. Компонент карты `src/components/map/TbilisiMap.tsx`

MapLibre GL, базовая стилистика — `BASEMAP_STYLE` из `src/lib/map-style.ts`. Источник — GeoJSON из JSON-файла, слой circles с `match` по `confession` → цвет.

Палитра (Okabe-Ito + добавки, см. `map-style.ts`):
- orthodox_georgian #0072B2, orthodox_russian #56B4E9, orthodox_military #009E73, armenian_apostolic #D55E00, greek_orthodox #CC79A7, roman_catholic #E69F00, lutheran #882255, jewish #117733, molokan #AA4499, baptist #44AA99, assyrian #999933.

### Панель управления (sidebar / drawer на mobile):
- Поиск по названию (ru/en/ka), debounce.
- Multi-select чипы по конфессиям (тык по цвету = toggle фильтра); кнопка «Все/Сбросить».
- Диапазон лет (двойной слайдер 1818–1930) — фильтрует по пересечению `Record_Years`.
- Чекбоксы: «Только сохранившиеся», «Действующие сейчас».
- Языковой переключатель ru/en/ka (как на `/map`, через search-param).

### Карточка точки (Popover/Sheet):
- Локализованное название.
- Конфессия (с цветной плашкой).
- Годы ведения / пропущенные годы.
- Сохранилась (Yes/No/Uncertain) + действующая.
- Адрес, район, исторический комментарий, note.
- Если `confidence ∈ {low_district, low_approx}` → жёлтый Alert «Точное местоположение неизвестно — точка по центру района/города».
- Кнопка «Где искать оригиналы метрических книг» (текст копируем из общего попапа `MapView` / `ExternalSourcesList`) → ссылка на каталог FamilySearch с `q.place=Tiflis` + ссылка на НИАГ.
- Кнопка «Сообщить о проблеме» → переиспользует `ReportProblemButton` (передаём контекст: feature id, координаты, lang).

### Адаптивность
- Desktop ≥1024: sidebar 320px слева, карта справа.
- Tablet 768–1023: collapsible top-bar с фильтрами, карта во всю ширину.
- Mobile <768: bottom sheet (Drawer) с фильтрами; попап точки — полноэкранный Sheet снизу.

## 4. i18n

Добавить в `src/lib/i18n.ts` блок `tbilisi`: заголовки, лейблы фильтров, конфессии, статусы, тексты предупреждений, подсказка про оригиналы. Полностью на ru/en/ka.

## 5. SEO / безопасность

- `head()` с уникальными meta на ru/en/ka (как в `map.tsx`).
- Canonical `https://metrics.datatells.info/tbilisi`.
- JSON-LD `Map`/`Place` со списком церквей (упрощённо: WebPage + ItemList).
- Добавить в `src/routes/sitemap[.]xml.ts`.
- Никаких пользовательских данных не пишем — RLS не нужен. `problem_reports` уже имеет `INSERT for anon` с валидацией длины.

## 6. Технические детали

- Цвета конфессий — добавить токены в `src/styles.css` (`--conf-orthodox-georgian` и т.д.) и использовать через `getComputedStyle` или прямо hex в MapLibre paint-выражении (как уже сделано в `map-style.ts`).
- Кластеризация не требуется (107 точек), но включим `cluster: false` явно.
- Bounds Тбилиси: `[[44.70, 41.63],[44.90, 41.78]]` — `fitBounds` на старте.

## 7. Файлы

Новые:
- `scripts/build-tbilisi.ts`
- `public/data/tbilisi-churches.json`
- `src/routes/tbilisi.tsx`
- `src/components/map/TbilisiMap.tsx`
- `src/components/map/TbilisiFilters.tsx`
- `src/components/map/TbilisiChurchCard.tsx`

Изменяются:
- `src/lib/i18n.ts` (блок `tbilisi`)
- `src/styles.css` (цветовые токены конфессий)
- `src/routes/index.tsx` (CTA-карточка)
- `src/components/map/MapView.tsx` (кнопка в попапе Тифлиса + floating CTA на зуме)
- `src/routes/sitemap[.]xml.ts` (добавить `/tbilisi`)

## 8. Open questions

- Нужны ли отдельные OG-изображения для `/tbilisi` (по 3 языкам), или достаточно того же `og-map.jpg`?
- Floating-кнопка «при зуме на Тбилиси» — оставить вместе с пунктом в попапе, или только одно из двух?
