import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { ArrowLeft, Download, Pencil, Save, X, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { authorName, copyrightLine } from "@/components/AuthorCredit";

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

const FALLBACK_PATHS: Record<string, string> = {
  ru: "/docs/map-guide-ru.md",
  en: "/docs/map-guide-en.md",
  ka: "/docs/map-guide-ka.md",
};

const LANG_OPTIONS: Array<{ code: "ru" | "en" | "ka"; label: string }> = [
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
  { code: "ka", label: "ქარ" },
];

function GuidePage() {
  const { lang } = Route.useSearch();
  const [content, setContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load admin status
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setIsAdmin(false); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled) setIsAdmin(!!data);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load content for current language
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: dbErr } = await supabase
          .from("guide_content")
          .select("content")
          .eq("lang", lang)
          .maybeSingle();
        if (dbErr) throw dbErr;
        if (data?.content && data.content.trim().length > 0) {
          if (!cancelled) { setContent(data.content); setLoading(false); }
          return;
        }
        // fallback to bundled markdown
        const r = await fetch(FALLBACK_PATHS[lang] ?? FALLBACK_PATHS.ru);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        if (!cancelled) { setContent(text); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(String(e)); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [lang]);

  const backLabel = lang === "en" ? "Back" : lang === "ka" ? "უკან" : "Назад";
  const downloadLabel = lang === "en" ? "Download .md" : lang === "ka" ? "ჩამოტვირთვა .md" : "Скачать .md";
  const editLabel = lang === "en" ? "Edit" : lang === "ka" ? "რედაქტირება" : "Редактировать";
  const saveLabel = lang === "en" ? "Save" : lang === "ka" ? "შენახვა" : "Сохранить";
  const cancelLabel = lang === "en" ? "Cancel" : lang === "ka" ? "გაუქმება" : "Отмена";
  const previewLabel = lang === "en" ? "Preview" : lang === "ka" ? "გადახედვა" : "Просмотр";
  const editorLabel = lang === "en" ? "Editor" : lang === "ka" ? "რედაქტორი" : "Редактор";
  const loadingLabel = lang === "en" ? "Loading…" : lang === "ka" ? "იტვირთება…" : "Загрузка…";
  const failedLabel = lang === "en" ? "Failed to load" : lang === "ka" ? "ჩატვირთვა ვერ მოხერხდა" : "Не удалось загрузить";

  const startEdit = () => {
    setDraft(content);
    setPreviewing(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
    setPreviewing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: upErr } = await supabase
        .from("guide_content")
        .upsert({ lang, content: draft, updated_by: user?.id ?? null }, { onConflict: "lang" });
      if (upErr) throw upErr;
      setContent(draft);
      setEditing(false);
      setPreviewing(false);
      toast.success(lang === "en" ? "Saved" : lang === "ka" ? "შენახულია" : "Сохранено");
    } catch (e) {
      toast.error(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const markdownComponents = {
    h1: (p: any) => <h1 className="mb-4 font-serif text-3xl font-semibold sm:text-4xl" {...p} />,
    h2: (p: any) => <h2 className="mt-10 mb-3 font-serif text-xl font-semibold" {...p} />,
    h3: (p: any) => <h3 className="mt-6 mb-2 font-serif text-lg font-semibold" {...p} />,
    p: (p: any) => <p className="my-3 text-muted-foreground" {...p} />,
    ul: (p: any) => <ul className="my-3 list-disc space-y-1 pl-6 text-muted-foreground" {...p} />,
    ol: (p: any) => <ol className="my-3 list-decimal space-y-1 pl-6 text-muted-foreground" {...p} />,
    li: (p: any) => <li className="leading-relaxed" {...p} />,
    a: (p: any) => <a className="text-primary underline-offset-2 hover:underline" target="_blank" rel="noopener" {...p} />,
    hr: () => <hr className="my-8 border-border" />,
    strong: (p: any) => <strong className="font-semibold text-foreground" {...p} />,
    code: (p: any) => <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]" {...p} />,
    blockquote: (p: any) => <blockquote className="my-4 border-l-2 border-border pl-4 italic text-muted-foreground" {...p} />,
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            search={{ lang }}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Language"
              className="inline-flex overflow-hidden rounded-xl border border-border bg-card text-sm"
            >
              {LANG_OPTIONS.map((opt) => {
                const active = opt.code === lang;
                return (
                  <Link
                    key={opt.code}
                    to="/guide"
                    search={{ lang: opt.code }}
                    aria-current={active ? "page" : undefined}
                    className={
                      "px-3 py-2 transition-colors " +
                      (active
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent")
                    }
                  >
                    {opt.label}
                  </Link>
                );
              })}
            </div>
            {isAdmin && !editing && (
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
              >
                <Pencil className="h-4 w-4" /> {editLabel}
              </button>
            )}
            {isAdmin && editing && (
              <>
                <button
                  type="button"
                  onClick={() => setPreviewing((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
                >
                  <Eye className="h-4 w-4" /> {previewing ? editorLabel : previewLabel}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                >
                  <X className="h-4 w-4" /> {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-primary bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> {saveLabel}
                </button>
              </>
            )}
            <a
              href={FALLBACK_PATHS[lang] ?? FALLBACK_PATHS.ru}
              download
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> {downloadLabel}
            </a>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{failedLabel}: {error}</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">{loadingLabel}</p>
        ) : editing && !previewing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[60vh] font-mono text-sm"
            aria-label={editorLabel}
          />
        ) : (
          <article className="max-w-none text-[15px] leading-relaxed text-foreground">
            <div className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {lang === "en" ? "Author" : lang === "ka" ? "ავტორი" : "Автор"}
              </p>
              <p className="mt-0.5 font-semibold">
                {authorName(lang)} ·{" "}
                <a
                  href="https://datatells.info"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  datatells.info
                </a>
              </p>
            </div>
            <ReactMarkdown components={markdownComponents}>
              {editing ? draft : content}
            </ReactMarkdown>
            <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
              {copyrightLine(lang)}
            </footer>
          </article>
        )}
      </div>
    </main>
  );
}
