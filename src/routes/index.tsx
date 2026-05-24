import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, MapPin, Layers, Globe2, Landmark, BookOpen, Download } from "lucide-react";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { t, type Lang, STRINGS } from "@/lib/i18n";
import { AuthorHero, CopyrightFooter, authorName } from "@/components/AuthorCredit";

const searchSchema = z.object({
  lang: fallback(z.enum(["ru", "en", "ka"]), "ru").default("ru"),
});

export const Route = createFileRoute("/")({
  validateSearch: zodValidator(searchSchema),
  head: ({ match }) => {
    const lang = ((match.search as any)?.lang ?? "ru") as Lang;
    const L = STRINGS[lang].landing;
    return {
      meta: [
        { title: L.metaTitle },
        { name: "description", content: L.metaDesc },
        { property: "og:title", content: L.metaTitle },
        { property: "og:description", content: L.metaDesc },
        { property: "og:type", content: "website" },
      ],
    };
  },
  component: Index,
});

function Index() {
  const { lang } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const T = t(lang as Lang);
  const L = T.landing;

  // Auto-detect browser language on first visit (when ?lang= is absent from
  // the URL). Defaults to "ru" if the system language isn't ru/en/ka.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("lang")) return; // user (or our redirect) already set it
    const raw = (navigator.language || "ru").toLowerCase();
    const base = raw.split("-")[0];
    const detected: Lang =
      base === "en" ? "en" : base === "ka" ? "ka" : "ru";
    if (detected !== lang) {
      navigate({ search: { lang: detected }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const features = useMemo(
    () => [
      { i: MapPin, t: L.feat1Title, d: L.feat1Desc },
      { i: Layers, t: L.feat2Title, d: L.feat2Desc },
      { i: Globe2, t: L.feat3Title, d: L.feat3Desc },
    ],
    [L],
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="flex gap-2 text-xs">
          {(["ru", "en", "ka"] as const).map((l) => (
            <Link
              key={l}
              to="/"
              search={{ lang: l }}
              className={
                "rounded-full border px-2.5 py-1 uppercase tracking-wide " +
                (lang === l
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent")
              }
            >
              {l === "ka" ? "ქარ" : l}
            </Link>
          ))}
        </div>
        <p className="mt-6 font-serif text-sm uppercase tracking-[0.2em] text-muted-foreground">
          {L.eyebrow}
        </p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-6xl">
          {L.h1}
          <span className="block text-muted-foreground">{L.years}</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">{L.lead}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/map"
            search={{ lang: "ru" }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5"
          >
            {L.ctaRu} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/map"
            search={{ lang: "en" }}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-accent"
          >
            {L.ctaEn} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/map"
            search={{ lang: "ka" }}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-accent"
          >
            {L.ctaKa} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Prominent guide CTA */}
        <section className="mt-10">
          <div className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-md sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-serif text-xs uppercase tracking-[0.18em] text-primary">
                    {lang === "en" ? "Start here" : lang === "ka" ? "დაიწყეთ აქედან" : "Начните отсюда"}
                  </p>
                  <h3 className="mt-1 font-serif text-xl font-semibold sm:text-2xl">
                    {lang === "en"
                      ? "User guide for the map"
                      : lang === "ka"
                      ? "რუკის სახელმძღვანელო"
                      : "Инструкция к карте"}
                  </h3>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    {lang === "en"
                      ? "All features, layers, the “Before / After” mode and where to find the original archive documents — in one short guide."
                      : lang === "ka"
                      ? "ყველა ფუნქცია, ფენა, „მდე/შემდეგ“ რეჟიმი და სად ვეძებოთ არქივის ორიგინალი დოკუმენტები — ერთ მოკლე სახელმძღვანელოში."
                      : "Все функции, слои, режим «До/После» и где искать оригиналы архивных документов — в одной короткой инструкции."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                <Link
                  to="/guide"
                  search={{ lang }}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
                >
                  <BookOpen className="h-4 w-4" />
                  {lang === "en" ? "Open guide" : lang === "ka" ? "გახსნა" : "Открыть инструкцию"}
                </Link>
                <a
                  href="/docs/map-guide-ru.md"
                  download
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent"
                >
                  <Download className="h-4 w-4" />
                  {lang === "en" ? "Download .md" : lang === "ka" ? "ჩამოტვირთვა .md" : "Скачать .md"}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Tbilisi map CTA */}
        <section className="mt-6">
          <Link
            to="/tbilisi"
            search={{ lang }}
            className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-card via-card to-primary/10 p-5 shadow-md transition-transform hover:-translate-y-0.5 sm:p-6"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Landmark className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-xs uppercase tracking-[0.18em] text-primary">
                {lang === "en" ? "City focus" : lang === "ka" ? "ქალაქის ფოკუსი" : "Фокус города"}
              </p>
              <h3 className="mt-1 font-serif text-xl font-semibold sm:text-2xl">
                {lang === "en"
                  ? "Map of Tbilisi churches"
                  : lang === "ka"
                  ? "თბილისის ეკლესიების რუკა"
                  : "Карта церквей Тбилиси"}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {lang === "en"
                  ? "108 parishes of all confessions — Orthodox, Armenian, Catholic, Lutheran, Jewish, Molokan and more — with parish-register years."
                  : lang === "ka"
                  ? "108 სამრევლო ყველა კონფესიის — მართლმადიდებლური, სომხური, კათოლიკური, ლუთერანული, იუდაური, მოლოკანური და სხვა — მეტრიკული წიგნების წლებით."
                  : "108 приходов всех конфессий — православных, армянских, католических, лютеранских, иудейских, молоканских и других — с годами метрических книг."}
              </p>
            </div>
            <ArrowRight className="hidden h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-1 sm:block" />
          </Link>
        </section>


        {/* Section: data source */}
        <section className="mt-16">
          <h2 className="font-serif text-lg font-semibold">{L.archiveTitle}</h2>
          <div className="mt-4 flex gap-4 rounded-2xl border border-border bg-card p-6">
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
              <Landmark className="h-5 w-5" />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {L.archiveBody}
            </p>
          </div>
        </section>

        {/* Section: map features */}
        <section className="mt-16">
          <h2 className="font-serif text-lg font-semibold">{L.featuresEyebrow}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{L.featuresHint}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {features.map(({ i: Icon, t: title, d }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-serif text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
