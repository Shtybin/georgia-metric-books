// AI Orchestration — Task 2: Geolocation of "Селения без координат"
//
// Walks `public/data/unlocated.json` and tries to put each settlement on the
// map by combining:
//   • Nominatim search (geocodeCandidates)               — geo evidence
//   • AI arbiter (Gemini)                                — picks best candidate
//   • Per-edit validation (region/uezd, name, distance)  — guards against duplicates
//   • Auto-merge into nearby existing feature OR create coord_suggestion
//
// Every processed item produces an `ai_audit_findings` row with `kind='geolocate'`
// so it shows up in the same Findings panel as audit findings. High-confidence
// merges are auto-applied (status='applied'); coord-suggestion items stay
// `pending` until a moderator approves them in the standard Suggestions flow.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import type { FeatureOverride } from "@/lib/featureOverrides";
import {
  fetchUnlocated,
  geocodeCandidates,
  aiArbiter,
  validateOsmMatch,
  findMergeTarget,
  buildFeatureIndex,
  buildSpatialIndex,
  buildMergedFeatureData,
  key as unlocatedKey,
  type UnlocatedItem,
} from "@/lib/aiGeocoder.functions";

async function assertEditor(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_min_role", {
    _user_id: userId,
    _min_role: "editor",
  });
  if (error || data !== true) throw new Error("Forbidden: editor role required");
}

// ---------- start ----------

const startSchema = z.object({
  budgetUsd: z.number().min(0.1).max(1000).default(20),
  uezd: z.string().max(200).optional(),
  minConfidence: z.number().min(0).max(1).default(0.55),
  minMergeConfidence: z.number().min(0).max(1).default(0.75),
  mergeRadiusM: z.number().int().min(0).max(5000).default(1500),
  conflictRadiusM: z.number().int().min(0).max(5000).default(300),
  geoStrict: z.boolean().default(true),
  notes: z.string().max(500).optional(),
});

export const startGeolocationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => startSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);

    const items = await fetchUnlocated();
    let candidates = items.filter((it) => (it.settlement.ru || it.settlement.en).trim().length > 0);
    if (data.uezd) {
      const u = data.uezd.toLocaleLowerCase().trim();
      candidates = candidates.filter(
        (it) =>
          (it.uezd.ru || "").toLocaleLowerCase().includes(u) ||
          (it.uezd.en || "").toLocaleLowerCase().includes(u),
      );
    }

    const now = new Date().toISOString();
    const scope = data.uezd ? `unlocated:${data.uezd}` : "unlocated:all";
    const { data: row, error } = await supabaseAdmin
      .from("ai_audit_runs")
      .insert({
        model: "google/gemini-2.5-pro",
        budget_usd: data.budgetUsd,
        scope,
        task_kind: "geolocate",
        notes: data.notes ?? null,
        points_total: candidates.length,
        points_done: 0,
        created_by: userId,
        status: "running",
        agent_progress: {
          coordinator: { done: 0, failed: 0 },
          geo: { done: 0, failed: 0 },
          metrics: { done: 0, failed: 0 },
          archive: { done: 0, failed: 0 },
          reviewer: { done: 0, failed: 0 },
        } as any,
        watchdog_state: { lastTickAt: now, stallCount: 0, autoRestartCount: 0 } as any,
        heartbeat_at: now,
      })
      .select("id, points_total")
      .single();
    if (error) throw new Error(error.message);
    return { runId: row!.id as string, total: row!.points_total as number };
  });

// ---------- tick ----------

const tickSchema = z.object({
  runId: z.string().uuid(),
  size: z.number().int().min(1).max(5).default(3),
  // Forward thresholds (kept in tick so admin can tweak per-tick if needed)
  minConfidence: z.number().min(0).max(1).default(0.55),
  minMergeConfidence: z.number().min(0).max(1).default(0.75),
  mergeRadiusM: z.number().int().min(0).max(5000).default(1500),
  conflictRadiusM: z.number().int().min(0).max(5000).default(300),
  geoStrict: z.boolean().default(true),
});

function bumpProgress(prev: any, deltaGeoDone: number, deltaGeoFail: number, lastError?: string) {
  const base = prev ?? {};
  const geo = base.geo ?? { done: 0, failed: 0 };
  return {
    ...base,
    geo: {
      done: (geo.done ?? 0) + deltaGeoDone,
      failed: (geo.failed ?? 0) + deltaGeoFail,
      lastError: lastError ?? geo.lastError ?? null,
    },
  };
}

export const processGeolocationTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tickSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);

    const { data: run, error: runErr } = await supabaseAdmin
      .from("ai_audit_runs")
      .select("*")
      .eq("id", data.runId)
      .single();
    if (runErr || !run) throw new Error(runErr?.message ?? "run not found");
    if (run.task_kind !== "geolocate") throw new Error("Прогон не относится к задаче геолокации");
    if (run.status !== "running") {
      return { status: run.status, processed: 0, pointsDone: run.points_done, pointsTotal: run.points_total };
    }

    // Build the same candidate list as start() — order-stable since fetchUnlocated is deterministic.
    const all = await fetchUnlocated();
    let candidates = all.filter((it) => (it.settlement.ru || it.settlement.en).trim().length > 0);
    const scope: string = run.scope ?? "unlocated:all";
    if (scope.startsWith("unlocated:") && scope !== "unlocated:all") {
      const u = scope.slice("unlocated:".length).toLocaleLowerCase().trim();
      candidates = candidates.filter(
        (it) =>
          (it.uezd.ru || "").toLocaleLowerCase().includes(u) ||
          (it.uezd.en || "").toLocaleLowerCase().includes(u),
      );
    }

    const start = run.points_done as number;
    const slice = candidates.slice(start, start + data.size);
    if (slice.length === 0) {
      const finishedAt = new Date().toISOString();
      await supabaseAdmin
        .from("ai_audit_runs")
        .update({ status: "done", finished_at: finishedAt, heartbeat_at: finishedAt, updated_at: finishedAt })
        .eq("id", run.id);
      return { status: "done", processed: 0, pointsDone: run.points_done, pointsTotal: run.points_total };
    }

    // Spatial index of existing published features
    const { data: ovRows } = await supabaseAdmin
      .from("feature_overrides")
      .select("id, feature_id, action, data, published, notes, created_at, updated_at")
      .eq("published", true)
      .order("updated_at", { ascending: true });
    const published = (ovRows || []) as unknown as FeatureOverride[];
    const featureList = buildFeatureIndex(published);
    const featureIndex = buildSpatialIndex(featureList);
    const editOverrideByFid = new Map<number, FeatureOverride>();
    for (const o of published) {
      if (o.action === "edit" && o.feature_id != null) editOverrideByFid.set(o.feature_id, o);
    }

    // Existing coord-suggestions to avoid re-queueing — both the
    // (settlement|uezd) key (so we don't re-ask the same place) and the
    // narrower (settlement|church|years) key (so we don't queue something
    // that would collide with the approved-unique index on approve).
    const { data: existing } = await supabaseAdmin
      .from("coord_suggestions")
      .select("settlement_ru, settlement_en, uezd_ru, uezd_en, church_ru, years, status");
    const existingKeys = new Set(
      (existing || []).map((e) =>
        `${(e.settlement_ru || e.settlement_en || "").toLocaleLowerCase().trim()}|${(e.uezd_ru || e.uezd_en || "").toLocaleLowerCase().trim()}`,
      ),
    );
    // Approved-natural-key set mirrors coord_suggestions_approved_unique_natural
    // (settlement_ru + church_ru + years). Skip items whose approved twin
    // already exists — approving a duplicate would 23505 on the unique index.
    const approvedNaturalKeys = new Set(
      (existing || [])
        .filter((e) => e.status === "approved")
        .map((e) =>
          `${(e.settlement_ru || "").toLocaleLowerCase().trim()}|${(e.church_ru || "").toLocaleLowerCase().trim()}|${e.years || ""}`,
        ),
    );
    const itemApprovedKey = (it: { settlement: { ru: string }; church: { ru: string }; years: string }) =>
      `${(it.settlement.ru || "").toLocaleLowerCase().trim()}|${(it.church.ru || "").toLocaleLowerCase().trim()}|${it.years || ""}`;

    let processed = 0;
    let merged = 0;
    let queued = 0;
    let rejected = 0;
    let lastError: string | undefined;
    let progress: any = run.agent_progress ?? {};

    const beat = async () => {
      const ts = new Date().toISOString();
      try {
        await supabaseAdmin
          .from("ai_audit_runs")
          .update({ heartbeat_at: ts, updated_at: ts })
          .eq("id", run.id)
          .eq("status", "running");
      } catch {
        /* heartbeat is best-effort */
      }
    };

    for (const item of slice) {
      const label = item.settlement.ru || item.settlement.en;
      const uezdLabel = item.uezd.ru || item.uezd.en || "";
      const itemKey = unlocatedKey(item);
      try {
        // Skip duplicates
        if (existingKeys.has(itemKey)) {
          await insertFinding(run.id, {
            kind: "geolocate",
            severity: "info",
            status: "rejected",
            confidence: 0,
            rationale: `Уже есть запись в очереди координат: ${label} (${uezdLabel || "без уезда"})`,
            current: { settlement: item.settlement, uezd: item.uezd, region: item.region },
            proposed: null,
            sources: [],
          });
          rejected++; processed++;
          continue;
        }
        // Skip items whose approved twin already exists — queueing them
        // would lead to a 23505 on coord_suggestions_approved_unique_natural at approve time.
        if (approvedNaturalKeys.has(itemApprovedKey(item))) {
          await insertFinding(run.id, {
            kind: "geolocate",
            severity: "info",
            status: "rejected",
            confidence: 0,
            rationale: `Уже есть одобренная точка с такими же селением/церковью/годами: ${label}. Повторное одобрение нарушило бы уникальный индекс.`,
            current: { settlement: item.settlement, uezd: item.uezd, region: item.region },
            proposed: null,
            sources: [],
          });
          rejected++; processed++;
          continue;
        }

        const cands = await geocodeCandidates(item);
        if (cands.length === 0) {
          await insertFinding(run.id, {
            kind: "geolocate",
            severity: "warn",
            status: "rejected",
            confidence: 0,
            rationale: `Nominatim ничего не нашёл в Грузии для «${label}» (${uezdLabel || "без уезда"})`,
            current: { settlement: item.settlement, uezd: item.uezd, region: item.region },
            proposed: null,
            sources: ["nominatim.openstreetmap.org"],
          });
          rejected++; processed++;
          progress = bumpProgress(progress, 0, 1, "Nominatim empty");
          continue;
        }

        const arb = await aiArbiter(item, cands);
        if (!arb || arb.index === -1) {
          await insertFinding(run.id, {
            kind: "geolocate",
            severity: "info",
            status: "rejected",
            confidence: arb?.confidence ?? 0,
            rationale: `AI отклонил всех кандидатов: ${arb?.reason ?? "—"}`,
            current: { settlement: item.settlement, uezd: item.uezd, region: item.region },
            proposed: { candidates: cands.map((c) => c.display_name) },
            sources: ["openrouter:google/gemini-2.5-pro"],
          });
          rejected++; processed++;
          continue;
        }
        if (arb.confidence < data.minConfidence) {
          await insertFinding(run.id, {
            kind: "geolocate",
            severity: "info",
            status: "rejected",
            confidence: arb.confidence,
            rationale: `Низкая уверенность (${arb.confidence.toFixed(2)} < ${data.minConfidence}): ${arb.reason}`,
            current: { settlement: item.settlement, uezd: item.uezd, region: item.region },
            proposed: { chosen: cands[arb.index]?.display_name ?? null },
            sources: ["openrouter:google/gemini-2.5-pro"],
          });
          rejected++; processed++;
          continue;
        }

        const chosen = cands[arb.index];
        const lat = parseFloat(chosen.lat);
        const lon = parseFloat(chosen.lon);

        const validation = validateOsmMatch(item, chosen, {
          minTokenLen: 3,
          prefixLen: 5,
          geoStrict: data.geoStrict,
        });
        if (!validation.ok) {
          await insertFinding(run.id, {
            kind: "geolocate",
            severity: "warn",
            status: "rejected",
            confidence: arb.confidence,
            rationale: `Авто-проверка: ${validation.reasons.join("; ")}`,
            current: { settlement: item.settlement, uezd: item.uezd, region: item.region },
            proposed: { lat, lon, osm: chosen.display_name },
            sources: ["nominatim.openstreetmap.org", "openrouter:google/gemini-2.5-pro"],
          });
          rejected++; processed++;
          continue;
        }

        // Auto-merge?
        const { match: mergeMatch } = findMergeTarget(item, lat, lon, featureIndex, data.mergeRadiusM);
        if (mergeMatch && arb.confidence >= data.minMergeConfidence) {
          const existingOv = editOverrideByFid.get(mergeMatch.target.id);
          const baseData = existingOv?.data ?? mergeMatch.target.data;
          const mergedData = buildMergedFeatureData(baseData, item, chosen.display_name);
          const notes = `AI-оркестрация · auto-merge · confidence ${arb.confidence.toFixed(2)} · ${mergeMatch.reason} · OSM: ${chosen.display_name}`;
          if (existingOv) {
            await supabaseAdmin
              .from("feature_overrides")
              .update({ data: JSON.parse(JSON.stringify(mergedData)), notes, published: true })
              .eq("id", existingOv.id);
          } else {
            await supabaseAdmin.from("feature_overrides").insert({
              feature_id: mergeMatch.target.id,
              action: "edit",
              data: JSON.parse(JSON.stringify(mergedData)),
              published: true,
              notes,
              created_by: userId,
            });
          }
          await insertFinding(run.id, {
            kind: "geolocate",
            severity: "info",
            status: "applied",
            confidence: arb.confidence,
            feature_id: mergeMatch.target.id,
            rationale: `Слито с #${mergeMatch.target.id} «${mergeMatch.target.data.settlement.ru || mergeMatch.target.data.settlement.en}» (${Math.round(mergeMatch.distanceM)} м, ${mergeMatch.reason}). Стандартный аудит карточки доработает церковь / годы / ссылки.`,
            current: { settlement: item.settlement, uezd: item.uezd, region: item.region, years: item.years },
            proposed: { lat, lon, merged: true, target_feature_id: mergeMatch.target.id, osm: chosen.display_name },
            sources: ["nominatim.openstreetmap.org", "openrouter:google/gemini-2.5-pro"],
          });
          merged++; processed++;
          progress = bumpProgress(progress, 1, 0);
          continue;
        }

        // Conflict check against pending suggestions
        const radiusDegLat = data.conflictRadiusM / 111_000;
        const radiusDegLon = data.conflictRadiusM / (111_000 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
        const { data: nearby } = await supabaseAdmin
          .from("coord_suggestions")
          .select("id, settlement_ru, settlement_en, status")
          .gte("lat", lat - radiusDegLat)
          .lte("lat", lat + radiusDegLat)
          .gte("lon", lon - radiusDegLon)
          .lte("lon", lon + radiusDegLon)
          .limit(1);
        if (nearby && nearby.length > 0) {
          const n = nearby[0];
          await insertFinding(run.id, {
            kind: "geolocate",
            severity: "info",
            status: "rejected",
            confidence: arb.confidence,
            rationale: `Конфликт: рядом уже есть запись «${n.settlement_ru || n.settlement_en}» (${n.status})`,
            current: { settlement: item.settlement, uezd: item.uezd, region: item.region },
            proposed: { lat, lon, osm: chosen.display_name },
            sources: ["nominatim.openstreetmap.org"],
          });
          rejected++; processed++;
          continue;
        }

        // Queue as coord suggestion for moderator
        const submitterNote = `AI-оркестрация · confidence ${arb.confidence.toFixed(2)} · ${arb.reason} · OSM: ${chosen.display_name}${
          validation.warnings.length ? ` · предупр.: ${validation.warnings.join(", ")}` : ""
        }`;
        const { data: ins, error: insErr } = await supabaseAdmin
          .from("coord_suggestions")
          .insert({
            settlement_ru: item.settlement.ru || "",
            settlement_en: item.settlement.en || "",
            uezd_ru: item.uezd.ru || "",
            uezd_en: item.uezd.en || "",
            region_ru: item.region.ru || "",
            region_en: item.region.en || "",
            church_ru: item.church.ru || "",
            church_en: item.church.en || "",
            years: item.years || "",
            start_year: item.startYear ?? null,
            end_year: item.endYear ?? null,
            lat,
            lon,
            status: "pending",
            origin: "ai-orchestration",
            submitter_note: submitterNote,
          })
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);

        await insertFinding(run.id, {
          kind: "geolocate",
          severity: "info",
          status: "pending",
          confidence: arb.confidence,
          rationale: `Нашлись координаты (${lat.toFixed(4)}, ${lon.toFixed(4)}) · ${arb.reason}. Подтвердите, чтобы перенести точку на карту через очередь предложений координат.`,
          current: { settlement: item.settlement, uezd: item.uezd, region: item.region, years: item.years, church: item.church },
          proposed: {
            lat,
            lon,
            osm: chosen.display_name,
            coord_suggestion_id: ins?.id ?? null,
            warnings: validation.warnings,
          },
          sources: ["nominatim.openstreetmap.org", "openrouter:google/gemini-2.5-pro"],
        });
        existingKeys.add(itemKey);
        queued++; processed++;
        progress = bumpProgress(progress, 1, 0);
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        lastError = msg;
        progress = bumpProgress(progress, 0, 1, msg);
        await insertFinding(run.id, {
          kind: "geolocate",
          severity: "error",
          status: "rejected",
          confidence: 0,
          rationale: `Ошибка обработки «${label}»: ${msg}`,
          current: { settlement: item.settlement, uezd: item.uezd, region: item.region },
          proposed: null,
          sources: [],
        });
        rejected++; processed++;
      }
      // Heartbeat after each settlement so the watchdog never flags a long-but-progressing tick.
      await beat();
    }

    const newDone = start + slice.length;
    const finished = newDone >= candidates.length;
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("ai_audit_runs")
      .update({
        points_done: newDone,
        agent_progress: progress,
        heartbeat_at: now,
        watchdog_state: { lastTickAt: now, stallCount: 0, autoRestartCount: 0 } as any,
        updated_at: now,
        ...(finished ? { status: "done", finished_at: now } : {}),
      })
      .eq("id", run.id);

    return {
      status: finished ? "done" : "running",
      processed,
      merged,
      queued,
      rejected,
      pointsDone: newDone,
      pointsTotal: run.points_total,
      lastError: lastError ?? null,
    };
  });

// ---------- helper: insert finding ----------

async function insertFinding(
  runId: string,
  f: {
    kind: "geolocate";
    severity: "info" | "warn" | "error";
    status: "pending" | "approved" | "rejected" | "applied";
    confidence: number;
    rationale: string;
    current: any;
    proposed: any;
    sources: string[];
    feature_id?: number | null;
  },
) {
  await supabaseAdmin.from("ai_audit_findings").insert({
    run_id: runId,
    feature_id: f.feature_id ?? null,
    kind: f.kind,
    severity: f.severity,
    status: f.status,
    confidence: f.confidence,
    rationale: f.rationale.slice(0, 2000),
    current: f.current,
    proposed: f.proposed,
    sources: f.sources,
    cost_usd: 0,
  });
}

// ---------- summary helper for UI ----------

export const getUnlocatedSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);
    const items = await fetchUnlocated();
    const byUezd = new Map<string, number>();
    for (const it of items) {
      const u = (it.uezd.ru || it.uezd.en || "—").trim() || "—";
      byUezd.set(u, (byUezd.get(u) || 0) + 1);
    }
    return {
      total: items.length,
      byUezd: [...byUezd.entries()].sort((a, b) => b[1] - a[1]).map(([uezd, count]) => ({ uezd, count })),
    };
  });
