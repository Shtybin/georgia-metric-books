# План: переписать docs/self-hosted-basemap-setup.md под реальный UI Cloudflare (путь через r2.dev)

## Контекст и почему предыдущая инструкция была неверной

В Cloudflare **subdomain delegation** (добавление `tiles.datatells.info`
как отдельной зоны через NS-записи) — фича **Enterprise-only**, на Free
и Pro её просто нет в UI. Источник:
https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/setup/

Поэтому реалистичный путь без переноса всего `datatells.info` в Cloudflare —
использовать встроенный публичный URL R2: `https://pub-<hash>.r2.dev`.
DNS не трогаем вообще: ни в Netlify, ни где-либо ещё.

Rate limit на `r2.dev` действительно есть, но для нашего трафика
(несколько сотен пользователей в день, ~400 МБ кэшируемых тайлов)
он не достигается. Если когда-нибудь упрёмся — позже сменим хостинг
тайлов на Bunny.net или перенесём DNS на Cloudflare целиком.

## Что меняем

Один файл: **`docs/self-hosted-basemap-setup.md`**.

Структуру переписываю полностью под реальный личный кабинет Cloudflare
(проверено по официальной документации, февраль 2026):

### Новая структура файла

1. **Что получим** — короткое введение (как сейчас).

2. **Что уже сделано** — артефакты в `/mnt/documents/basemap/` (как сейчас).

3. **Шаг 1. Создать аккаунт Cloudflare и активировать R2**
   - Зарегистрироваться/войти на dash.cloudflare.com.
   - В левом сайдбаре пункт **R2 Object Storage**.
   - При первом заходе Cloudflare попросит **активировать R2** —
     это требует добавить платёжный метод, но **в пределах free tier
     (10 ГБ хранения + 1M write + 10M read операций/мес)** счёт нулевой.
     Снять с карты ничего не спишут, пока не выйдем за лимиты.
   - Нажать **Enable R2**.

4. **Шаг 2. Создать bucket**
   - В R2 dashboard → кнопка **Create bucket** (правый верх).
   - Bucket name: `metrics-basemap`.
   - Location: **Automatic** (Cloudflare сам выберет регион).
   - Default Storage Class: **Standard**.
   - Нажать **Create bucket**.

5. **Шаг 3. Включить публичный доступ через r2.dev**
   - Открыть созданный bucket → вкладка **Settings** (вверху).
   - Найти секцию **Public access** → подсекция **R2.dev subdomain**.
   - Нажать кнопку **Allow Access**.
   - Появится модалка с предупреждением о rate limit — ввести
     подтверждение `allow` (Cloudflare требует явное согласие) и нажать
     **Allow**.
   - Cloudflare сразу покажет публичный URL вида:
     ```
     https://pub-<32 hex chars>.r2.dev
     ```
   - **Скопировать этот URL** — это и будет `VITE_BASEMAP_BASE_URL`.

6. **Шаг 4. Настроить CORS**
   - Тот же экран bucket → **Settings** → секция **CORS policy** →
     кнопка **Add CORS policy**.
   - Вставить JSON (приведу актуальный формат с `AllowedOrigins`
     включая прод-домен, lovable preview и localhost).
   - Нажать **Save**.

7. **Шаг 5. Залить файлы**
   - **Вариант через веб-UI**: bucket → вкладка **Objects** → кнопка
     **Upload** (или drag-and-drop). Для папок с шрифтами/спрайтами
     указать, что Cloudflare поддерживает upload папок (через
     "Upload folder" из выпадающего меню рядом с Upload). Имена
     папок: `fonts/`, `sprites/`.
   - **Вариант через rclone** (быстрее для шрифтов — 100+ мелких файлов):
     приведу актуальную инструкцию `rclone config` → провайдер
     `Cloudflare R2`, нужны Account ID (виден в R2 → Overview справа)
     и API token (R2 → **Manage R2 API Tokens** → **Create API token**
     → права **Object Read & Write** → scope: bucket `metrics-basemap`).
   - Финальная структура bucket — как сейчас в файле.

8. **Шаг 6. Проверить, что файлы отдаются**
   - Открыть в браузере:
     - `https://pub-xxxxx.r2.dev/georgia.pmtiles`
     - `https://pub-xxxxx.r2.dev/fonts/Noto%20Sans%20Regular/0-255.pbf`
     - `https://pub-xxxxx.r2.dev/sprites/v4/light.json`
   - Если 403 — public access не активирован.
   - Если 404 — файл лежит не в том пути / неправильное имя папки.

9. **Шаг 7. Прописать URL в проекте**
   ```
   VITE_BASEMAP_BASE_URL=https://pub-xxxxx.r2.dev
   ```
   в `.env`, перезапустить vite.

10. **Шаг 8. Обновление подложки в будущем** — как сейчас.

11. **Troubleshooting** — расширить:
    - 429 / Too Many Requests от r2.dev → достигли rate limit;
      когда это станет проблемой — варианты решения (перенос DNS
      на Cloudflare целиком, либо смена на Bunny.net).
    - Остальные пункты из текущего файла (CORS, шрифты, спрайты,
      env var).

### Что **удаляю** из текущего файла

- Раздел «Вариант B — через свой поддомен» с NS-записями в Netlify
  и Add a site → tiles.datatells.info — это не работает на Free плане.
- Соответствующий пункт troubleshooting про «зона висит Pending».

### Что НЕ трогаем

- Сам код: `src/lib/map-style.ts`, компоненты карты, регистрация
  `pmtiles://` — всё уже готово и работает с любым базовым URL.
- `.env.example` — уже содержит `VITE_BASEMAP_BASE_URL` с плейсхолдером,
  только обновлю комментарий, чтобы плейсхолдер был
  `https://pub-xxxxx.r2.dev` (более реалистичный для нашего пути).
