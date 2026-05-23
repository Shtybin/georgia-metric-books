# План: подключение R2 к tiles.datatells.info без переноса основного домена

Основной домен `datatells.info` остаётся на Netlify DNS — туда не лезем.
В Cloudflare заводим **только зону для одного поддомена** `tiles.datatells.info`,
а в Netlify добавляем NS-записи, которые делегируют этот поддомен Cloudflare.
Это стандартная схема subdomain delegation, она не ломает ни сайт на Netlify,
ни почту, ни остальные DNS-записи.

## Шаги (выполняет пользователь, я обновляю только документацию)

### 1. Cloudflare: создать зону для поддомена
1. Cloudflare Dashboard → **Add a site** → ввести `tiles.datatells.info`
   (именно поддомен, не корень).
2. План — **Free**.
3. Cloudflare выдаст 2 nameserver-а вида
   `xxx.ns.cloudflare.com` и `yyy.ns.cloudflare.com`. Записать.

### 2. Netlify DNS: делегировать поддомен
В панели Netlify → Domains → `datatells.info` → **Add new record**, создать
**две NS-записи**:

```
Type: NS   Name: tiles   Value: xxx.ns.cloudflare.com   TTL: 3600
Type: NS   Name: tiles   Value: yyy.ns.cloudflare.com   TTL: 3600
```

Всё. С этого момента Cloudflare управляет только `tiles.datatells.info`
и его под-под-доменами, остальной DNS живёт на Netlify.

Подождать 5–30 минут пока Cloudflare увидит делегирование
(в дашборде статус зоны станет **Active**).

### 3. R2: bucket + публичный доступ + custom domain
1. Cloudflare → R2 → **Create bucket** `metrics-basemap`.
2. Settings → **Custom Domains** → **Connect Domain** → ввести
   `tiles.datatells.info`. Cloudflare сам создаст CNAME внутри своей зоны
   и выпустит SSL за пару минут.
3. Settings → **CORS Policy** — вставить JSON со списком наших origin-ов
   (как в текущей инструкции).

### 4. Залить файлы в bucket
Через rclone или веб-интерфейс — структура та же:
```
metrics-basemap/
  georgia.pmtiles
  fonts/Noto Sans Regular/0-255.pbf  ...
  sprites/v4/light.json  ...
```

### 5. Прописать URL в проекте
`.env`:
```
VITE_BASEMAP_BASE_URL=https://tiles.datatells.info
```

Карта подхватится после редеплоя.

## Что я меняю в коде

Только документация — никакого React-кода трогать не нужно, реализация в
`src/lib/map-style.ts` уже готова и не зависит от способа делегирования.

- `docs/self-hosted-basemap-setup.md` — переписать раздел «Включить публичный
  доступ»:
  - убрать вариант «перенести весь домен в Cloudflare»;
  - оставить **Вариант A** (`r2.dev` поддомен) как быстрый тест;
  - заменить **Вариант B** на новый — **subdomain delegation**: шаги 1–3 выше
    с конкретными скриншотными ориентирами в Netlify и Cloudflare;
  - добавить troubleshooting: «зона в Cloudflare висит Pending» → проверить
    NS-записи в Netlify через `dig NS tiles.datatells.info`.

## Что НЕ трогаем

- `src/lib/map-style.ts`, компоненты карты, регистрация `pmtiles://` —
  всё это уже работает и не зависит от того, как настроен DNS.
- Основные DNS-записи `datatells.info` в Netlify (A, MX, TXT и т.д.).
- Деплой и хостинг сайта — он продолжает жить на Netlify/Lovable.
