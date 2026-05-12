Создам файл `README.md` в корне проекта (на русском, с дублирующими английскими подзаголовками для GitHub-аудитории) со следующими разделами:

## 1. Шапка
- Название: **Архивный атлас Грузии XIX века / Georgia Metric Books Atlas**
- Краткое описание (1–2 строки): интерактивная карта селений и приходов Грузии XIX в. на основе метрических книг.
- Бейджи: TanStack Start, React 19, Vite 7, Tailwind v4, Supabase, MapLibre, лицензия.
- Скриншот карты (placeholder `docs/screenshot.png`).
- Живые ссылки: `https://metrics.datatells.info`, `https://georgia-metric-books.lovable.app`.

## 2. Возможности
- Интерактивная карта (MapLibre GL) с ~5000+ точками.
- Три языка интерфейса: русский, английский, грузинский.
- Поиск, фильтры по региону/уезду/периоду, радиусный поиск.
- Панель «без координат», репортинг проблем.
- Embed-режим (`/embed`) для встраивания.
- Админ-панель с ролевой моделью (Lovable Cloud / Supabase + RLS + `has_role`).
- Диагностика сессии в админке.

## 3. Технологический стек
Таблица: Frontend (React 19, TanStack Start/Router, Tailwind v4, shadcn/ui, MapLibre GL, Fuse.js), Backend (Lovable Cloud = Supabase: Postgres + RLS + Auth), Сборка (Vite 7, Cloudflare Workers runtime), AI-перевод (Lovable AI Gateway, Gemini 2.5 Pro).

## 4. Структура проекта
ASCII-дерево ключевых каталогов: `src/routes`, `src/components/map`, `src/lib`, `scripts/`, `supabase/migrations`, `public/data`.

## 5. Быстрый старт локально
```bash
git clone https://github.com/<user>/<repo>.git
cd <repo>
bun install        # или npm install
cp .env.example .env  # заполнить ключи Supabase
bun run dev
```
- Требования: Node 20+ или Bun 1.1+.
- Переменные окружения: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (+ серверные `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`).
- Команды: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`, `test`.

## 6. Подготовка данных
- `scripts/build-geojson.ts` — собирает GeoJSON из `scripts/data/*.csv` в `public/data/`.
- `scripts/translate-ka.ts` — AI-перевод на грузинский (требует Lovable AI Gateway).
- `scripts/check-unlocated.ts` — проверка точек без координат.

## 7. База данных и миграции
- Все миграции в `supabase/migrations/`.
- Роли через таблицу `user_roles` + функция `has_role(uuid, app_role)` (security definer).
- Описание ролевой модели и почему НЕ хранить роль в `profiles`.
- Как назначить администратора SQL-вставкой.

## 8. Публикация на GitHub — пошагово
Подробная инструкция (главное, что просил пользователь):

### 8.1. Через интеграцию Lovable ↔ GitHub (рекомендуется)
1. В редакторе Lovable: меню «+» → GitHub → Connect project.
2. Авторизовать Lovable GitHub App.
3. Выбрать аккаунт/организацию и нажать **Create Repository**.
4. Двунаправленный sync: пуши в GitHub автоматически прилетают в Lovable и наоборот.

### 8.2. Вручную (если хотите свой репозиторий с нуля)
```bash
# 1. Скачать код из Lovable: Code Editor → Download codebase
# 2. Создать репозиторий на GitHub (gh CLI или web UI)
gh repo create datatells/georgia-metric-books --public --source=. --remote=origin
# 3. Подготовить .gitignore (уже есть), удалить .env из истории если попал
git init
git add .
git commit -m "Initial commit: Georgia Metric Books Atlas"
git branch -M main
git push -u origin main
```

### 8.3. Что НЕ коммитить (`.gitignore`)
- `.env`, `.env.local`
- `node_modules`, `dist`, `.vite`, `.wrangler`
- `public/data/*.geojson` (если генерится из CSV — опционально)
- `scripts/data/ka.cache.json`

### 8.4. Защита секретов
- Никогда не пушить `SUPABASE_SERVICE_ROLE_KEY`.
- Anon key (`VITE_SUPABASE_PUBLISHABLE_KEY`) — безопасен в коде.
- Если случайно запушили секрет → ротация в Lovable Cloud → `git filter-repo`.

### 8.5. GitHub Actions (опционально)
Минимальный workflow `.github/workflows/ci.yml`: install → lint → test → build на каждый PR.

### 8.6. Настройки репозитория
- Description, topics: `georgia`, `history`, `metric-books`, `maplibre`, `tanstack-start`, `genealogy`.
- About: ссылка на `https://metrics.datatells.info`.
- Включить Discussions / Issues с шаблонами.
- Branch protection на `main`.

## 9. Деплой
- **Lovable**: автодеплой на push, кнопка Publish → `*.lovable.app` + custom domain `metrics.datatells.info`.
- **Self-hosting**: ссылка на docs Lovable, упоминание Cloudflare Workers (т.к. `wrangler.jsonc`).

## 10. Развитие и контрибьютинг
- Workflow: issue → branch → PR → review → merge.
- Code style: ESLint + Prettier (`bun run lint`, `bun run format`).
- Тесты: Vitest (`bun run test`).
- Conventional Commits рекомендуются.

## 11. Лицензия и благодарности
- Лицензия (MIT по умолчанию — спрошу подтвердить, если нужно иное).
- Источники данных: метрические книги (указать архивы).
- Карта: MapLibre + © OpenStreetMap contributors.
- Сделано на Lovable Cloud.

## 12. Контакты
- Автор / поддержка: email или ссылка на datatells.info.

---

**Дополнительно (если согласуете):**
- Создам `.env.example` с пустыми ключами и комментариями.
- Создам шаблон `docs/screenshot.png` (плейсхолдер) или сделаю скриншот текущей карты через imagegen-инструмент.
- Создам базовый `.github/workflows/ci.yml` и `.github/ISSUE_TEMPLATE/`.

Подтверди, делать ли README двуязычным (RU + EN секциями) или только на русском, и нужны ли сопутствующие файлы (`.env.example`, CI workflow, issue templates) — иначе сделаю только `README.md` на русском с английскими подзаголовками.