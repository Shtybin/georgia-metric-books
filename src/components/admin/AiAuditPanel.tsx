import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Sparkles, Play, Square, Check, X, RefreshCw } from "lucide-react";
import {
  startAuditRun,
  processNextBatch,
  getRunStatus,
  listAuditRuns,
  listFindings,
  reviewFinding,
  cancelAuditRun,
} from "@/lib/aiAudit.functions";

const MODELS = [
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (дёшево)" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (точно, дороже)" },
];

const UEZD_PRESETS = [
  { id: "all", label: "Все точки" },
  { id: "uezd:tbilisi", label: "Тбилисский уезд" },
  { id: "uezd:gori", label: "Горийский" },
  { id: "uezd:telavi", label: "Телавский" },
  { id: "uezd:signagi", label: "Сигнахский" },
  { id: "uezd:dusheti", label: "Душетский" },
  { id: "uezd:kutaisi", label: "Кутаисский" },
];

export function AiAuditPanel() {
  const start = useServerFn(startAuditRun);
  const batch = useServerFn(processNextBatch);
  const status = useServerFn(getRunStatus);
  const listRuns = useServerFn(listAuditRuns);
  const list = useServerFn(listFindings);
  const review = useServerFn(reviewFinding);
  const cancel = useServerFn(cancelAuditRun);

  const [model, setModel] = useState(MODELS[0].id);
  const [budget, setBudget] = useState(100);
  const [scope, setScope] = useState("uezd:tbilisi");
  const [runs, setRuns] = useState<any[]>([]);
  const [currentRun, setCurrentRun] = useState<any | null>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "applied" | "all">("pending");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshRuns() {
    try { setRuns(await listRuns({ data: {} })); } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { refreshRuns(); }, []);

  async function reloadFindings(runId: string, f = filter) {
    try { setFindings(await list({ data: { runId, status: f, limit: 300 } })); } catch (e: any) { setError(e.message); }
  }

  async function refreshStatus(runId: string) {
    try { setCurrentRun(await status({ data: { runId } })); } catch {}
  }

  async function doStart() {
    setError(null); setBusy(true);
    try {
      const r = await start({ data: { budgetUsd: budget, model, scope } });
      await refreshRuns();
      await refreshStatus(r.runId);
      setRunning(true);
      runLoop(r.runId);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function runLoop(runId: string) {
    setRunning(true);
    let consecutiveErrors = 0;
    while (true) {
      try {
        const r = await batch({ data: { runId, size: model.includes("pro") ? 3 : 5 } });
        await refreshStatus(runId);
        await reloadFindings(runId);
        if (r.status !== "running") break;
        consecutiveErrors = 0;
      } catch (e: any) {
        setError(e.message);
        consecutiveErrors += 1;
        if (consecutiveErrors > 3) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    setRunning(false);
    await refreshRuns();
  }

  async function doCancel() {
    if (!currentRun) return;
    await cancel({ data: { runId: currentRun.id } });
    setRunning(false);
    await refreshStatus(currentRun.id);
    await refreshRuns();
  }

  async function doReview(id: string, decision: "approved" | "rejected") {
    await review({ data: { id, decision } });
    if (currentRun) await reloadFindings(currentRun.id);
  }

  async function openRun(r: any) {
    setCurrentRun(r);
    await reloadFindings(r.id);
    if (r.status === "running") runLoop(r.id);
  }

  const pct = currentRun && currentRun.points_total > 0
    ? Math.round((currentRun.points_done / currentRun.points_total) * 100)
    : 0;

  return (
    <section className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Новый прогон AI-аудита</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Модель</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5">
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Бюджет, $</span>
            <input type="number" min={1} max={1000} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="w-full rounded-md border border-border bg-background px-2 py-1.5 tabular-nums" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Область</span>
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5">
              {UEZD_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={doStart} disabled={busy || running} size="sm">
            <Play className="mr-1 h-3.5 w-3.5" /> Запустить аудит
          </Button>
          {running && (
            <Button onClick={doCancel} variant="outline" size="sm">
              <Square className="mr-1 h-3.5 w-3.5" /> Остановить
            </Button>
          )}
          <Button onClick={refreshRuns} variant="ghost" size="sm">
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Обновить
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </div>

      {currentRun && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-medium">Прогон {currentRun.id.slice(0, 8)} · <span className="text-xs text-muted-foreground">{currentRun.status}</span></h3>
            <div className="text-xs tabular-nums text-muted-foreground">
              {currentRun.points_done} / {currentRun.points_total} · ${Number(currentRun.spent_usd).toFixed(4)} / ${Number(currentRun.budget_usd).toFixed(2)}
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1 text-xs">
            {(["pending", "approved", "rejected", "applied", "all"] as const).map((f) => (
              <button key={f} onClick={() => { setFilter(f); if (currentRun) reloadFindings(currentRun.id, f); }} className={"rounded-md px-2 py-1 " + (filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}>
                {f === "pending" ? "Ожидают" : f === "approved" ? "Одобрены" : f === "rejected" ? "Отклонены" : f === "applied" ? "Применены" : "Все"}
              </button>
            ))}
          </div>
        </div>
      )}

      {currentRun && (
        <ul className="space-y-2">
          {findings.length === 0 && <li className="text-sm text-muted-foreground">Записей нет.</li>}
          {findings.map((f) => (
            <li key={f.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-xs">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium uppercase">{f.kind}</span>
                    <span className={"rounded-md px-1.5 py-0.5 " + (f.severity === "error" ? "bg-destructive/15 text-destructive" : f.severity === "warn" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground")}>{f.severity}</span>
                    <span className="text-muted-foreground tabular-nums">conf {Number(f.confidence).toFixed(2)} · ${Number(f.cost_usd).toFixed(5)}</span>
                    <span className="text-muted-foreground">#{f.feature_id}</span>
                  </div>
                  <p className="mb-2 text-foreground">{f.rationale}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-muted/40 p-2">
                      <div className="mb-1 text-[10px] uppercase text-muted-foreground">было</div>
                      <pre className="whitespace-pre-wrap break-words text-[11px]">{JSON.stringify(f.current, null, 2)}</pre>
                    </div>
                    <div className="rounded-md bg-primary/5 p-2">
                      <div className="mb-1 text-[10px] uppercase text-primary">предложено</div>
                      <pre className="whitespace-pre-wrap break-words text-[11px]">{JSON.stringify(f.proposed, null, 2)}</pre>
                    </div>
                  </div>
                  {Array.isArray(f.sources) && f.sources.length > 0 && (
                    <p className="mt-2 text-[10px] text-muted-foreground">Источники: {f.sources.join(" · ")}</p>
                  )}
                </div>
                {f.status === "pending" && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button size="sm" onClick={() => doReview(f.id, "approved")}><Check className="mr-1 h-3.5 w-3.5" /> Одобрить</Button>
                    <Button size="sm" variant="outline" onClick={() => doReview(f.id, "rejected")}><X className="mr-1 h-3.5 w-3.5" /> Отклонить</Button>
                  </div>
                )}
                {f.status !== "pending" && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{f.status}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-2 font-medium">История прогонов</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Прогонов ещё не было.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {runs.map((r) => (
              <li key={r.id}>
                <button onClick={() => openRun(r)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                  <span className="font-mono">{r.id.slice(0, 8)}</span>
                  <span className="text-muted-foreground">{r.scope}</span>
                  <span className="tabular-nums">{r.points_done}/{r.points_total}</span>
                  <span className="tabular-nums">${Number(r.spent_usd).toFixed(4)}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{r.status}</span>
                  <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString("ru-RU")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <UnlocatedMergeSection />
    </section>
  );
}

// ============================================================
// Phase 2 — Merge unlocated settlements with map points
// ============================================================
import { findUnlocatedMatches, applyUnlocatedMerge } from "@/lib/aiAudit.functions";

function UnlocatedMergeSection() {
  const find = useServerFn(findUnlocatedMatches);
  const apply = useServerFn(applyUnlocatedMerge);
  const [minScore, setMinScore] = useState(0.75);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [genericSkipped, setGenericSkipped] = useState(0);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true); setErr(null);
    try {
      const r = await find({ data: { minScore, limit: 500 } });
      setMatches(r.matches);
      setGenericSkipped(r.genericRegionSkipped);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setLoading(false); }
  }

  async function applyOne(m: any) {
    const key = `${m.featureId}:${m.unlocatedIndex}`;
    try {
      await apply({ data: { featureId: m.featureId, unlocatedIndex: m.unlocatedIndex } });
      setApplied((s) => ({ ...s, [key]: true }));
    } catch (e: any) { setErr(e?.message ?? String(e)); }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        <h3 className="text-base font-semibold">Этап 2 — Слияние «Селений без координат» с точками карты</h3>
      </header>
      <p className="mb-3 text-xs text-muted-foreground">
        Сопоставление по нормализованному имени селения + совпадению региона/уезда. Селения с обобщённым регионом
        (Имеретия, Гурия, Абхазия, Мегрелия, Сванетия, Кахетия, Картли, Осетия) помечаются, но не сливаются автоматически.
        Каждое одобрение создаёт запись в feature_overrides (action=merge_unlocated, не опубликовано) — публикация требует ручной модерации.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Мин. сходство ({minScore.toFixed(2)})</span>
          <input
            type="range" min={0.5} max={1} step={0.05}
            value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}
          />
        </label>
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Найти совпадения
        </Button>
        {matches.length > 0 && (
          <span className="text-muted-foreground">
            Найдено {matches.length} (обобщ. регион помечено: {genericSkipped})
          </span>
        )}
      </div>
      {err && <div className="mb-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{err}</div>}
      {matches.length > 0 && (
        <div className="max-h-[480px] overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th className="px-2 py-1">Score</th>
                <th className="px-2 py-1">Без коорд.</th>
                <th className="px-2 py-1">→ Точка на карте</th>
                <th className="px-2 py-1">Годы</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => {
                const key = `${m.featureId}:${m.unlocatedIndex}`;
                return (
                  <tr key={key} className="border-t border-border align-top">
                    <td className="px-2 py-1 tabular-nums">{m.score.toFixed(2)}</td>
                    <td className="px-2 py-1">
                      <div className="font-medium">{m.settlement}</div>
                      <div className="text-muted-foreground">{m.region}{m.church ? ` · ${m.church}` : ""}</div>
                      {m.isGenericRegion && <div className="text-amber-600">обобщ. регион</div>}
                    </td>
                    <td className="px-2 py-1">
                      <div className="font-medium">#{m.featureId} {m.featureSettlement}</div>
                      <div className="text-muted-foreground">{[m.featureUezd, m.featureRegion].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-2 py-1 tabular-nums">{m.years}</td>
                    <td className="px-2 py-1">
                      {applied[key] ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="h-3 w-3" /> добавлено</span>
                      ) : m.isGenericRegion ? (
                        <Button size="sm" variant="outline" onClick={() => applyOne(m)}>Принять вручную</Button>
                      ) : (
                        <Button size="sm" onClick={() => applyOne(m)}>Слить</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

