import { useEffect, useState } from "react";
import { ExternalLink, Trash2, Plus, RefreshCw } from "lucide-react";
import {
  ExternalSource,
  ExternalProvider,
  PROVIDER_LABELS,
  fetchAllSources,
  createSource,
  deleteSource,
  familySearchSearchUrl,
} from "@/lib/externalSources";
import { Button } from "@/components/ui/button";

export function ExternalSourcesPanel() {
  const [items, setItems] = useState<ExternalSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [providerFilter, setProviderFilter] = useState<"all" | ExternalProvider>("all");
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const all = await fetchAllSources();
      setItems(all);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const filtered = items.filter((s) => {
    if (providerFilter !== "all" && s.provider !== providerFilter) return false;
    if (q.trim()) {
      const blob = `${s.title} ${s.url} ${s.description ?? ""} ${s.uezd_ru ?? ""} ${s.uezd_en ?? ""} ${s.place_query ?? ""}`.toLowerCase();
      if (!blob.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  async function onDelete(id: string) {
    if (!confirm("Удалить источник?")) return;
    try {
      await deleteSource(id);
      setItems((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value as "all" | ExternalProvider)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="all">Все провайдеры</option>
          <option value="familysearch">FamilySearch</option>
          <option value="niag">НИАГ</option>
          <option value="other">Другие</option>
        </select>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск: заголовок, URL, уезд…"
          className="w-64 rounded-md border border-border bg-background px-2 py-1 text-xs"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} / {items.length}</span>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
          <RefreshCw className={"mr-1 h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
          Обновить
        </Button>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} className="ml-auto">
          <Plus className="mr-1 h-3.5 w-3.5" />
          {showForm ? "Скрыть форму" : "Добавить источник"}
        </Button>
      </div>

      {showForm && (
        <AddForm
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      <div className="rounded-md border border-border bg-card/40 p-2 text-xs text-muted-foreground">
        💡 Совет: ищите коллекции на{" "}
        <a
          href={familySearchSearchUrl("Грузия")}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          familysearch.org/search/catalog
        </a>{" "}
        по местам (Тифлис, Кутаиси, Грузия) и копируйте URL коллекций сюда.
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Источников нет.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={s.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">
                      {PROVIDER_LABELS[s.provider]}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                      {s.scope === "feature" ? `точка #${s.feature_id}` : `уезд: ${s.uezd_ru || s.uezd_en}`}
                    </span>
                    {s.requires_auth && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                        требуется регистрация
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-medium">{s.title}</div>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <span className="break-all">{s.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  {s.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                  )}
                  {s.place_query && (
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      place_query: <span className="font-mono">{s.place_query}</span>
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {new Date(s.created_at).toLocaleString("ru-RU")}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onDelete(s.id)} aria-label="Удалить">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddForm({ onCreated }: { onCreated: () => void }) {
  const [provider, setProvider] = useState<ExternalProvider>("familysearch");
  const [scope, setScope] = useState<"feature" | "uezd">("uezd");
  const [featureId, setFeatureId] = useState("");
  const [uezdRu, setUezdRu] = useState("");
  const [uezdEn, setUezdEn] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [requiresAuth, setRequiresAuth] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!url.trim() || !title.trim()) {
      alert("URL и заголовок обязательны");
      return;
    }
    if (scope === "feature" && !featureId.trim()) {
      alert("Укажите feature_id");
      return;
    }
    if (scope === "uezd" && !uezdRu.trim() && !uezdEn.trim()) {
      alert("Укажите название уезда (RU или EN)");
      return;
    }
    setSaving(true);
    try {
      await createSource({
        provider,
        scope,
        feature_id: scope === "feature" ? parseInt(featureId, 10) : null,
        uezd_ru: scope === "uezd" ? uezdRu.trim() || null : null,
        uezd_en: scope === "uezd" ? uezdEn.trim() || null : null,
        url,
        title,
        description,
        place_query: placeQuery || null,
        requires_auth: requiresAuth,
      });
      onCreated();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-muted-foreground">Провайдер</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ExternalProvider)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1"
          >
            <option value="familysearch">FamilySearch</option>
            <option value="niag">НИАГ</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Привязка</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "feature" | "uezd")}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1"
          >
            <option value="uezd">К уезду</option>
            <option value="feature">К точке (feature_id)</option>
          </select>
        </label>
      </div>

      {scope === "feature" ? (
        <label className="block text-xs">
          <span className="text-muted-foreground">feature_id</span>
          <input
            value={featureId}
            onChange={(e) => setFeatureId(e.target.value)}
            type="number"
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1"
            placeholder="Найдите id в parishes.geojson"
          />
        </label>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="text-muted-foreground">Уезд (RU)</span>
            <input
              value={uezdRu}
              onChange={(e) => setUezdRu(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1"
              placeholder="Тифлисский"
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted-foreground">Уезд (EN)</span>
            <input
              value={uezdEn}
              onChange={(e) => setUezdEn(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1"
              placeholder="Tiflissky"
            />
          </label>
        </div>
      )}

      <label className="block text-xs">
        <span className="text-muted-foreground">Заголовок</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1"
          placeholder="Метрические книги Тифлисской епархии 1820–1917"
        />
      </label>

      <label className="block text-xs">
        <span className="text-muted-foreground">URL</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]"
          placeholder="https://www.familysearch.org/search/catalog/…"
        />
      </label>

      <label className="block text-xs">
        <span className="text-muted-foreground">Описание</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="block text-xs">
        <span className="text-muted-foreground">place_query (для будущей API-синхронизации)</span>
        <input
          value={placeQuery}
          onChange={(e) => setPlaceQuery(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1"
          placeholder="Тифлис"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={requiresAuth}
          onChange={(e) => setRequiresAuth(e.target.checked)}
        />
        Требуется регистрация на сайте провайдера
      </label>

      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
