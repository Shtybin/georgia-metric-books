## Цель

В админ-панели «AI-Оркестрация» появится **второй тип прогона** — «Геолокация неразмещённых селений». Он берёт все записи из `public/data/unlocated.json`, которым до сих пор не присвоены координаты (нет принятого `coord_suggestion` и нет ручной привязки в `feature_overrides`/`user_coords`), находит для них координаты с учётом географии, исторических уездов/районов и омонимов, ставит точку на карте и тут же прогоняет её через ту же аудит-цепочку, что и остальные точки (церкви, периоды, пропущенные годы, ссылки на архив и FamilySearch).

## UX (вкладка AI-Оркестрация)

- Селектор задачи сверху панели: **«Аудит существующих точек»** (текущий прогон) / **«Геолокация неразмещённых»** (новый).
- Для новой задачи:
  - счётчик «осталось неразмещённых» (всего / уже геолоцированных за этот прогон / отброшенных как неоднозначные);
  - те же кнопки Play / Pause / Resume / Cancel, тот же watchdog и heartbeat;
  - таблица находок с типом `geolocate`: координаты-кандидат, источник (OSM/Nominatim/исторический справочник/AI-вывод), confidence, обоснование, ссылки;
  - кнопки Approve/Reject. Auto-approve при confidence ≥ 0.85 и единственном кандидате; иначе — ручная модерация.

## Пайплайн агентов (повторно использует существующих)

```text
Coordinator → LocatorAgent → DisambiguatorAgent → MetricsAgent → ArchiveAgent → Reviewer
```

1. **Coordinator** делит оставшиеся unlocated-записи на батчи (как сейчас в `aiOrchestrator.functions.ts`).
2. **LocatorAgent** (новый, обёртка над уже существующим `aiGeocoder.functions.ts`):
   - сначала Nominatim/OSM по `settlement + uezd + region` (готовая функция `geocodeCandidates`);
   - если 0 или >1 кандидата — обращение к Lovable AI (Gemini Pro) с контекстом: исторический уезд/район XIX в., соседние уже размещённые селения, PDF-чанки `pdf_text_chunks`, ссылки `archival-services.gov.ge` (та же иерархия источников, что в текущем оркестраторе: сайт → PDF → NIAG).
3. **DisambiguatorAgent**: если в Грузии есть несколько одноимённых сёл, выбирает то, чей уезд/район совпадает с историческим (использует `LOCATION_HINTS` и геометрию уже размещённых соседей того же уезда — bounding box ±N км).
4. **MetricsAgent / ArchiveAgent / Reviewer** — уже существующие, запускаются на новой точке сразу после установки координат: проверяют названия церквей, период метрических книг, пропущенные годы, наличие ссылок на `archival-services.gov.ge` и `familysearch.org`, создают `missing_years_suggestions` и `external_sources`.

## Применение результата

После approve (ручного или авто):
- создаётся `feature_overrides` c `action: "merge_unlocated"` (механизм уже есть — `aiAudit.functions.ts` строка ~900), с заполнением координат, названий церквей, периода и т. д.;
- запись помечается обработанной в `coord_suggestions` (status=approved, source=`ai-orchestration`);
- точка немедленно появляется на основной карте (та же логика рендера, что и для существующих overrides);
- параллельно дописываются `external_sources` (archive + FamilySearch) и `missing_years_suggestions`.

## База данных

Дополнения к существующим таблицам, без новых сущностей:
- `ai_audit_runs`: поле `task_kind` (`'audit' | 'geolocate'`, default `'audit'`), чтобы UI и watchdog различали типы прогонов.
- `ai_audit_findings`: расширить enum `kind` значением `geolocate` (rationale, candidate lat/lon, confidence, источники — в существующем `data jsonb`).
- `coord_suggestions`: добавить `origin text` (значения `manual | ai-geocoder | ai-orchestration`), чтобы видеть, какие точки пришли из новой задачи.

Все изменения — одной миграцией с GRANT/RLS, повторяющими существующие политики этих таблиц.

## Серверная часть

Новый файл `src/lib/aiOrchestratorGeolocate.functions.ts`:
- `startGeolocationRun({ budgetUsd, scope, model })` — аналог `startOrchestrationRun`, но скоуп идёт по `unlocated.json` минус уже размещённые.
- `processGeolocationTick({ runId })` — обрабатывает следующий батч: вызывает LocatorAgent → Disambiguator → создаёт finding.
- `applyGeolocationFinding({ findingId })` — выполняет merge_unlocated через существующий механизм, затем синхронно прогоняет MetricsAgent/ArchiveAgent на новой точке.
- Pause/Resume/Cancel/Watchdog — переиспользуют ту же логику, что и аудит-оркестратор (выделить общие helpers).

## UI-изменения

- `src/components/admin/AiOrchestrationPanel.tsx`: добавить переключатель задач, отрисовку карточки находки `geolocate` (карта-мини, кандидаты, кнопки Approve/Reject/Open on map).
- В таблице/легенде неразмещённых (`UnlocatedPanel`) — бейдж «AI нашёл координаты, ждёт модерации» для тех записей, по которым есть pending `coord_suggestions` с `origin = ai-orchestration`.

## Технические детали

- Модель по умолчанию: `google/gemini-2.5-pro` (та же, что в текущем оркестраторе). Для дешёвой первичной проверки кандидатов — `google/gemini-3-flash-preview`.
- Все вызовы через Lovable AI Gateway, без новых секретов.
- Nominatim уже используется в `aiGeocoder.functions.ts`; повторно используем с тем же User-Agent и rate-limit.
- Auto-apply порог: confidence ≥ 0.85 AND единственный гео-кандидат AND уезд совпадает. Иначе — pending.
- Идемпотентность: перед обработкой ticka — проверка, что для записи нет approved `coord_suggestion` или published `feature_override`.
- Heartbeat/Watchdog/exponential backoff — переиспользуются как есть (мягкий resume, не cancel).

## Этапы

1. Миграция БД (`task_kind`, `coord_suggestions.origin`, enum extension).
2. `aiOrchestratorGeolocate.functions.ts` + общие helpers вынести из `aiOrchestrator.functions.ts`.
3. UI-переключатель задач и новая карточка находки в `AiOrchestrationPanel`.
4. Бейдж pending-AI-координат в `UnlocatedPanel`.
5. Прогон на 5–10 записях вручную, проверка корректности, затем полный запуск.
