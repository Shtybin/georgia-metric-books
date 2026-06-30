# Georgia Metric Books Atlas — 19th-century Georgia

**Georgia Metric Books Atlas** is an interactive map of settlements, churches and parishes of 19th-century Georgia, built from the metric books of the Russian Empire. An open research tool for historians, genealogists and local-history enthusiasts.

👤 **Author:** Vitalii Shtybin — independent researcher · [datatells.info](https://datatells.info)
© 2025 Vitalii Shtybin. Maps, data compilations and accompanying texts are an authored project protected by copyright. See [`COPYRIGHT.md`](./COPYRIGHT.md) for details.

🌐 **Live:** [metrics.datatells.info](https://metrics.datatells.info) · 🗺️ Mirror: [georgia-metric-books.lovable.app](https://georgia-metric-books.lovable.app)

[![TanStack Start](https://img.shields.io/badge/TanStack-Start-EF4444)](https://tanstack.com/start) [![React 19](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev) [![Vite 7](https://img.shields.io/badge/Vite-7-646CFF)](https://vitejs.dev) [![Tailwind v4](https://img.shields.io/badge/Tailwind-v4-38BDF8)](https://tailwindcss.com) [![MapLibre GL](https://img.shields.io/badge/MapLibre-GL-396CB2)](https://maplibre.org) [![Lovable Cloud](https://img.shields.io/badge/Lovable-Cloud-FF5C5C)](https://lovable.dev)

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Data preparation](#data-preparation)
- [Database and roles](#database-and-roles)
- [Publishing to GitHub — step by step](#publishing-to-github--step-by-step)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License and credits](#license-and-credits)

---

## Features

- 🗺️ **Interactive map** built on MapLibre GL with 5,000+ historical points.
- 🌐 **Three UI languages:** Russian, English, Georgian (with `ka → en → ru` fallback).
- 🔎 **Smart search** for settlements and churches (Fuse.js, multilingual).
- 🎚️ **Filters** by region, uezd, period and radius.
- 📍 **“Unlocated” panel** — points still waiting to be geolocated.
- 🛠️ **In-card problem reporting** straight from a point.
- 🧩 **Embed mode** (`/embed`) for embedding the map on third-party sites.
- 🔐 **Admin panel** with a server-side role model (RLS + `has_role`).
- 🩺 **Session diagnostics** in the admin panel for quick permission checks.

---

## Tech stack

| Layer       | Technologies                                                               |
|-------------|----------------------------------------------------------------------------|
| Frontend    | React 19, TanStack Start / Router, Tailwind CSS v4, shadcn/ui, Lucide      |
| Map         | MapLibre GL JS, custom styles, OpenStreetMap tiles                         |
| Search      | Fuse.js (multilingual fuzzy)                                               |
| Backend     | **Lovable Cloud** (Supabase under the hood): Postgres + RLS + Auth         |
| Build       | Vite 7, Cloudflare Workers runtime (`wrangler.jsonc`)                      |
| AI translation | Lovable AI Gateway, `google/gemini-2.5-pro` (offline script)            |
| Tests       | Vitest                                                                     |
| Lint/format | ESLint 9, Prettier 3                                                       |

---

## Project structure

```
.
├── src/
│   ├── routes/               # TanStack file-based routing
│   │   ├── __root.tsx        # Root layout (html/head/body)
│   │   ├── index.tsx         # Landing page
│   │   ├── map.tsx           # Main map
│   │   ├── embed.tsx         # Embeddable version
│   │   ├── login.tsx         # Authentication
│   │   └── admin.tsx         # Admin panel + diagnostics
│   ├── components/
│   │   ├── map/              # MapView, UnlocatedPanel, ReportProblemButton
│   │   └── ui/               # shadcn/ui components
│   ├── lib/
│   │   ├── i18n.ts           # UI translations (ru/en/ka)
│   │   ├── geo.ts            # Geometry and coordinate helpers
│   │   └── map-style.ts      # MapLibre map style
│   ├── integrations/supabase/  # Auto-generated, do not edit
│   └── server.ts             # SSR entry with error wrapping
├── scripts/
│   ├── build-geojson.ts      # Build GeoJSON from CSV
│   ├── translate-ka.ts       # AI translation of data into Georgian
│   ├── check-unlocated.ts    # Audit of points without coordinates
│   └── data/                 # Source CSV files (ru/en/ka) + glossary
├── supabase/
│   ├── config.toml
│   └── migrations/           # SQL migrations (roles, has_role, RLS)
├── public/data/              # Generated GeoJSON and stats
└── wrangler.jsonc            # Cloudflare Workers config
```

---

## Quick start

**Requirements:** Node.js ≥ 20 or Bun ≥ 1.1, Git.

```bash
git clone https://github.com/<your-user>/<repo>.git
cd <repo>

# Install dependencies (Bun is faster, npm also works)
bun install
# or: npm install

# Copy the example env file and fill in Lovable Cloud keys
cp .env.example .env

# Start the dev server
bun run dev
# → http://localhost:5173
```

### Useful commands

| Command              | What it does                              |
|----------------------|-------------------------------------------|
| `bun run dev`        | Dev server with HMR                       |
| `bun run build`      | Production build                          |
| `bun run build:dev`  | Dev build (for debugging SSR)             |
| `bun run preview`    | Preview a production build locally        |
| `bun run lint`       | ESLint                                    |
| `bun run format`     | Prettier                                  |
| `bun run test`       | Vitest (single run)                       |
| `bun run test:watch` | Vitest in watch mode                      |
| `bun run test:e2e`   | Playwright e2e: overlay overflow checks for `/map` and `/tbilisi` at 375/390/1280 px. Before the first run: `npx playwright install chromium`. Spins up `vite dev` by default; to reuse a running one: `PLAYWRIGHT_BASE_URL=http://localhost:8080 bun run test:e2e`. |

---

## Environment variables

The `.env` file (local) **must never be committed**. The template is `.env.example`:

```dotenv
# Client-side (bundled into the build — safe to publish the anon key)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_SUPABASE_PROJECT_ID=<project-ref>

# Server-side (for SSR / edge functions — DO NOT publish service_role)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # ⚠️ secret!
```

> When working through Lovable Cloud the `.env` file is created and updated automatically — there is no need to edit it manually.

---

## Data preparation

All historical data lives in `scripts/data/*.csv` and is compiled into GeoJSON for the map.

```bash
# 1. Build GeoJSON from CSVs (ru/en/ka) → public/data/
bun run scripts/build-geojson.ts

# 2. Check which points are still missing coordinates
bun run scripts/check-unlocated.ts

# 3. (optional) Generate the Georgian translation via AI
bun run scripts/translate-ka.ts
```

> `translate-ka.ts` uses the Lovable AI Gateway and is idempotent — already-translated strings are not requested again.

---

## Database and roles

All schema changes go through migrations in `supabase/migrations/`.

**Role model** (important for security):

- Roles are stored in a **separate** `public.user_roles` table — NOT on `profiles` and NOT on `auth.users` (privilege-escalation protection).
- Role type is the enum `public.app_role` (`admin`, `moderator`, `user`).
- Permission checks go through the `SECURITY DEFINER` function `public.has_role(uuid, app_role)` and its mirror `private.has_role(uuid, app_role)` to avoid RLS recursion. RLS policies use `private.has_role(auth.uid(), 'admin')`.
- All admin operations (editing `feature_overrides`, moderating `problem_reports`, `coord_suggestions`, `uezd_corrections`, `missing_years_suggestions`, editing `guide_content`) are guarded by RLS policies using `private.has_role(auth.uid(), 'admin')`.
- The server function `public.rollback_feature_override(uuid)` additionally checks the role in its body (`RAISE EXCEPTION 'Forbidden'`).

**Permissions (`GRANT` / `REVOKE`) on `SECURITY DEFINER` functions:**

| Function | `anon` | `authenticated` | Purpose |
|---|---|---|---|
| `public.log_problem_report_status_change()` | ❌ | ❌ | trigger-only (called by Postgres) |
| `public.log_feature_override_change()` | ❌ | ❌ | trigger-only |
| `public.update_updated_at_column()` | ❌ | ❌ | trigger-only |
| `public.rollback_feature_override(uuid)` | ❌ | ✅ | internally checks `private.has_role(..., 'admin')` |
| `public.has_role(uuid, app_role)` | ❌ | ✅ | permission check in the app |
| `private.has_role(uuid, app_role)` | ❌ | ✅ | used by RLS policies |

`anon` and `PUBLIC` have no `EXECUTE` on any of them. The Supabase linter flags `rollback_feature_override` and `has_role` as accessible to authenticated users — that is **by design**: without it the app cannot call them via PostgREST/SDK; protection is enforced by the internal role check and/or RLS.

**Grant an administrator manually:**

```sql
insert into public.user_roles (user_id, role)
values ('<auth-user-uuid>', 'admin')
on conflict do nothing;
```

---

## Publishing to GitHub — step by step

### Option A. Through the Lovable ↔ GitHub integration (recommended)

1. In the Lovable editor open the **“+” → GitHub → Connect project** menu.
2. Authorize the **Lovable GitHub App** (once per account).
3. Pick an account or organization and click **Create Repository**.
4. Done: two-way sync is configured. Edits made in Lovable are pushed to `main`, and pushes to GitHub flow back into Lovable automatically.

> If you already have an empty repository and want to “attach” it — importing existing repos is not supported yet. Create a new one through the integration and migrate the code manually.

### Option B. Manual, from scratch

```bash
# 1. Download the code from Lovable: Code Editor → Download codebase
unzip codebase.zip && cd <project>

# 2. Initialize git
git init
git branch -M main

# 3. Make sure .env does NOT land in the commit (it's already in .gitignore)
git status   # .env must not appear in the list

# 4. First commit
git add .
git commit -m "Initial commit: Georgia Metric Books Atlas"

# 5a. Create the repository through GitHub CLI
gh repo create <user>/georgia-metric-books \
  --public \
  --description "Atlas of 19th-century Georgia from metric books" \
  --source=. --remote=origin --push

# 5b. OR create the repo via github.com/new and then:
git remote add origin https://github.com/<user>/georgia-metric-books.git
git push -u origin main
```

### What to check before `git push`

- ✅ `.gitignore` contains `.env`, `node_modules`, `dist`, `.wrangler/`, `.dev.vars`.
- ✅ No hard-coded `SUPABASE_SERVICE_ROLE_KEY` or other secrets in the code.
- ✅ `bun run build` finishes without errors.
- ✅ `bun run lint` is clean.

### Secret protection

| Key                           | Safe to publish?   |
|-------------------------------|--------------------|
| `VITE_SUPABASE_URL`           | ✅ yes             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (anon) | ✅ yes    |
| `SUPABASE_SERVICE_ROLE_KEY`   | ❌ **no, never**   |
| `LOVABLE_API_KEY` (if present)| ❌ no              |

If a secret accidentally ends up in the repository:

```bash
# 1. Rotate the key in Lovable Cloud immediately (Connectors → Lovable Cloud).
# 2. Remove it from history:
git filter-repo --path .env --invert-paths
git push --force
```

### Repository settings after creation

- **About** → link to `https://metrics.datatells.info`.
- **Topics:** `georgia`, `history`, `metric-books`, `genealogy`, `maplibre`, `tanstack-start`, `react`, `supabase`.
- **Branch protection** for `main`: forbid force-push, require PR review.
- Enable **Issues** and **Discussions** for feedback.

### CI on GitHub Actions (optional)

Create `.github/workflows/ci.yml`:

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

## Deployment

- **Lovable (default):** auto-deploy on every push to `main`. The **Publish** button publishes to `*.lovable.app`. The custom domain `metrics.datatells.info` is wired up via DNS on Netlify (A record `185.158.133.1` + TXT `_lovable.<sub>`).
- **Self-hosting:** the project builds for Cloudflare Workers (see `wrangler.jsonc`). Details: [docs.lovable.dev/tips-tricks/self-hosting](https://docs.lovable.dev/tips-tricks/self-hosting).

> **Frontend** changes require clicking **Update** in the Publish dialog.
> **Backend** changes (migrations, edge functions) deploy automatically.

---

## Contributing

1. Open an issue describing the task.
2. Create a branch: `git checkout -b feat/<short-name>`.
3. Before the PR: `bun run lint && bun run test && bun run build`.
4. Conventional Commits are welcome (`feat:`, `fix:`, `docs:`, `chore:`).
5. Open a PR against `main` describing your changes.

---

## License and credits

- The project **code** is distributed under the **MIT** license (see [`LICENSE`](./LICENSE)).
- **Maps, data compilations (GeoJSON), guide texts, design and presentation** — © 2025 **Vitalii Shtybin**, all rights reserved. Use, citation and republication are allowed only with author attribution and an active link to <https://metrics.datatells.info>. See [`COPYRIGHT.md`](./COPYRIGHT.md) for details.
- **Data:** 19th-century metric books (National Archives of Georgia and others).
- **Map:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, rendered with [MapLibre GL](https://maplibre.org).
- **Platform:** built with [Lovable](https://lovable.dev) and Lovable Cloud.

## About the author

**Vitalii Shtybin** is an independent researcher and author of [datatells.info](https://datatells.info). The main site hosts other projects and articles on the history and local studies of the Caucasus.

---

<sub>Made with ❤️ for the historians and genealogists of the Caucasus.</sub>
