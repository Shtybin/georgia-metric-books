import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP_STYLE } from "@/lib/map-style";
import { fetchTbilisiChurches, type TbilisiChurch, TBILISI_YEAR_MIN, TBILISI_YEAR_MAX } from "@/lib/tbilisiChurches";
import {
  CONFESSION_COLORS, CONFESSION_ORDER, tT, TBILISI_BBOX,
  type Confession,
} from "@/lib/i18n-tbilisi";
import type { Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { X, Search, Globe2, ArrowLeft, AlertTriangle, Filter, BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ReportProblemButton } from "@/components/map/ReportProblemButton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { t as tCore } from "@/lib/i18n";

interface Props { lang: Lang; onLangChange: (l: Lang) => void; }

export function TbilisiMap({ lang, onLangChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [rows, setRows] = useState<TbilisiChurch[] | null>(null);
  const [selected, setSelected] = useState<TbilisiChurch | null>(null);
  const [query, setQuery] = useState("");
  const [enabled, setEnabled] = useState<Set<Confession>>(new Set(CONFESSION_ORDER));
  const [yearMin, setYearMin] = useState(TBILISI_YEAR_MIN);
  const [yearMax, setYearMax] = useState(TBILISI_YEAR_MAX);
  const [onlyPreserved, setOnlyPreserved] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const T = tT(lang);
  const Tcore = tCore(lang);

  useEffect(() => { fetchTbilisiChurches().then(setRows); }, []);

  useEffect(() => {
    document.body.dataset.fullscreenMap = "true";
    return () => { delete document.body.dataset.fullscreenMap; };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!enabled.has(r.confession)) return false;
      const sy = r.startYear ?? TBILISI_YEAR_MIN;
      const ey = r.endYear ?? TBILISI_YEAR_MAX;
      if (ey < yearMin || sy > yearMax) return false;
      if (onlyPreserved && r.preserved !== "yes") return false;
      if (onlyActive && r.active !== "yes") return false;
      if (q) {
        const hay = (r.name.ka + " " + r.name.ru + " " + r.name.en + " " + r.address).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, enabled, yearMin, yearMax, onlyPreserved, onlyActive, query]);

  // Build map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [
        (TBILISI_BBOX[0] + TBILISI_BBOX[2]) / 2,
        (TBILISI_BBOX[1] + TBILISI_BBOX[3]) / 2,
      ],
      zoom: 11.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.on("load", () => {
      map.addSource("churches", { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
      const colorExpr: any = ["match", ["get", "confession"],
        ...CONFESSION_ORDER.flatMap((c) => [c, CONFESSION_COLORS[c]]),
        "#888",
      ];
      map.addLayer({
        id: "churches",
        type: "circle",
        source: "churches",
        paint: {
          "circle-color": colorExpr,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 8, 16, 11],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.92,
        },
      });
      map.on("click", "churches", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = (f.properties as any).id as number;
        const row = (rowsRef.current || []).find((r) => r.id === id);
        if (row) setSelected(row);
      });
      map.on("mouseenter", "churches", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "churches", () => { map.getCanvas().style.cursor = ""; });
    });
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  const rowsRef = useRef<TbilisiChurch[] | null>(null);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // Update map data on filter change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("churches") as any;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: filtered.map((r) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [r.lon, r.lat] },
          properties: { id: r.id, confession: r.confession },
        })),
      });
    };
    if (map.isStyleLoaded() && map.getSource("churches")) apply();
    else map.once("idle", apply);
  }, [filtered]);

  const toggleConfession = (c: Confession) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const totalCount = rows?.length ?? 0;

  return (
    <div
      className="relative overflow-hidden bg-background"
      style={{ width: "100%", height: "100dvh" }}
    >
      <div ref={containerRef} className="tbilisi-map absolute inset-0" style={{ position: "absolute", inset: 0 }} />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4">
        <div className="pointer-events-auto flex w-full items-center gap-2 sm:max-w-md">
          <Link
            to="/map"
            search={{ lang }}
            className="shrink-0 rounded-lg border border-border bg-card/95 p-2 text-muted-foreground shadow-lg backdrop-blur hover:bg-accent"
            aria-label={T.backToMap}
            title={T.backToMap}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={T.search}
              className="w-full rounded-lg border border-border bg-card/95 py-2 pl-8 pr-8 text-sm shadow-lg backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="shrink-0 rounded-lg border border-border bg-card/95 p-2 text-foreground shadow-lg backdrop-blur hover:bg-accent lg:hidden"
            aria-label={T.showFilters}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>

        <div className="pointer-events-auto flex w-auto self-end items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur sm:self-auto">
          <Globe2 className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
          {(["ru", "en", "ka"] as const).map((l) => (
            <button
              key={l}
              onClick={() => onLangChange(l)}
              className={
                "rounded px-2 py-1 text-xs uppercase " +
                (lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")
              }
            >
              {l === "ka" ? "ქა" : l}
            </button>
          ))}
        </div>
      </div>

      {/* Filters panel (sidebar on desktop, drawer on mobile) */}
      <div
        className={
          "pointer-events-auto absolute z-20 flex flex-col gap-2 rounded-xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur lg:gap-3 lg:p-3 " +
          "left-3 right-3 top-[7.5rem] bottom-16 overflow-auto sm:left-auto sm:right-4 sm:top-20 sm:w-72 sm:bottom-16 lg:w-80 lg:bottom-20 lg:flex " +
          (filtersOpen ? "flex" : "hidden lg:flex")
        }
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-serif text-sm font-semibold">{T.legendTitle}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setEnabled((prev) =>
                  prev.size === CONFESSION_ORDER.length ? new Set() : new Set(CONFESSION_ORDER)
                )
              }
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
            >
              {enabled.size === CONFESSION_ORDER.length ? T.hideAll : T.showAll}
            </button>
            <span className="text-xs text-muted-foreground">{T.foundCount(filtered.length, totalCount)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CONFESSION_ORDER.map((c) => {
            const on = enabled.has(c);
            const count = (rows || []).filter((r) => r.confession === c).length;
            if (count === 0) return null;
            return (
              <button
                key={c}
                onClick={() => toggleConfession(c)}
                className={
                  "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition " +
                  (on ? "border-border bg-background" : "border-border/40 bg-muted/40 opacity-50")
                }
                title={T.confessions[c]}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CONFESSION_COLORS[c] }} />
                <span className="max-w-[160px] truncate">{T.confessions[c]}</span>
                <span className="text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>

        <div>
          <label className="text-xs font-medium">{T.yearRange}: {yearMin}–{yearMax}</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <input
              type="range" min={TBILISI_YEAR_MIN} max={TBILISI_YEAR_MAX}
              value={yearMin}
              onChange={(e) => setYearMin(Math.min(Number(e.target.value), yearMax))}
              className="w-full"
              aria-label="Min year"
            />
            <input
              type="range" min={TBILISI_YEAR_MIN} max={TBILISI_YEAR_MAX}
              value={yearMax}
              onChange={(e) => setYearMax(Math.max(Number(e.target.value), yearMin))}
              className="w-full"
              aria-label="Max year"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyPreserved} onChange={(e) => setOnlyPreserved(e.target.checked)} />
            {T.onlyPreserved}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            {T.onlyActive}
          </label>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm" variant="outline" className="flex-1"
            onClick={() => {
              setEnabled(new Set(CONFESSION_ORDER));
              setYearMin(TBILISI_YEAR_MIN); setYearMax(TBILISI_YEAR_MAX);
              setOnlyPreserved(false); setOnlyActive(false); setQuery("");
            }}
          >{T.reset}</Button>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-2 p-3 sm:p-4">
        <button
          onClick={() => setDocsOpen(true)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur hover:bg-accent"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {T.archiveButton}
        </button>
        <div className="pointer-events-auto">
          <ReportProblemButton
            lang={lang}
            getMapState={() => {
              const m = mapRef.current; if (!m) return null;
              const c = m.getCenter();
              return { lat: c.lat, lon: c.lng, zoom: m.getZoom() };
            }}
          />
        </div>
      </div>

      {/* Selected church card */}
      {selected && (
        <div className="pointer-events-auto absolute bottom-16 left-1/2 z-30 w-[min(420px,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-border bg-card p-4 shadow-2xl sm:bottom-20">
          <div className="flex items-start gap-3">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-background"
              style={{ background: CONFESSION_COLORS[selected.confession] }}
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-base font-semibold leading-tight">{selected.name[lang]}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{T.confessions[selected.confession]}</p>
            </div>
            <button onClick={() => setSelected(null)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {T.confidenceWarn[selected.confidence] && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{T.confidenceWarn[selected.confidence]}</span>
            </div>
          )}

          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            {selected.address && (<><dt className="text-muted-foreground">{T.fields.address}</dt><dd>{selected.address}</dd></>)}
            {selected.district && (<><dt className="text-muted-foreground">{T.fields.district}</dt><dd>{selected.district}</dd></>)}
            <dt className="text-muted-foreground">{T.fields.recordYears}</dt><dd>{selected.recordYears || "—"}</dd>
            {selected.missingYears && (<><dt className="text-muted-foreground">{T.fields.missingYears}</dt><dd>{selected.missingYears}</dd></>)}
            <dt className="text-muted-foreground">{T.fields.preserved}</dt><dd>{T.yesNo[selected.preserved]}</dd>
            <dt className="text-muted-foreground">{T.fields.active}</dt><dd>{T.yesNo[selected.active]}</dd>
            {selected.note && (<><dt className="text-muted-foreground">{T.fields.note}</dt><dd>{selected.note}</dd></>)}
            {selected.historicalNote && (<><dt className="text-muted-foreground">{T.fields.historicalNote}</dt><dd>{selected.historicalNote}</dd></>)}
          </dl>
        </div>
      )}

      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{Tcore.docsTitle}</DialogTitle>
            <DialogDescription asChild>
              <div className="prose prose-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: Tcore.docsBodyHtml }} />
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
