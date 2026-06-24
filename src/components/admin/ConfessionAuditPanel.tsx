import { useEffect, useMemo, useState } from "react";
import { CONFESSION_ORDER, CONFESSION_COLORS, TBILISI_STRINGS, type Confession } from "@/lib/i18n-tbilisi";
import { categorizeParish } from "@/lib/confessionRules";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";

type Feat = {
  id: number;
  properties: {
    settlement?: { ru?: string; en?: string };
    uezd?: { ru?: string; en?: string };
    region?: { ru?: string; en?: string };
    church?: { ru?: string; en?: string; ka?: string } | string;
  };
};

type Row = {
  id: number;
  settlement: string;
  uezd: string;
  region: string;
  church: string;
  categories: Confession[];
  isDefaultOnly: boolean;
};

const LABEL = TBILISI_STRINGS.ru.confessions;
const SHORT = TBILISI_STRINGS.ru.confessionsShort;

export function ConfessionAuditPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Confession | "all" | "multi" | "default_only">("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/data/parishes.geojson", { cache: "no-cache" });
      const data = await res.json();
      const out: Row[] = (data.features as Feat[]).map((f) => {
        const p = f.properties || {};
        const cats = categorizeParish(p);
        const ch = typeof p.church === "string" ? p.church : p.church?.ru || p.church?.en || "";
        return {
          id: f.id as number,
          settlement: p.settlement?.ru || p.settlement?.en || "—",
          uezd: p.uezd?.ru || p.uezd?.en || "",
          region: p.region?.ru || p.region?.en || "",
          church: ch || "",
          categories: cats,
          isDefaultOnly: cats.length === 1 && cats[0] === "orthodox_georgian",
        };
      });
      setRows(out);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    if (!rows) return null;
    const total = rows.length;
    const dist = new Map<Confession, number>();
    for (const c of CONFESSION_ORDER) dist.set(c, 0);
    let multi = 0;
    let classified = 0; // any non-default category
    for (const r of rows) {
      if (r.categories.length > 1) multi++;
      if (!r.isDefaultOnly) classified++;
      for (const c of r.categories) dist.set(c, (dist.get(c) || 0) + 1);
    }
    return { total, dist, multi, classified, classifiedPct: total ? (classified * 100) / total : 0 };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [] as Row[];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "multi" && r.categories.length <= 1) return false;
      if (filter === "default_only" && !r.isDefaultOnly) return false;
      if (filter !== "all" && filter !== "multi" && filter !== "default_only" && !r.categories.includes(filter)) return false;
      if (q) {
        const hay = `${r.settlement} ${r.uezd} ${r.region} ${r.church}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  function downloadCsv() {
    if (!rows) return;
    const head = ["id","settlement","uezd","region","categories","church"];
    const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
    const lines = [head.join(",")];
    for (const r of rows) {
      lines.push([r.id, esc(r.settlement), esc(r.uezd), esc(r.region), esc(r.categories.join("|")), esc(r.church)].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "confession-audit.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={"mr-1 h-4 w-4 " + (loading ? "animate-spin" : "")} />
          Перепрогнать
        </Button>
        <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!rows}>
          <Download className="mr-1 h-4 w-4" /> Скачать CSV
        </Button>
        <p className="text-xs text-muted-foreground">
          Категории вычисляются на лету по логике <code>src/lib/confessionRules.ts</code>.
          Чтобы повлиять на классификацию — отредактируйте <code>KEYWORD_RULES</code> или
          <code> AREA_RULES</code> и перезагрузите страницу.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">Ошибка: {error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Загрузка датасета…</p>}

      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Всего точек</div>
            <div className="text-2xl font-semibold tabular-nums">{stats.total.toLocaleString("ru-RU")}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Классифицировано (не только дефолт)</div>
            <div className="text-2xl font-semibold tabular-nums">
              {stats.classified.toLocaleString("ru-RU")}
              <span className="ml-1 text-sm text-muted-foreground">({stats.classifiedPct.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Мульти-конфессиональных</div>
            <div className="text-2xl font-semibold tabular-nums">{stats.multi.toLocaleString("ru-RU")}</div>
          </div>
        </div>
      )}

      {stats && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Распределение по конфессиям
          </div>
          <ul className="space-y-1">
            {CONFESSION_ORDER.map((c) => {
              const n = stats.dist.get(c) || 0;
              const pct = stats.total ? (n / stats.total) * 100 : 0;
              return (
                <li key={c} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white"
                    style={{ backgroundColor: CONFESSION_COLORS[c] }}
                  />
                  <span className="w-44 shrink-0">{LABEL[c]}</span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full"
                      style={{ width: `${pct}%`, backgroundColor: CONFESSION_COLORS[c] }}
                    />
                  </div>
                  <span className="w-20 text-right tabular-nums text-muted-foreground">
                    {n.toLocaleString("ru-RU")} ({pct.toFixed(1)}%)
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value as any); setLimit(100); }}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="all">Все точки</option>
          <option value="multi">Мульти-конфессиональные</option>
          <option value="default_only">Только дефолт (orthodox_georgian)</option>
          <optgroup label="По конфессии">
            {CONFESSION_ORDER.map((c) => (
              <option key={c} value={c}>{LABEL[c]}</option>
            ))}
          </optgroup>
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setLimit(100); }}
          placeholder="Поиск: селение, уезд, церковь…"
          className="min-w-[260px] flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length.toLocaleString("ru-RU")} {filtered.length === rows?.length ? "" : `/ ${rows?.length ?? 0}`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Селение</th>
              <th className="px-3 py-2 text-left">Уезд / регион</th>
              <th className="px-3 py-2 text-left">Конфессии</th>
              <th className="px-3 py-2 text-left">Церкви</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r) => (
              <tr key={r.id} className="border-t border-border/60 align-top">
                <td className="px-3 py-2 font-medium">{r.settlement}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {[r.uezd, r.region].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.categories.map((c) => (
                      <span
                        key={c}
                        title={LABEL[c]}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-1.5 py-0.5 text-[11px]"
                      >
                        <span
                          className="h-2 w-2 rounded-full ring-1 ring-white"
                          style={{ backgroundColor: CONFESSION_COLORS[c] }}
                        />
                        {SHORT[c]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs italic text-muted-foreground">
                  {r.church ? r.church.replace(/\|/g, " · ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > limit && (
          <div className="border-t border-border/60 px-3 py-2 text-center">
            <Button size="sm" variant="ghost" onClick={() => setLimit((n) => n + 200)}>
              Показать ещё ({filtered.length - limit})
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
