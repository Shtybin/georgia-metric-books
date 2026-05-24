import type { Lang } from "@/lib/i18n";

const AUTHOR_RU = "Виталий Штыбин";
const AUTHOR_EN = "Vitaly Shtybin";
const AUTHOR_KA = "ვიტალი შტიბინი";
const SITE = "datatells.info";
const SITE_URL = "https://datatells.info";
const YEAR = "2025";

export function authorName(lang: Lang) {
  return lang === "en" ? AUTHOR_EN : lang === "ka" ? AUTHOR_KA : AUTHOR_RU;
}

export function copyrightLine(lang: Lang) {
  const rights =
    lang === "en"
      ? "All rights reserved"
      : lang === "ka"
      ? "ყველა უფლება დაცულია"
      : "Все права защищены";
  return `© ${YEAR} ${authorName(lang)} · ${rights} · ${SITE}`;
}

/** Compact attribution overlay shown on top of every map. */
export function MapAuthorBadge({ lang }: { lang: Lang }) {
  return (
    <a
      href={SITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="pointer-events-auto absolute bottom-3 left-1/2 z-[6] -translate-x-1/2 rounded-full border border-border bg-card/95 px-3 py-1 text-[11px] font-medium text-foreground shadow-md backdrop-blur hover:bg-accent sm:bottom-2 sm:left-3 sm:translate-x-0"
      title={SITE_URL}
    >
      © {YEAR} {authorName(lang)} · {SITE}
    </a>
  );
}

/** Hero block on the landing page: author + CTA to datatells.info. */
export function AuthorHero({ lang }: { lang: Lang }) {
  const tagline =
    lang === "en"
      ? "Independent researcher · author at datatells.info"
      : lang === "ka"
      ? "დამოუკიდებელი მკვლევარი · ავტორი datatells.info-ზე"
      : "Независимый исследователь · автор datatells.info";
  const cta =
    lang === "en"
      ? "Other projects and articles by the author →"
      : lang === "ka"
      ? "ავტორის სხვა პროექტები და სტატიები →"
      : "Другие проекты и статьи автора →";
  const rights =
    lang === "en"
      ? "This map and its accompanying materials are an original work, protected by copyright."
      : lang === "ka"
      ? "ეს რუკა და თანმხლები მასალები ავტორის ნაშრომია და დაცულია საავტორო უფლებებით."
      : "Карты и сопроводительные материалы — авторский проект, защищён авторским правом.";
  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-serif text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {lang === "en" ? "Author" : lang === "ka" ? "ავტორი" : "Автор проекта"}
          </p>
          <h3 className="mt-1 font-serif text-xl font-semibold sm:text-2xl">
            {authorName(lang)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
            {rights}
          </p>
        </div>
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
        >
          {cta}
        </a>
      </div>
    </section>
  );
}

/** Page footer with copyright. */
export function CopyrightFooter({ lang }: { lang: Lang }) {
  return (
    <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
      <p>
        {copyrightLine(lang)} ·{" "}
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          {SITE}
        </a>
      </p>
    </footer>
  );
}
