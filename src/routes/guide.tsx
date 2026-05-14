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
          <article
            className="prose prose-neutral dark:prose-invert max-w-none
              prose-headings:font-serif
              prose-h1:text-3xl sm:prose-h1:text-4xl
              prose-h2:mt-10 prose-h2:text-xl
              prose-h3:mt-6 prose-h3:text-lg
              prose-a:text-primary hover:prose-a:underline
              prose-li:my-1
              prose-hr:my-8
              prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em]"
          >
            <ReactMarkdown>{content}</ReactMarkdown>
          </article>
        )}
      </div>
    </main>
  );
}
