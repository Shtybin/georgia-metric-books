## Проблема

На `/map` рендерится UI поверх карты (поиск, легенда, статистика), но сама карта — белый холст без зум-контролов и тайлов. Сеть показывает: стиль Positron, шрифты, спрайты и `parishes.geojson` загружены успешно, но **запросов к векторным тайлам нет вообще** — значит, инстанс MapLibre либо не создан, либо создан в контейнере 0×0 и сразу осиротел.

## Причина

В `src/routes/map.tsx` и `src/routes/embed.tsx` `MapView` подключается через runtime-`import()` + `setMounted`:

```tsx
const [Mounted, setMounted] = useState(null);
useEffect(() => {
  import("@/components/map/MapView").then((m) => setMounted(() => m.MapView));
}, []);
```

Это даёт двойной mount при SSR-гидрации и HMR: первый раз `MapView` монтируется → `useEffect` создаёт `maplibregl.Map` → `mapRef.current` записан → компонент размонтируется → `map.remove()` отрабатывает → React монтирует заново, но во втором `useEffect` `data` ещё `null` (или гонится с первым fetch), и инстанс не пересоздаётся. В итоге MapLibre мёртв, а UI поверх него — живой.

Дополнительно: init-`useEffect` зависит от `[data]`, поэтому если `data` пришло до первой отрисовки контейнера, `containerRef.current` может оказаться `null` на момент эффекта в строгом режиме React 19.

## Решение

### 1. Убрать ненужный lazy-import wrapper

`src/routes/map.tsx` и `src/routes/embed.tsx` упрощаются до прямого импорта:

```tsx
import { MapView } from "@/components/map/MapView";
// ...
<main className="h-screen w-screen overflow-hidden bg-background">
  <MapView lang={lang as Lang} onLangChange={...} />
</main>
```

MapLibre тяжёлый, но он используется только на этих маршрутах — TanStack Router уже разделяет бандл по роутам, отдельный dynamic import избыточен.

### 2. Развести инициализацию карты и загрузку данных

В `MapView.tsx` сейчас один `useEffect([data])` делает обе вещи. Разделяем:

- **Effect A** (`[]`) — создать `maplibregl.Map` сразу, как только смонтирован контейнер. Стиль Positron подгружается параллельно с GeoJSON, базовая карта рисуется не дожидаясь данных.
- **Effect B** (`[data]`) — на `map.on("load")` (или сразу, если уже загружен) добавить source `parishes` и слои. Если `data` приходит после `load`, добавляем тогда; если раньше — ждём событие `load`.
- **Cleanup** делаем только в Effect A: `return () => { map.remove(); mapRef.current = null; }`.

### 3. Защита от 0×0 контейнера

После создания карты вызываем `map.resize()` через `ResizeObserver` на контейнере — это покрывает кейс, когда родитель меняет размер после монтирования (SSR-гидрация, HMR, переключение языка).

### 4. Логирование ошибок MapLibre

Подписаться на `map.on("error", e => console.error("[maplibre]", e.error))`. Сейчас если стиль падает (CORS, 5xx) — пользователь видит белый экран без диагностики.

### 5. Проверка

После правки:
- Открыть `/map` → должны прийти запросы `tiles.openfreemap.org/data/.../*.pbf`.
- Видны зум-контролы справа сверху, базовая карта Positron, цветные точки приходов.
- Hard refresh не должен ломать карту.

## Файлы

```
src/routes/map.tsx          — убрать lazy wrapper, прямой <MapView />
src/routes/embed.tsx        — убрать lazy wrapper, прямой <MapView />
src/components/map/MapView.tsx — разделить init/data effects, добавить ResizeObserver и error listener
```

Никаких изменений в данных, стилях токенов, цветах легенды или маршрутизации.
