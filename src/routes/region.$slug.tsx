import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import regionsData from "@/data/regions.generated.json";
import type { Lang } from "@/lib/i18n";

type Parish = {
  id: number;
  settlement: { ru: string; en: string; ka: string };
  church: { ru: string; en: string; ka: string };
  uezd: { ru: string; en: string; ka: string };
  years: string;
  startYear: number | null;
  endYear: number | null;
  coord: [number, number];
};

type Region = {
  slug: string;
  names: { ru: string; en: string; ka: string };
  parishes: Parish[];
  count: number;
};

const REGIONS = (regionsData as unknown as { regions: Record<string, Region> }).regions;

const searchSchema = z.object({
  lang: fallback(z.enum(["ru", "en", "ka"]), "ru").default("ru"),
});

const T = {
  ru: {
    heading: (r: string) => `Приходы и метрические книги: ${r}`,
    intro: (n: number, r: string) =>
      `На карте отмечено ${n} приходов региона ${r} с указанием периодов ведения метрических книг. Данные охватывают 1819–1930 годы.`,
    parishes: "Список приходов",
    openOnMap: "Открыть на карте",
    otherRegions: "Другие регионы",
    home: "На главную",
    map: "Карта",
    guide: "Инструкция",
    breadcrumb: "Регионы",
    yearsLabel: "Годы записей",
    settlementLabel: "Село",
    churchLabel: "Церковь",
  },
  en: {
    heading: (r: string) => `Parishes and metric books: ${r}`,
    intro: (n: number, r: string) =>
      `The map shows ${n} parishes in ${r} region with the periods of metric book keeping. Records span 1819–1930.`,
    parishes: "List of parishes",
    openOnMap: "Open on map",
    otherRegions: "Other regions",
    home: "Home",
    map: "Map",
    guide: "Guide",
    breadcrumb: "Regions",
    yearsLabel: "Record years",
    settlementLabel: "Settlement",
    churchLabel: "Church",
  },
  ka: {
    heading: (r: string) => `სამრევლოები და მეტრიკული წიგნები: ${r}`,
    intro: (n: number, r: string) =>
      `რუკაზე მონიშნულია ${n} სამრევლო რეგიონში ${r}, წიგნების წარმოების პერიოდებით. მონაცემები მოიცავს 1819–1930 წლებს.`,
    parishes: "სამრევლოების ჩამონათვალი",
    openOnMap: "რუკაზე გახსნა",
    otherRegions: "სხვა რეგიონები",
    home: "მთავარი",
    map: "რუკა",
    guide: "ინსტრუქცია",
    breadcrumb: "რეგიონები",
    yearsLabel: "ჩანაწერების წლები",
    settlementLabel: "სოფელი",
    churchLabel: "ეკლესია",
  },
} as const;

function pickName(names: { ru: string; en: string; ka: string }, lang: Lang) {
  return names[lang] || names.en || names.ru;
}

export const Route = createFileRoute("/region/$slug")({
  validateSearch: zodValidator(searchSchema),
  loader: ({ params }) => {
    const region = REGIONS[params.slug];
    if (!region) throw notFound();
    return { region };
  },
  head: ({ params, loaderData }) => {
    // loaderData is undefined on notFound / SSR error paths — return
    // a noindex fallback rather than a broken preview.
    if (!loaderData) {
      return {
        meta: [
          { title: "Region not found — Georgia Metric Books" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const url = `https://metrics.datatells.info/region/${params.slug}`;
    const region = loaderData.region;
    const ru = region.names.ru || region.names.en;
    const en = region.names.en;
    const ka = region.names.ka || region.names.en;
    const title = `${en} — Metric Books, Parishes 1819–1930 | Метрические книги, приходы (${ru})`;
    const desc = `Interactive map of ${region.count} parishes in ${en} (${ru} / ${ka}). Metric book years, church names, settlements. Данные о приходах и метрических книгах.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [
        { rel: "canonical", href: url },
        { rel: "alternate", hrefLang: "ru", href: `${url}?lang=ru` },
        { rel: "alternate", hrefLang: "en", href: `${url}?lang=en` },
        { rel: "alternate", hrefLang: "ka", href: `${url}?lang=ka` },
        { rel: "alternate", hrefLang: "x-default", href: url },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Place",
            name: `${en} / ${ru} / ${ka}`,
            description: desc,
            url,
            containedInPlace: { "@type": "Country", name: "Georgia" },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://metrics.datatells.info/" },
              { "@type": "ListItem", position: 2, name: "Regions", item: "https://metrics.datatells.info/region" },
              { "@type": "ListItem", position: 3, name: en, item: url },
            ],
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: region.parishes.slice(0, 200).map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: `${p.church.en || p.settlement.en}${p.settlement.en ? ` (${p.settlement.en})` : ""}`,
            })),
          }),
        },
      ],
    };
  },
  component: RegionPage,
  notFoundComponent: RegionNotFound,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Failed to load region</h1>
      <p className="mt-2 text-sm text-muted-foreground">{String(error?.message ?? error)}</p>
    </div>
  ),
});

function RegionNotFound() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Region not found</h1>
      <p className="mt-3 text-muted-foreground">
        <Link to="/map" className="underline">Open the map</Link> to browse all available regions.
      </p>
    </div>
  );
}

function RegionPage() {
  const { region } = Route.useLoaderData();
  const { lang } = Route.useSearch();
  const L = T[lang as Lang] ?? T.ru;
  const regionName = pickName(region.names, lang as Lang);

  const otherRegions = Object.values(REGIONS)
    .filter((r) => r.slug !== region.slug)
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3 text-xs sm:text-sm">
          <nav className="flex items-center gap-3 text-muted-foreground">
            <Link to="/" search={{ lang: lang as Lang } as any} className="hover:text-foreground">{L.home}</Link>
            <span aria-hidden>›</span>
            <Link to="/map" search={{ lang: lang as Lang }} className="hover:text-foreground">{L.map}</Link>
            <span aria-hidden>›</span>
            <span className="text-foreground">{L.breadcrumb}</span>
          </nav>
          <Link to="/guide" search={{ lang: lang as Lang }} className="hover:text-foreground">{L.guide}</Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{L.heading(regionName)}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {L.intro(region.count, regionName)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {region.names.en} · {region.names.ru} · {region.names.ka}
        </p>
        <div className="mt-6">
          <Link
            to="/map"
            search={{ lang: lang as Lang }}
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:opacity-90"
          >
            {L.openOnMap} →
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-12">
        <h2 className="mb-4 text-xl font-semibold">{L.parishes}</h2>
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card/40">
          {region.parishes.map((p) => {
            const settlement = pickName(p.settlement, lang as Lang);
            const church = pickName(p.church, lang as Lang);
            const uezd = pickName(p.uezd, lang as Lang);
            return (
              <li key={p.id} className="px-4 py-3 text-sm">
                <div className="font-medium">
                  {church || settlement || "—"}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {[settlement && `${L.settlementLabel}: ${settlement}`, uezd, p.years && `${L.yearsLabel}: ${p.years}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-16">
        <h2 className="mb-4 text-lg font-semibold">{L.otherRegions}</h2>
        <div className="flex flex-wrap gap-2">
          {otherRegions.map((r) => (
            <Link
              key={r.slug}
              to="/region/$slug"
              params={{ slug: r.slug }}
              search={{ lang: lang as Lang }}
              className="rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs hover:bg-accent"
            >
              {pickName(r.names, lang as Lang)}
              <span className="ml-1 text-muted-foreground">({r.count})</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
