import { useEffect, useState } from "react";
import { BUCKET_COLORS, BUCKET_ORDER } from "@/lib/map-style";
import { BarChart3 } from "lucide-react";

interface BucketStats {
  bucket: string;
  count: number;
  pct: number;
}

export function DataQualitySummary() {
  const [stats, setStats] = useState<BucketStats[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/parishes.geojson")
      .then((r) => r.json())
      .then((data) => {
        const counts: Record<string, number> = {};
        let t = 0;
        for (const f of data.features || []) {
          const b = f.properties?.bucket ?? "unknown";
          counts[b] = (counts[b] || 0) + 1;
          t++;
        }
        const arr: BucketStats[] = [];
        for (const b of BUCKET_ORDER) {
          const c = counts[b] || 0;
          arr.push({ bucket: b, count: c, pct: t ? (c / t) * 100 : 0 });
        }
        // catch any unexpected buckets
        const known = new Set(BUCKET_ORDER);
        for (const [b, c] of Object.entries(counts)) {
          if (!known.has(b)) {
            arr.push({ bucket: b, count: c, pct: t ? (c / t) * 100 : 0 });
          }
        }
        setStats(arr);
        setTotal(t);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const maxCount = Math.max(...stats.map((s) => s.count), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Распределение по категориям Start Year</h3>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {loading ? "…" : `всего точек: ${total}`}
        </span>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Загрузка…</p>
      ) : (
        <div className="space-y-2">
          {stats.map((s) => {
            const color = BUCKET_COLORS[s.bucket] || "#888";
            const barPct = (s.count / maxCount) * 100;
            return (
              <div key={s.bucket} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs text-muted-foreground">{s.bucket}</div>
                <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm transition-all"
                    style={{ width: `${barPct}%`, backgroundColor: color }}
                  />
                  <span className="absolute inset-y-0 left-1 z-10 flex items-center text-[11px] font-medium tabular-nums">
                    {s.count}
                  </span>
                </div>
                <div className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {s.pct.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
