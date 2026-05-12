# Архивный атлас Грузии XIX века

**Georgia Metric Books Atlas** — интерактивная карта селений, церквей и приходов Грузии XIX века, построенная на основе метрических книг Российской империи. Открытый исследовательский инструмент для историков, генеалогов и краеведов.

🌐 **Live:** [metrics.datatells.info](https://metrics.datatells.info) · 🗺️ Mirror: [georgia-metric-books.lovable.app](https://georgia-metric-books.lovable.app)

[![TanStack Start](https://img.shields.io/badge/TanStack-Start-EF4444)](https://tanstack.com/start) [![React 19](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev) [![Vite 7](https://img.shields.io/badge/Vite-7-646CFF)](https://vitejs.dev) [![Tailwind v4](https://img.shields.io/badge/Tailwind-v4-38BDF8)](https://tailwindcss.com) [![MapLibre GL](https://img.shields.io/badge/MapLibre-GL-396CB2)](https://maplibre.org) [![Lovable Cloud](https://img.shields.io/badge/Lovable-Cloud-FF5C5C)](https://lovable.dev)

---

## Содержание / Contents

- [Возможности](#возможности)
- [Технологический стек](#технологический-стек)
- [Структура проекта](#структура-проекта)
- [Быстрый старт](#быстрый-старт)
- [Переменные окружения](#переменные-окружения)
- [Подготовка данных](#подготовка-данных)
- [База данных и роли](#база-данных-и-роли)
- [Публикация на GitHub — пошагово](#публикация-на-github--пошагово)
- [Деплой](#деплой)
- [Контрибьютинг](#контрибьютинг)
- [Лицензия и благодарности](#лицензия-и-благодарности)

---

## Возможности / Features

- 🗺️ **Интерактивная карта** на MapLibre GL с ~5 000+ исторических точек.
- 🌐 **Три языка интерфейса:** русский, английский, грузинский (с фолбэком `ka → en → ru`).
- 🔎 **Умный поиск** по селениям и церквям (Fuse.js, многоязычный).
- 🎚️ **Фильтры** по региону, уезду, периоду, радиусу.
- 📍 **Панель «без координат»** — точки, которые ещё ждут локализации.
- 🛠️ **Репортинг проблем** прямо с карточки точки.
- 🧩 **Embed-режим** (`/embed`) для встраивания карты на сторонние сайты.
- 🔐 **Админ-панель** с серверной ролевой моделью (RLS + `has_role`).
- 🩺 **Диагностика сессии** в админке для быстрой проверки прав.

---

## Технологический стек / Stack

| Слой        | Технологии                                                                 |
|-------------|----------------------------------------------------------------------------|
| Frontend    | React 19, TanStack Start / Router, Tailwind CSS v4, shadcn/ui, Lucide      |
| Карта       | MapLibre GL JS, кастомные стили, тайлы OpenStreetMap                       |
| Поиск       | Fuse.js (fuzzy multilingual)                                               |
| Backend     | **Lovable Cloud** (Supabase под капотом): Postgres + RLS + Auth            |
| Сборка      | Vite 7, Cloudflare Workers runtime (`wrangler.jsonc`)                      |
| AI-перевод  | Lovable AI Gateway, `google/gemini-2.5-pro` (офлайн-скрипт)                |
| Тесты       | Vitest                                                                     |
| Линт/формат | ESLint 9, Prettier 3                                                       |

---

## Структура проекта

```
.
├── src/
│   ├── routes/               # Файловая маршрутизация TanStack
│   │   ├── __root.tsx        # Корневой layout (html/head/body)
│   │   ├── index.tsx         # Лендинг
│   │   ├── map.tsx           # Основная карта
│   │   ├── embed.tsx         # Встраиваемая версия
│   │   ├── login.tsx         # Авторизация
│   │   └── admin.tsx         # Админ-панель + диагностика
│   ├── components/
│   │   ├── map/              # MapView, UnlocatedPanel, ReportProblemButton
│   │   └── ui/               # shadcn/ui компоненты
│   ├── lib/
│   │   ├── i18n.ts           # Переводы UI (ru/en/ka)
│   │   ├── geo.ts            # Геометрия и работа с координатами
│   │   └── map-style.ts      # Стиль карты MapLibre
│   ├── integrations/supabase/  # Авто-генерируется, не править
│   └── server.ts             # SSR entry с обёрткой ошибок
├── scripts/
│   ├── build-geojson.ts      # Сборка GeoJSON из CSV
│   ├── translate-ka.ts       # AI-перевод данных на грузинский
│   ├── check-unlocated.ts    # Аудит точек без координат
│   └── data/                 # Исходные CSV (ru/en/ka) + glossary
├── supabase/
│   ├── config.toml
│   └── migrations/           # SQL-миграции (роли, has_role, RLS)
├── public/data/              # Сгенерированный GeoJSON и stats
└── wrangler.jsonc            # Конфиг Cloudflare Workers
```

---

## Быстрый старт / Quick start

**Требования:** Node.js ≥ 20 или Bun ≥ 1.1, Git.

```bash
git clone https://github.com/<your-user>/<repo>.git
cd <repo>

# Установка зависимостей (Bun быстрее, npm тоже работает)
bun install
# или: npm install

# Скопируйте пример env и заполните ключами Lovable Cloud
cp .env.example .env

# Запуск dev-сервера
bun run dev
# → http://localhost:5173
```

### Полезные команды

| Команда              | Что делает                                |
|----------------------|-------------------------------------------|
| `bun run dev`        | Dev-сервер с HMR                          |
| `bun run build`      | Production-сборка                         |
| `bun run build:dev`  | Dev-сборка (для отладки SSR)              |
| `bun run preview`    | Просмотр production-сборки локально       |
| `bun run lint`       | ESLint                                    |
| `bun run format`     | Prettier                                  |
| `bun run test`       | Vitest (один прогон)                      |
| `bun run test:watch` | Vitest в watch-режиме                     |

---

## Переменные окружения

Файл `.env` (локально) **никогда не коммитится**. Пример — `.env.example`:

```dotenv
# Клиентские (попадают в бандл — безопасно публиковать anon-ключ)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_SUPABASE_PROJECT_ID=<project-ref>

# Серверные (для SSR / edge-функций — НЕ публиковать service_role)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # ⚠️ секрет!
```

> При работе через Lovable Cloud файл `.env` создаётся и обновляется автоматически — править его вручную не нужно.

---

## Подготовка данных

Все исторические данные хранятся в `scripts/data/*.csv` и собираются в GeoJSON для карты.

```bash
# 1. Собрать GeoJSON из CSV (ru/en/ka) → public/data/
bun run scripts/build-geojson.ts

# 2. Проверить, какие точки остались без координат
bun run scripts/check-unlocated.ts

# 3. (опционально) Догенерировать грузинский перевод через AI
bun run scripts/translate-ka.ts
```

> `translate-ka.ts` использует Lovable AI Gateway и идемпотентен — уже переведённые строки не дёргает повторно.

---

## База данных и роли

Все изменения схемы — через миграции в `supabase/migrations/`.

**Ролевая модель** (важно для безопасности):

- Роли хранятся в **отдельной** таблице `public.user_roles` — НЕ в `profiles` и НЕ в `auth.users`.
- Проверка прав — через security-definer функцию `public.has_role(_user_id uuid, _role app_role)`, чтобы не упираться в RLS-рекурсию.
- RLS-политики на таблицах используют `has_role(auth.uid(), 'admin')`.

**Назначить администратора вручную:**

```sql
insert into public.user_roles (user_id, role)
values ('<auth-user-uuid>', 'admin')
on conflict do nothing;
```

---

## Публикация на GitHub — пошагово

### Вариант A. Через интеграцию Lovable ↔ GitHub (рекомендуется)

1. В редакторе Lovable откройте меню **«+» → GitHub → Connect project**.
2. Авторизуйте **Lovable GitHub App** (один раз на аккаунт).
3. Выберите аккаунт или организацию, нажмите **Create Repository**.
4. Готово: настроена двунаправленная синхронизация. Любые правки в Lovable пушатся в `main`, и наоборот — push в GitHub автоматически прилетает в Lovable.

> Если у вас уже есть пустой репозиторий и нужно «привязать» — пока импорт существующих репо не поддерживается. Создайте новый через интеграцию, затем перенесите код вручную.

### Вариант B. Вручную, с нуля

```bash
# 1. Скачайте код из Lovable: Code Editor → Download codebase
unzip codebase.zip && cd <project>

# 2. Инициализируйте git
git init
git branch -M main

# 3. Убедитесь, что .env НЕ попадёт в коммит (он уже в .gitignore)
git status   # .env не должно быть в списке

# 4. Первый коммит
git add .
git commit -m "Initial commit: Georgia Metric Books Atlas"

# 5a. Создайте репозиторий через GitHub CLI
gh repo create <user>/georgia-metric-books \
  --public \
  --description "Архивный атлас Грузии XIX века по метрическим книгам" \
  --source=. --remote=origin --push

# 5b. ИЛИ создайте репо в веб-интерфейсе github.com/new и затем:
git remote add origin https://github.com/<user>/georgia-metric-books.git
git push -u origin main
```

### Что обязательно проверить перед `git push`

- ✅ В `.gitignore` есть `.env`, `node_modules`, `dist`, `.wrangler/`, `.dev.vars`.
- ✅ В коде нет хардкода `SUPABASE_SERVICE_ROLE_KEY` или других секретов.
- ✅ `bun run build` проходит без ошибок.
- ✅ `bun run lint` без критики.

### Защита секретов

| Ключ                          | Можно публиковать? |
|-------------------------------|--------------------|
| `VITE_SUPABASE_URL`           | ✅ да              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (anon) | ✅ да     |
| `SUPABASE_SERVICE_ROLE_KEY`   | ❌ **нет, никогда** |
| `LOVABLE_API_KEY` (если есть) | ❌ нет             |

Если секрет случайно попал в репозиторий:

```bash
# 1. Сразу же ротируйте ключ в Lovable Cloud (Connectors → Lovable Cloud).
# 2. Удалите из истории:
git filter-repo --path .env --invert-paths
git push --force
```

### Настройки репозитория после создания

- **About** → ссылка на `https://metrics.datatells.info`.
- **Topics:** `georgia`, `history`, `metric-books`, `genealogy`, `maplibre`, `tanstack-start`, `react`, `supabase`.
- **Branch protection** для `main`: запретить force-push, требовать PR-ревью.
- Включите **Issues** и **Discussions** для обратной связи.

### CI на GitHub Actions (опционально)

Создайте `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run test
      - run: bun run build
```

---

## Деплой

- **Lovable (по умолчанию):** автодеплой на каждый push в `main`. Кнопка **Publish** публикует на `*.lovable.app`. Кастомный домен `metrics.datatells.info` подключён через DNS на Netlify (A-запись `185.158.133.1` + TXT `_lovable.<sub>`).
- **Self-hosting:** проект собирается под Cloudflare Workers (см. `wrangler.jsonc`). Подробности — в [docs.lovable.dev/tips-tricks/self-hosting](https://docs.lovable.dev/tips-tricks/self-hosting).

> **Frontend** изменения требуют клика **Update** в диалоге Publish.
> **Backend** изменения (миграции, edge-функции) деплоятся автоматически.

---

## Контрибьютинг

1. Заведите issue с описанием задачи.
2. Создайте ветку: `git checkout -b feat/<short-name>`.
3. Перед PR: `bun run lint && bun run test && bun run build`.
4. Conventional Commits приветствуются (`feat:`, `fix:`, `docs:`, `chore:`).
5. Откройте PR в `main`, опишите изменения.

---

## Лицензия и благодарности

- **Лицензия:** MIT (см. `LICENSE`).
- **Данные:** метрические книги XIX в. (Национальный архив Грузии и др.).
- **Карта:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, рендер — [MapLibre GL](https://maplibre.org).
- **Платформа:** сделано на [Lovable](https://lovable.dev) с Lovable Cloud.

---

<sub>Made with ❤️ for the historians and genealogists of the Caucasus.</sub>
