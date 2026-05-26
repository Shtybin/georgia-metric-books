# Проверка координат тбилисских церквей через ИИ

## Что делаем

Новая вкладка в /admin → «Координаты Тбилиси»: запускает батч AI-проверки координат церквей из `public/data/tbilisi-churches.json` с уверенностью != `high`. Для каждой церкви комбинируем geocoding (Nominatim) и deep-research через Lovable AI (GPT-5, reasoning=high) — модель получает имя/адрес/район/исторические заметки + кандидатов OSM и возвращает уточнённые координаты с обоснованием и ссылками. Результаты складываются в новую таблицу для модерации; ничего не публикуется автоматически.

## Технические детали

### 1. Миграция БД

Новая таблица `public.tbilisi_coord_verifications`:
- `id uuid pk`
- `church_id int` (id из tbilisi-churches.json), уникален
- `old_lat/old_lon double`, `new_lat/new_lon double`
- `distance_m double` (расстояние между старой и новой)
- `confidence numeric(3,2)` (0–1, от модели)
- `reasoning text` (объяснение модели)
- `sources jsonb` (массив `{url, title}`)
- `osm_candidates jsonb` (что вернул Nominatim)
- `status text` ∈ {pending, approved, rejected}, default pending
- `reviewed_by uuid`, `reviewed_at timestamptz`, `created_at`, `updated_at`

GRANT для authenticated/service_role + RLS: select/insert/update только для `has_role(auth.uid(), 'admin')`. Триггер `update_updated_at_column`.

### 2. Server function `src/lib/tbilisiCoordVerifier.functions.ts`

`verifyTbilisiCoords({ limit, offset, minConfidence?, recheck? })`, middleware `requireSupabaseAuth` + ручная проверка роли admin через `has_role`:

1. Читает `public/data/tbilisi-churches.json` через `fs.readFileSync`.
2. Фильтрует записи `confidence !== 'high'`. Если `recheck=false`, исключает уже верифицированные (есть строка в `tbilisi_coord_verifications`).
3. Чанками по 2 (≈30 сек лимит):
   - Nominatim `q=address, Tbilisi, Georgia` (User-Agent + 1.1s задержка).
   - Lovable AI: `openai/gpt-5`, `reasoning: { effort: "high" }`, tool calling для строгого JSON.
   - Системный промпт: историк-картограф Тифлиса; задача — проверить координаты церкви на основе адреса, района, исторических заметок, кандидатов OSM. Возвращай `{lat, lon, confidence, reasoning, sources: [{url,title}]}`. Если уверен в текущих — верни их же с пояснением.
   - Считает distance_m (haversine), upsert в таблицу по `church_id`.
4. Возвращает `{processed, updated, skipped, errors, log: [...]}` для UI.

`listTbilisiVerifications({ status })` — возвращает строки + соответствующие church данные (joined в коде).

`reviewTbilisiVerification({ id, action: 'approve'|'reject' })` — обновляет статус.

### 3. UI `src/components/admin/TbilisiCoordVerifierPanel.tsx`

По образцу `AiGeocoderPanel`:
- Слайдер «сколько проверить» (1–50), чекбокс «перепроверять уже проверенные».
- Кнопка «Запустить» — клиентский цикл по 2 записи (как уже сделано в AiGeocoderPanel) с прогрессом.
- Лог: имя церкви, старые/новые координаты, distance_m, confidence, reasoning, ссылки на источники.
- Под логом — список pending-предложений с кнопками Approve/Reject и мини-картой (AdminMiniMap) показывающей старую и новую точки.

### 4. Применение одобренных правок

`src/lib/tbilisiChurches.ts` грузит JSON и затем тянет approved-верификации из Supabase, мёржит по id — `church.lat/lon` заменяются, `confidence` повышается до `high`, добавляется флаг `verifiedByAi: true` чтобы показывать значок в карточке.

### 5. Вкладка в admin.tsx

Добавляем `"tbilisi"` в union типа `tab`, кнопку «Координаты Тбилиси», секцию `{tab === "tbilisi" && <TbilisiCoordVerifierPanel />}`.

## Стоимость / ограничения

GPT-5 с reasoning=high — самый дорогой и медленный из доступных. 2 церкви/запрос ≈ 30–60 сек. Полный обход ~200 точек = ~50 запусков, расходует ощутимый кусок Lovable AI кредитов. UI явно об этом предупреждает.

## Что НЕ делаем в этом проходе

- Не публикуем правки автоматически — только через ручное approve.
- Не трогаем общий метрики-набор (только тбилисские церкви).
- Не меняем сам JSON-файл; правки живут в Supabase и применяются поверх.
