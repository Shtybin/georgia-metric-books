# Интеграция с FamilySearch — ссылки на метрические книги

## Что делаем

Добавляем курируемый каталог внешних ссылок (для начала на FamilySearch, с расчётом на будущие провайдеры — НИАГ, dlib и т.д.) и привязываем их к точкам карты или к уездам целиком. Пользователь на карте видит блок «Архивные источники» в попапе/панели точки и переходит по ссылке в FamilySearch, где авторизуется уже своим аккаунтом.

Скрейпинг и использование личного пароля не делаем — нарушает TOS FamilySearch. Параллельно подготовим черновик заявки на официальный FS API, чтобы позже можно было автоматически подтягивать новые коллекции.

## Архитектура данных

Новая таблица `external_sources` в Lovable Cloud:

| Поле | Тип | Назначение |
|---|---|---|
| `id` | uuid PK | |
| `provider` | text | `'familysearch'`, позже `'niag'`, `'other'` |
| `scope` | text | `'feature'` (точка) или `'uezd'` |
| `feature_id` | int, nullable | id фичи в parishes.geojson (если scope='feature') |
| `uezd_ru` / `uezd_en` | text, nullable | имя уезда (если scope='uezd') |
| `url` | text | прямая ссылка на каталог/коллекцию FS |
| `title` | text | человеческий заголовок («Метрические книги Тифлисской епархии 1820–1917») |
| `description` | text, nullable | краткое примечание |
| `place_query` | text, nullable | поисковый запрос (`Тифлис`, `Кутаиси`) — для будущей синхронизации через API |
| `requires_auth` | bool, default true | подсказка пользователю |
| `created_by` / `created_at` / `updated_at` | служебные | |

RLS:
- SELECT: `anon` + `authenticated` (публичные ссылки)
- INSERT/UPDATE/DELETE: только `admin` (через `has_role`)

## Backend (server functions)

`src/lib/externalSources.functions.ts`:
- `listSourcesForFeature(featureId, uezdRu)` — публичная, возвращает объединённый список (по feature_id + по uezd)
- `listAllSources()` — admin, для модерации
- `upsertSource(payload)` — admin, валидация через Zod
- `deleteSource(id)` — admin

Все мутации — `requireSupabaseAuth` + проверка роли admin внутри хендлера.

## UI

### Карта (попап/панель точки)
Новая секция «Архивные источники» в `MapView` (и `UnlocatedPanel` для уездов):
- иконка `BookOpen` / `ExternalLink`
- список ссылок: заголовок + провайдер + значок «требуется регистрация»
- клик → `target="_blank" rel="noopener"`, открывается FS, пользователь логинится сам
- если ссылок нет — секция скрыта

### Админка
Новая вкладка в `/admin` — «Внешние источники»:
- таблица всех записей с фильтром по провайдеру и уезду
- форма добавления: provider, scope (точка/уезд), выбор feature через autocomplete или ввод uezd, url, title, description, place_query
- быстрая кнопка «Добавить источник» прямо в попапе точки на карте (только для админов) — открывает диалог с предзаполненным feature_id/uezd
- кнопка «Найти в FamilySearch» рядом с уездом — открывает FS-каталог с `q.place=<uezd>` в новой вкладке (без скрейпинга, просто удобный шорткат для ручного поиска)

## Заявка на FS API (отдельный артефакт)

Сгенерирую `docs/familysearch-api-application.md` — черновик заявки на developer.familysearch.org с описанием проекта, scope, целевой аудитории, чтобы ты мог подать её сам. Когда (если) одобрят и появится client_id/secret — добавлю серверную функцию `syncFamilySearchPlace(place_query)`, которая через OAuth-аутентифицированного пользователя будет искать новые коллекции и предлагать их к добавлению в `external_sources` (модерация админом).

## Изменения по файлам

**Миграция:**
- создать таблицу `external_sources` + RLS + триггер `updated_at`

**Новые файлы:**
- `src/lib/externalSources.functions.ts` — server functions
- `src/components/admin/ExternalSourcesPanel.tsx` — админка
- `src/components/map/ExternalSourcesList.tsx` — секция в попапе/панели
- `docs/familysearch-api-application.md` — черновик заявки

**Правки:**
- `src/routes/admin.tsx` — новая вкладка
- `src/components/map/MapView.tsx` — рендер секции в попапе точки + admin-кнопка «Добавить источник»
- `src/components/map/UnlocatedPanel.tsx` — секция для уезда
- `src/lib/i18n.ts` — новые строки (ru/en/ka)

## Что НЕ делаем

- ❌ скрейпинг FS под твоим логином (бан + юридический риск)
- ❌ автоматическая авторизация посетителей карты через твой аккаунт (невозможно, и не нужно — у каждого свой FS-аккаунт)
- ❌ хранение FS-логинов/паролей пользователей

## Объём

Первая итерация (без API FS): миграция + server fns + админка + UI на карте + черновик заявки. После одобрения FS API — отдельный заход на автосинхронизацию.
