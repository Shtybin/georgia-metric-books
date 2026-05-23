# Подложка карты: Stadia Maps (Alidade Smooth)

После долгих попыток с самохостингом Protomaps на R2 (см. историю в git)
мы перешли на готовый хостинг **Stadia Maps**. Это убирает всю возню
с pmtiles, rclone, CORS и 373-мегабайтным файлом.

**Что используем:**
- Стиль: `alidade_smooth` — визуально близок к CARTO Positron / Light.
- Источник: `https://tiles.stadiamaps.com/styles/alidade_smooth.json`
- Тарифы: free tier — **200 000 тайл-запросов в месяц** + 2 500 статичных
  карт. Для нашего трафика — с большим запасом.
- На `localhost` и `*.lovable.app` работает **без ключа** (они в whitelist
  Stadia для разработки). На проде нужен API-ключ.

---

## Шаг 1. Создать аккаунт Stadia Maps

1. Перейти на <https://client.stadiamaps.com/signup/>.
2. Зарегистрироваться (email + пароль). Платёжная карта **не нужна**
   для free tier.
3. После подтверждения email — вход в [client.stadiamaps.com](https://client.stadiamaps.com).

## Шаг 2. Создать Property и добавить домены

«Property» в терминологии Stadia = одно приложение/сайт.

1. В дашборде → **Properties** → **Create a new property**.
2. Имя: `metrics.datatells.info` (или любое).
3. Открыть только что созданный Property → секция **Authentication
   Configuration**.
4. В подсекции **Domains** добавить **точные** домены, с которых сайт
   будет грузить тайлы:
   - `metrics.datatells.info`
   - `georgia-metric-books.lovable.app`
   - (любые превью-домены `id-preview--*.lovable.app`, если нужно)
5. Сохранить.

> На `localhost:*` и `*.lovable.app` тайлы грузятся даже без ключа —
> Stadia разрешает их по умолчанию для разработки.

## Шаг 3. Сгенерировать API-ключ

1. В том же Property → секция **API Keys** → **Create API key**.
2. Скопировать значение ключа (показывается один раз, но можно
   создать новый, если потеряли).

## Шаг 4. Прописать ключ в проекте

В `.env` (в корне проекта):

```
VITE_STADIA_API_KEY=ваш-ключ-здесь
```

В Lovable: правый верх → **Project Settings** → **Environment Variables** →
добавить `VITE_STADIA_API_KEY` со значением ключа.

Перезапустить dev-сервер (полный рестарт, не hot reload), а на проде —
задеплоить, переменная подхватится автоматически.

## Шаг 5. Проверить

Открыть карту в браузере. Должна загрузиться светлая подложка
(Alidade Smooth). В Network-вкладке DevTools видны запросы к
`tiles.stadiamaps.com` со статусом 200.

Если тайлы возвращают **401/403** — ключ не подхватился или домен
не добавлен в Authentication Configuration. Перепроверить шаги 2 и 4.

---

## Тарифы и мониторинг

- Free tier: 200 000 запросов тайлов / мес. Один пользователь смотрит
  карту ≈ 30–80 тайлов за сеанс → запас на 2 500–6 500 уникальных
  визитов в месяц.
- Использование видно в дашборде Stadia: **Properties → Usage**.
- Если упрёмся в лимит — апгрейд на `$20/мес` (1 млн запросов)
  или возвращаемся к самохостингу через R2 (старая инструкция
  сохранена в git history).

## Атрибуция

Stadia требует упоминание в углу карты:

```
© Stadia Maps © OpenMapTiles © OpenStreetMap
```

Стиль `alidade_smooth.json` уже содержит эту атрибуцию в `sources[*].attribution`,
MapLibre рендерит её автоматически в правом нижнем углу — ничего
дописывать в коде не нужно.

---

## Troubleshooting

**Карта белая / серая, в консоли 401/403 от `tiles.stadiamaps.com`**
→ Домен не в Authentication Configuration **или** ключ не задан в env.

**Карта работает локально, но не на проде**
→ На проде ОБЯЗАТЕЛЬНО нужен `VITE_STADIA_API_KEY` + прод-домен в
Stadia. Localhost — единственный whitelist без ключа.

**Карта работает, но в Stadia дашборде нулевой usage**
→ Проверить, что в Network реально летят запросы к
`tiles.stadiamaps.com` (а не к закэшированному старому источнику).
Hard reload (Cmd/Ctrl+Shift+R) сбрасывает кэш тайлов.

**Хочется тёмную карту**
→ В `src/lib/map-style.ts` поменять `alidade_smooth` на
`alidade_smooth_dark` (тот же free tier, тот же ключ).
