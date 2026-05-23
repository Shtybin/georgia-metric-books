ial# План правок `docs/self-hosted-basemap-setup.md`

Две фактические ошибки в текущей инструкции — исправляю обе.

## Проблема 1. Stadia: одна Property = один домен

В Authentication Configuration у Property добавляется ровно **один** домен,
не список. Значит, чтобы покрыть и прод (`metrics.datatells.info`), и
Lovable-домен (`georgia-metric-books.lovable.app`), нужно **две Property
с двумя разными API-ключами**.

Перепишу Шаг 2–4 так:

- **Шаг 2.** Создать **Property #1** → домен `metrics.datatells.info` →
  получить ключ → сохранить как `VITE_STADIA_API_KEY` (прод).
- **Шаг 3.** Создать **Property #2** → домен
  `georgia-metric-books.lovable.app` → получить ключ → сохранить отдельно
  (например, в заметках; в код не кладём, потому что в рантайме всё равно
  читается один `VITE_STADIA_API_KEY`).
- **Важная оговорка**: один билд = один ключ. На практике вариантов два:
  - **A (рекомендую):** деплоить только на кастомный домен
    `metrics.datatells.info`, а `*.lovable.app` использовать как
    dev-превью — там ключ Stadia не нужен (whitelist).
  - **B:** если реально нужны оба прод-домена с тайлами, держать
    `VITE_STADIA_API_KEY` от Property `metrics.datatells.info`, а на
    `lovable.app` тайлы будут грузиться по dev-whitelist Stadia без ключа
    (это уже работает из коробки).
- В итоге **достаточно одной Property + одного ключа** для
  `metrics.datatells.info`. Вторая Property не нужна, пока не появится
  третий собственный домен.

## Проблема 2. Где в Lovable класть ключ

В Lovable нет вкладки «Environment Variables» в Project Settings —
я ошибся. Правильный путь для рантайм-секретов:

> **Cloud → Secrets** (или Project Settings → Cloud → Secrets)

Но `VITE_*` переменные — это **build-time**, их Vite вшивает в бандл
на этапе сборки. Поэтому для `VITE_STADIA_API_KEY` есть два пути:

1. **Через secrets-инструмент Lovable** — я вызову `add_secret`
   для `VITE_STADIA_API_KEY`, появится защищённая форма, ты вставишь
   значение. После этого Lovable пробросит её и в билд, и в рантайм.
   Это рекомендованный способ — ключ не лежит в git.
2. **Локально для разработки** — прописать строку
   `VITE_STADIA_API_KEY=...` в локальном `.env` (файл уже в
   `.gitignore`, в репо не уедет). На проде всё равно нужен пункт 1.

В доке поправлю Шаг 4 на этот сценарий и уберу несуществующую
«Environment Variables в Project Settings».

## Что меняю в файлах

- `docs/self-hosted-basemap-setup.md` — переписываю Шаги 2–4 целиком
  (один домен на Property, рекомендация ограничиться
  `metrics.datatells.info`, корректный способ добавления ключа через
  Cloud → Secrets / `add_secret`).
- `.env.example` — поправляю комментарий: убираю упоминание двух
  доменов в одной Property, добавляю про dev-whitelist Lovable.

Код (`src/lib/map-style.ts`) **не трогаю** — логика чтения
`VITE_STADIA_API_KEY` и фолбэк на работу без ключа уже корректны.

## Дальше

Когда подтвердишь план — в build-режиме сразу вызову `add_secret`
для `VITE_STADIA_API_KEY`, чтобы ты вставил ключ в форму, и
обновлю обе доки.