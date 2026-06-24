# План: AI-оркестрация для тотальной перепроверки точек

## Цель
Удалить вкладки **AI-геокодер** и **AI-аудит** из админки. Вместо них — одна вкладка **AI-оркестрация**, где группа из 4 ботов (Coordinator → GeoAgent / MetricsAgent / ArchiveAgent → Reviewer) автоматически проверяет каждую точку карты и кладёт находки на ручное ревью (human-in-the-loop).

## Архитектура агентов

```text
                ┌──────────────────────┐
                │   Coordinator        │  делит N точек на батчи,
                │   (Gemini 2.5 Flash) │  ставит задачи в очередь,
                └──────────┬───────────┘  следит за watchdog
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
 ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
 │  GeoAgent   │   │ MetricsAgent │   │ ArchiveAgent │
 │ Gemini 2.5  │   │ Gemini 2.5   │   │ Gemini 2.5   │
 │   Pro       │   │   Pro        │   │   Flash      │
 │ координаты, │   │ годы МК,     │   │ ссылки на    │
 │ уезд, район │   │ церкви,      │   │ archival-    │
 │             │   │ пропуски     │   │ services.gov │
 └─────┬───────┘   └──────┬───────┘   └──────┬───────┘
       └──────────────────┼──────────────────┘
                          ▼
                  ┌───────────────┐
                  │   Reviewer    │ агрегирует, ставит
                  │   GPT-5       │ confidence, эскалирует
                  │ (эскалация)   │ спорные кейсы, пишет
                  └───────┬───────┘ итоговое findings
                          ▼
                ai_audit_findings (status=pending)
                     → ручное ревью
```

**Гибридная модель:** базовая работа на `google/gemini-2.5-pro`. Reviewer на `openai/gpt-5` запускается только если хотя бы один из под-агентов вернул `confidence < 0.7` или агенты противоречат друг другу (экономия токенов). ArchiveAgent — на быстрой `gemini-2.5-flash` (там только HTTP-проверки, не нужен Pro).

## Что проверяет каждый агент

**GeoAgent** — координаты:
- читает текущие `lat/lon`, название, `church`, `uezd`, `region`
- если есть конкретный уезд (напр. Горийский) — проверяет, попадает ли точка в границы (используем bbox из существующих данных уездов)
- если общий регион (Гурия, Имеретия) — сверяет с историческими bbox этих областей
- учитывает однокоренные названия (Tsageri vs Tsaishi vs Tskhinvali), предлагает корректировку при mismatch
- источник истины: `feature_overrides`, `uezd_corrections`, GeoJSON уездов 1898 г.

**MetricsAgent** — данные метрических книг:
- сверяет годы ведения МК в карточке с реальными годами из БД сайта (`features`) и из загруженных PDF
- проверяет согласованность: периоды ведения ⊇ годы пропусков ∪ годы наличия
- проверяет, что список церквей в карточке соответствует упоминаниям в PDF
- источник: таблицы БД + парсинг PDF (см. ниже)

**ArchiveAgent** — внешние ссылки:
- если в `external_sources` есть ссылка на `archival-services.gov.ge/saeklesio/` — делает HEAD-запрос, проверяет 200 и что в URL фигурирует то же название/фонд
- помечает битые ссылки и предлагает поиск по сайту архива

**Reviewer** — финальный арбитр:
- агрегирует находки 3 агентов
- эскалирует на GPT-5 только при разногласиях или низкой уверенности
- выставляет финальный `severity` и `confidence`
- записывает в `ai_audit_findings` со `status='pending'`

## Источники данных PDF

Будем использовать **существующую инфраструктуру** + новый storage bucket:
- `archival-services.gov.ge` — ArchiveAgent делает прямые HTTP-проверки через server fn
- **новый bucket `metric-book-pdfs`** в Lovable Cloud Storage — туда пользователь загружает PDF через UI новой вкладки
- при первой загрузке: запускаем извлечение текста через `document--parse_document` логику внутри server fn, сохраняем выжимку (год, церковь, район) в новую таблицу `pdf_extracted_records` для быстрого поиска агентами
- старый скрипт `scripts/parse-niag-pdfs.py` остаётся для bulk-импорта вне UI

## Структура вкладки UI

```text
┌─ AI-оркестрация ─────────────────────────────────────────────┐
│                                                              │
│  [ Запустить ▶ ]  [ Пауза ⏸ ]  [ Стоп ⏹ ]  [ Перезапуск ↻ ] │
│                                                              │
│  Бюджет: $5.00 / $20.00       Модель: Gemini Pro + GPT-5     │
│                                                              │
│  ┌─ Прогресс ──────────────────────────────────────────┐    │
│  │ 1247 / 4892 точек  (25.5%)   ETA: 38 мин            │    │
│  │ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░             │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ Боты ──────────────────────────────────────────────┐    │
│  │ Coordinator   ● работает    очередь: 12 батчей      │    │
│  │ GeoAgent      ● работает    1102/4892  fails: 3     │    │
│  │ MetricsAgent  ● работает     987/4892  fails: 1     │    │
│  │ ArchiveAgent  ● работает     834/4892  fails: 12    │    │
│  │ Reviewer      ● ожидает      612/4892  fails: 0     │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ Watchdog ──────────────────────────────────────────┐    │
│  │ Последняя активность: 3 сек назад                    │    │
│  │ Зависшие задачи: 0  (порог 60 сек → auto-restart)   │    │
│  │ [Подробный лог ▼]                                    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ Проблемные кейсы (требуют внимания) ───────────────┐    │
│  │ • Тбилиси, Сионский собор — GeoAgent vs MetricsAgent│    │
│  │ • Кутаиси, Баграти — битая ссылка archive          │    │
│  │ ...                                                  │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  [Загрузить PDF метрических книг ⬆]                          │
│                                                              │
│  [Перейти к ревью находок →]  (открывает старый UI findings)│
└──────────────────────────────────────────────────────────────┘
```

Лог обновляется live через polling `ai_audit_runs` + `ai_audit_findings` каждые 2 сек (Supabase realtime — опционально, polling проще).

## Watchdog

Серверная функция `orchestratorTick`:
- запускается каждые 30 сек, пока есть `running` run
- проверяет `updated_at` каждой задачи в очереди
- если задача висит > 60 сек без обновления → помечает `failed`, увеличивает счётчик попыток, возвращает в очередь (макс 3 попытки)
- если 5+ задач подряд упали с одной ошибкой → ставит run в `paused`, уведомляет UI
- кнопка «Перезапуск» в UI чистит зависшие задачи и продолжает с последней успешной точки

## Что удаляется

- `src/components/admin/AiGeocoderPanel.tsx`
- `src/components/admin/AiAuditPanel.tsx`
- `src/lib/aiGeocoder.functions.ts`
- `src/lib/aiAudit.functions.ts` (логика частично переносится в новые функции)
- Соответствующие табы в `src/routes/admin.tsx`

## Что создаётся

**Frontend:**
- `src/components/admin/AiOrchestrationPanel.tsx` — главный UI вкладки
- `src/components/admin/orchestration/AgentStatusCard.tsx`
- `src/components/admin/orchestration/WatchdogPanel.tsx`
- `src/components/admin/orchestration/PdfUploadDialog.tsx`
- `src/components/admin/orchestration/FindingsReviewLink.tsx` (переиспользует существующий UI ревью находок из `AiAuditPanel`, выносим в `FindingsReviewPanel.tsx`)

**Backend (server fns в `src/lib/`):**
- `aiOrchestrator.functions.ts` — `startRun`, `pauseRun`, `resumeRun`, `restartRun`, `getRunStatus`
- `aiOrchestrator.coordinator.server.ts` — логика батчинга и очереди
- `aiOrchestrator.agents.server.ts` — реализация GeoAgent / MetricsAgent / ArchiveAgent / Reviewer через AI SDK + Lovable AI Gateway
- `aiOrchestrator.watchdog.server.ts` — детект зависших задач
- `pdfExtractor.functions.ts` — приём PDF и сохранение выжимок

**DB-миграции:**
- `ai_orchestration_tasks` — очередь задач (run_id, feature_id, agent, status, attempts, last_heartbeat, payload)
- `pdf_extracted_records` — извлечённые из PDF записи (pdf_id, year, church, region, raw_text)
- расширение `ai_audit_runs`: добавить колонки `agent_progress jsonb`, `watchdog_state jsonb`, `paused_at`
- storage bucket `metric-book-pdfs` (приватный, доступ только admin)
- GRANT / RLS политики на всё новое

## Технические детали

- Все вызовы Gemini Pro/GPT-5 идут через **Lovable AI Gateway** (`@ai-sdk/openai-compatible`), читают `LOVABLE_API_KEY` в `process.env` внутри `.handler()`
- Структурированный вывод через `Output.object` со Zod-схемами (по схеме на агента)
- Стоимость считается per-call, агрегируется в `ai_audit_runs.spent_usd`, останавливаем run при превышении `budget_usd`
- Долгие задачи: Coordinator не блокирует HTTP — он только ставит задачи в очередь и возвращается. Реальная работа агентов идёт через `pg_cron` → `/api/public/orchestrator/process-batch` (с подписанным секретом) каждые 10 сек, либо через `setTimeout`-чейн внутри одного long-running server fn (проще для MVP)
- Для MVP стартую с `setTimeout`-цикла внутри одного `startRun` (Cloudflare Workers держит до 30 сек CPU, поэтому Coordinator перезапускается из watchdog tick)

## Что мне нужно от вас перед стартом

Пришлите 1–2 примера PDF метрических книг прямо в следующем сообщении — мне нужно посмотреть на их реальную структуру, чтобы корректно настроить `pdfExtractor` (форматы названий церквей/годов в разных PDF могут отличаться, и я не хочу гадать).

После реализации вы запустите run на полной карте, посмотрите на находки в pending, одобрите/отклоните, и одобренные применятся как `feature_overrides` (как сейчас в `AiAuditPanel`).
