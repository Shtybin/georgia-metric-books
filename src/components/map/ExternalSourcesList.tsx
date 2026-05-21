import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Lock, Search, Trash2, Plus } from "lucide-react";
import {
  ExternalSource,
  PROVIDER_LABELS,
  fetchSourcesForFeature,
  deleteSource,
  createSource,
  familySearchSearchUrl,
  ExternalProvider,
} from "@/lib/externalSources";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

const L: Record<Lang, Record<string, string>> = {
  ru: {
    title: "Архивные источники",
    empty: "Источники пока не добавлены.",
    requiresAuth: "требуется регистрация",
    open: "Открыть",
    addSource: "Добавить источник",
    searchFsByUezd: "Искать в FamilySearch по уезду",
    delete: "Удалить",
    cancel: "Отмена",
    save: "Сохранить",
    formTitle: "Заголовок",
    formUrl: "Ссылка",
    formDescription: "Описание (необязательно)",
    formProvider: "Провайдер",
    scopeFeature: "Только эта точка",
    scopeUezd: "Весь уезд",
    confirmDelete: "Удалить источник?",
  },
  en: {
    title: "Archive sources",
    empty: "No sources yet.",
    requiresAuth: "login required",
    open: "Open",
    addSource: "Add source",
    searchFsByUezd: "Search FamilySearch by uezd",
    delete: "Delete",
    cancel: "Cancel",
    save: "Save",
    formTitle: "Title",
    formUrl: "URL",
    formDescription: "Description (optional)",
    formProvider: "Provider",
    scopeFeature: "This point only",
    scopeUezd: "Whole uezd",
    confirmDelete: "Delete this source?",
  },
  ka: {
    title: "საარქივო წყაროები",
    empty: "წყაროები ჯერ არ არის.",
    requiresAuth: "საჭიროა ავტორიზაცია",
    open: "გახსნა",
    addSource: "წყაროს დამატება",
    searchFsByUezd: "FamilySearch-ში ძებნა მაზრის მიხედვით",
    delete: "წაშლა",
    cancel: "გაუქმება",
    save: "შენახვა",
    formTitle: "სათაური",
    formUrl: "ბმული",
    formDescription: "აღწერა (არასავალდებულო)",
    formProvider: "წყარო",
    scopeFeature: "მხოლოდ ეს წერტილი",
    scopeUezd: "მთელი მაზრა",
    confirmDelete: "წავშალოთ წყარო?",
  },
};

interface Props {
  lang: Lang;
  featureId: number | null;
  uezdRu: string | null;
  uezdEn: string | null;
}

export function ExternalSourcesList({ lang, featureId, uezdRu, uezdEn }: Props) {
  const t = L[lang];
  const [sources, setSources] = useState<ExternalSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  async function reload() {
    setLoading(true);
    const data = await fetchSourcesForFeature(featureId, uezdRu, uezdEn);
    setSources(data);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureId, uezdRu, uezdEn]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!cancelled) setIsAdmin(data === true);
    })();
    return () => { cancelled = true; };
  }, []);

  async function onDelete(id: string) {
    if (!confirm(t.confirmDelete)) return;
    try {
      await deleteSource(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const fsSearchPlace = uezdRu || uezdEn || "";

  return (
    <section className="mt-3 rounded-md border border-border bg-background/40 px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <BookOpen className="h-3 w-3" />
          {t.title}
        </div>
        {fsSearchPlace && (
          <a
            href={familySearchSearchUrl(fsSearchPlace)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
            title={t.searchFsByUezd}
          >
            <Search className="h-3 w-3" />
            FamilySearch
          </a>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">…</p>
      ) : sources.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {sources.map((s) => (
            <li
              key={s.id}
              className="group flex items-start gap-2 rounded-sm border border-border/60 bg-card/60 px-2 py-1.5"
            >
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1"
              >
                <div className="flex items-center gap-1 text-xs font-medium text-foreground group-hover:text-primary">
                  <span className="truncate">{s.title || s.url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span>{PROVIDER_LABELS[s.provider]}</span>
                  {s.requires_auth && (
                    <span className="inline-flex items-center gap-0.5">
                      <Lock className="h-2.5 w-2.5" />
                      {t.requiresAuth}
                    </span>
                  )}
                  {s.scope === "uezd" && (s.uezd_ru || s.uezd_en) && (
                    <span>· {s.uezd_ru || s.uezd_en}</span>
                  )}
                </div>
                {s.description && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground/90">
                    {s.description}
                  </p>
                )}
              </a>
              {isAdmin && (
                <button
                  onClick={() => onDelete(s.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t.delete}
                  title={t.delete}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <div className="mt-2">
          {addOpen ? (
            <InlineAddForm
              lang={lang}
              featureId={featureId}
              uezdRu={uezdRu}
              uezdEn={uezdEn}
              defaultSearch={fsSearchPlace}
              onCancel={() => setAddOpen(false)}
              onSaved={async () => {
                setAddOpen(false);
                await reload();
              }}
            />
          ) : (
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              {t.addSource}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function InlineAddForm({
  lang,
  featureId,
  uezdRu,
  uezdEn,
  defaultSearch,
  onCancel,
  onSaved,
}: {
  lang: Lang;
  featureId: number | null;
  uezdRu: string | null;
  uezdEn: string | null;
  defaultSearch: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = L[lang];
  const [provider, setProvider] = useState<ExternalProvider>("familysearch");
  const [scope, setScope] = useState<"feature" | "uezd">(featureId != null ? "feature" : "uezd");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiresAuth, setRequiresAuth] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!url.trim() || !title.trim()) return;
    setSaving(true);
    try {
      await createSource({
        provider,
        scope,
        feature_id: featureId,
        uezd_ru: uezdRu,
        uezd_en: uezdEn,
        url,
        title,
        description,
        place_query: defaultSearch || null,
        requires_auth: requiresAuth,
      });
      onSaved();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block text-[10px]">
          <span className="text-muted-foreground">{t.formProvider}</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ExternalProvider)}
            className="mt-0.5 w-full rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
          >
            <option value="familysearch">FamilySearch</option>
            <option value="niag">НИАГ</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block text-[10px]">
          <span className="text-muted-foreground">Scope</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "feature" | "uezd")}
            className="mt-0.5 w-full rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
          >
            {featureId != null && <option value="feature">{t.scopeFeature}</option>}
            <option value="uezd">{t.scopeUezd}</option>
          </select>
        </label>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t.formTitle}
        className="w-full rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t.formUrl}
        className="w-full rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t.formDescription}
        rows={2}
        className="w-full rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
      />
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={requiresAuth}
          onChange={(e) => setRequiresAuth(e.target.checked)}
        />
        {t.requiresAuth}
      </label>
      <div className="flex justify-end gap-1.5 pt-1">
        <button
          onClick={onCancel}
          className="rounded-sm border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
        >
          {t.cancel}
        </button>
        <button
          onClick={submit}
          disabled={saving || !url.trim() || !title.trim()}
          className="rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "…" : t.save}
        </button>
      </div>
    </div>
  );
}
