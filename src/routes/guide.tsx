import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { ArrowLeft, Download } from "lucide-react";
import type { Lang } from "@/lib/i18n";

const searchSchema = z.object({
  lang: fallback(z.enum(["ru", "en", "ka"]), "ru").default("ru"),
});

export const Route = createFileRoute("/guide")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Инструкция к карте — Метрические книги Грузии" },
      { name: "description", content: "Путеводитель по интерактивной карте метрических книг Грузии 1819–1930." },
    ],
  }),
  component: GuidePage,
});

function GuidePage() {
  const { lang } = Route.useSearch();
  const [content, setContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/docs/map-guide-ru.md")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setContent)
      .catch((e) => setError(String(e)));
  }, []);

  const backLabel =
    lang === "en" ? "Back" : lang === "ka" ? "უკან" : "Назад";
  const downloadLabel =
    lang === "en" ? "Download .md" : lang === "ka" ? "ჩამოტვირთვა .md" : "Скачать .md";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            to="/"
            search={{ lang }}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
          <a
            href="/docs/map-guide-ru.md"
            download
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> {downloadLabel}
          </a>
        </div>

        {error ? (
          <p className="text-sm text-destructive">Failed to load: {error}</p>
        ) : !content ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <article className="max-w-none text-[15px] leading-relaxed text-foreground">
            <ReactMarkdown
              components={{
                h1: (p) => <h1 className="mb-4 font-serif text-3xl font-semibold sm:text-4xl" {...p} />,
                h2: (p) => <h2 className="mt-10 mb-3 font-serif text-xl font-semibold" {...p} />,
                h3: (p) => <h3 className="mt-6 mb-2 font-serif text-lg font-semibold" {...p} />,
                p: (p) => <p className="my-3 text-muted-foreground" {...p} />,
                ul: (p) => <ul className="my-3 list-disc space-y-1 pl-6 text-muted-foreground" {...p} />,
                ol: (p) => <ol className="my-3 list-decimal space-y-1 pl-6 text-muted-foreground" {...p} />,
                li: (p) => <li className="leading-relaxed" {...p} />,
                a: (p) => <a className="text-primary underline-offset-2 hover:underline" target="_blank" rel="noopener" {...p} />,
                hr: () => <hr className="my-8 border-border" />,
                strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
                code: (p) => <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]" {...p} />,
                blockquote: (p) => <blockquote className="my-4 border-l-2 border-border pl-4 italic text-muted-foreground" {...p} />,
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </main>
  );
}
