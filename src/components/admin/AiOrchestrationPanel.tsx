import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Play,
  Pause,
  Square,
  RefreshCw,
  Check,
  X,
  Activity,
  AlertTriangle,
  Upload,
  Sparkles,
  Globe,
  MapPin,
  ScrollText,
  Gavel,
} from "lucide-react";
import {
  startOrchestrationRun,
  pauseOrchestrationRun,
  resumeOrchestrationRun,
  cancelOrchestrationRun,
  processOrchestrationTick,
  watchdogCheck,
  getPdfDatabaseStatus,
} from "@/lib/aiOrchestrator.functions";
import {
  getRunStatus,
  listAuditRuns,
  listFindings,
  reviewFinding,
} from "@/lib/aiAudit.functions";

const SCOPE_PRESETS = [
  { id: "all", label: "Все точки карты" },
  { id: "uezd:tbilisi", label: "Тбилисский уезд" },
  { id: "uezd:gori", label: "Горийский" },
  { id: "uezd:telavi", label: "Телавский" },
  { id: "uezd:signagi", label: "Сигнахский" },
  { id: "uezd:dusheti", label: "Душетский" },
  { id: "uezd:kutaisi", label: "Кутаисский" },
];

type AgentKey = "coordinator" | "geo" | "metrics" | "archive" | "reviewer";
const AGENTS: { key: AgentKey; label: string; icon: any; desc: string }[] = [
  { key: "coordinator", label: "Coordinator", icon: Sparkles, desc: "Делит работу на батчи" },
  { key: "geo", label: "GeoAgent", icon: MapPin, desc: "Координаты, уезд, район" },
  { key: "metrics", label: "MetricsAgent", icon: ScrollText, desc: "Годы, церкви, пропуски" },
  { key: "archive", label: "ArchiveAgent", icon: Globe, desc: "Ссылки на archival-services.gov.ge" },
  { key: "reviewer", label: "Reviewer", icon: Gavel, desc: "Итоговая оценка" },
];

function fmtDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}ч ${m % 60}м`;
  if (m > 0) return `${m}м ${s % 60}с`;
  return `${s}с`;
}

export function AiOrchestrationPanel() {
  const start = useServerFn(startOrchestrationRun);
  const pause = useServerFn(pauseOrchestrationRun);
  const resume = useServerFn(resumeOrchestrationRun);
  const cancel = useServerFn(cancelOrchestrationRun);
  const tick = useServerFn(processOrchestrationTick);
  const watchdog = useServerFn(watchdogCheck);
  const status = useServerFn(getRunStatus);
  const listRuns = useServerFn(listAuditRuns);
  const list = useServerFn(listFindings);
  const review = useServerFn(reviewFinding);

  const [scope, setScope] = useState("all");
  const [budget, setBudget] = useState(20);
  const [runs, setRuns] = useState<any[]>([]);
  const [currentRun, setCurrentRun] = useState<any | null>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "applied" | "all">("pending");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const runningRef = useRef(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  async function refreshRuns() {
    try { setRuns(await listRuns({ data: {} } as any)); } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { refreshRuns(); }, []);

  async function refreshStatus(runId: string) {
    try {
      const r = await status({ data: { runId } } as any);
      setCurrentRun(r);
    } catch {}
  }
  async function reloadFindings(runId: string, f = filter) {
    try { setFindings(await list({ data: { runId, status: f, limit: 300 } } as any)); } catch (e: any) { setError(e.message); }
  }

  async function doStart() {
    setError(null); setBusy(true);
    try {
      const r = await start({ data: { budgetUsd: budget, scope } } as any);
      setStartedAt(Date.now());
      await refreshRuns();
      await refreshStatus(r.runId);
      runningRef.current = true;
      runLoop(r.runId);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function runLoop(runId: string) {
    runningRef.current = true;
    let consecutiveErrors = 0;
    while (runningRef.current) {
      try {
        const r = await tick({ data: { runId, size: 3 } } as any);
        await refreshStatus(runId);
        await reloadFindings(runId);
        if (r.status !== "running") break;
        consecutiveErrors = 0;
        // Run watchdog check in background; do not block the loop
        watchdog({ data: { runId } } as any).catch(() => {});
      } catch (e: any) {
        setError(e?.message ?? String(e));
        consecutiveErrors += 1;
        if (consecutiveErrors > 3) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    runningRef.current = false;
    await refreshRuns();
  }

  async function doPause() {
    if (!currentRun) return;
    runningRef.current = false;
    await pause({ data: { runId: currentRun.id } } as any);
    await refreshStatus(currentRun.id);
  }
  async function doResume() {
    if (!currentRun) return;
    await resume({ data: { runId: currentRun.id } } as any);
    await refreshStatus(currentRun.id);
    runLoop(currentRun.id);
  }
  async function doCancel() {
    if (!currentRun) return;
    runningRef.current = false;
    await cancel({ data: { runId: currentRun.id } } as any);
    await refreshStatus(currentRun.id);
    await refreshRuns();
  }
  async function doRestart() {
    if (!currentRun) return;
    // Resume from where it stopped — same run, just restart the loop.
    await resume({ data: { runId: currentRun.id } } as any).catch(() => {});
    await refreshStatus(currentRun.id);
    runLoop(currentRun.id);
  }

  async function openRun(r: any) {
    setCurrentRun(r);
    setStartedAt(new Date(r.started_at).getTime());
    await reloadFindings(r.id);
    if (r.status === "running") { runningRef.current = true; runLoop(r.id); }
  }

  async function doReview(id: string, decision: "approved" | "rejected") {
    await review({ data: { id, decision } } as any);
    if (currentRun) await reloadFindings(currentRun.id);
  }

  // Derived metrics
  const pct = currentRun && currentRun.points_total > 0
    ? Math.round((currentRun.points_done / currentRun.points_total) * 100)
    : 0;
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  const eta = useMemo(() => {
    if (!currentRun || !startedAt || currentRun.points_done <= 0) return null;
    const perPoint = elapsedMs / currentRun.points_done;
    const remaining = (currentRun.points_total - currentRun.points_done) * perPoint;
    return remaining;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRun?.points_done, currentRun?.points_total, startedAt]);

  const agentProgress: Record<AgentKey, { done: number; failed: number; lastError?: string }> =
    (currentRun?.agent_progress as any) ?? {
      coordinator: { done: 0, failed: 0 },
      geo: { done: 0, failed: 0 },
      metrics: { done: 0, failed: 0 },
      archive: { done: 0, failed: 0 },
      reviewer: { done: 0, failed: 0 },
    };
  const watchdogState: any = currentRun?.watchdog_state ?? {};
  const lastBeatAgo = currentRun?.heartbeat_at
    ? Date.now() - new Date(currentRun.heartbeat_at).getTime()
    : null;
  const isStalled = currentRun?.status === "running" && lastBeatAgo !== null && lastBeatAgo > 60_000;

  return (
    <section className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      {/* Header / controls */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-medium">AI-оркестрация · тотальная перепроверка точек</h2>
            <p className="text-xs text-muted-foreground">
              Coordinator → GeoAgent + MetricsAgent + ArchiveAgent → Reviewer · модель: <code>google/gemini-2.5-pro</code>
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Область</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5"
              disabled={runningRef.current}
            >
              {SCOPE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Бюджет, $</span>
            <input
              type="number"
              min={0.5}
              max={500}
              step={0.5}
              value={budget === 0 ? "" : budget}
              onFocus={(e) => e.target.select()}
              onChange={(e) => { const v = e.target.value; setBudget(v === "" ? 0 : Number(v)); }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 tabular-nums"
              disabled={runningRef.current}
            />
          </label>
          <div className="text-xs">
            <span className="mb-1 block text-muted-foreground">База PDF метрических книг</span>
            <PdfDbStatus />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!currentRun || currentRun.status !== "running" ? (
            <Button onClick={doStart} disabled={busy} size="sm">
              <Play className="mr-1 h-3.5 w-3.5" /> Запустить
            </Button>
          ) : (
            <Button onClick={doPause} variant="outline" size="sm">
              <Pause className="mr-1 h-3.5 w-3.5" /> Пауза
            </Button>
          )}
          {currentRun?.status === "paused" && (
            <Button onClick={doResume} size="sm">
              <Play className="mr-1 h-3.5 w-3.5" /> Продолжить
            </Button>
          )}
          {currentRun && currentRun.status !== "done" && currentRun.status !== "cancelled" && (
            <Button onClick={doCancel} variant="outline" size="sm">
              <Square className="mr-1 h-3.5 w-3.5" /> Стоп
            </Button>
          )}
          {currentRun && isStalled && (
            <Button onClick={doRestart} variant="default" size="sm" className="bg-amber-600 hover:bg-amber-700">
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Перезапуск (watchdog)
            </Button>
          )}
          <Button onClick={refreshRuns} variant="ghost" size="sm">
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Обновить
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </div>

      {/* Progress card */}
      {currentRun && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-medium">
              Прогон <span className="font-mono text-xs text-muted-foreground">{currentRun.id.slice(0, 8)}</span>
              {" · "}
              <span className={
                "rounded-md px-1.5 py-0.5 text-xs " +
                (currentRun.status === "running" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : currentRun.status === "paused" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : currentRun.status === "done" ? "bg-muted text-muted-foreground"
                  : "bg-destructive/15 text-destructive")
              }>{currentRun.status}</span>
            </h3>
            <div className="text-xs tabular-nums text-muted-foreground">
              {currentRun.points_done} / {currentRun.points_total} ({pct}%) ·
              {" "}${Number(currentRun.spent_usd).toFixed(4)} / ${Number(currentRun.budget_usd).toFixed(2)} ·
              {" "}ETA: {eta != null ? fmtDuration(eta) : "—"} ·
              {" "}прошло: {fmtDuration(elapsedMs)}
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Agents grid */}
      {currentRun && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {AGENTS.map((a) => {
            const ap = agentProgress[a.key] ?? { done: 0, failed: 0 };
            const Icon = a.icon;
            const isActive = currentRun.status === "running";
            return (
              <div key={a.key} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="mb-1 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{a.label}</span>
                  <span className={"ml-auto h-2 w-2 rounded-full " + (isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40")} />
                </div>
                <p className="mb-2 text-[10px] leading-tight text-muted-foreground">{a.desc}</p>
                <div className="flex justify-between text-xs tabular-nums">
                  <span>done <strong>{ap.done}</strong></span>
                  <span className={ap.failed > 0 ? "text-destructive" : "text-muted-foreground"}>
                    fails <strong>{ap.failed}</strong>
                  </span>
                </div>
                {ap.lastError && (
                  <p className="mt-1 line-clamp-2 text-[10px] text-destructive" title={ap.lastError}>
                    {ap.lastError}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Watchdog */}
      {currentRun && (
        <div className={"rounded-xl border bg-card p-3 shadow-sm " + (isStalled ? "border-amber-500" : "border-border")}>
          <div className="flex items-center gap-2">
            {isStalled ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <Activity className="h-4 w-4 text-emerald-600" />
            )}
            <span className="text-sm font-medium">Watchdog</span>
            <span className="text-xs text-muted-foreground">
              · последняя активность: {lastBeatAgo != null ? fmtDuration(lastBeatAgo) + " назад" : "—"}
              {" · стопов: "}{watchdogState.stallCount ?? 0}
              {" · авто-перезапусков: "}{watchdogState.autoRestartCount ?? 0}
              {watchdogState.lastTickMs != null && ` · цикл ${watchdogState.lastTickMs}мс`}
            </span>
          </div>
          {isStalled && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Прогон не отвечает дольше 60 сек. Нажмите «Перезапуск» чтобы продолжить с последней успешной точки.
            </p>
          )}
        </div>
      )}

      {/* Findings */}
      {currentRun && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Находки</h3>
            <div className="flex flex-wrap gap-1 text-xs">
              {(["pending", "approved", "rejected", "applied", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); reloadFindings(currentRun.id, f); }}
                  className={"rounded-md px-2 py-1 " + (filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}
                >
                  {f === "pending" ? "Ожидают" : f === "approved" ? "Одобрены" : f === "rejected" ? "Отклонены" : f === "applied" ? "Применены" : "Все"}
                </button>
              ))}
            </div>
          </div>
          <ul className="space-y-2">
            {findings.length === 0 && <li className="text-sm text-muted-foreground">Записей нет.</li>}
            {findings.map((f) => (
              <li key={f.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
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
        </div>
      )}

      {/* Run history */}
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
    </section>
  );
}
