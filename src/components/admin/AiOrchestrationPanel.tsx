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
import {
  startGeolocationRun,
  processGeolocationTick,
  getUnlocatedSummary,
} from "@/lib/aiOrchestratorGeolocate.functions";

type TaskKind = "audit" | "geolocate";

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

/**
 * Derive a more honest status than the raw DB column. A run can stay
 * `running` long after the worker actually stopped ticking (watchdog only
 * does soft heartbeat bumps), so we surface `stalled` once the heartbeat
 * is older than ~3 minutes. `paused_at` also wins over a stale `running`.
 */
function derivedStatus(r: any): { label: string; tone: "running" | "paused" | "done" | "cancelled" | "stalled" } {
  const raw = r?.status as string | undefined;
  const hb = r?.heartbeat_at ? new Date(r.heartbeat_at).getTime() : 0;
  const ageMs = hb ? Date.now() - hb : Infinity;
  if (raw === "done") return { label: "done", tone: "done" };
  if (raw === "cancelled") return { label: "cancelled", tone: "cancelled" };
  if (raw === "paused" || r?.paused_at) return { label: "paused", tone: "paused" };
  if (raw === "running" && ageMs > 3 * 60_000) {
    return { label: `stalled · ${fmtDuration(ageMs)}`, tone: "stalled" };
  }
  return { label: raw ?? "—", tone: "running" };
}

const TONE_CLASSES: Record<string, string> = {
  running: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  done: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
  stalled: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
};


export function AiOrchestrationPanel() {
  const start = useServerFn(startOrchestrationRun);
  const pause = useServerFn(pauseOrchestrationRun);
  const resume = useServerFn(resumeOrchestrationRun);
  const cancel = useServerFn(cancelOrchestrationRun);
  const tick = useServerFn(processOrchestrationTick);
  const watchdog = useServerFn(watchdogCheck);
  const startGeo = useServerFn(startGeolocationRun);
  const tickGeo = useServerFn(processGeolocationTick);
  const fetchUnloc = useServerFn(getUnlocatedSummary);
  const status = useServerFn(getRunStatus);
  const listRuns = useServerFn(listAuditRuns);
  const list = useServerFn(listFindings);
  const review = useServerFn(reviewFinding);

  const [task, setTask] = useState<TaskKind>("audit");
  const [scope, setScope] = useState("all");
  const [geoUezd, setGeoUezd] = useState<string>("");
  const [unlocSummary, setUnlocSummary] = useState<{ total: number; byUezd: { uezd: string; count: number }[] } | null>(null);
  const [budget, setBudget] = useState(20);

  const [runs, setRuns] = useState<any[]>([]);
  const [currentRun, setCurrentRun] = useState<any | null>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "applied" | "all">("pending");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const runningRef = useRef(false);
  const viewedRunIdRef = useRef<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  async function refreshRuns() {
    try { setRuns(await listRuns({ data: {} } as any)); } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { refreshRuns(); }, []);
  useEffect(() => {
    if (task !== "geolocate") return;
    fetchUnloc({ data: {} } as any).then((s) => setUnlocSummary(s as any)).catch(() => {});
  }, [task]);

  // Auto-resume policy: ALWAYS prefer continuing an in-progress run over
  // leaving it parked. We re-evaluate on every `runs` poll, not just once.
  //   - `running` with stale heartbeat (>2 min): browser loop died — restart it.
  //   - `paused` and healthy (points left + budget left): treat the pause as
  //     a watchdog false-positive and resume automatically. Per-run cooldown
  //     (45s) prevents tight resume/pause loops if something is actually wrong.
  const autoResumeCooldownRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (runningRef.current) return;
    if (!runs || runs.length === 0) return;
    const STALE_MS = 2 * 60 * 1000;
    const COOLDOWN_MS = 45 * 1000;
    const now = Date.now();
    const candidate = runs.find((r) => {
      const last = autoResumeCooldownRef.current.get(r.id) ?? 0;
      if (now - last < COOLDOWN_MS) return false;
      const pointsLeft = (r.points_total ?? 0) > (r.points_done ?? 0);
      const budgetLeft = Number(r.spent_usd ?? 0) < Number(r.budget_usd ?? 0);
      if (r.status === "paused" && pointsLeft && budgetLeft) return true;
      if (r.status === "running") {
        const hb = r.heartbeat_at ? new Date(r.heartbeat_at).getTime() : 0;
        return !hb || now - hb > STALE_MS;
      }
      return false;
    });
    if (!candidate) return;
    autoResumeCooldownRef.current.set(candidate.id, now);
    (async () => {
      try {
        await resume({ data: { runId: candidate.id } } as any).catch(() => {});
        if (!viewedRunIdRef.current) {
          viewedRunIdRef.current = candidate.id;
          setCurrentRun(candidate);
          setStartedAt(new Date(candidate.started_at).getTime());
          await reloadFindings(candidate.id);
        }
        runningRef.current = true;
        runLoop(candidate.id, (candidate.task_kind as TaskKind) ?? "audit");
      } catch (e: any) {
        setError(`Авто-возобновление не удалось: ${e?.message ?? e}`);
      }
    })();
  }, [runs]);

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
      const r = task === "geolocate"
        ? await startGeo({ data: { budgetUsd: budget, uezd: geoUezd || undefined } } as any)
        : await start({ data: { budgetUsd: budget, scope } } as any);
      setStartedAt(Date.now());
      await refreshRuns();
      viewedRunIdRef.current = r.runId;
      await refreshStatus(r.runId);
      runningRef.current = true;
      runLoop(r.runId, task);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function runLoop(runId: string, kind: TaskKind = "audit") {
    runningRef.current = true;
    // Priority: ALWAYS continue the current run rather than abort.
    // On errors we back off exponentially (max 30s) but never break out
    // unless the user explicitly pauses/cancels or the run is finished.
    let consecutiveErrors = 0;
    while (runningRef.current) {
      try {
        const r = kind === "geolocate"
          ? await tickGeo({ data: { runId, size: 3 } } as any)
          : await tick({ data: { runId, size: 3 } } as any);
        // Only refresh UI state if the user is still viewing this run.
        // Otherwise keep polling silently so the user's selection isn't hijacked.
        if (viewedRunIdRef.current === runId) {
          await refreshStatus(runId);
          await reloadFindings(runId);
        }
        if (r.status !== "running") break;
        consecutiveErrors = 0;
        setError(null);
        if (kind === "audit") watchdog({ data: { runId } } as any).catch(() => {});
      } catch (e: any) {
        consecutiveErrors += 1;
        if (viewedRunIdRef.current === runId) {
          setError(`${e?.message ?? String(e)} · продолжаем (попытка ${consecutiveErrors})`);
        }
        const delay = Math.min(30_000, 3000 * 2 ** (consecutiveErrors - 1));
        await new Promise((r) => setTimeout(r, delay));
        try {
          if (viewedRunIdRef.current === runId) await refreshStatus(runId);
        } catch { /* keep looping */ }
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
    viewedRunIdRef.current = currentRun.id;
    await refreshStatus(currentRun.id);
    runLoop(currentRun.id, (currentRun.task_kind as TaskKind) ?? "audit");
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
    // PRIORITY: continue current run from points_done — never reset to zero.
    // We only flip status back to `running` and re-enter the polling loop;
    // no findings/progress are dropped.
    await resume({ data: { runId: currentRun.id } } as any).catch(() => {});
    viewedRunIdRef.current = currentRun.id;
    await refreshStatus(currentRun.id);
    runningRef.current = true;
    runLoop(currentRun.id, (currentRun.task_kind as TaskKind) ?? "audit");
  }

  async function openRun(r: any) {
    viewedRunIdRef.current = r.id;
    setCurrentRun(r);
    setStartedAt(new Date(r.started_at).getTime());
    await reloadFindings(r.id);
    // Do NOT auto-start a polling loop here — only the run that the user
    // explicitly starts/resumes drives the loop. Opening a historical run
    // just shows its current state without taking over the view.
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
            <h2 className="font-medium">AI-оркестрация · автономные задачи</h2>
            <p className="text-xs text-muted-foreground">
              Coordinator → GeoAgent + MetricsAgent + ArchiveAgent → Reviewer · модель: <code>google/gemini-2.5-pro</code>
            </p>
          </div>
        </div>
        {/* Task switch */}
        <div className="mb-3 inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
          {([
            { id: "audit", label: "Аудит точек" },
            { id: "geolocate", label: "Геолокация селений без координат" },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => !runningRef.current && setTask(t.id)}
              disabled={runningRef.current}
              className={
                "rounded-md px-3 py-1.5 transition-colors " +
                (task === t.id
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:bg-accent")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {task === "audit" ? (
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
          ) : (
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">
                Уезд / район (опционально)
                {unlocSummary && <span className="ml-1 text-muted-foreground/70">· всего {unlocSummary.total} селений</span>}
              </span>
              <select
                value={geoUezd}
                onChange={(e) => setGeoUezd(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                disabled={runningRef.current}
              >
                <option value="">— все уезды —</option>
                {(unlocSummary?.byUezd ?? []).map((u) => (
                  <option key={u.uezd} value={u.uezd}>{u.uezd} ({u.count})</option>
                ))}
              </select>
            </label>
          )}
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
            <span className="mb-1 block text-muted-foreground">
              {task === "audit" ? "База PDF метрических книг" : "Источники геолокации"}
            </span>
            {task === "audit" ? (
              <PdfDbStatus />
            ) : (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Globe className="h-3.5 w-3.5 text-emerald-600" />
                Nominatim (OSM) → AI-арбитр → авто-слияние / очередь координат
              </span>
            )}
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
              {currentRun.task_kind && (
                <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {currentRun.task_kind}
                </span>
              )}
              {" · "}
              {(() => { const d = derivedStatus(currentRun); return (
                <span className={"rounded-md px-1.5 py-0.5 text-xs " + (TONE_CLASSES[d.tone] || TONE_CLASSES.running)}
                      title={currentRun.heartbeat_at ? `Heartbeat: ${new Date(currentRun.heartbeat_at).toLocaleString("ru-RU")}` : undefined}>
                  {d.label}
                </span>
              ); })()}
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
            {runs.map((r) => {
              const d = derivedStatus(r);
              return (
                <li key={r.id}>
                  <button onClick={() => openRun(r)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                    <span className="font-mono">{r.id.slice(0, 8)}</span>
                    {r.task_kind && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{r.task_kind}</span>
                    )}
                    <span className="text-muted-foreground">{r.scope}</span>
                    <span className="tabular-nums">{r.points_done}/{r.points_total}</span>
                    <span className="tabular-nums">${Number(r.spent_usd).toFixed(4)}</span>
                    <span className={"rounded-full px-2 py-0.5 " + (TONE_CLASSES[d.tone] || "bg-muted")}
                          title={r.heartbeat_at ? `Heartbeat: ${new Date(r.heartbeat_at).toLocaleString("ru-RU")}` : undefined}>
                      {d.label}
                    </span>
                    <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString("ru-RU")}</span>
                  </button>
                </li>
              );
            })}

          </ul>
        )}
      </div>
    </section>
  );
}

function PdfDbStatus() {
  const fetchStatus = useServerFn(getPdfDatabaseStatus);
  const [s, setS] = useState<{ totalChunks: number; sources: { name: string; chunks: number; from: number; to: number }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchStatus()
      .then((r) => alive && setS(r as any))
      .catch((e) => alive && setErr(e?.message ?? String(e)));
    return () => { alive = false; };
  }, [fetchStatus]);
  if (err) return <span className="text-destructive">PDF: {err}</span>;
  if (!s) return <span className="text-muted-foreground">Загрузка…</span>;
  if (s.totalChunks === 0) return <span className="text-muted-foreground">PDF не загружены</span>;
  const range = s.sources.length
    ? `${Math.min(...s.sources.map(x => x.from))}–${Math.max(...s.sources.map(x => x.to))}`
    : "—";
  return (
    <span className="inline-flex items-center gap-2">
      <Upload className="h-3.5 w-3.5 text-emerald-600" />
      <span className="tabular-nums">{s.totalChunks} фрагм.</span>
      <span className="text-muted-foreground">/ {s.sources.length} PDF / {range}</span>
    </span>
  );
}
