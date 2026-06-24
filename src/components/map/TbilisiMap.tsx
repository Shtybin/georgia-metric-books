import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Popup, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP_STYLE, attachBasemapFallback, collapseAttribution } from "@/lib/map-style";
import { MapAuthorBadge, MapHomeButton } from "@/components/AuthorCredit";
import { DonateButton } from "@/components/DonateButton";
import {
  fetchTbilisiChurches,
  type TbilisiChurch,
  TBILISI_YEAR_MIN,
  TBILISI_YEAR_MAX,
} from "@/lib/tbilisiChurches";
import {
  CONFESSION_COLORS,
  CONFESSION_ORDER,
  tT,
  TBILISI_BBOX,
  type Confession,
} from "@/lib/i18n-tbilisi";
import {
  DISTRICTS_1898_URL,
  HISTORICAL_MAPS,
  type District1898Properties,
  type HistoricalConfig,
} from "@/lib/tbilisi-historical";
import type { Lang } from "@/lib/i18n";

/** Доступные исторические подложки (только с привязанными тайлами). */
const TILE_MAPS = HISTORICAL_MAPS.filter(
  (m): m is typeof m & { config: Extract<HistoricalConfig, { kind: "tiles" }> } =>
    !!m.config && m.config.kind === "tiles",
);
const DEFAULT_HIST_ID = TILE_MAPS[0]?.id ?? "1898";


import { localizeAddress, localizeDistrict } from "@/lib/tbilisi-locations";
import { Button } from "@/components/ui/button";
import { X, Search, Globe2, ArrowLeft, AlertTriangle, Filter, BookOpen, Layers, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ReportProblemButton } from "@/components/map/ReportProblemButton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { t as tCore } from "@/lib/i18n";

interface Props {
  lang: Lang;
  onLangChange: (l: Lang) => void;
  historicalOn?: boolean;
  historicalOpacity?: number;
  districtsOn?: boolean;
  historicalMapId?: string;
  onHistoricalChange?: (h: boolean, o: number, d: boolean) => void;
  onHistoricalMapChange?: (id: string) => void;
}


type ChurchFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { id: number; confession: Confession }
>;

function churchFeatureCollection(rows: TbilisiChurch[]): ChurchFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows
      .filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat))
      .map((r) => ({
        type: "Feature" as const,
        geometry: { type: "Point", coordinates: [r.lon, r.lat] },
        properties: { id: r.id, confession: r.confession },
      })),
  };
}

type DistrictsFC = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  District1898Properties
>;

/** Ray-casting point-in-polygon. Returns true if [lon,lat] is inside any ring of feature. */
function pointInRing(point: [number, number], ring: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInPolygon(point: [number, number], coords: GeoJSON.Polygon["coordinates"]): boolean {
  if (!coords.length) return false;
  if (!pointInRing(point, coords[0])) return false;
  for (let i = 1; i < coords.length; i++) if (pointInRing(point, coords[i])) return false;
  return true;
}
function findDistrictFor(
  lon: number,
  lat: number,
  fc: DistrictsFC | null,
): District1898Properties | null {
  if (!fc) return null;
  const p: [number, number] = [lon, lat];
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === "Polygon" && pointInPolygon(p, g.coordinates)) return f.properties;
    if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates) if (pointInPolygon(p, poly)) return f.properties;
    }
  }
  return null;
}

export function TbilisiMap({
  lang,
  onLangChange,
  historicalOn = false,
  historicalOpacity = 60,
  districtsOn = true,
  historicalMapId = DEFAULT_HIST_ID,
  onHistoricalChange,
  onHistoricalMapChange,
}: Props) {
  const activeHistMap = useMemo(
    () => TILE_MAPS.find((m) => m.id === historicalMapId) ?? TILE_MAPS[0] ?? null,
    [historicalMapId],
  );
  const activeHistYear: number | null = activeHistMap?.year ?? null;
  const hasAnyHistMap = TILE_MAPS.length > 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const rowsRef = useRef<TbilisiChurch[] | null>(null);
  const filteredRef = useRef<TbilisiChurch[]>([]);
  const [rows, setRows] = useState<TbilisiChurch[] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<TbilisiChurch | null>(null);
  const [query, setQuery] = useState("");
  const [enabled, setEnabled] = useState<Set<Confession>>(new Set(CONFESSION_ORDER));
  const [yearMin, setYearMin] = useState(TBILISI_YEAR_MIN);
  const [yearMax, setYearMax] = useState(TBILISI_YEAR_MAX);
  const [onlyPreserved, setOnlyPreserved] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  /** Раскрыта ли сама палитра конфессий внутри легенды.
   *  На мобильных свёрнута по умолчанию, чтобы освободить карту. */
  const [legendOpen, setLegendOpen] = useState(() =>
    typeof window === "undefined" || !window.matchMedia("(max-width: 639px)").matches,
  );
  /** Раскрыта ли панель «Историческая карта» на мобильном/планшете. */
  const [histPanelOpen, setHistPanelOpen] = useState(false);
  const [districts, setDistricts] = useState<DistrictsFC | null>(null);
  const T = tT(lang);
  const Tcore = tCore(lang);

  useEffect(() => {
    fetchTbilisiChurches().then(setRows);
  }, []);

  // Load district polygons (silently no-op on 404 / empty)
  useEffect(() => {
    fetch(DISTRICTS_1898_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.type === "FeatureCollection" && Array.isArray(d.features) && d.features.length) {
          setDistricts(d as DistrictsFC);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.body.dataset.fullscreenMap = "true";
    return () => {
      delete document.body.dataset.fullscreenMap;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!enabled.has(r.confession)) return false;
      const sy = r.startYear ?? TBILISI_YEAR_MIN;
      const ey = r.endYear ?? TBILISI_YEAR_MAX;
      if (ey < yearMin || sy > yearMax) return false;
      // Скрываем церкви, которых ещё не существовало на момент создания
      // исторической карты (например, для слоя 1898 г. — все startYear > 1898).
      if (
        historicalOn &&
        activeHistYear != null &&
        r.startYear != null &&
        r.startYear > activeHistYear
      )
        return false;
      if (onlyPreserved && r.preserved !== "yes") return false;
      if (onlyActive && r.active !== "yes") return false;
      if (q) {
        const hay = (r.name.ka + " " + r.name.ru + " " + r.name.en + " " + r.address).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, enabled, yearMin, yearMax, onlyPreserved, onlyActive, query, historicalOn, activeHistYear]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    filteredRef.current = filtered;
  }, [filtered]);

  // Build map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [(TBILISI_BBOX[0] + TBILISI_BBOX[2]) / 2, (TBILISI_BBOX[1] + TBILISI_BBOX[3]) / 2],
      zoom: 11.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    attachBasemapFallback(map);
    collapseAttribution(map);

    map.on("load", () => {
      // Регистрируем все доступные исторические подложки сразу.
      // Видимостью и opacity управляет реактивный effect ниже.
      for (const m of TILE_MAPS) {
        const srcId = `hist-${m.id}`;
        const cfg = m.config;
        map.addSource(srcId, {
          type: "raster",
          tiles: [cfg.tiles],
          tileSize: 256,
          minzoom: cfg.minzoom ?? 10,
          maxzoom: cfg.maxzoom ?? 18,
          attribution: cfg.attribution ?? `Карта Тифлиса, ${m.year ?? ""} г.`,
        });
        const isActive = historicalOn && m.id === historicalMapId;
        map.addLayer({
          id: srcId,
          type: "raster",
          source: srcId,
          layout: { visibility: isActive ? "visible" : "none" },
          paint: { "raster-opacity": Math.max(0, Math.min(1, historicalOpacity / 100)) },
        });
      }

      // District polygons (1898). Source is added empty, populated when geojson loads.
      map.addSource("districts-1898", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] } as DistrictsFC,
      });
      map.addLayer({
        id: "districts-1898-fill",
        type: "fill",
        source: "districts-1898",
        layout: { visibility: districtsOn ? "visible" : "none" },
        paint: { "fill-color": "#b45309", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "districts-1898-line",
        type: "line",
        source: "districts-1898",
        layout: { visibility: districtsOn ? "visible" : "none" },
        paint: {
          "line-color": "#92400e",
          "line-width": 2,
          "line-dasharray": [3, 2],
          "line-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "districts-1898-label",
        type: "symbol",
        source: "districts-1898",
        layout: {
          visibility: districtsOn ? "visible" : "none",
          "text-field": ["coalesce", ["get", "name_latin"], ["get", "name_ru"]],
          "text-size": 12,
          "text-font": ["Noto Sans Regular"],
          "text-letter-spacing": 0.08,
          "text-transform": "uppercase",
        },
        paint: {
          "text-color": "#78350f",
          "text-halo-color": "#fef3c7",
          "text-halo-width": 1.5,
        },
      });

      map.addSource("churches", {
        type: "geojson",
        data: churchFeatureCollection([]),
      });
      const colorExpr = [
        "match",
        ["get", "confession"],
        ...CONFESSION_ORDER.flatMap((c) => [c, CONFESSION_COLORS[c]]),
        "#888",
      ] as unknown as string;
      map.addLayer({
        id: "churches",
        type: "circle",
        source: "churches",
        paint: {
          "circle-color": colorExpr,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 8, 16, 11],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.6,
        },
      });

      // Подсветка выбранной церкви: halo + точка поверх остальных,
      // оформление синхронизировано с основной картой (MapView).
      map.addSource("selected", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection,
      });
      map.addLayer({
        id: "selected-halo",
        type: "circle",
        source: "selected",
        paint: {
          "circle-color": "transparent",
          "circle-radius": 22,
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "selected-point",
        type: "circle",
        source: "selected",
        paint: {
          "circle-color": colorExpr,
          "circle-radius": 9,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
      map.on("click", "churches", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = Number((f.properties as { id?: number | string }).id);
        const row = (rowsRef.current || []).find((r) => r.id === id);
        if (row) setSelected(row);
      });
      map.on("mouseenter", "churches", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "churches", () => {
        map.getCanvas().style.cursor = "";
      });
      setMapReady(true);
    });
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map data on filter change (only after map source is ready)
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("churches") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData(churchFeatureCollection(filtered));
  }, [filtered, mapReady]);

  // Update selected-church highlight source when selection changes.

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("selected") as GeoJSONSource | undefined;
    if (!src) return;
    if (!selected) {
      src.setData({ type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection);
      return;
    }
    const feature: GeoJSON.Feature<GeoJSON.Point, { id: number; confession: Confession }> = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [selected.lon, selected.lat] },
      properties: { id: selected.id, confession: selected.confession },
    };
    src.setData({ type: "FeatureCollection", features: [feature] } as GeoJSON.FeatureCollection);
  }, [selected, mapReady]);


  // Push districts data when loaded
  useEffect(() => {
    if (!mapReady || !districts) return;
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("districts-1898") as GeoJSONSource | undefined;
    if (src) src.setData(districts as unknown as GeoJSON.FeatureCollection);
  }, [districts, mapReady]);

  // Historical raster: visibility + opacity reactive to props.
  // Активным может быть только один слой; остальные скрываются.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    for (const m of TILE_MAPS) {
      const id = `hist-${m.id}`;
      if (!map.getLayer(id)) continue;
      const isActive = historicalOn && m.id === historicalMapId;
      map.setLayoutProperty(id, "visibility", isActive ? "visible" : "none");
      if (isActive) {
        map.setPaintProperty(
          id,
          "raster-opacity",
          Math.max(0, Math.min(1, historicalOpacity / 100)),
        );
      }
    }
  }, [historicalOn, historicalOpacity, historicalMapId, mapReady]);

  // District polygons: visibility reactive
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    for (const id of ["districts-1898-fill", "districts-1898-line", "districts-1898-label"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", districtsOn ? "visible" : "none");
      }
    }
  }, [districtsOn, mapReady]);

  const selectedDistrict = useMemo(
    () => (selected ? findDistrictFor(selected.lon, selected.lat, districts) : null),
    [selected, districts],
  );

  const toggleConfession = (c: Confession, additive = false) => {
    setEnabled((prev) => {
      if (additive) {
        // Shift+клик — мульти-выбор: добавить/убрать категорию из набора.
        const next = new Set(prev);
        if (next.has(c)) next.delete(c); else next.add(c);
        if (next.size === 0) return new Set(CONFESSION_ORDER);
        return next;
      }
      // Клик — изолировать. Повторный клик по уже изолированной — восстановить всё.
      if (prev.size === 1 && prev.has(c)) return new Set(CONFESSION_ORDER);
      return new Set([c]);
    });
  };

  const totalCount = rows?.length ?? 0;

  return (
    <div
      className="relative overflow-hidden bg-background"
      style={{ width: "100%", height: "100dvh" }}
    >
      <div
        ref={containerRef}
        className="tbilisi-map absolute inset-0"
        style={{ position: "absolute", inset: 0 }}
      />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4">
        <div className="pointer-events-auto flex w-full items-center gap-2 sm:max-w-md">
          <MapHomeButton lang={lang} />
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
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear"
              >
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

        <div className="pointer-events-auto hidden w-auto items-center gap-2 self-end sm:flex sm:self-auto">
          <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
            <Globe2 className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
            {(["ru", "en", "ka"] as const).map((l) => (
              <button
                key={l}
                onClick={() => onLangChange(l)}
                className={
                  "rounded px-2 py-1 text-xs uppercase " +
                  (lang === l
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent")
                }
              >
                {l === "ka" ? "ქა" : l}
              </button>
            ))}
          </div>
          {/* Report button next to language switcher on tablet+ */}
          <div className="hidden sm:block">
            <ReportProblemButton
              lang={lang}
              getMapState={() => {
                const m = mapRef.current;
                if (!m) return null;
                const c = m.getCenter();
                return { lat: c.lat, lon: c.lng, zoom: m.getZoom() };
              }}
              inline
            />
          </div>
          <div className="hidden sm:block">
            <DonateButton lang={lang} variant="compact" />
          </div>
        </div>
      </div>

      {/* Mobile-only language switcher: below legend, left-aligned */}
      <div className="pointer-events-auto absolute left-3 top-[11.5rem] z-20 sm:hidden">
        <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
          <Globe2 className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
          {(["ru", "en", "ka"] as const).map((l) => (
            <button
              key={l}
              onClick={() => onLangChange(l)}
              className={
                "rounded px-2 py-1 text-xs uppercase " +
                (lang === l
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent")
              }
            >
              {l === "ka" ? "ქა" : l}
            </button>
          ))}
        </div>
      </div>

      {/* Filters panel: horizontal compact strip on mobile/tablet, sidebar on desktop */}
      <div
        className={
          "pointer-events-auto absolute z-20 flex-col rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur " +
          "left-3 right-3 top-[3.25rem] max-h-[7.5rem] gap-1.5 overflow-auto p-2 " +
          "sm:left-3 sm:right-3 sm:top-[4.75rem] sm:max-h-[7rem] sm:w-auto sm:p-2 " +
          "lg:left-auto lg:right-4 lg:top-20 lg:w-80 lg:max-h-none lg:gap-3 lg:bottom-20 lg:p-3 " +
          "flex"
        }
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            aria-expanded={legendOpen}
            className="flex items-center gap-1 text-left"
            title={legendOpen ? Tcore.collapseLegend : Tcore.expandLegend}
          >
            {legendOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            <h2 className="font-serif text-xs font-semibold sm:text-sm">{T.legendTitle}</h2>
          </button>
          <div className="flex items-center gap-2">
            {legendOpen && (
              <button
                onClick={() =>
                  setEnabled((prev) =>
                    prev.size === CONFESSION_ORDER.length ? new Set() : new Set(CONFESSION_ORDER),
                  )
                }
                className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
              >
                {enabled.size === CONFESSION_ORDER.length ? T.hideAll : T.showAll}
              </button>
            )}
            <span className="text-xs text-muted-foreground">
              {T.foundCount(filtered.length, totalCount)}
            </span>
          </div>
        </div>
        {legendOpen && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {CONFESSION_ORDER.map((c) => {
                const on = enabled.has(c);
                const count = (rows || []).filter((r) => r.confession === c).length;
                if (count === 0) return null;
                return (
                  <button
                    key={c}
                    onClick={(e) => toggleConfession(c, e.shiftKey)}
                    className={
                      "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition " +
                      (on ? "border-border bg-background" : "border-border/40 bg-muted/40 opacity-50")
                    }
                    title={T.confessions[c]}
                    aria-label={T.confessions[c]}
                    aria-pressed={on}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: CONFESSION_COLORS[c] }}
                    />
                    <span className="max-w-[120px] truncate lg:hidden">{T.confessionsShort[c]}</span>
                    <span className="hidden max-w-[160px] truncate lg:inline">{T.confessions[c]}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] leading-tight text-muted-foreground">
              {Tcore.multiSelectHint}
            </p>
          </>
        )}

        <div className="hidden lg:block">
          <label className="text-xs font-medium">
            {T.yearRange}: {yearMin}–{yearMax}
          </label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <input
              type="range"
              min={TBILISI_YEAR_MIN}
              max={TBILISI_YEAR_MAX}
              value={yearMin}
              onChange={(e) => setYearMin(Math.min(Number(e.target.value), yearMax))}
              className="w-full"
              aria-label="Min year"
            />
            <input
              type="range"
              min={TBILISI_YEAR_MIN}
              max={TBILISI_YEAR_MAX}
              value={yearMax}
              onChange={(e) => setYearMax(Math.max(Number(e.target.value), yearMin))}
              className="w-full"
              aria-label="Max year"
            />
          </div>
        </div>

        <div className="hidden flex-col gap-1.5 text-xs lg:flex">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={onlyPreserved}
              onChange={(e) => setOnlyPreserved(e.target.checked)}
            />
            {T.onlyPreserved}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
            />
            {T.onlyActive}
          </label>
        </div>

        <div className="hidden gap-2 lg:flex">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => {
              setEnabled(new Set(CONFESSION_ORDER));
              setYearMin(TBILISI_YEAR_MIN);
              setYearMax(TBILISI_YEAR_MAX);
              setOnlyPreserved(false);
              setOnlyActive(false);
              setQuery("");
            }}
          >
            {T.reset}
          </Button>
        </div>
      </div>


      {/* Историческая подложка.
          Desktop (lg+): панель закреплена в левом нижнем углу.
          Tablet (sm…lg) и Mobile (<sm): компактная пилюля «Слои», по тапу
          раскрывается панель ровно над кнопкой.
          Выбор «Без старой карты» полностью выключает растровый слой. */}
      {(hasAnyHistMap || districts) && (
        <div className="pointer-events-none absolute bottom-14 left-3 z-30 sm:bottom-4 sm:left-4">
          {/* Кнопка-триггер: видна на <lg; на lg+ скрыта (панель всегда раскрыта). */}
          <button
            type="button"
            onClick={() => setHistPanelOpen((v) => !v)}
            aria-expanded={histPanelOpen}
            aria-pressed={historicalOn}
            className={
              "pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition-colors lg:hidden " +
              (historicalOn
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card/95 text-foreground hover:bg-accent")
            }
            title={T.historical.title}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>
              {historicalOn && activeHistMap
                ? `${activeHistMap.year ?? activeHistMap.title}`
                : T.historical.toggle}
            </span>
          </button>

          {/* Сама панель — на lg+ всегда видна, на <lg — только при histPanelOpen. */}
          <div
            className={
              "pointer-events-auto mb-2 w-[16rem] rounded-xl border border-border bg-card/95 p-2.5 shadow-xl backdrop-blur lg:mb-0 lg:block " +
              (histPanelOpen ? "block" : "hidden")
            }
            style={{ position: "absolute", bottom: "100%", left: 0 }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <h2 className="font-serif text-xs font-semibold">{T.historical.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setHistPanelOpen(false)}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
                aria-label="Закрыть"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {hasAnyHistMap && (
              <>
                <label className="block text-[11px] text-muted-foreground">Подложка</label>
                <select
                  value={historicalOn ? historicalMapId : "none"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "none") {
                      onHistoricalChange?.(false, historicalOpacity, districtsOn);
                    } else {
                      onHistoricalMapChange?.(v);
                      onHistoricalChange?.(true, historicalOpacity, districtsOn);
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="none">Без старой карты</option>
                  {TILE_MAPS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>

                {historicalOn && (
                  <div className="mt-2">
                    <label className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{T.historical.opacity}</span>
                      <span>{historicalOpacity}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={historicalOpacity}
                      onChange={(e) =>
                        onHistoricalChange?.(historicalOn, Number(e.target.value), districtsOn)
                      }
                      className="w-full"
                    />
                  </div>
                )}
              </>
            )}

            {districts && (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={districtsOn}
                  onChange={(e) =>
                    onHistoricalChange?.(historicalOn, historicalOpacity, e.target.checked)
                  }
                />
                {T.historical.districts}
              </label>
            )}
          </div>
        </div>
      )}



      {/* Bottom action bar.
          Mobile (<sm): single row at bottom — docs + author (©year) + 1898 toggle.
          Tablet/desktop (sm+): docs button centered, author badge below (extra pb so they don't collide). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-start gap-2 p-3 sm:items-center sm:p-4 sm:pb-16">
        {/* Mobile: compact row, justify-between so docs+author left, 1898 toggle right. */}
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:hidden">
          <button
            onClick={() => setDocsOpen(true)}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-2.5 py-1 text-[11px] font-medium shadow-md backdrop-blur hover:bg-accent"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {T.archiveButtonShort}
          </button>
          <MapAuthorBadge lang={lang} inline />
          <DonateButton lang={lang} variant="inline" />
        </div>
        {/* Tablet/desktop: centered docs button (full label). */}
        <button
          onClick={() => setDocsOpen(true)}
          className="pointer-events-auto hidden items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur hover:bg-accent sm:inline-flex"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {T.archiveButton}
        </button>
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
              <h3 className="font-serif text-base font-semibold leading-tight">
                {selected.name[lang]}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {T.confessions[selected.confession]}
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
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
            {selected.address && (
              <>
                <dt className="text-muted-foreground">{T.fields.address}</dt>
                <dd>{localizeAddress(selected.address, lang)}</dd>
              </>
            )}
            {/* Modern admin district (e.g. "Isani") intentionally hidden —
                the address field already carries the historical quarter
                (e.g. "Avlabari"), and showing both confused users. */}
            <dt className="text-muted-foreground">{T.fields.recordYears}</dt>
            <dd>{selected.recordYears || "—"}</dd>
            {selected.recordsByType && Object.keys(selected.recordsByType).length > 0 && (
              <>
                <dt className="text-muted-foreground">{T.fields.recordsByType}</dt>
                <dd>
                  <ul className="space-y-0.5">
                    {(["birth", "marriage", "death"] as const).map((k) =>
                      selected.recordsByType?.[k] ? (
                        <li key={k}>
                          <span className="text-muted-foreground">{T.recordType[k]}:</span>{" "}
                          {selected.recordsByType[k]}
                        </li>
                      ) : null,
                    )}
                  </ul>
                </dd>
              </>
            )}
            {selected.missingYears && (
              <>
                <dt className="text-muted-foreground">{T.fields.missingYears}</dt>
                <dd>{selected.missingYears}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{T.fields.preserved}</dt>
            <dd>{T.yesNo[selected.preserved]}</dd>
            <dt className="text-muted-foreground">{T.fields.active}</dt>
            <dd>{T.yesNo[selected.active]}</dd>
            {(() => {
              const noteText =
                typeof selected.note === "string"
                  ? selected.note
                  : selected.note?.[lang] || selected.note?.ru || "";
              return noteText ? (
                <>
                  <dt className="text-muted-foreground">{T.fields.note}</dt>
                  <dd>{noteText}</dd>
                </>
              ) : null;
            })()}
            {(() => {
              const histText =
                typeof selected.historicalNote === "string"
                  ? selected.historicalNote
                  : selected.historicalNote?.[lang] || selected.historicalNote?.ru || "";
              return histText ? (
                <>
                  <dt className="text-muted-foreground">{T.fields.historicalNote}</dt>
                  <dd>{histText}</dd>
                </>
              ) : null;
            })()}
            {selectedDistrict && (
              <>
                <dt className="text-muted-foreground">{T.historical.districtField}</dt>
                <dd>
                  {selectedDistrict[`name_${lang}` as "name_ru" | "name_en" | "name_ka"] ||
                    selectedDistrict.name_latin}
                </dd>
              </>
            )}
          </dl>
          {selected.archiveUrl && (
            <div className="mt-3 text-xs">
              <a
                href={selected.archiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                {T.fields.archiveLink}
                {selected.archiveRows?.length
                  ? ` (${selected.archiveRows.map((r) => `№${r.n}`).join(", ")})`
                  : ""}
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          )}
        </div>
      )}

      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{T.archiveButton}</DialogTitle>
            <DialogDescription asChild>
              <div
                className="prose prose-sm dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: T.archiveBodyHtml }}
              />
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <MapAuthorBadge lang={lang} />
    </div>
  );
}
