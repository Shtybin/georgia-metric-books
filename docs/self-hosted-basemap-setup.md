# Самохостинговая подложка карты (Protomaps + Cloudflare R2)

Эта инструкция один раз настраивает собственный источник тайлов для основной
карты. После настройки сайт перестаёт зависеть от внешних бесплатных сервисов
(OpenFreeMap, CARTO) — карта работает, даже если они недоступны.

Что получим:
- Один файл `.pmtiles` (~373 МБ) со всем Кавказом (зум 0–14).
- Шрифты Noto Sans и спрайты Protomaps.
- Хранение и раздача через Cloudflare R2: **бесплатный egress** + 10 ГБ free tier.
- Визуально — стиль `Light` от Protomaps, почти неотличим от Positron.

---

## 0. Что я уже сделал за вас

В `/mnt/documents/basemap/` лежат два готовых артефакта — скачайте их к себе
на компьютер:

- `georgia.pmtiles` (373 МБ) — векторная подложка региона
  (bbox 39–48° долготы, 38–44° широты, zoom 0–14).
- `assets.zip` (9.6 МБ) — папки `fonts/` и `sprites/` для MapLibre.

Распакуйте `assets.zip` локально — внутри будут две папки: `fonts/` и `sprites/`.

---

## 1. Создать Cloudflare R2 bucket

1. Зарегистрируйтесь / войдите в [Cloudflare](https://dash.cloudflare.com).
2. В левом меню выберите **R2 Object Storage** → **Create bucket**.
3. Название: `metrics-basemap` (или любое своё, запомните).
4. Регион: **Automatic** (Cloudflare выберет ближайший).
5. Нажмите **Create**.

> R2 free tier: 10 ГБ хранения, 1 млн операций записи/мес, 10 млн чтения/мес,
> **бесплатный egress без лимита** — наши ~400 МБ и трафик легко укладываются.

---

## 2. Включить публичный доступ

R2 по умолчанию приватный. Два варианта раздачи:

### Вариант A — быстро, через `r2.dev` поддомен

1. Откройте созданный bucket → вкладка **Settings**.
2. В разделе **Public access** → **R2.dev subdomain** → **Allow Access**.
3. Подтвердите. Cloudflare выдаст URL вида
   `https://pub-xxxxxxxxxxxx.r2.dev`.
4. Это и будет ваш `VITE_BASEMAP_BASE_URL`.

⚠️ Минус: на `*.r2.dev` стоит rate limit и Cloudflare не рекомендует его для
прода. Подойдёт чтобы быстро проверить.

### Вариант B — правильно, через свой поддомен (рекомендуется)

Основной домен `datatells.info` живёт на **Netlify DNS**, и переносить его
целиком в Cloudflare не нужно (и нельзя без простоя сайта/почты).
Вместо этого делегируем Cloudflare **только один поддомен** `tiles.datatells.info`
— стандартная схема *subdomain delegation*. Остальные записи
(`datatells.info`, `www`, MX и т.д.) остаются на Netlify нетронутыми.

#### B.1. Завести зону в Cloudflare для поддомена

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Add a site**.
2. В поле ввести именно **`tiles.datatells.info`** (поддомен, не корень).
3. План — **Free**.
4. Cloudflare покажет 2 nameserver-а вида:
   ```
   xxx.ns.cloudflare.com
   yyy.ns.cloudflare.com
   ```
   Запишите их — пригодятся на следующем шаге.

#### B.2. Делегировать поддомен из Netlify DNS

1. Netlify → **Domains** → выберите `datatells.info` → **Add new record**.
2. Создайте **две `NS`-записи** (именно NS, не CNAME и не A):

   ```
   Type: NS   Name: tiles   Value: xxx.ns.cloudflare.com   TTL: 3600
   Type: NS   Name: tiles   Value: yyy.ns.cloudflare.com   TTL: 3600
   ```

3. Сохраните. Подождите 5–30 минут — в дашборде Cloudflare статус зоны
   `tiles.datatells.info` сменится с **Pending** на **Active**.

Проверить, что делегирование прошло, можно командой:
```bash
dig NS tiles.datatells.info +short
# должно вернуть оба ns.cloudflare.com
```

#### B.3. Подключить поддомен к R2 bucket

1. R2 → ваш bucket → **Settings** → **Custom Domains** → **Connect Domain**.
2. Введите `tiles.datatells.info`.
3. Cloudflare сам создаст CNAME в своей зоне и выпустит SSL — 2–5 минут.
4. Это будет ваш `VITE_BASEMAP_BASE_URL=https://tiles.datatells.info`.

> Что НЕ затрагивает делегирование: сам сайт `datatells.info`, `www`,
> почта (MX), все остальные DNS-записи. Netlify продолжает обслуживать
> корневой домен, Cloudflare — только `tiles.*` ветку.

---

## 3. Настроить CORS

Браузер не сможет загружать тайлы из R2 без CORS-заголовков.

1. В bucket → **Settings** → **CORS Policy** → **Add CORS Policy**.
2. Вставьте JSON:

```json
[
  {
    "AllowedOrigins": [
      "https://metrics.datatells.info",
      "https://georgia-metric-books.lovable.app",
      "https://*.lovable.app",
      "http://localhost:8080",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 86400
  }
]
```

3. Сохраните. Замените домены на свои, если у вас другие.

---

## 4. Залить файлы

Структура bucket должна выглядеть так:

```
metrics-basemap/
  georgia.pmtiles
  fonts/
    Noto Sans Regular/
      0-255.pbf
      256-511.pbf
      ...
    Noto Sans Medium/
      ...
    Noto Sans Italic/
      ...
  sprites/
    v4/
      light.json
      light.png
      light@2x.json
      light@2x.png
      ...
```

### Через веб-интерфейс (просто, но медленно)

1. В bucket → **Objects** → **Upload**.
2. Загрузите `georgia.pmtiles` в корень.
3. Создайте папку `fonts` → загрузите всё из распакованной `fonts/`.
4. Создайте папку `sprites` → загрузите всё из распакованной `sprites/`.

### Через `rclone` (быстрее, рекомендуется для шрифтов)

```bash
# Установить rclone (Mac: brew install rclone; Linux: apt-get install rclone)
rclone config
# Создайте remote типа "Cloudflare R2", укажите Account ID + Access Key + Secret
# (генерируются в R2 → Manage R2 API Tokens → Create API token, права: Object Read & Write)

# Залить всё разом:
rclone copy ./georgia.pmtiles r2:metrics-basemap/ --progress
rclone copy ./fonts r2:metrics-basemap/fonts --progress
rclone copy ./sprites r2:metrics-basemap/sprites --progress
```

---

## 5. Проверить, что работает

Откройте в браузере:

- `https://<ваш-URL>/georgia.pmtiles` — должен начать качаться (или вернуть
  ответ с `Content-Type: application/octet-stream`).
- `https://<ваш-URL>/fonts/Noto%20Sans%20Regular/0-255.pbf` — должен вернуть
  PBF файл (бинарный).
- `https://<ваш-URL>/sprites/v4/light.json` — должен вернуть JSON.

Если что-то возвращает 403 — проверьте, что Public Access включён.
Если 404 на шрифт — проверьте, что папка названа в точности `Noto Sans Regular`
(с пробелами, без подчёркиваний).

---

## 6. Прописать URL в проекте

В файле `.env` (в корне проекта) добавьте:

```
VITE_BASEMAP_BASE_URL=https://tiles.datatells.info
```

(или ваш `pub-xxx.r2.dev`)

Перезапустите dev-сервер / задеплойте — карта должна загрузиться.

---

## 7. Обновление подложки в будущем

Protomaps пересобирает мир еженедельно (`https://build.protomaps.com/YYYYMMDD.pmtiles`).
Чтобы обновить данные:

```bash
# Скачать pmtiles CLI: https://github.com/protomaps/go-pmtiles/releases
pmtiles extract https://build.protomaps.com/20260518.pmtiles \
  georgia.pmtiles --bbox=39.0,38.0,48.0,44.0 --maxzoom=14
rclone copy ./georgia.pmtiles r2:metrics-basemap/ --progress
```

CLI скачивает только нужный регион (через HTTP range requests), а не весь мир.

---

## Troubleshooting

**Карта белая, в консоли `Failed to fetch ... pmtiles`**
→ CORS не настроен, либо URL не совпадает с тем, что в `.env`.

**Карта без подписей городов**
→ Не загрузились шрифты. Проверьте `/fonts/Noto%20Sans%20Regular/0-255.pbf`.

**Карта серая, без иконок POI**
→ Не загрузились спрайты. Проверьте, что `sprites/v4/light.json` доступен.

**`VITE_BASEMAP_BASE_URL is not set` в консоли**
→ Переменная не подхватилась. После добавления в `.env` нужен полный
перезапуск vite-сервера (не hot reload).

**Зона `tiles.datatells.info` в Cloudflare висит Pending больше часа**
→ NS-записи в Netlify не подхватились. Проверьте:
```bash
dig NS tiles.datatells.info +short
```
Должны вернуться оба `*.ns.cloudflare.com`. Если возвращается пусто или
NS родительского домена — перепроверьте имя записи в Netlify (должно быть
именно `tiles`, не `tiles.datatells.info`) и TTL (≤ 3600).

**R2 → Connect Domain не даёт подключить `tiles.datatells.info`**
→ Зона ещё не Active. Дождитесь статуса Active в Cloudflare, потом повторите.
