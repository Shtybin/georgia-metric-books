import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import tbilisiBundled from "../../public/data/tbilisi-churches.json";

// ---- Types -----------------------------------------------------------------

interface TbilisiChurchRow {
  id: number;
  name: { ka: string; ru: string; en: string };
  confession: string;
  confessionRaw: string;
  address: string;
  district: string;
  lat: number;
  lon: number;
  recordYears: string;
  note: string | { ru: string; en: string; ka: string };
  historicalNote: string | { ru: string; en: string; ka: string };
  confidence: string;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  class: string;
}

interface VerifyLogRow {
  churchId: number;
  name: string;
  status: "updated" | "kept" | "skipped" | "error";
  oldLat: number;
  oldLon: number;
  newLat?: number;
  newLon?: number;
  distanceM?: number;
  confidence?: number;
  reasoning?: string;
  sources?: { url: string; title?: string }[];
  note?: string;
}

interface VerifyResult {
  processed: number;
  updated: number;
  kept: number;
  skipped: number;
  errors: number;
  remaining: number;
  log: VerifyLogRow[];
}

// ---- Helpers ---------------------------------------------------------------

const TBILISI_BBOX = { minLat: 41.6, maxLat: 41.85, minLon: 44.6, maxLon: 44.95 };

function inTbilisi(lat: number, lon: number) {
  return (
    lat >= TBILISI_BBOX.minLat &&
    lat <= TBILISI_BBOX.maxLat &&
    lon >= TBILISI_BBOX.minLon &&
    lon <= TBILISI_BBOX.maxLon
  );
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function asPlainText(v: string | { ru: string; en: string; ka: string } | undefined): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.ru || v.en || v.ka || "";
}

async function geocodeNominatim(query: string): Promise<NominatimHit[]> {
  if (!query.trim()) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${query}, Tbilisi, Georgia`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("viewbox", "44.6,41.85,44.95,41.6");
  url.searchParams.set("bounded", "1");
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "metrics.datatells.info/tbilisi-coord-verifier (contact: site admin)",
        "Accept-Language": "ru,en,ka",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as NominatimHit[];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("[nominatim]", e);
    return [];
  }
}

interface AiVerdict {
  lat: number;
  lon: number;
  confidence: number;
  reasoning: string;
  sources: { url: string; title?: string }[];
  keep_current: boolean;
}

async function aiVerify(
  church: TbilisiChurchRow,
  candidates: NominatimHit[],
): Promise<AiVerdict | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[aiVerify] LOVABLE_API_KEY missing");
    return null;
  }

  const note = asPlainText(church.note);
  const histNote = asPlainText(church.historicalNote);

  const systemPrompt = `Ты — историк-картограф Тифлиса (Тбилиси) конца XIX — начала XX века. Задача: проверить географические координаты исторической церкви.

Опирайся на: исторический адрес и район из дореволюционных источников, известные карты Тифлиса 1898 года, исторические очерки, OpenStreetMap, Wikipedia (ru/en/ka), сайты епархий, базы культурного наследия Грузии. Учти, что некоторые церкви были снесены — тогда ищи координаты исторического участка, а не современного здания на его месте.

Координаты должны быть в пределах исторического Тифлиса (примерно lat 41.65–41.78, lon 44.75–44.85).

Если уверен, что текущие координаты корректны — верни их же с keep_current=true и поясни, на чём основано подтверждение. Если нашёл лучшие — keep_current=false и новые lat/lon.

confidence:
 - 0.9+ : подтверждено несколькими независимыми источниками (карта 1898, OSM, статья)
 - 0.7  : один авторитетный источник + соответствие району
 - 0.5  : разумная оценка по адресу/району, источники косвенные
 - <0.5 : плохо подтверждено; лучше keep_current=true

В sources давай реальные URL источников, которыми пользовался (Wikipedia статья, OSM way/node, страница епархии и т.п.). Не выдумывай ссылки.`;

  const userPrompt = `Церковь:
- Название (ka): ${church.name.ka || "—"}
- Название (ru): ${church.name.ru || "—"}
- Название (en): ${church.name.en || "—"}
- Конфессия: ${church.confessionRaw}
- Исторический адрес: ${church.address || "—"}
- Район: ${church.district || "—"}
- Годы метрических книг: ${church.recordYears || "—"}
- Примечание: ${note || "—"}
- Историческая справка: ${histNote || "—"}
- Текущие координаты в датасете: lat=${church.lat}, lon=${church.lon}
- Текущая уверенность: ${church.confidence}

Кандидаты OpenStreetMap по адресу (могут быть нерелевантны):
${
  candidates.length
    ? candidates
        .map(
          (c, i) =>
            `${i + 1}. ${c.display_name} [${c.class}/${c.type}, lat=${c.lat}, lon=${c.lon}]`,
        )
        .join("\n")
    : "— (Nominatim ничего не нашёл)"
}

Проведи исследование и верни структурированный ответ через инструмент verify_coords.`;

  const tool = {
    type: "function" as const,
    function: {
      name: "verify_coords",
      description:
        "Вернуть проверенные координаты церкви с обоснованием и источниками",
      parameters: {
        type: "object",
        properties: {
          keep_current: {
            type: "boolean",
            description: "true если текущие координаты верны и не нужно менять",
          },
          lat: { type: "number", description: "Итоговая широта (если keep_current — повторить текущую)" },
          lon: { type: "number", description: "Итоговая долгота" },
          confidence: {
            type: "number",
            description: "Уверенность 0..1",
            minimum: 0,
            maximum: 1,
          },
          reasoning: {
            type: "string",
            description: "Краткое объяснение по-русски (1–3 предложения), на чём основано решение",
          },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                title: { type: "string" },
              },
              required: ["url"],
              additionalProperties: false,
            },
          },
        },
        required: ["keep_current", "lat", "lon", "confidence", "reasoning", "sources"],
        additionalProperties: false,
      },
    },
  };

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "verify_coords" } },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI ${res.status}: ${text.slice(0, 1000)}`);
    }
    const data = (await res.json()) as {
      choices?: {
        message?: {
          tool_calls?: { function?: { name?: string; arguments?: string } }[];
        };
      }[];
    };
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = call?.function?.arguments;
    if (!argsRaw) {
      console.error("[aiVerify] no tool_call", JSON.stringify(data).slice(0, 500));
      return null;
    }
    const parsed = JSON.parse(argsRaw) as Partial<AiVerdict>;
    if (
      typeof parsed.lat !== "number" ||
      typeof parsed.lon !== "number" ||
      typeof parsed.confidence !== "number"
    ) {
      return null;
    }
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning || "",
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      keep_current: parsed.keep_current ?? false,
    };
  } catch (e) {
    console.error("[aiVerify]", e);
    return null;
  }
}

async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) {
    console.error("[isAdmin]", error);
    return false;
  }
  return data === true;
}

// ---- Server functions ------------------------------------------------------

const verifyInput = z.object({
  limit: z.number().int().min(1).max(10).default(2),
  offset: z.number().int().min(0).default(0),
  recheck: z.boolean().default(false),
});

export const verifyTbilisiCoords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => verifyInput.parse(data))
  .handler(async ({ data, context }): Promise<VerifyResult> => {
    if (!(await isAdmin(context.userId))) {
      throw new Error("Forbidden: admin role required");
    }

    const churches = tbilisiBundled as TbilisiChurchRow[];
    const candidates = churches.filter((c) => c.confidence !== "high");

    let alreadyVerified = new Set<number>();
    if (!data.recheck) {
      const { data: rows } = await supabaseAdmin
        .from("tbilisi_coord_verifications")
        .select("church_id");
      alreadyVerified = new Set((rows || []).map((r) => r.church_id as number));
    }

    const queue = candidates.filter((c) => !alreadyVerified.has(c.id));
    const slice = queue.slice(data.offset, data.offset + data.limit);
    const remaining = Math.max(0, queue.length - data.offset - slice.length);

    const log: VerifyLogRow[] = [];
    let updated = 0;
    let kept = 0;
    let skipped = 0;
    let errors = 0;

    for (const church of slice) {
      const displayName =
        church.name.ru || church.name.en || church.name.ka || `#${church.id}`;
      try {
        // Nominatim is rate-limited: ~1 req/sec.
        const osm = await geocodeNominatim(church.address || displayName);
        await new Promise((r) => setTimeout(r, 1100));

        const verdict = await aiVerify(church, osm);
        if (!verdict) {
          errors++;
          log.push({
            churchId: church.id,
            name: displayName,
            status: "error",
            oldLat: church.lat,
            oldLon: church.lon,
            note: "AI вернул пустой ответ",
          });
          continue;
        }

        if (!inTbilisi(verdict.lat, verdict.lon)) {
          skipped++;
          log.push({
            churchId: church.id,
            name: displayName,
            status: "skipped",
            oldLat: church.lat,
            oldLon: church.lon,
            newLat: verdict.lat,
            newLon: verdict.lon,
            confidence: verdict.confidence,
            reasoning: verdict.reasoning,
            sources: verdict.sources,
            note: "Координаты вне Тбилиси — отброшены",
          });
          continue;
        }

        const distance = haversineM(
          church.lat,
          church.lon,
          verdict.lat,
          verdict.lon,
        );
        const status: "updated" | "kept" =
          verdict.keep_current || distance < 25 ? "kept" : "updated";

        const { error: upErr } = await supabaseAdmin
          .from("tbilisi_coord_verifications")
          .upsert(
            {
              church_id: church.id,
              old_lat: church.lat,
              old_lon: church.lon,
              new_lat: verdict.lat,
              new_lon: verdict.lon,
              distance_m: distance,
              model_confidence: Math.max(0, Math.min(1, verdict.confidence)),
              reasoning: verdict.reasoning,
              sources: JSON.parse(JSON.stringify(verdict.sources)),
              osm_candidates: JSON.parse(JSON.stringify(osm.slice(0, 5))),
              status: "pending" as const,
              created_by: context.userId,
              reviewed_by: null,
              reviewed_at: null,
            },
            { onConflict: "church_id" },
          );
        if (upErr) throw upErr;

        if (status === "updated") updated++;
        else kept++;

        log.push({
          churchId: church.id,
          name: displayName,
          status,
          oldLat: church.lat,
          oldLon: church.lon,
          newLat: verdict.lat,
          newLon: verdict.lon,
          distanceM: distance,
          confidence: verdict.confidence,
          reasoning: verdict.reasoning,
          sources: verdict.sources,
        });
      } catch (e) {
        errors++;
        log.push({
          churchId: church.id,
          name: displayName,
          status: "error",
          oldLat: church.lat,
          oldLon: church.lon,
          note: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      processed: slice.length,
      updated,
      kept,
      skipped,
      errors,
      remaining,
      log,
    };
  });

export const listTbilisiVerifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) {
      throw new Error("Forbidden: admin role required");
    }
    let q = supabaseAdmin
      .from("tbilisi_coord_verifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;

    const churches = tbilisiBundled as TbilisiChurchRow[];
    const byId = new Map(churches.map((c) => [c.id, c]));
    return (rows || []).map((row) => {
      const ch = byId.get(row.church_id as number);
      return {
        ...row,
        church: ch
          ? {
              id: ch.id,
              name: ch.name,
              address: ch.address,
              district: ch.district,
              confessionRaw: ch.confessionRaw,
              confidence: ch.confidence,
            }
          : null,
      };
    });
  });

export const reviewTbilisiVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject", "reset"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) {
      throw new Error("Forbidden: admin role required");
    }
    const status =
      data.action === "approve"
        ? "approved"
        : data.action === "reject"
          ? "rejected"
          : "pending";
    const { error } = await supabaseAdmin
      .from("tbilisi_coord_verifications")
      .update({
        status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
