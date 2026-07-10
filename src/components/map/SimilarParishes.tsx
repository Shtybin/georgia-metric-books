import type { Lang } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";

type F = GeoJSON.Feature<GeoJSON.Point, any>;

const COPY: Record<Lang, { title: string; empty: string; hint: string }> = {
  ru: {
    title: "Похожие приходы",
    empty: "Похожие приходы не найдены",
    hint: "тот же уезд, пересекающийся период",
  },
  en: {
    title: "Similar parishes",
    empty: "No similar parishes found",
    hint: "same district, overlapping years",
  },
  ka: {
    title: "მსგავსი სამრევლოები",
    empty: "მსგავსი სამრევლოები ვერ მოიძებნა",
    hint: "იგივე მაზრა, გადამფარავი პერიოდი",
  },
};

function nameOf(p: any, key: "settlement" | "church" | "uezd", lang: Lang): string {
  const v = p?.[key];
  if (!v) return "";
  return v[lang] || v.en || v.ru || "";
}

function overlap(aStart?: number, aEnd?: number, bStart?: number, bEnd?: number): number {
  if (!aStart || !aEnd || !bStart || !bEnd) return 0;
  const lo = Math.max(aStart, bStart);
  const hi = Math.min(aEnd, bEnd);
  return Math.max(0, hi - lo);
}

export function SimilarParishes({
  lang,
  selected,
  all,
  onPick,
}: {
  lang: Lang;
  selected: F;
  all: F[];
  onPick: (f: F) => void;
}) {
  const p = selected.properties;
  if (!p) return null;
  const uezdKey = (p.uezd?.en || p.uezd?.ru || "").toString().trim().toLowerCase();
  if (!uezdKey) return null;

  const selStart = Number(p.startYear) || undefined;
  const selEnd = Number(p.endYear) || undefined;

  const scored: Array<{ f: F; score: number }> = [];
  for (const f of all) {
    if (f.id === selected.id) continue;
    const q = f.properties;
    if (!q) continue;
    const qUezd = (q.uezd?.en || q.uezd?.ru || "").toString().trim().toLowerCase();
    if (qUezd !== uezdKey) continue;
    const qStart = Number(q.startYear) || undefined;
    const qEnd = Number(q.endYear) || undefined;
    const ov = overlap(selStart, selEnd, qStart, qEnd);
    // Score: overlap in years (0 if none), +1 if any period at all.
    const score = ov + (qStart && qEnd ? 1 : 0);
    scored.push({ f, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);

  const c = COPY[lang] ?? COPY.ru;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {c.title}
        </div>
        <div className="text-[10px] text-muted-foreground/70">{c.hint}</div>
      </div>
      {top.length === 0 ? (
        <div className="text-xs text-muted-foreground">{c.empty}</div>
      ) : (
        <ul className="space-y-1">
          {top.map(({ f }) => {
            const settlement = nameOf(f.properties, "settlement", lang);
            const church = nameOf(f.properties, "church", lang);
            const churchFirst = church ? church.split("|")[0].trim() : "";
            const start = f.properties?.startYear;
            const end = f.properties?.endYear;
            const period = start && end ? (start === end ? `${start}` : `${start}–${end}`) : "";
            return (
              <li key={String(f.id)}>
                <button
                  type="button"
                  onClick={() => {
                    trackEvent(
                      "map_similar_click",
                      { from: selected.id, to: f.id },
                      lang,
                    );
                    onPick(f);
                  }}
                  className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  <div className="truncate font-medium text-foreground">
                    {settlement || churchFirst || "—"}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {[churchFirst && churchFirst !== settlement ? churchFirst : null, period]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
