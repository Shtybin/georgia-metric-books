## Цель

Бот проходит по каждой точке карты (Feature), сверяет «Селение / уезд / церкви / годы метрических книг / пропущенные годы» с эталонными PDF-каталогами НИАГ (Ф.489 оп.6, 1819–1870) и сайтом archival-services.gov.ge, формирует **предложения на модерацию**. После одобрения они применяются. Второй этап — слияние селений из «Селения без координат» с подтверждёнными точками.

---

## Источники истины

- **5 PDF Ф.489 оп.6** (1819–1830, 1831–1840, 1841–1850, 1851–1860, 1861–1870) — единый каталог: `№ уезд YYYY weli` → таблица «селение/церковь | район».
- Существующие данные NIAG в проекте (`scripts/niag_match.py`, `Fond 489 Inv.6`).
- Сайт `archival-services.gov.ge` — для точек после 1870 и сверки годов.

PDF разбираем однократно офлайн-скриптом → `public/data/niag-catalog.json`:
```json
{ "uezd_ka":"თბილისი","year":1819,"entries":[
  {"n":1,"settlement":"სიონი","church":"ღვთისმშობლის მიძინების","district":"თბილისი"}, ...
]}
```
Этот каталог грузится один раз и фильтруется по уезду/диапазону лет — это **резко уменьшает контекст промпта** (по точке ~5–30 строк вместо всего PDF).

---

## Бюджет $100 — как укладываемся

- Модель: `google/gemini-2.5-flash-lite` (≈ $0.10/1M вход, $0.40/1M выход).
- На точку: ~1.5K input + 0.4K output ≈ $0.00031 → **~3000 точек × $0.0003 ≈ $1**. Запас огромен; даже с `gemini-2.5-flash` ($0.30/$2.50) бюджета хватает на полный прогон + повторы.
- Жёсткий стоп: серверная функция читает сумму `cost_usd` по текущему `run_id`, при ≥ $100 (настраиваемый лимит) — `status='budget_exhausted'`, дальнейшие батчи отклоняются.
- Возврат `usage.prompt_tokens / completion_tokens` из ответа AI Gateway → считаем стоимость по таблице цен модели.

---

## Схема БД (новая, миграция отдельным сообщением после одобрения плана)

- `ai_audit_runs` — `id, status (running/paused/done/budget_exhausted/failed), model, budget_usd, spent_usd, points_total, points_done, started_at, finished_at, created_by`.
- `ai_audit_findings` — `id, run_id, feature_id, kind (settlement|uezd|church|years|missing_years|duplicate), severity (info|warn|error), confidence (0–1), current jsonb, proposed jsonb, rationale text, sources jsonb (PDF page / URL), tokens_in, tokens_out, cost_usd, status (pending/approved/rejected/applied), reviewed_by, reviewed_at`.
- RLS: чтение/правка только `editor`/`admin`; вставка — только `service_role` через серверную функцию.
- GRANT под политики, RLS, политики — по шаблону проекта.

Применение одобренной правки = запись в существующие таблицы (`feature_overrides`, `missing_years_suggestions`, `uezd_corrections`) с пометкой «source: ai_audit_finding/<id>». **Ничего не публикуется автоматически.**

---

## Серверная логика (TanStack `createServerFn`)

`src/lib/ai-audit.functions.ts`:
- `startAuditRun({ budgetUsd=100, model, scope:'all'|'uezd:<>' })` — создаёт `ai_audit_runs`, выбирает feature_id'ы, возвращает `runId`.
- `processNextBatch({ runId, size=10 })` — берёт N точек, для каждой:
  1. Достаёт карточку из `parishes.geojson` + активные `feature_overrides`.
  2. Фильтрует `niag-catalog.json` по уезду и диапазону лет точки.
  3. Опционально `fetch` к `archival-services.gov.ge` (HTML → текст, кэш по url) для лет >1870.
  4. Промпт → Lovable AI (structured output через tool calling `propose_corrections`).
  5. Пишет findings, обновляет `spent_usd`, `points_done`.
  6. При превышении бюджета — `budget_exhausted` и выход.
- `getRunStatus(runId)` / `listFindings({runId, status})` / `reviewFinding({id, decision, note})`.
- `getRunStatus` опрашивается UI каждые 2 сек.

Правило «общие регионы не сливаем»: если `region` ∈ {Имеретия, Гурия, Абхазия, Мегрелия, Сванетия, Кахетия, …} и `uezd` пуст — `kind='duplicate'` не предлагается; точка остаётся независимой.

---

## UI: вкладка «AI-аудит карты»

`src/components/admin/AiAuditPanel.tsx`:
- Кнопка **«Запустить аудит»** (выбор модели, бюджет, scope).
- Прогресс: `points_done / points_total`, потрачено `$X.XX / $100`, ETA, кнопки Пауза/Стоп.
- Таблица findings с фильтрами (kind, severity, status), diff-вью «было → стало», цитата из PDF (стр. №) или URL архива.
- Кнопки **Одобрить** / **Отклонить** (массовое действие на отфильтрованной выборке).
- После одобрения — автозапись в `feature_overrides` / `missing_years_suggestions` / `uezd_corrections` (никакой публикации).

Регистрация вкладки в `src/routes/_authenticated/admin.tsx` (после «Источники», перед «Пользователи»).

---

## Этап 2 — слияние «Селений без координат»

Отдельная кнопка **«Сопоставить unlocated»** в той же вкладке:
- Для каждой записи `unlocated.json` ищем по нормализованным `settlement` + `church` совпадение среди **подтверждённых** AI-аудитом точек (Levenshtein + транслитерация ka/ru/en).
- Если найдено и `region` не из «общего» списка — finding `kind='duplicate'`, после одобрения: запись добавляется в feature как `mergedFrom`, исключается из `unlocated.json` через `feature_overrides` (action='merge_unlocated').
- Общие регионы остаются как есть.

---

## План работ (порядок)

1. Скрипт-парсер `scripts/parse-niag-pdfs.py` → `public/data/niag-catalog.json`.
2. Миграция: таблицы `ai_audit_runs`, `ai_audit_findings` + GRANT + RLS.
3. Серверные функции `ai-audit.functions.ts` (старт, батч, статус, ревью) + учёт стоимости.
4. UI-вкладка `AiAuditPanel.tsx` + регистрация в админке.
5. E2E прогон на 20 точках одного уезда → проверка качества и стоимости.
6. Этап 2 — сопоставление `unlocated`.

---

## Технические детали

- Модель по умолчанию: `google/gemini-2.5-flash-lite`; переключатель в UI на `gemini-2.5-flash` для повторов спорных кейсов.
- Лимит RPS: батч 10 точек с задержкой 1 сек между ними, обработка 429/402 с экспоненциальным бэкоффом.
- Промпт фиксирован на бэкенде; tool-calling схема `propose_corrections` с полями `settlement_ok, district_ok, church_corrections[], years_correction, missing_years_correction, duplicate_of:int|null, confidence, sources[]`.
- Кэш HTTP-запросов к архиву в памяти процесса серверной функции (короткие прогоны) + опционально таблица `ai_audit_cache(url, fetched_at, body)`.
- Ничего не пишет в `parishes.geojson` напрямую — только через существующий слой `feature_overrides`, который уже мерджится на клиенте.
