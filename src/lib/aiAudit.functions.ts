import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import parishesRaw from "../../public/data/parishes.geojson?raw";
import catalogRaw from "../../public/data/niag-catalog.json?raw";

const parishes = JSON.parse(parishesRaw) as GeoJSON.FeatureCollection<
  GeoJSON.Point,
  Record<string, any>
>;

interface CatalogEntry {
  s: string; // settlement_name_en
  c: string; // church_name_en
  y: string; // years_range
  m: string; // missing years
  ref: string;
}
interface CatalogShape {
  source: string;
  byDistrict: Record<string, CatalogEntry[]>;
}
const catalog = JSON.parse(catalogRaw) as CatalogShape;
const catalogIndex = catalog.byDistrict ?? {};

// ---- Pricing (USD per 1M tokens) ---------------------------------------
const PRICING: Record<string, { in: number; out: number }> = {
  "google/gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "google/gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "google/gemini-2.5-pro": { in: 1.25, out: 10 },
  "google/gemini-3-flash-preview": { in: 0.3, out: 2.5 },
};
function priceUsd(model: string, tIn: number, tOut: number) {
  const p = PRICING[model] ?? PRICING["google/gemini-2.5-flash-lite"];
  return (tIn * p.in + tOut * p.out) / 1_000_000;
}

// Generic / non-uezd regions — never propose merges for these
const GENERIC_REGIONS = new Set(
  [
    "имеретия", "гурия", "абхазия", "мегрелия", "сванетия", "кахетия",
    "картли", "имерети", "imereti", "guria", "abkhazia", "samegrelo",
    "svaneti", "kakheti", "kartli", "megreliya", "imeretiya", "guriya",
    "abkhaziya", "osetiya",
  ].map((s) => s.toLowerCase()),
);

// Normalize an uezd/region label to the same key used in catalog.byDistrict
function normDistrict(uezd: string | undefined | null): string {
  if (!uezd) return "";
  return uezd.trim().toLowerCase();
}

// Russian → English transliteration of uezd labels seen in feature props,
// because catalog is keyed by English forms ("kutaisskiy uezd", "imeretiya")
const RU_TO_EN: Array<[RegExp, string]> = [
  [/кутаис\w*\s*уезд/, "kutaisskiy uezd"],
  [/гори\w*\s*уезд/, "goriyskiy uezd"],
  [/телав\w*\s*уезд/, "telavskiy uezd"],
  [/тифлис\w*\s*уезд|тбилис\w*\s*уезд/, "tbilisskiy uezd"],
  [/душет\w*\s*уезд/, "dushetskiy uezd"],
  [/ахалцих\w*\s*уезд/, "akhaltsikhskiy uezd"],
  [/шорапан\w*\s*уезд/, "shorapanskiy uezd"],
  [/рачин\w*\s*уезд/, "rachinskiy uezd"],
  [/озургет\w*\s*уезд/, "ozurgetskiy uezd"],
  [/сенакс\w*\s*уезд/, "senakskiy uezd"],
  [/зугдид\w*\s*уезд/, "zugdidskiy uezd"],
  [/имерет/, "imeretiya"],
  [/гури/, "guriya"],
  [/мегрел/, "megreliya"],
  [/абхаз/, "abkhaziya"],
  [/осети/, "osetiya"],
  [/кахети/, "kakhetiya"],
];
function ruToEnDistrict(u: string): string {
  const k = u.toLowerCase();
  for (const [re, en] of RU_TO_EN) if (re.test(k)) return en;
  return k;
}

function pickCatalogContext(
  uezd: string | undefined,
  startYear: number | null,
  endYear: number | null,
): { entries: CatalogEntry[]; text: string } {
  const enKey = ruToEnDistrict(uezd ?? "");
  const list = catalogIndex[enKey] ?? [];
  const start = startYear ?? 1800;
  const end = endYear ?? 1900;
  const filtered = list.filter((e) => {
    if (!e.y) return true;
    const m = e.y.match(/(\d{4})/g);
    if (!m) return true;
    const ys = m.map(Number);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    return hi >= start - 2 && lo <= end + 2;
  });
  let acc = `Уезд (нормализован): ${enKey || "—"}\n`;
  const out: CatalogEntry[] = [];
  for (const e of filtered) {
    const block = `- ${e.s || "—"} | ${e.c || "—"} | годы ${e.y || "?"}${e.m ? " | пропуски " + e.m : ""}\n`;
    if (acc.length + block.length > 12000) break;
    acc += block;
    out.push(e);
  }
  return { entries: out, text: acc };
}


// ---- Schemas -----------------------------------------------------------
const startSchema = z.object({
  budgetUsd: z.number().min(0.1).max(1000).default(100),
  model: z.string().default("google/gemini-2.5-flash-lite"),
  scope: z.string().default("all"), // "all" | "uezd:<key>" | "ids:1,2,3"
  notes: z.string().max(500).optional(),
});

const batchSchema = z.object({
  runId: z.string().uuid(),
  size: z.number().min(1).max(20).default(5),
});

const reviewSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

// ---- assert helpers ----------------------------------------------------
async function assertEditor(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_min_role", {
    _user_id: userId,
    _min_role: "editor",
  });
  if (error || data !== true) {
    throw new Error("Forbidden: editor role required");
  }
}

// ---- featureId selection -----------------------------------------------
function selectFeatureIds(scope: string): number[] {
  if (scope.startsWith("ids:")) {
    return scope
      .slice(4)
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
  }
  if (scope.startsWith("uezd:")) {
    const key = scope.slice(5).toLowerCase();
    return parishes.features
      .filter((f) => {
        const u = (f.properties.uezd?.ru || f.properties.uezd?.en || "")
          .toLowerCase();
        return u.includes(key);
      })
      .map((f) => f.id as number)
      .filter((n) => Number.isFinite(n));
  }
  return parishes.features
    .map((f) => f.id as number)
    .filter((n) => Number.isFinite(n));
}

// ---- AI call -----------------------------------------------------------
const TOOL_SCHEMA = {
  type: "object",
  properties: {
    settlement_ok: { type: "boolean" },
    settlement_correction: { type: "string" },
    uezd_ok: { type: "boolean" },
    uezd_correction: { type: "string" },
    church_ok: { type: "boolean" },
    church_corrections: {
      type: "array",
      items: { type: "string" },
    },
    years_ok: { type: "boolean" },
    years_correction: { type: "string" },
    missing_years_ok: { type: "boolean" },
    missing_years_correction: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    rationale: { type: "string" },
    sources: {
      type: "array",
      items: { type: "string" },
      description: "Цитаты из каталога / URL архива",
    },
  },
  required: ["confidence", "rationale"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Ты — модератор грузинского архивного атласа метрических книг (НИАГ Ф.489 оп.6).
По карточке точки проверь название селения, уезда/района, церквей, диапазона годов и пропущенных лет.
Сверяй ИСКЛЮЧИТЕЛЬНО с предоставленным каталогом. Если каталог не содержит подтверждения — пиши confidence < 0.3 и оставляй *_ok=true.
Никогда не выдумывай факты. Если уезд относится к общим регионам (Имеретия, Гурия, Абхазия, Мегрелия, Сванетия, Кахетия, Картли) и подробного уезда нет — не предлагай уточнений по уезду.
Возвращай результат строго через инструмент propose_corrections.`;

async function callGateway(model: string, system: string, user: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "propose_corrections",
            description: "Вернуть проверенные правки.",
            parameters: TOOL_SCHEMA,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "propose_corrections" },
      },
    }),
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (res.status === 402) throw new Error("ai_credits_exhausted");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as any;
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  let parsed: any = {};
  try {
    parsed = JSON.parse(call?.function?.arguments ?? "{}");
  } catch {
    parsed = {};
  }
  const usage = json.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  return {
    parsed,
    tokensIn: usage.prompt_tokens ?? 0,
    tokensOut: usage.completion_tokens ?? 0,
  };
}

// ---- Findings derivation -----------------------------------------------
type FindingRow = {
  kind: string;
  severity: "info" | "warn" | "error";
  current: any;
  proposed: any;
  rationale: string;
};

function deriveFindings(card: any, ai: any): FindingRow[] {
  const out: FindingRow[] = [];
  const isGenericRegion = GENERIC_REGIONS.has(
    String(card.region?.ru || card.region?.en || "").toLowerCase().trim(),
  );

  if (ai.settlement_ok === false && ai.settlement_correction) {
    out.push({
      kind: "settlement",
      severity: "warn",
      current: card.settlement,
      proposed: { suggestion: ai.settlement_correction },
      rationale: ai.rationale ?? "",
    });
  }
  if (
    !isGenericRegion &&
    ai.uezd_ok === false &&
    ai.uezd_correction &&
    String(ai.uezd_correction).trim()
  ) {
    out.push({
      kind: "uezd",
      severity: "warn",
      current: card.uezd,
      proposed: { suggestion: ai.uezd_correction },
      rationale: ai.rationale ?? "",
    });
  }
  if (ai.church_ok === false && Array.isArray(ai.church_corrections) && ai.church_corrections.length) {
    out.push({
      kind: "church",
      severity: "warn",
      current: card.church,
      proposed: { suggestions: ai.church_corrections },
      rationale: ai.rationale ?? "",
    });
  }
  if (ai.years_ok === false && ai.years_correction) {
    out.push({
      kind: "years",
      severity: "warn",
      current: { yearsRaw: card.yearsRaw, startYear: card.startYear, endYear: card.endYear },
      proposed: { yearsRaw: ai.years_correction },
      rationale: ai.rationale ?? "",
    });
  }
  if (ai.missing_years_ok === false && ai.missing_years_correction) {
    out.push({
      kind: "missing_years",
      severity: "info",
      current: { missingRaw: card.missingRaw },
      proposed: { missingRaw: ai.missing_years_correction },
      rationale: ai.rationale ?? "",
    });
  }
  return out;
}

// ---- Server functions --------------------------------------------------
export const startAuditRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => startSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);
    const ids = selectFeatureIds(data.scope);
    const { data: row, error } = await supabaseAdmin
      .from("ai_audit_runs")
      .insert({
        model: data.model,
        budget_usd: data.budgetUsd,
        scope: data.scope,
        notes: data.notes ?? null,
        points_total: ids.length,
        points_done: 0,
        created_by: userId,
        status: "running",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { runId: row!.id as string, total: ids.length };
  });

export const cancelAuditRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);
    const { error } = await supabaseAdmin
      .from("ai_audit_runs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.runId)
      .in("status", ["running", "paused"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const processNextBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => batchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);

    const { data: run, error: runErr } = await supabaseAdmin
      .from("ai_audit_runs")
      .select("*")
      .eq("id", data.runId)
      .single();
    if (runErr || !run) throw new Error(runErr?.message ?? "run not found");
    if (run.status !== "running") {
      return { status: run.status, processed: 0, spentUsd: Number(run.spent_usd), pointsDone: run.points_done, pointsTotal: run.points_total };
    }
    if (Number(run.spent_usd) >= Number(run.budget_usd)) {
      await supabaseAdmin
        .from("ai_audit_runs")
        .update({ status: "budget_exhausted", finished_at: new Date().toISOString() })
        .eq("id", run.id);
      return { status: "budget_exhausted", processed: 0, spentUsd: Number(run.spent_usd), pointsDone: run.points_done, pointsTotal: run.points_total };
    }

    const ids = selectFeatureIds(run.scope as string);
    const slice = ids.slice(run.points_done, run.points_done + data.size);
    if (slice.length === 0) {
      await supabaseAdmin
        .from("ai_audit_runs")
        .update({ status: "done", finished_at: new Date().toISOString() })
        .eq("id", run.id);
      return { status: "done", processed: 0, spentUsd: Number(run.spent_usd), pointsDone: run.points_done, pointsTotal: run.points_total };
    }

    let processed = 0;
    let spent = Number(run.spent_usd);
    const budget = Number(run.budget_usd);
    const findingsToInsert: any[] = [];

    for (const featureId of slice) {
      if (spent >= budget) break;
      const feat = parishes.features.find((f) => f.id === featureId);
      if (!feat) {
        processed += 1;
        continue;
      }
      const p = feat.properties;
      const card = {
        feature_id: featureId,
        settlement: p.settlement,
        church: p.church,
        region: p.region,
        uezd: p.uezd,
        yearsRaw: p.yearsRaw,
        missingRaw: p.missingRaw,
        startYear: p.startYear,
        endYear: p.endYear,
      };
      const ctx = pickCatalogContext(
        card.uezd?.ru || card.uezd?.en || card.region?.ru,
        card.startYear,
        card.endYear,
      );
      const userMsg = `КАРТОЧКА:\n${JSON.stringify(card, null, 2)}\n\nКАТАЛОГ НИАГ (${ctx.entries.length} записей):\n${ctx.text || "(нет совпадений по уезду/годам)"}`;
      let ai: any = {}; let tIn = 0; let tOut = 0;
      try {
        const r = await callGateway(run.model as string, SYSTEM_PROMPT, userMsg);
        ai = r.parsed; tIn = r.tokensIn; tOut = r.tokensOut;
      } catch (e: any) {
        if (e.message === "ai_credits_exhausted") {
          await supabaseAdmin
            .from("ai_audit_runs")
            .update({ status: "budget_exhausted", finished_at: new Date().toISOString() })
            .eq("id", run.id);
          break;
        }
        if (e.message === "rate_limited") {
          await new Promise((res) => setTimeout(res, 2000));
        }
        findingsToInsert.push({
          run_id: run.id,
          feature_id: featureId,
          kind: "other",
          severity: "error",
          confidence: 0,
          current: card,
          proposed: {},
          rationale: `Ошибка вызова AI: ${e.message ?? String(e)}`,
          sources: [],
          tokens_in: 0,
          tokens_out: 0,
          cost_usd: 0,
          status: "rejected",
        });
        processed += 1;
        continue;
      }
      const cost = priceUsd(run.model as string, tIn, tOut);
      spent += cost;

      const rows = deriveFindings(card, ai);
      const conf = Number(ai.confidence ?? 0);
      if (rows.length === 0) {
        // log an info row so the admin sees the point was checked
        findingsToInsert.push({
          run_id: run.id,
          feature_id: featureId,
          kind: "other",
          severity: "info",
          confidence: conf,
          current: card,
          proposed: {},
          rationale: ai.rationale ?? "ОК — расхождений не найдено",
          sources: Array.isArray(ai.sources) ? ai.sources.slice(0, 10) : [],
          tokens_in: tIn,
          tokens_out: tOut,
          cost_usd: cost,
          status: "approved", // auto-mark as reviewed since no action needed
        });
      } else {
        for (const r of rows) {
          findingsToInsert.push({
            run_id: run.id,
            feature_id: featureId,
            kind: r.kind,
            severity: r.severity,
            confidence: conf,
            current: r.current,
            proposed: r.proposed,
            rationale: r.rationale || ai.rationale || "",
            sources: Array.isArray(ai.sources) ? ai.sources.slice(0, 10) : [],
            tokens_in: tIn,
            tokens_out: tOut,
            cost_usd: cost,
            status: "pending",
          });
        }
      }
      processed += 1;
      // tiny throttle
      await new Promise((res) => setTimeout(res, 250));
    }

    if (findingsToInsert.length) {
      const { error: insErr } = await supabaseAdmin
        .from("ai_audit_findings")
        .insert(findingsToInsert);
      if (insErr) console.error("findings insert", insErr);
    }

    const newDone = run.points_done + processed;
    const finished = newDone >= run.points_total || spent >= budget;
    const status = spent >= budget ? "budget_exhausted" : finished ? "done" : "running";

    await supabaseAdmin
      .from("ai_audit_runs")
      .update({
        points_done: newDone,
        spent_usd: spent,
        status,
        finished_at: finished ? new Date().toISOString() : null,
      })
      .eq("id", run.id);

    return {
      status,
      processed,
      spentUsd: spent,
      pointsDone: newDone,
      pointsTotal: run.points_total,
    };
  });

export const getRunStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);
    const { data: row, error } = await supabaseAdmin
      .from("ai_audit_runs")
      .select("*")
      .eq("id", data.runId)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listAuditRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);
    const { data, error } = await supabaseAdmin
      .from("ai_audit_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listFindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        runId: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected", "applied", "all"]).default("pending"),
        limit: z.number().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);
    let q = supabaseAdmin
      .from("ai_audit_findings")
      .select("*")
      .eq("run_id", data.runId)
      .order("severity", { ascending: false })
      .order("confidence", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const reviewFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => reviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    await assertEditor(userId);

    const { data: finding, error: getErr } = await supabaseAdmin
      .from("ai_audit_findings")
      .select("*")
      .eq("id", data.id)
      .single();
    if (getErr || !finding) throw new Error(getErr?.message ?? "not found");

    let newStatus: "approved" | "rejected" | "applied" = data.decision;

    if (data.decision === "approved" && finding.feature_id != null) {
      // Apply to existing moderation surfaces depending on kind.
      const proposed = (finding.proposed ?? {}) as Record<string, any>;
      const current = (finding.current ?? {}) as Record<string, any>;
      try {
        if (finding.kind === "missing_years" && proposed.missingRaw != null) {
          await supabaseAdmin.from("missing_years_suggestions").insert({
            feature_id: finding.feature_id,
            current_missing: String(current.missingRaw ?? ""),
            proposed_missing: String(proposed.missingRaw ?? ""),
            settlement_snapshot: current,
            note: `AI-аудит: ${finding.rationale ?? ""}`.slice(0, 1000),
            created_by: userId,
          });
          newStatus = "applied";
        } else if (finding.kind === "uezd") {
          await supabaseAdmin.from("uezd_corrections").insert({
            feature_id: finding.feature_id,
            current_uezd: current,
            proposed_uezd: proposed,
            settlement_snapshot: {},
            region_snapshot: {},
            note: `AI-аудит: ${finding.rationale ?? ""}`.slice(0, 1000),
            created_by: userId,
          });
          newStatus = "applied";
        } else if (["settlement", "church", "years"].includes(finding.kind)) {
          await supabaseAdmin.from("feature_overrides").insert({
            feature_id: finding.feature_id,
            action: "patch",
            data: { ai_audit: { kind: finding.kind, proposed } },
            published: false,
            notes: `AI-аудит #${finding.id.slice(0, 8)} ${finding.kind}: ${finding.rationale ?? ""}`.slice(0, 1000),
            created_by: userId,
          });
          newStatus = "applied";
        }
      } catch (e: any) {
        console.error("apply finding failed", e);
        // keep status='approved' if apply failed
      }
    }

    const { error: updErr } = await supabaseAdmin
      .from("ai_audit_findings")
      .update({
        status: newStatus,
        review_note: data.note ?? null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, status: newStatus };
  });
