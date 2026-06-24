// AI Orchestration — Phase 1
//
// Wraps the existing `aiAudit.functions.ts` logic (which already covers
// GeoAgent + MetricsAgent responsibilities — names/uezds/years against the
// NIAG catalog) and adds:
//   • Per-agent progress counters in `ai_audit_runs.agent_progress`
//   • Heartbeat + watchdog state in `ai_audit_runs.heartbeat_at` / `watchdog_state`
//   • Pause/resume support
//   • ArchiveAgent: HTTP HEAD on external_sources URLs for each feature in the batch
//
// Phase 2 will add: PDF cross-check (`metric-book-pdfs` bucket), GPT-5 reviewer
// escalation, dedicated agent prompts per concern.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { processNextBatch, startAuditRun, cancelAuditRun } from "@/lib/aiAudit.functions";

// ---------- helpers ----------

async function assertEditor(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_min_role", {
    _user_id: userId,
    _min_role: "editor",
  });
  if (error || data !== true) throw new Error("Forbidden: editor role required");
}

type AgentName = "coordinator" | "geo" | "metrics" | "archive" | "reviewer";
type AgentProgress = Record<AgentName, { done: number; failed: number; lastError?: string | null }>;
const ZERO_PROGRESS: AgentProgress = {
  coordinator: { done: 0, failed: 0 },
  geo: { done: 0, failed: 0 },
  metrics: { done: 0, failed: 0 },
  archive: { done: 0, failed: 0 },
  reviewer: { done: 0, failed: 0 },
};

function mergeProgress(prev: any, delta: Partial<AgentProgress>): AgentProgress {
  const base: AgentProgress = { ...ZERO_PROGRESS, ...(prev ?? {}) } as AgentProgress;
  for (const k of Object.keys(delta) as AgentName[]) {
    const cur = base[k] ?? { done: 0, failed: 0 };
    const d = delta[k]!;
    base[k] = {
      done: cur.done + (d.done ?? 0),
      failed: cur.failed + (d.failed ?? 0),
      lastError: d.lastError !== undefined ? d.lastError : cur.lastError,
    };
  }
  return base;
}

// ---------- start (delegates to existing audit) ----------

const orchStartSchema = z.object({
  budgetUsd: z.number().min(0.1).max(1000).default(20),
  scope: z.string().default("all"),
  notes: z.string().max(500).optional(),
  // Phase 1 fixes model to Gemini Pro per approved plan.
  model: z.string().default("google/gemini-2.5-pro"),
});

export const startOrchestrationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orchStartSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);
    // Delegate to existing startAuditRun so all the catalog / feature selection
    // logic is reused. Then seed the orchestration-specific columns.
    const r = await startAuditRun({
      data: {
        budgetUsd: data.budgetUsd,
        model: data.model,
        scope: data.scope,
        notes: data.notes,
      },
    } as any);
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("ai_audit_runs")
      .update({
        agent_progress: ZERO_PROGRESS as any,
        watchdog_state: { lastTickAt: now, stallCount: 0, autoRestartCount: 0 } as any,
        heartbeat_at: now,
        paused_at: null,
        updated_at: now,
      })
      .eq("id", r.runId);
    return { runId: r.runId, total: r.total };
  });

// ---------- pause / resume / cancel ----------

export const pauseOrchestrationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor((context as any).userId as string);
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("ai_audit_runs")
      .update({ status: "paused", paused_at: now, updated_at: now })
      .eq("id", data.runId)
      .eq("status", "running");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resumeOrchestrationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor((context as any).userId as string);
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("ai_audit_runs")
      .update({ status: "running", paused_at: null, heartbeat_at: now, updated_at: now })
      .eq("id", data.runId)
      .eq("status", "paused");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelOrchestrationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor((context as any).userId as string);
    return cancelAuditRun({ data: { runId: data.runId } } as any) as any;
  });

// ---------- ArchiveAgent: check external_sources links ----------

async function checkUrl(url: string): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    // some servers reject HEAD — try GET with no body
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(7000),
      });
      return { ok: res.ok, status: res.status };
    } catch (e2: any) {
      return { ok: false, status: 0, error: String(e2?.message ?? e2) };
    }
  }
}

async function runArchiveAgent(
  runId: string,
  featureIds: number[],
): Promise<{ done: number; failed: number; findings: any[] }> {
  if (featureIds.length === 0) return { done: 0, failed: 0, findings: [] };

  const { data: sources, error } = await supabaseAdmin
    .from("external_sources")
    .select("id, feature_id, url, title, provider")
    .in("feature_id", featureIds);
  if (error) return { done: 0, failed: featureIds.length, findings: [] };

  const findings: any[] = [];
  let done = 0;
  let failed = 0;

  // limit concurrency to avoid hammering archive.
  const CONCURRENCY = 4;
  let i = 0;
  async function worker() {
    while (i < (sources ?? []).length) {
      const idx = i++;
      const s = (sources ?? [])[idx];
      const check = await checkUrl(s.url);
      done += 1;
      if (!check.ok) {
        failed += 1;
        findings.push({
          run_id: runId,
          feature_id: s.feature_id,
          kind: "other",
          severity: "warn",
          confidence: 0.95,
          current: { url: s.url, title: s.title, provider: s.provider },
          proposed: {},
          rationale: `ArchiveAgent: ссылка недоступна (HTTP ${check.status}${check.error ? " — " + check.error : ""})`,
          sources: [s.url],
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: 0,
          status: "pending",
        });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, (sources ?? []).length) }, () => worker()),
  );

  if (findings.length) {
    await supabaseAdmin.from("ai_audit_findings").insert(findings);
  }
  return { done, failed, findings };
}

// ---------- batch tick (called from UI polling) ----------

const tickSchema = z.object({
  runId: z.string().uuid(),
  size: z.number().min(1).max(20).default(3),
});

export const processOrchestrationTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tickSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);

    // Check run status — skip if paused/cancelled/done.
    const { data: run } = await supabaseAdmin
      .from("ai_audit_runs")
      .select("id, status, agent_progress, watchdog_state, points_done, scope")
      .eq("id", data.runId)
      .single();
    if (!run) throw new Error("run not found");
    if (run.status !== "running") {
      return { status: run.status, skipped: true };
    }

    const tickStart = Date.now();
    let geoErr: string | null = null;
    let geoDone = 0;
    let geoFailed = 0;

    // GeoAgent + MetricsAgent (existing audit logic — does both today)
    let batchResult: any = null;
    try {
      batchResult = await processNextBatch({
        data: { runId: data.runId, size: data.size },
      } as any);
      geoDone = batchResult.processed ?? 0;
    } catch (e: any) {
      geoErr = e?.message ?? String(e);
      geoFailed = data.size;
    }

    // Determine which features were just processed for the ArchiveAgent pass
    // We re-derive from points_done range. processNextBatch already advances
    // points_done by `processed` — so re-read for the new range.
    const { data: postRun } = await supabaseAdmin
      .from("ai_audit_runs")
      .select("points_done, points_total, spent_usd, budget_usd, status")
      .eq("id", data.runId)
      .single();
    const newDone = postRun?.points_done ?? run.points_done;
    const justProcessed = Math.max(0, newDone - run.points_done);

    // ArchiveAgent runs in parallel conceptually but we sequence after GeoAgent
    // to share the same feature window without re-querying.
    let archive = { done: 0, failed: 0 };
    if (justProcessed > 0) {
      // Re-derive feature ids from scope (cheap — pure data lookup in audit module)
      const { selectFeatureIdsForScope } = await import("@/lib/aiAudit.scope.server");
      const ids = selectFeatureIdsForScope(run.scope as string);
      const window = ids.slice(newDone - justProcessed, newDone);
      try {
        const r = await runArchiveAgent(data.runId, window);
        archive = { done: r.done, failed: r.failed };
      } catch (e: any) {
        archive = { done: 0, failed: window.length };
      }
    }

    // Update agent_progress + heartbeat + watchdog.
    const now = new Date().toISOString();
    const progress = mergeProgress(run.agent_progress, {
      coordinator: { done: 1, failed: 0 },
      geo: { done: geoDone, failed: geoFailed, lastError: geoErr },
      metrics: { done: geoDone, failed: 0 }, // metrics is bundled in geo agent for phase 1
      archive: { done: archive.done, failed: archive.failed },
      reviewer: { done: geoDone, failed: 0 }, // reviewer is implicit in deriveFindings
    });
    const watchdog = {
      lastTickAt: now,
      stallCount: 0,
      autoRestartCount: (run.watchdog_state as any)?.autoRestartCount ?? 0,
      lastTickMs: Date.now() - tickStart,
    };
    await supabaseAdmin
      .from("ai_audit_runs")
      .update({
        agent_progress: progress as any,
        watchdog_state: watchdog as any,
        heartbeat_at: now,
        updated_at: now,
      })
      .eq("id", data.runId);

    return {
      status: postRun?.status ?? "running",
      processed: geoDone,
      archiveChecked: archive.done,
      archiveFailed: archive.failed,
      pointsDone: newDone,
      pointsTotal: postRun?.points_total ?? 0,
      spentUsd: Number(postRun?.spent_usd ?? 0),
      budgetUsd: Number(postRun?.budget_usd ?? 0),
      geoError: geoErr,
    };
  });

// ---------- watchdog check (auto-restart stalled runs) ----------

const STALL_MS = 60_000;

export const watchdogCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor((context as any).userId as string);
    const { data: run } = await supabaseAdmin
      .from("ai_audit_runs")
      .select("id, status, heartbeat_at, watchdog_state")
      .eq("id", data.runId)
      .single();
    if (!run) return { stalled: false };
    if (run.status !== "running") return { stalled: false, status: run.status };
    const lastBeat = new Date(run.heartbeat_at as any).getTime();
    const sinceMs = Date.now() - lastBeat;
    if (sinceMs < STALL_MS) return { stalled: false, sinceMs };
    // Mark as paused (auto) so UI can decide to restart.
    const cur: any = run.watchdog_state ?? {};
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("ai_audit_runs")
      .update({
        status: "paused",
        paused_at: now,
        watchdog_state: {
          ...cur,
          stallCount: (cur.stallCount ?? 0) + 1,
          stalledAt: now,
          stalledSinceMs: sinceMs,
        } as any,
        updated_at: now,
      })
      .eq("id", data.runId)
      .eq("status", "running");
    return { stalled: true, sinceMs };
  });

// ---------- PDF database status (Phase 2) ----------

export const getPdfDatabaseStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertEditor((context as any).userId as string);
    const { data, error } = await supabaseAdmin
      .from("pdf_text_chunks")
      .select("source_name, decade_start, decade_end");
    if (error) throw new Error(error.message);
    const bySrc = new Map<string, { chunks: number; from: number; to: number }>();
    for (const r of (data ?? []) as any[]) {
      const cur = bySrc.get(r.source_name) ?? { chunks: 0, from: r.decade_start, to: r.decade_end };
      cur.chunks += 1;
      cur.from = Math.min(cur.from, r.decade_start);
      cur.to = Math.max(cur.to, r.decade_end);
      bySrc.set(r.source_name, cur);
    }
    return {
      totalChunks: data?.length ?? 0,
      sources: Array.from(bySrc.entries())
        .map(([name, s]) => ({ name, chunks: s.chunks, from: s.from, to: s.to }))
        .sort((a, b) => a.from - b.from),
    };
  });
