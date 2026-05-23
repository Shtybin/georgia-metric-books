# Самохостинговая подложка карты (Protomaps + Cloudflare R2)

Эта инструкция один раз настраивает собственный источник тайлов для основной
карты. После настройки сайт перестаёт зависеть от внешних бесплатных сервисов
(OpenFreeMap, CARTO) — карта работает, даже если они недоступны.

**Что получим:**
- Один файл `.pmtiles` (~373 МБ) со всем Кавказом (зум 0–14).
- Шрифты Noto Sans и спрайты Protomaps.
- Хранение и раздача через Cloudflare R2: 10 ГБ free tier, бесплатный
  egress, без переноса DNS — раздача идёт с встроенного домена
  `https://pub-<хэш>.r2.dev`.
- Визуально — стиль `Light` от Protomaps, почти неотличим от Positron.

> **Почему не свой поддомен `tiles.datatells.info`?**
> Чтобы R2 раздавал файлы с вашего домена, нужен Cloudflare Custom Domain,
> а он работает только если DNS домена обслуживает Cloudflare целиком.
> Subdomain delegation через NS-записи — Enterprise-only фича
> ([источник](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/setup/)).
> Переносить весь `datatells.info` c Netlify не хочется → используем
> встроенный `r2.dev`. Его rate limit на наш трафик не влияет.

---

## 0. Что я уже подготовил за вас

В `/mnt/documents/basemap/` лежат два готовых артефакта — скачайте их к себе
на компьютер:

- `georgia.pmtiles` (373 МБ) — векторная подложка региона
  (bbox 39–48° долготы, 38–44° широты, zoom 0–14).
- `assets.zip` (9.6 МБ) — папки `fonts/` и `sprites/` для MapLibre.

Распакуйте `assets.zip` локально — внутри будут две папки: `fonts/` и `sprites/`.

---

## Шаг 1. Создать аккаунт Cloudflare и активировать R2

1. Зарегистрируйтесь / войдите на [dash.cloudflare.com](https://dash.cloudflare.com).
2. В левом сайдбаре выберите **R2 Object Storage**.
3. При первом заходе Cloudflare покажет экран **Purchase R2** с кнопкой
   **Purchase R2 Plan**. Несмотря на название, это **бесплатно** — Cloudflare
   требует привязать платёжный метод (карту), но **списания не будет**, пока
   вы не выйдете за free tier:
   - 10 ГБ хранения / мес
   - 1 000 000 операций записи (Class A) / мес
   - 10 000 000 операций чтения (Class B) / мес
   - **0 ₽ за egress** (исходящий трафик всегда бесплатный)
4. Добавьте карту, нажмите **Purchase**. R2 активирован.

---

## Шаг 2. Создать bucket

1. R2 dashboard → правый верх → кнопка **Create bucket**.
2. **Bucket name**: `metrics-basemap` (или своё, запомните).
3. **Location**: оставьте **Automatic** — Cloudflare выберет ближайший регион.
4. **Default Storage Class**: **Standard**.
5. Нажмите **Create bucket**.

---

## Шаг 3. Включить публичный доступ через r2.dev

R2 по умолчанию приватный. Включаем встроенный публичный URL.

1. Откройте только что созданный bucket → вкладка **Settings** (верхняя
   панель вкладок: *Objects · Metrics · Settings*).
2. Прокрутите до секции **Public access**.
3. В подсекции **R2.dev subdomain** нажмите **Allow Access**.
4. Откроется модалка-предупреждение: r2.dev предназначен для разработки
   и имеет rate limit. В поле подтверждения введите слово **`allow`**
   (Cloudflare требует это явно) и нажмите **Allow**.
5. После подтверждения в той же секции появится **Public R2.dev Bucket URL**
   вида:
   ```
   https://pub-a1b2c3d4e5f6...r2.dev
   ```
   **Скопируйте его** — это будет ваш `VITE_BASEMAP_BASE_URL`.

---

## Шаг 4. Настроить CORS

Браузер не сможет загружать тайлы без CORS-заголовков.

1. Тот же экран bucket → **Settings** → секция **CORS Policy** → кнопка
   **Add CORS policy**.
2. Откроется JSON-редактор. **Очистите его полностью** и вставьте текст
   ниже — начинается с `[` и заканчивается `]`. **Без** строк
   ```` ```json ```` сверху и ```` ``` ```` снизу — это разметка markdown,
   Cloudflare её не понимает и выдаёт `This policy is not valid`
   именно из-за неё.

<!-- COPY START -->
    [
      {
        "AllowedOrigins": [
          "https://metrics.datatells.info",
          "https://georgia-metric-books.lovable.app",
          "http://localhost:8080",
          "http://localhost:5173"
        ],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedHeaders": ["Range", "If-Match", "If-None-Match"],
        "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
        "MaxAgeSeconds": 86400
      }
    ]
<!-- COPY END -->

3. Нажмите **Save**.

> **Если всё равно `This policy is not valid`:**
> - Убедитесь, что в редакторе **первый символ — `[`**, последний — `]`.
>   Никаких ```` ``` ```` и слова `json` в начале быть не должно.
> - Все origins — в формате `scheme://host[:port]`, без завершающего `/`,
>   без `*` и без `*.lovable.app` (точные URL).
> - В `AllowedHeaders` — явный список заголовков, не `"*"`.
> - Превью-URL Lovable меняется при каждом деплое. Если нужен превью-домен,
>   добавьте его точное значение отдельной строкой в `AllowedOrigins`.

---

## Шаг 5. Залить файлы

> ⚠️ **Важно про лимит R2 web-UI: 300 МБ на файл.**
> `georgia.pmtiles` весит **373 МБ**, поэтому через браузерный
> «Upload» его залить **нельзя** — Cloudflare прямо пишет:
> *«Files larger than 300 MB can be uploaded using the S3
> Compatibility API or Workers»*. Используем `rclone` — он же
> заодно быстро зальёт сотни мелких файлов шрифтов.

Финальная структура bucket должна быть такой:

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

### Вариант A — rclone (основной, нужен для pmtiles)

#### A.1. Установить rclone

```bash
# macOS
brew install rclone

# Linux (Debian/Ubuntu)
sudo apt-get install rclone

# Windows
choco install rclone
# либо скачать с https://rclone.org/downloads/
```

Проверить: `rclone version` (должно быть ≥ 1.60).

#### A.2. Получить ключи R2 API

1. R2 dashboard → **правый верх** → кнопка **{ } API** →
   **Manage API tokens** → **Create API token**.
2. Заполнить форму:
   - **Token name**: `rclone-upload`.
   - **Permissions**: **Object Read & Write**.
   - **Specify bucket(s)**: **Apply to specific buckets only** →
     выбрать `metrics-basemap` (ограничивает scope ключа).
   - **TTL**: оставить пустым (бессрочный) или поставить дату.
3. Нажать **Create API Token**. Cloudflare покажет:
   - **Access Key ID** (~32 hex символа)
   - **Secret Access Key** (~64 символа)
   - **Use jurisdiction-specific endpoints for S3 Clients** — там же
     endpoint вида `https://<account-id>.r2.cloudflarestorage.com`.
4. **СКОПИРУЙТЕ ВСЁ СРАЗУ В БЛОКНОТ.** Secret Cloudflare больше
   не покажет — закроете окно, придётся пересоздавать токен.

Где найти **Account ID** отдельно, если потеряли: R2 dashboard →
любой bucket → вкладка **Settings** → блок **Bucket details** →
строка **S3 API** содержит URL вида
`https://<account-id>.r2.cloudflarestorage.com/metrics-basemap`.

#### A.3. Сконфигурировать rclone remote

Запустите `rclone config` и отвечайте по порядку:

```
n) New remote
name> r2
Storage> s3                         (вводите цифру s3 или "s3")
provider> Cloudflare                (выбрать из списка)
env_auth> 1                         (Enter access key / secret pair)
access_key_id> <Access Key ID>
secret_access_key> <Secret Access Key>
region> auto
endpoint> https://<account-id>.r2.cloudflarestorage.com
location_constraint>                (оставить пустым, Enter)
acl>                                (Enter — пусто, R2 ACL не использует)
Edit advanced config? n
Keep this "r2" remote? y
q) Quit config
```

Проверить, что remote работает:
```bash
rclone lsd r2:
# должен показать metrics-basemap
```

#### A.4. Залить файлы

```bash
# Перейти в папку, где лежат скачанные артефакты:
cd /path/to/basemap   # тут лежат georgia.pmtiles, fonts/, sprites/

# Большой файл (373 МБ) — multipart upload chunks по 100 МБ.
# Если оборвётся — просто запустите снова, rclone докачает.
rclone copy ./georgia.pmtiles r2:metrics-basemap/ \
  --progress \
  --s3-upload-cutoff 100M \
  --s3-chunk-size 100M \
  --s3-upload-concurrency 4

# Шрифты — сотни мелких файлов, лучше с параллелизмом:
rclone copy ./fonts r2:metrics-basemap/fonts \
  --progress --transfers 16 --checkers 16

# Спрайты — десяток файлов:
rclone copy ./sprites r2:metrics-basemap/sprites --progress
```

#### A.5. Проверить, что всё на месте

```bash
rclone size r2:metrics-basemap
# Total objects: ~250
# Total size: ~383 MiB
```

Если число объектов и размер примерно совпадают — заливка прошла.

### Вариант B — веб-UI (только для fonts/ и sprites/)

Подходит, если уже залили `georgia.pmtiles` через rclone и хочется
дозалить мелкие папки без терминала. **Для самого `georgia.pmtiles`
не работает** — лимит 300 МБ.

1. Bucket → вкладка **Objects** → **Upload** (правый верх).
2. В выпадающем меню рядом с Upload:
   - **Upload folder** → выберите распакованную папку `fonts/` целиком.
     Cloudflare сохранит структуру.
   - Ещё раз **Upload folder** → папка `sprites/`.

---

---

## Шаг 6. Проверить, что файлы отдаются

Откройте в браузере (подставьте свой `pub-xxx.r2.dev`):

- `https://pub-xxx.r2.dev/georgia.pmtiles` — должен начать скачиваться
  (или вернуть ответ с `Content-Type: application/octet-stream`).
- `https://pub-xxx.r2.dev/fonts/Noto%20Sans%20Regular/0-255.pbf` — должен
  вернуть бинарный PBF.
- `https://pub-xxx.r2.dev/sprites/v4/light.json` — должен вернуть JSON.

| Что вернулось | Что не так |
|---|---|
| `403 Forbidden` | Public Access не активирован (шаг 3) |
| `404 Not Found` на шрифт | Папка названа неправильно — должна быть `Noto Sans Regular` с пробелами, не `Noto_Sans_Regular` |
| `404` на `georgia.pmtiles` | Файл не в корне bucket, а в подпапке |

---

## Шаг 7. Прописать URL в проекте

В файле `.env` (в корне проекта) добавьте:

```
VITE_BASEMAP_BASE_URL=https://pub-xxxxxxxxxxxxxxxxx.r2.dev
```

Перезапустите dev-сервер (не hot reload, а полный `bun dev` заново).
На продакшене — задеплойте, переменная подхватится автоматически.

После этого карта должна загрузиться вместо белой подложки.

---

## Шаг 8. Обновление подложки в будущем

Protomaps пересобирает мир еженедельно
(`https://build.protomaps.com/YYYYMMDD.pmtiles`). Чтобы обновить данные:

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
→ CORS не настроен, либо URL в `.env` не совпадает с тем, что в R2.

**Карта без подписей городов**
→ Не загрузились шрифты. Проверьте `/fonts/Noto%20Sans%20Regular/0-255.pbf`
в браузере — должен возвращать PBF.

**Карта серая, без иконок POI**
→ Не загрузились спрайты. Проверьте `/sprites/v4/light.json`.

**`VITE_BASEMAP_BASE_URL is not set` в консоли**
→ Переменная не подхватилась. После добавления в `.env` нужен полный
перезапуск vite-сервера (не hot reload).

**HTTP 429 / Too Many Requests от `pub-xxx.r2.dev`**
→ Достигли rate limit r2.dev. На нашем трафике это маловероятно, но если
случится — варианты:
1. Перенести `datatells.info` целиком на Cloudflare DNS (Netlify
   продолжит хостить сайт через A-запись на их load balancer) и
   подключить R2 Custom Domain `tiles.datatells.info`.
2. Перейти на Bunny.net Storage + CDN (~$0.01/ГБ, поддерживает CNAME
   с любого DNS, не требует переноса домена).

**Не вижу кнопки `Allow Access` в Public access**
→ Возможно, в вашем аккаунте уже отключена возможность r2.dev
(администратор Cloudflare мог отключить на уровне аккаунта в
**R2 → Settings → Managed public buckets**). Включите там же.
