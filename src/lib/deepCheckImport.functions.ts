import { createServerFn } from "@tanstack/react-start";
import rows from "@/data/deep-check-findings.json";

// TEMPORARY one-shot import of screening + Gemini 2.5 Pro findings. Remove after run.
export const importDeepCheck = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin
    .from("ai_audit_runs").select("id").eq("scope", "deep-check-2026-11").maybeSingle();
  if (existing) return { skipped: true };
  const { data: run, error } = await supabaseAdmin
    .from("ai_audit_runs")
    .insert({
      status: "done", model: "google/gemini-2.5-pro", task_kind: "audit", scope: "deep-check-2026-11",
      points_total: 232, points_done: 232, finished_at: new Date().toISOString(),
      notes: "Скрининг 1376 точек → 232 спорных → глубокая проверка Gemini 2.5 Pro",
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabaseAdmin
    .from("ai_audit_findings")
    .insert((rows as any[]).map((r) => ({ ...r, run_id: run.id })));
  if (e2) throw new Error(e2.message);
  return { inserted: rows.length };
});
