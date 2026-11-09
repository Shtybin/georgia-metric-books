import { createFileRoute } from "@tanstack/react-router";
import rows from "@/data/deep-check-findings.json";

// TEMPORARY one-shot import; removed right after running.
export const Route = createFileRoute("/api/deep-check-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-once") !== "dc-7f3a91") return new Response("no", { status: 403 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ex } = await supabaseAdmin.from("ai_audit_runs").select("id").eq("scope", "deep-check-2026-11").maybeSingle();
        if (ex) return Response.json({ skipped: true });
        const { data: run, error } = await supabaseAdmin.from("ai_audit_runs").insert({
          status: "done", model: "google/gemini-2.5-pro", task_kind: "audit", scope: "deep-check-2026-11",
          points_total: 232, points_done: 232, finished_at: new Date().toISOString(),
          notes: "Скрининг 1376 точек → 232 спорных → глубокая проверка Gemini 2.5 Pro",
        }).select("id").single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const { error: e2 } = await supabaseAdmin.from("ai_audit_findings").insert((rows as any[]).map((r) => ({ ...r, run_id: run.id })));
        if (e2) return Response.json({ error: e2.message }, { status: 500 });
        return Response.json({ inserted: rows.length });
      },
    },
  },
});
