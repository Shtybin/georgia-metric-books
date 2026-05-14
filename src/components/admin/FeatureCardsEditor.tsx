import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EditableMiniMap } from "@/components/map/EditableMiniMap";
import {
  applyOverrides,
  emptyFeatureData,
  featureToData,
  type FeatureData,
  type FeatureOverride,
} from "@/lib/featureOverrides";
import { Pencil, Trash2, Plus, Eye, EyeOff, RotateCcw, Save, X as XIcon } from "lucide-react";

type BaseFeature = GeoJSON.Feature<GeoJSON.Point, any>;
type FC = GeoJSON.FeatureCollection<GeoJSON.Point, any>;

interface EffectiveRow {
  /** Original geojson id, or null for new additions */
  feature_id: number | null;
  /** Synthetic key for React */
  key: string;
  data: FeatureData;
  override: FeatureOverride | null;
  source: "original" | "added" | "edited" | "deleted";
}

export function FeatureCardsEditor() {
  const [base, setBase] = useState<FC | null>(null);
  const [overrides, setOverrides] = useState<FeatureOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "drafts" | "published" | "deleted">("all");
  const [editing, setEditing] = useState<EffectiveRow | null>(null);
  const [creating, setCreating] = useState(false);

  // Load base + overrides
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [baseRes, ovRes] = await Promise.all([
        fetch("/data/parishes.geojson").then((r) => r.json() as Promise<FC>),
        supabase
          .from("feature_overrides")
          .select("id, feature_id, action, data, published, notes, created_at, updated_at")
          .order("updated_at", { ascending: false }),
      ]);
      if (!mounted) return;
      if (ovRes.error) console.error(ovRes.error);
      setBase(baseRes);
      setOverrides((ovRes.data as unknown as FeatureOverride[]) || []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function reloadOverrides() {
    const { data, error } = await supabase
      .from("feature_overrides")
      .select("id, feature_id, action, data, published, notes, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      alert(error.message);
      return;
    }
    setOverrides((data as unknown as FeatureOverride[]) || []);
  }

  // Compute effective rows
  const rows: EffectiveRow[] = useMemo(() => {
    if (!base) return [];
    const editById = new Map<number, FeatureOverride>();
    const deleteById = new Map<number, FeatureOverride>();
    const adds: FeatureOverride[] = [];
    for (const o of overrides) {
      if (o.action === "edit" && o.feature_id != null) editById.set(o.feature_id, o);
      else if (o.action === "delete" && o.feature_id != null) deleteById.set(o.feature_id, o);
      else if (o.action === "add") adds.push(o);
    }
    const out: EffectiveRow[] = [];
    for (const f of base.features) {
      const fid = f.id as number;
      const del = deleteById.get(fid);
      const ed = editById.get(fid);
      if (del) {
        out.push({
          feature_id: fid,
          key: `f-${fid}`,
          data: ed?.data ?? featureToData(f),
          override: del,
          source: "deleted",
        });
      } else if (ed) {
        out.push({
          feature_id: fid,
          key: `f-${fid}`,
          data: ed.data ?? featureToData(f),
          override: ed,
          source: "edited",
        });
      } else {
        out.push({
          feature_id: fid,
          key: `f-${fid}`,
          data: featureToData(f),
          override: null,
          source: "original",
        });
      }
    }
    for (const o of adds) {
      if (!o.data) continue;
      out.push({
        feature_id: null,
        key: `a-${o.id}`,
        data: o.data,
        override: o,
        source: "added",
      });
    }
    return out;
  }, [base, overrides]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return rows
      .filter((r) => {
        if (filter === "drafts") {
          if (!r.override || r.override.published) return false;
        } else if (filter === "published") {
          if (!r.override || !r.override.published) return false;
        } else if (filter === "deleted") {
          if (r.source !== "deleted") return false;
        } else {
          // "all" — show overridden first; only show originals if searching
          if (!q && !r.override) return false;
        }
        if (!q) return true;
        const d = r.data;
        const haystack = [
          d.settlement.ru, d.settlement.en, d.settlement.ka,
          d.region.ru, d.region.en, d.region.ka,
          d.uezd.ru, d.uezd.en, d.uezd.ka,
          d.church.ru, d.church.en, d.church.ka,
        ].join(" ").toLocaleLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 200);
  }, [rows, search, filter]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по селу, церкви, уезду, региону…"
          className="max-w-sm"
        />
        <div className="flex gap-1 text-xs">
          {([
            ["all", "Изменённые"],
            ["drafts", "Черновики"],
            ["published", "Опубликовано"],
            ["deleted", "Удалённые"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={
                "rounded-md px-3 py-1 transition-colors " +
                (filter === k
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setCreating(true)} className="ml-auto">
          <Plus className="mr-1 h-4 w-4" /> Добавить точку
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Базовых точек: {base?.features.length ?? "—"} · правок: {overrides.length}
        {filter === "all" && !search && " · введите поисковый запрос, чтобы увидеть оригинальные карточки"}
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ничего не найдено.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <RowCard
              key={r.key}
              row={r}
              onEdit={() => setEditing(r)}
              onDeleteToggle={async () => {
                if (r.source === "deleted" && r.override) {
                  // restore: remove the delete override
                  if (!confirm("Восстановить точку?")) return;
                  const { error } = await supabase
                    .from("feature_overrides")
                    .delete()
                    .eq("id", r.override.id);
                  if (error) return alert(error.message);
                  await reloadOverrides();
                } else if (r.feature_id != null) {
                  if (!confirm("Скрыть эту точку с карты? (Можно отменить)")) return;
                  const { error } = await supabase.from("feature_overrides").insert({
                    feature_id: r.feature_id,
                    action: "delete",
                    data: null,
                    published: false,
                  });
                  if (error) return alert(error.message);
                  await reloadOverrides();
                } else if (r.override) {
                  // delete the addition entirely
                  if (!confirm("Удалить добавленную точку?")) return;
                  const { error } = await supabase
                    .from("feature_overrides")
                    .delete()
                    .eq("id", r.override.id);
                  if (error) return alert(error.message);
                  await reloadOverrides();
                }
              }}
              onTogglePublished={async () => {
                if (!r.override) return;
                const { error } = await supabase
                  .from("feature_overrides")
                  .update({ published: !r.override.published })
                  .eq("id", r.override.id);
                if (error) return alert(error.message);
                await reloadOverrides();
              }}
              onRevert={async () => {
                if (!r.override) return;
                if (!confirm("Удалить правку и вернуть оригинальные данные?")) return;
                const { error } = await supabase
                  .from("feature_overrides")
                  .delete()
                  .eq("id", r.override.id);
                if (error) return alert(error.message);
                await reloadOverrides();
              }}
            />
          ))}
        </ul>
      )}

      {editing && (
        <EditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reloadOverrides();
          }}
        />
      )}
      {creating && (
        <EditDialog
          row={null}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await reloadOverrides();
          }}
        />
      )}
    </section>
  );
}

function RowCard({
  row,
  onEdit,
  onDeleteToggle,
  onTogglePublished,
  onRevert,
}: {
  row: EffectiveRow;
  onEdit: () => void;
  onDeleteToggle: () => void;
  onTogglePublished: () => void;
  onRevert: () => void;
}) {
  const d = row.data;
  const statusBadge = (() => {
    if (row.source === "deleted") {
      return <Badge tone="destructive">{row.override?.published ? "удалено · публично" : "удалено · черновик"}</Badge>;
    }
    if (row.source === "added") {
      return <Badge tone="info">{row.override?.published ? "новая · публично" : "новая · черновик"}</Badge>;
    }
    if (row.source === "edited") {
      return <Badge tone="amber">{row.override?.published ? "правка · публично" : "правка · черновик"}</Badge>;
    }
    return <Badge tone="muted">оригинал</Badge>;
  })();

  return (
    <li className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {d.settlement.ru || d.settlement.en || d.settlement.ka || "—"}
            <span className="ml-2 text-xs text-muted-foreground">
              {[d.uezd.ru || d.uezd.en, d.region.ru || d.region.en].filter(Boolean).join(" · ")}
            </span>
            <span className="ml-2">{statusBadge}</span>
          </div>
          {(d.church.ru || d.church.en) && (
            <div className="text-xs italic text-muted-foreground">
              {(d.church.ru || d.church.en).replace(/\|/g, " · ")}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
            <span>id {row.feature_id ?? "новый"}</span>
            <span>lat {d.lat.toFixed(4)}, lon {d.lon.toFixed(4)}</span>
            {d.yearsRaw.ru && <span>{d.yearsRaw.ru}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          {row.override && (
            <Button size="sm" variant="outline" onClick={onTogglePublished}>
              {row.override.published ? <><EyeOff className="mr-1 h-3.5 w-3.5" /> Снять</> : <><Eye className="mr-1 h-3.5 w-3.5" /> Опубликовать</>}
            </Button>
          )}
          {row.source !== "deleted" && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Править
            </Button>
          )}
          {row.source === "edited" && (
            <Button size="sm" variant="ghost" onClick={onRevert} title="Вернуть оригинал">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDeleteToggle}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "muted" | "amber" | "info" | "destructive" }) {
  const cls = {
    muted: "bg-muted text-muted-foreground",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    info: "bg-primary/15 text-primary",
    destructive: "bg-destructive/15 text-destructive",
  }[tone];
  return <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium " + cls}>{children}</span>;
}

function EditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: EffectiveRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<FeatureData>(() => row?.data ?? emptyFeatureData());
  const [publish, setPublish] = useState<boolean>(() => row?.override?.published ?? false);
  const [saving, setSaving] = useState(false);

  function setLang(field: "settlement" | "church" | "region" | "uezd", lang: "ru" | "en" | "ka", value: string) {
    setData((d) => ({ ...d, [field]: { ...d[field], [lang]: value } }));
  }

  async function save() {
    setSaving(true);
    try {
      if (row?.override) {
        // Update existing override
        const { error } = await supabase
          .from("feature_overrides")
          .update({ data: data as any, published: publish })
          .eq("id", row.override.id);
        if (error) throw error;
      } else if (row && row.feature_id != null) {
        // Create new edit override for an existing feature
        const { error } = await supabase.from("feature_overrides").insert({
          feature_id: row.feature_id,
          action: "edit",
          data: data as any,
          published: publish,
        });
        if (error) throw error;
      } else {
        // Brand-new addition
        const { error } = await supabase.from("feature_overrides").insert({
          feature_id: null,
          action: "add",
          data: data as any,
          published: publish,
        });
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) {
      alert(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const title = !row
    ? "Новая точка"
    : row.feature_id != null
      ? `Правка точки #${row.feature_id}`
      : "Правка добавленной точки";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <FieldGroup label="Село" field="settlement" data={data} setLang={setLang} />
          <FieldGroup label="Уезд" field="uezd" data={data} setLang={setLang} />
          <FieldGroup label="Регион" field="region" data={data} setLang={setLang} />
          <FieldGroup label="Церковь" field="church" data={data} setLang={setLang} />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Годы (текстом)</label>
              <Input
                value={data.yearsRaw.ru}
                onChange={(e) => setData((d) => ({ ...d, yearsRaw: { ru: e.target.value, en: e.target.value, ka: e.target.value } }))}
                placeholder="1845-1916"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Начало</label>
              <Input
                type="number"
                value={data.startYear}
                onChange={(e) => setData((d) => ({ ...d, startYear: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Конец</label>
              <Input
                type="number"
                value={data.endYear}
                onChange={(e) => setData((d) => ({ ...d, endYear: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Широта (lat)</label>
              <Input
                type="number"
                step="0.000001"
                value={data.lat}
                onChange={(e) => setData((d) => ({ ...d, lat: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Долгота (lon)</label>
              <Input
                type="number"
                step="0.000001"
                value={data.lon}
                onChange={(e) => setData((d) => ({ ...d, lon: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Перетащите маркер или кликните по карте, чтобы изменить координаты
            </label>
            <div className="overflow-hidden rounded-md border border-border">
              <EditableMiniMap
                lat={data.lat}
                lon={data.lon}
                className="h-72 w-full"
                onChange={(la, lo) => setData((d) => ({ ...d, lat: la, lon: lo }))}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Сразу опубликовать на карте
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <XIcon className="mr-1 h-4 w-4" /> Отмена
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-1 h-4 w-4" /> {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldGroup({
  label,
  field,
  data,
  setLang,
}: {
  label: string;
  field: "settlement" | "church" | "region" | "uezd";
  data: FeatureData;
  setLang: (f: any, l: "ru" | "en" | "ka", v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(["ru", "en", "ka"] as const).map((l) => (
          <div key={l}>
            <label className="mb-1 block text-[10px] uppercase text-muted-foreground">{l}</label>
            <Input value={data[field][l]} onChange={(e) => setLang(field, l, e.target.value)} />
          </div>
        ))}
      </div>
    </div>
  );
}
