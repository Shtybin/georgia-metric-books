import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

type Op = "insert" | "update" | "delete";

interface HistoryRow {
  id: string;
  override_id: string;
  feature_id: number | null;
  op: Op;
  action: string | null;
  data: any;
  published: boolean | null;
  notes: string | null;
  prev_action: string | null;
  prev_data: any;
  prev_published: boolean | null;
  prev_notes: string | null;
  changed_by: string | null;
  changed_at: string;
}

const OP_LABEL: Record<Op, string> = {
  insert: "создано",
  update: "правка",
  delete: "удалено",
};

const OP_TONE: Record<Op, string> = {
  insert: "bg-primary/15 text-primary",
  update: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  delete: "bg-destructive/15 text-destructive",
};

const ACTION_LABEL: Record<string, string> = {
  edit: "правка карточки",
  add: "новая точка",
  delete: "скрытие точки",
};

function settlementName(d: any): string {
  if (!d || typeof d !== "object") return "—";
  const s = d.settlement ?? {};
  return s.ru || s.en || s.ka || "—";
}

function uezdName(d: any): string {
  if (!d || typeof d !== "object") return "";
  const u = d.uezd ?? {};
  return u.ru || u.en || u.ka || "";
}

export function FeatureOverrideHistory({ currentUserId }: { currentUserId: string | null }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [opFilter, setOpFilter] = useState<Op | "all">("all");
  const [search, setSearch] = useState("");
  const [searchDeb, setSearchDeb] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [restoring, setRestoring] = useState<Record<string, boolean>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    let q = supabase
      .from("feature_override_history")
      .select("id, override_id, feature_id, op, action, data, published, notes, prev_action, prev_data, prev_published, prev_notes, changed_by, changed_at")
      .order("changed_at", { ascending: false })
      .limit(500);
    if (opFilter !== "all") q = q.eq("op", opFilter);
    const { data, error } = await q;
    setLoading(false);
    if (error) { console.error(error); return; }
    setRows((data as unknown as HistoryRow[]) || []);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [opFilter]);
  useEffect(() => { const t = setTimeout(() => setSearchDeb(search.trim().toLowerCase()), 300); return () => clearTimeout(t); }, [search]);

  const filtered = useMemo(() => {
    if (!searchDeb) return rows;
    return rows.filter((r) => {
      const hay = [
        settlementName(r.data), uezdName(r.data),
        settlementName(r.prev_data), uezdName(r.prev_data),
        r.notes ?? "", String(r.feature_id ?? ""), r.override_id,
      ].join(" ").toLowerCase();
      return hay.includes(searchDeb);
    });
  }, [rows, searchDeb]);

  async function rollback(r: HistoryRow) {
    if (r.action == null) {
      alert("Нет данных снапшота для отката этой записи.");
      return;
    }
    const label = `${settlementName(r.data) || "—"} → ${OP_LABEL[r.op]} от ${new Date(r.changed_at).toLocaleString("ru-RU")}`;
    if (!confirm(`Откатить правку к версии:\n${label}?`)) return;
    setRestoring((s) => ({ ...s, [r.id]: true }));
    const { error } = await supabase.rpc("rollback_feature_override", { _history_id: r.id });
    setRestoring((s) => ({ ...s, [r.id]: false }));
    if (error) { alert(error.message); return; }
    await load();
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 text-xs">
          {(["all", "insert", "update", "delete"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setOpFilter(k)}
              className={
                "rounded-md px-3 py-1 transition-colors " +
                (opFilter === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")
              }
            >
              {k === "all" ? "Все" : OP_LABEL[k]}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по селу, уезду, заметке…"
          className="max-w-sm"
        />
        <Button size="sm" variant="outline" onClick={load} className="ml-auto">
          <RefreshCw className={"mr-1 h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
          Обновить
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Записей нет.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const open = !!expanded[r.id];
            const name = settlementName(r.data) !== "—" ? settlementName(r.data) : settlementName(r.prev_data);
            const isMine = currentUserId && r.changed_by === currentUserId;
            return (
              <li key={r.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + OP_TONE[r.op]}>
                        {OP_LABEL[r.op]}
                      </span>
                      {r.action && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {ACTION_LABEL[r.action] ?? r.action}
                        </span>
                      )}
                      {r.published != null && (
                        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {r.published ? "опубликовано" : "черновик"}
                        </span>
                      )}
                      <span className="font-medium">{name}</span>
                      {uezdName(r.data) && (
                        <span className="text-xs text-muted-foreground">· {uezdName(r.data)}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                      <span>{new Date(r.changed_at).toLocaleString("ru-RU")}</span>
                      <span>
                        автор: {isMine ? "вы" : (r.changed_by ? r.changed_by.slice(0, 8) + "…" : "система")}
                      </span>
                      {r.feature_id != null && <span>feature #{r.feature_id}</span>}
                      <span>override {r.override_id.slice(0, 8)}…</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                    >
                      {open ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
                      {open ? "Скрыть" : "Снапшот"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => rollback(r)}
                      disabled={restoring[r.id] || r.action == null}
                      title={r.action == null ? "Нет данных для отката" : "Откатить override к этой версии"}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      {restoring[r.id] ? "Откат…" : "Откатить"}
                    </Button>
                  </div>
                </div>

                {open && (
                  <div className="mt-3 grid gap-2 border-t border-border pt-2 text-xs sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        После
                      </div>
                      <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-snug">
{JSON.stringify({ action: r.action, published: r.published, notes: r.notes, data: r.data }, null, 2)}
                      </pre>
                    </div>
                    {r.op === "update" && (
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          До
                        </div>
                        <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-snug">
{JSON.stringify({ action: r.prev_action, published: r.prev_published, notes: r.prev_notes, data: r.prev_data }, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
