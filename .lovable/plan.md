
# Интерактивная карта метрических книг Грузии (1819–1930)

Производственное приложение: научная картография + UX, оптимизированный для встраивания, мобильных устройств и датасета ~5100 записей (с потенциалом масштабирования до 10k+).

---

## 1. Рекомендуемая архитектура карты

**Single-page карта на MapLibre GL JS** внутри текущего стека TanStack Start (React 19 + Vite 7).

```text
┌──────────────────────────────────────────────────┐
│  TanStack Start (SSR shell, SEO, OG-теги)        │
│  └── /map  (clientOnly map shell)                │
│       ├── <MapCanvas/>      MapLibre GL          │
│       ├── <SearchBox/>      cmdk + Fuse.js       │
│       ├── <LegendPanel/>    легенда + статистика │
│       ├── <DetailCard/>     popup/sheet          │
│       ├── <LangToggle/>     RU/EN                │
│       └── <EmbedFrame/>     /embed маршрут        │
└──────────────────────────────────────────────────┘
```

Ключевые решения:
- Карта инициализируется только на клиенте (`useEffect`), но страница рендерится SSR ради SEO и OG-превью при шаринге в LinkedIn/Facebook/Medium.
- Отдельный маршрут `/embed` — упрощённый layout без хедера, специально для `<iframe>`.
- Состояние карты (zoom, center, lang, выбранный пункт) → URL search params (`validateSearch` TanStack Router) — это даёт shareable deep links.

---

## 2. Технологический стек: сравнение и выбор

| Решение | Плюсы | Минусы | Вердикт |
|---|---|---|---|
| **Leaflet** | Простой, маленький бандл, raster-friendly | Canvas/DOM, тормозит на 10k+ точках, нет GPU-стилизации | Подходит для <2k точек |
| **MapLibre GL JS** | WebGL, vector tiles, нативные кластеры, бесплатные стили, OSS | Чуть тяжелее, кривая обучения | **Рекомендуется** |
| **Mapbox GL** | То же + платные стили | Требует токен и платный аккаунт | Нет — vendor lock-in |
| **Deck.gl** | Превосходен для миллионов точек, GPU-агрегации | Избыточен для 5k, сложнее UX-кастомизация попапов | Для будущей heatmap-надстройки |
| **Kepler.gl** | Готовый продукт | Не встраивается элегантно, плохо кастомизируется | Нет |

**Выбор: MapLibre GL JS** + опционально слой `deck.gl` через `MapboxOverlay` для будущих агрегаций.

Стек:
- **Карта:** `maplibre-gl` v4 + бесплатные тайлы (MapTiler free tier / OpenFreeMap / Stadia Maps)
- **Поиск:** `cmdk` (UI) + `fuse.js` (fuzzy multi-lingual search)
- **Геопространственное:** `@turf/turf` (distance, bbox), `rbush` или `geokdbush` для пространственного индекса
- **i18n:** `react-i18next` (UI) + два GeoJSON-файла (данные)
- **UI:** уже стоящий shadcn/ui + Tailwind v4
- **Шрифты:** **Inter** (UI, отлично поддерживает кириллицу и латиницу), **Source Serif 4** (заголовки карточек — историческая нотка, кириллический набор), системный fallback
- Размеры: 14px база, 16px popup body, 12px метки легенды; line-height 1.5; tabular-nums для годов

---

## 3. Модель данных и GeoJSON-схема

CSV → препроцессинг (одноразовый Node-скрипт `scripts/build-geojson.ts`) → два статических файла в `public/data/`:

- `points.en.geojson`
- `points.ru.geojson`

Препроцессор:
1. Игнорирует строки без `Latitude`/`Longitude` (но считает их для статистики).
2. Парсит `Years` и `Missing Years` в массивы `number[]`.
3. Считает `coverage = (endYear - startYear + 1) - missingYears.length`.
4. Кладёт оба языка в один файл с `properties.i18n` — лучше, чем два файла, т.к. экономит трафик и сохраняет единый id (см. §9).

**Финальная схема (один файл, рекомендуется):**

```json
{
  "type": "Feature",
  "id": 42,
  "geometry": { "type": "Point", "coordinates": [42.23, 42.01] },
  "properties": {
    "settlement": { "ru": "Никози", "en": "Nikozi" },
    "church":     { "ru": "Св. Георгия", "en": "St. George" },
    "region":     { "ru": "—", "en": "—" },
    "uezd":       { "ru": "Горийский уезд", "en": "Goriyskiy Uezd" },
    "startYear": 1830,
    "endYear": 1860,
    "missingYears": [1836, 1841, 1842],
    "yearsRaw":   { "ru": "1830-1835, ...", "en": "1830-1835, ..." },
    "coverage": 19,
    "bucket": "1820-1840"
  }
}
```

**Решение по мультиязычности:** один GeoJSON со встроенным `i18n` объектом. Переключение языка не дёргает сеть, не сбрасывает zoom, фильтры и выбранную точку — просто переписывает текстовые expressions в стилях слоя через `map.setLayoutProperty('labels','text-field', ['get', 'settlement', ['get', lang]])` и перерисовывает popup.

---

## 4. Доступность и цветовая система

**Палитра — Okabe-Ito (5 категорий из 8), модифицированная для светлого и тёмного базового слоя:**

| Bucket Start Year | HEX | Обоснование |
|---|---|---|
| до 1840 | `#0072B2` (синий) | Старейшие — холодный, «архивный» |
| 1840–1860 | `#009E73` (зелёный) | |
| 1860–1880 | `#E69F00` (оранжевый) | |
| 1880–1900 | `#CC79A7` (розово-сливовый) | |
| после 1900 | `#D55E00` (киноварь) | Самые поздние — тёплый акцент |

Почему Okabe-Ito:
- Различим при всех типах дальтонизма (deuter/prot/tritan), проверено научной литературой (Okabe & Ito 2008).
- Контраст к OSM-серому базовому слою и к тёмному CARTO Dark Matter ≥ 3:1 (WCAG для не-текста).
- В отличие от ColorBrewer sequential, эти цвета **категориальные**, что точнее отражает «корзины» (а не градацию).
- Tableau 2.0 — близкая альтернатива, но Okabe-Ito лучше документирован для дальтоников.

Точкам даётся белая обводка `#FFFFFF` 1.5px — обязательное «отделение» от любого базового слоя (классический картографический приём, Brewer 2015).

Тёмная тема: тот же набор + увеличенная opacity обводки до 80% черного для контурной читаемости на светлом тайле.

---

## 5. Логика размера точек

Формула:

```text
coverage = (endYear − startYear + 1) − missingYears.length
radius   = clamp( sqrt(coverage) * 1.6, 4, 18 )   // в пикселях
```

Объяснение:
- `sqrt` — площадь круга пропорциональна coverage (правило Flannery): пользователь воспринимает площадь, не радиус.
- `clamp(4..18)` — нижний порог гарантирует кликабельность (≥44px touch target вместе с halo на мобильном), верхний предотвращает «баблы-доминаторы».
- На zoom < 6 умножаем на 0.7 через MapLibre `interpolate` expression — точки не слипаются на мелком масштабе.

В MapLibre это выражается одним expression без JS-цикла:
```js
'circle-radius': [
  'interpolate', ['linear'], ['zoom'],
  4, ['max', 3, ['*', ['sqrt', ['get','coverage']], 1.0]],
  10, ['max', 4, ['*', ['sqrt', ['get','coverage']], 1.6]]
]
```

---

## 6. UX поиска

- Кнопка/инпут в верхнем левом углу (на мобильном — full-width sticky сверху).
- `cmdk` Command Palette (Ctrl/⌘K), внутри — `Fuse.js` индекс по `settlement.ru`, `settlement.en`, `church.*`, `uezd.*`, threshold 0.3, `minMatchCharLength: 2`.
- Выпадающий список: имя поселения + церковь + уезд (мелким, muted-foreground), макс. 8 результатов.
- При выборе:
  1. `map.flyTo({ center, zoom: 11, duration: 900, essential: true })`
  2. Устанавливается `selectedId` в feature-state → отдельный слой `selected-halo` рисует пульсирующее кольцо (CSS-анимация невозможна в WebGL; используем `circle-radius` interpolate + `requestAnimationFrame` с ease-in-out 0..1).
  3. Selected feature рендерится в **отдельном top-most слое** — никогда не теряется в кластерах (см. §11: cluster bypass).
  4. Halo живёт пока пользователь не выберет другую точку или не нажмёт Esc — не исчезает по таймеру.

Мультиязычный поиск: один Fuse-индекс с обоими языками, поэтому пользователь, переключённый на EN, всё равно найдёт «Никози».

---

## 7. Анализ радиуса 50 км

**Геопространственный индекс:** `geokdbush` (KD-tree поверх `kdbush`), построенный один раз при загрузке. O(log n) на запрос против O(n) брутфорса — критично при 10k+.

**Дистанция:** Haversine через `geokdbush.around(index, lon, lat, Infinity, 50 /*km*/)`. Точность ~0.5% на расстояниях <100 км — достаточно.

Поток клика:
1. Клик → получаем feature → kd-tree → массив id соседей.
2. На карту добавляем feature-state `inRadius=true` → отдельный paint-стиль (увеличенная обводка `#111` 2px, opacity 1.0; не-входящие → opacity 0.25).
3. Рисуем сам круг радиусом 50 км через `turf.circle(center, 50, {steps: 96})` как заполненный полигон с opacity 0.08 и обводкой 1.5px пунктиром.
4. В popup показываем `Найдено в радиусе 50 км: N`.
5. На мобильном — кнопка «Сбросить выделение» в bottom sheet.

Производительность: feature-state не перестраивает GeoJSON-источник, только GPU-paint — мгновенно даже на 50k точек.

---

## 8. Дизайн popup и легенды

Popup (desktop) / bottom sheet (mobile, `<Drawer>` shadcn):

```text
┌──────────────────────────────────────┐
│  Никози                              │  ← H3, Source Serif 4, 18px
│  Св. Георгия                         │  ← muted, italic, 14px
│  ────────────────────────────────    │
│  Регион     Горийский уезд           │
│  Период     1830–1860 (19 лет данных)│
│  Пропуски   1836, 1841–1850, 1857    │
│                                      │
│  [ Показать в радиусе 50 км → ]      │  ← primary button
└──────────────────────────────────────┘
```

- Контраст текст/фон ≥ 7:1 (WCAG AAA для основного текста).
- max-width 320px, padding 16px, radius 12px, shadow-elegant из дизайн-системы.
- Семантические токены: `--popover`, `--popover-foreground`, `--primary`.
- ARIA: `role="dialog"`, `aria-labelledby="settlement-name"`.
- Compact список пропусков: схлопывает последовательные годы в `1841–1850`.

Легенда:
- Закреплённая компактная карточка нижний-правый угол.
- 5 цветовых маркеров + подписи периодов, сортируемая, кликабельная (фильтрует слой через `setFilter`).
- Внизу мини-блок **статистики** (см. §13).

---

## 9. Архитектура переключения языков

- UI-строки → `react-i18next` с двумя ресурсами `ru.json`/`en.json`.
- Данные → один GeoJSON с `properties.{field}.{lang}` (см. §3) — переключение языка не требует повторной загрузки и не сбрасывает состояние карты.
- Активный язык — в URL (`?lang=ru`) через TanStack Router `validateSearch` → SSR отдаёт правильные OG-теги при шаринге.
- Стилевые expressions используют динамический `lang` через `setLayoutProperty('symbols', 'text-field', ['get', lang, ['get','settlement']])`.

**Альтернатива (отвергнута):** два отдельных файла. Отвергнута потому что: дублирует id, дублирует геометрию, удваивает бандл, ломает feature-state при переключении.

---

## 10. Встраивание и деплой

- Маршрут `/embed?lang=ru&focus=42` — без хедера/футера, full-bleed карта, branding watermark.
- HTTP-заголовки разрешают iframe: `Content-Security-Policy: frame-ancestors *` (или whitelist medium.com, linkedin.com, facebook.com).
- Адаптивный iframe-сниппет на отдельной странице `/share`:
  ```html
  <iframe src="https://map.example.com/embed" style="width:100%;aspect-ratio:16/10;border:0" loading="lazy" allowfullscreen></iframe>
  ```
- OG-теги динамически генерируются из выбранной точки (`focus=`) — превью в LinkedIn/Facebook/Medium.
- **Деплой:** Cloudflare Workers (соответствует TanStack Start template). GeoJSON и тайлы — на CDN (Cloudflare R2 + Cache rules `s-maxage=31536000, immutable` после хеширования имени файла).
- Static-friendly: данные мутируются раз в N месяцев → агрессивное кеширование, hashed filenames, prefetch с `<link rel="preload" as="fetch">`.

Mobile:
- Тайлы vector (~30–80 КБ/тайл) предпочтительнее raster.
- `prefers-reduced-motion` → выключаем halo-pulse.
- Touch-targets ≥44px (за счёт прозрачного hit-кольца).

---

## 11. Производительность для 10k+ точек

- Источник `cluster: true, clusterRadius: 50, clusterMaxZoom: 9`.
- Три слоя: `clusters` (counts), `unclustered-points`, `selected-top` (bypass-кластер: дублируем выбранную фичу как отдельный неклaстеризуемый источник, чтобы выделение всегда было видно).
- Фильтрация по периоду — через `setFilter` (GPU), а не пересборка GeoJSON.
- KD-tree строится один раз в Web Worker (`comlink`), не блокирует main thread.
- Поиск Fuse.js — тоже в Web Worker.
- Bundle split: `maplibre-gl` динамическим импортом — карта не блокирует initial paint.
- Lighthouse-бюджет: TTI < 3.5s на 4G, JS < 250KB gzip без maplibre.

---

## 12. Примеры кода

**Радиус-поиск (Web Worker):**
```ts
import KDBush from 'kdbush';
import { around } from 'geokdbush';
let index: KDBush;
self.onmessage = ({data}) => {
  if (data.type === 'init') {
    index = new KDBush(data.points.length);
    data.points.forEach((p:any) => index.add(p.lon, p.lat));
    index.finish();
  }
  if (data.type === 'query') {
    const ids = around(index, data.lon, data.lat, Infinity, 50);
    self.postMessage({ ids });
  }
};
```

**Динамическая стилизация (категория + размер):**
```ts
map.addLayer({
  id: 'points',
  type: 'circle',
  source: 'parishes',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': ['match', ['get','bucket'],
      'pre-1840','#0072B2','1840-1860','#009E73',
      '1860-1880','#E69F00','1880-1900','#CC79A7',
      /*default*/ '#D55E00'],
    'circle-radius': ['interpolate',['linear'],['zoom'],
      4, ['max',3,['*',['sqrt',['get','coverage']],1.0]],
      10,['max',4,['*',['sqrt',['get','coverage']],1.6]]],
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#fff',
  }
});
```

**Autocomplete (Fuse, мультиязычный):**
```ts
const fuse = new Fuse(features, {
  keys: ['properties.settlement.ru','properties.settlement.en',
         'properties.church.ru','properties.church.en'],
  threshold: 0.3, minMatchCharLength: 2, includeScore: true
});
const hits = fuse.search(query).slice(0,8);
```

**Переключение языка без перезагрузки:**
```ts
function setLang(lang: 'ru'|'en') {
  map.setLayoutProperty('labels','text-field',
    ['get', lang, ['get','settlement']]);
  i18n.changeLanguage(lang);
  // popup перерисуется через React state
}
```

---

## 13. Панель статистики

Считается один раз в препроцессоре и встраивается в манифест `public/data/stats.json`:
```json
{ "total": 5102, "withCoords": 3120, "withoutCoords": 1982,
  "geocodingConfidence": 0.611 }
```

UI: компактный блок 220×88 в нижней правой легенде.
```text
Всего записей       5 102
С координатами      3 120  (61.1%)
Без координат       1 982  (38.9%)
Уверенность геокода 61.1%
```

---

## 14. Структура проекта

```text
src/
├── routes/
│   ├── __root.tsx
│   ├── index.tsx              # лендинг + CTA "Открыть карту"
│   ├── map.tsx                # полное приложение
│   ├── embed.tsx              # iframe-вариант
│   └── share.tsx              # генератор iframe-кода
├── components/
│   └── map/
│       ├── MapCanvas.tsx
│       ├── SearchBox.tsx
│       ├── LegendPanel.tsx
│       ├── StatsPanel.tsx
│       ├── DetailCard.tsx
│       ├── LangToggle.tsx
│       └── layers.ts          # MapLibre style expressions
├── workers/
│   ├── spatial.worker.ts      # kdbush + geokdbush
│   └── search.worker.ts       # fuse.js
├── lib/
│   ├── i18n.ts
│   ├── buckets.ts             # классификатор start year
│   └── geo.ts                 # turf helpers
└── styles.css

scripts/
└── build-geojson.ts           # CSV → GeoJSON + stats.json

public/data/
├── parishes.geojson           # объединённый RU+EN
└── stats.json
```

---

## 15. Финальная рекомендуемая прод-архитектура

```text
[ CSV (RU+EN) ]
      │  build-time (npm script, CI)
      ▼
[ scripts/build-geojson.ts ] ──► public/data/*.geojson + stats.json (hashed)
      │
      ▼
[ TanStack Start app on Cloudflare Workers ]
      │  SSR shell (SEO, OG)
      ├── /        лендинг
      ├── /map     карта
      ├── /embed   iframe
      └── /share   генератор кода
            │
            ▼
[ MapLibre GL (client) ] + [ Web Workers: spatial, search ]
            │
            ▼
[ Cloudflare CDN: tiles + GeoJSON, immutable cache ]
```

Долгосрочная поддержка: данные обновляются через PR с новым CSV → CI пересобирает GeoJSON → деплой. Никакой БД не нужна, пока датасет статичен. Если в будущем потребуется пользовательский ввод/коллаборация — добавляем Lovable Cloud (Postgres + PostGIS) и API-маршрут `/api/parishes` с server function.

---

## Открытые вопросы перед реализацией

1. Подтверждаете ли выбор **MapLibre GL JS + Okabe-Ito + один объединённый GeoJSON**? (vs Leaflet / отдельные файлы по языку)
2. Нужны ли дополнительные фильтры в легенде (по уезду, церкви, диапазону покрытия) — или только цветовые корзины?
3. Базовый слой по умолчанию: светлый (Positron) или тёмный (Dark Matter)? Делать ли переключатель?
4. Нужен ли маршрут `/share` с конструктором iframe-кода уже на MVP, или пока достаточно просто `/embed`?

После ответов начну реализацию: препроцессор → routes/map → слои/поиск → радиус → embed.
