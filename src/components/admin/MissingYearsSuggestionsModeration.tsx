import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, X, Trash2 } from "lucide-react";

interface MultiLang { ru?: string; en?: string; ka?: string }

interface Suggestion {
  id: string;
  feature_id: number | null;
  settlement_snapshot: { settlement?: MultiLang; region?: MultiLang } | null;
  current_missing: string;
  proposed_missing: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
}

const FILTERS = ["pending", "approved", "rejected", "all"] as const;
type Filter = typeof FILTERS[number];

const FILTER_LABEL: Record<Filter, string> = {
  pending: "Ожидают", approved: "Одобрены", rejected: "Отклонены", all: "Все",
};

function ml(v: MultiLang | null | undefined) {
  if (!v) return "—";
  return v.ru || v.en || v.ka || "—";
}

export function MissingYearsSuggestionsModeration() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("missing_years_suggestions")
      .select("id, feature_id, settlement_snapshot, current_missing, proposed_missing, note, status, created_at, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) console.error(error);
    setItems((data as unknown as Suggestion[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  async function setStatus(id: string, status: "approved" | "rejected") {
    const { data: { user } } = await supabase.auth.getUser();
    const reviewer = user?.id ?? null;
    const { error } = await supabase
      .from("missing_years_suggestions")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: reviewer })
      .eq("id", id);
    if (error) { alert(error.message); return; }
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
  }

  async function applyAsOverride(c: Suggestion) {
    if (c.feature_id == null) {
      alert("Нет привязки к точке geojson — примените вручную через вкладку «Карточки».");
      return;
    }
    if (!confirm("Создать неопубликованную правку карточки с предложенными пропущенными годами?")) return;

    let base: any = null;
    try {
      const fc = await fetch("/data/parishes.geojson").then((r) => r.json());
      base = fc.features.find((f: any) => f.id === c.feature_id);
    } catch {
      alert("Не удалось загрузить базовый geojson"); return;
    }
    if (!base) { alert("Точка не найдена в geojson"); return; }
    const p = base.properties ?? {};
    const [lon, lat] = base.geometry.coordinates;
    const data = {
      settlement: { ru: p.settlement?.ru ?? "", en: p.settlement?.en ?? "", ka: p.settlement?.ka ?? "" },
      church: { ru: p.church?.ru ?? "", en: p.church?.en ?? "", ka: p.church?.ka ?? "" },
      region: { ru: p.region?.ru ?? "", en: p.region?.en ?? "", ka: p.region?.ka ?? "" },
      uezd: { ru: p.uezd?.ru ?? "", en: p.uezd?.en ?? "", ka: p.uezd?.ka ?? "" },
      yearsRaw: { ru: p.yearsRaw?.ru ?? "", en: p.yearsRaw?.en ?? "", ka: p.yearsRaw?.ka ?? "" },
      missingYearsRaw: {
        ru: c.proposed_missing,
        en: c.proposed_missing,
        ka: c.proposed_missing,
      },
      startYear: typeof p.startYear === "number" ? p.startYear : 1900,
      endYear: typeof p.endYear === "number" ? p.endYear : 1900,
      lat, lon,
      discrepancyNote: c.note
        ? { ru: c.note, en: c.note, ka: c.note }
        : { ru: "", en: "", ka: "" },
    };
    const { error: insErr } = await supabase.from("feature_overrides").insert({
      feature_id: c.feature_id,
      action: "edit",
      data: data as any,
      published: false,
      notes: `From missing_years_suggestion ${c.id}`,
    });
    if (insErr) { alert(insErr.message); return; }
    await setStatus(c.id, "approved");
    alert("Создан черновик правки. Перейдите во вкладку «Карточки», чтобы опубликовать.");
  }

  async function remove(id: string) {
    if (!confirm("Удалить предложение?")) return;
    const { error } = await supabase.from("missing_years_suggestions").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-4">
      <div className="mb-3 flex flex-wrap gap-1 text-xs">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "rounded-md px-3 py-1 transition-colors " +
              (filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")
            }
          >{FILTER_LABEL[f]}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Записей нет.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {ml(c.settlement_snapshot?.settlement)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {ml(c.settlement_snapshot?.region)}
                      {c.feature_id != null && <> · id {c.feature_id}</>}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-muted-foreground">Сейчас в карточке</span>
                    <span className="whitespace-pre-line break-words">{c.current_missing || "—"}</span>
                    <span className="text-muted-foreground">Предложено</span>
                    <span className="whitespace-pre-line break-words font-medium text-amber-700 dark:text-amber-300">
                      {c.proposed_missing}
                    </span>
                    {c.note && (<>
                      <span className="text-muted-foreground">Комментарий</span>
                      <span className="whitespace-pre-line">{c.note}</span>
                    </>)}
                    <span className="text-muted-foreground">Создано</span>
                    <span className="tabular-nums">{new Date(c.created_at).toLocaleString("ru-RU")}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {c.status === "pending" ? (
                    <>
                      <Button size="sm" onClick={() => applyAsOverride(c)}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Применить
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "approved")}>
                        Одобрить
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "rejected")}>
                        <X className="mr-1 h-3.5 w-3.5" /> Отклонить
                      </Button>
                    </>
                  ) : (
                    <span className={
                      "rounded-full px-2 py-0.5 text-xs " +
                      (c.status === "approved"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground")
                    }>
                      {c.status === "approved" ? "одобрено" : "отклонено"}
                    </span>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)} aria-label="Удалить">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
