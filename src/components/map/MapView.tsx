import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Fuse from "fuse.js";
import { Search, X, Globe2, MapPin, Info } from "lucide-react";
import { Lang, t, compactYears } from "@/lib/i18n";
import {
  BASEMAP_STYLE,
  BUCKET_COLORS,
  BUCKET_ORDER,
  colorExpression,
  radiusExpression,
} from "@/lib/map-style";
import { circlePolygon, neighborsWithin } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Feature = GeoJSON.Feature<GeoJSON.Point, any>;
type FC = GeoJSON.FeatureCollection<GeoJSON.Point, any>;

interface Stats {
  total: number;
  withCoords: number;
  withoutCoords: number;
  geocodingConfidence: number;
}

interface Props {
  lang: Lang;
  onLangChange: (l: Lang) => void;
  embed?: boolean;
}

export function MapView({ lang, onLangChange, embed }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [data, setData] = useState<FC | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Feature | null>(null);
  const [neighborIds, setNeighborIds] = useState<Set<number>>(new Set());
  const [enabledBuckets, setEnabledBuckets] = useState<Set<string>>(
    new Set(BUCKET_ORDER),
  );
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const T = t(lang);

  // Load data once
  useEffect(() => {
    fetch("/data/parishes.geojson").then(r => r.json()).then(setData);
    fetch("/data/stats.json").then(r => r.json()).then(setStats);
  }, []);

  // Fuse index across both languages
  const fuse = useMemo(() => {
    if (!data) return null;
    return new Fuse(data.features, {
      keys: [
        "properties.settlement.ru", "properties.settlement.en",
        "properties.church.ru", "properties.church.en",
        "properties.uezd.ru", "properties.uezd.en",
        "properties.region.ru", "properties.region.en",
      ],
      threshold: 0.35,
      minMatchCharLength: 2,
      includeScore: true,
    });
  }, [data]);

  const searchResults = useMemo(() => {
    if (!fuse || query.trim().length < 2) return [];
    return fuse.search(query.trim()).slice(0, 8).map(r => r.item as Feature);
  }, [fuse, query]);

  const points = useMemo(() => {
    if (!data) return [];
    return data.features.map(f => ({
      id: f.id as number,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
  }, [data]);

  const styleLoadedRef = useRef(false);

  // Effect A: create map once on mount, independent of data
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [43.5, 42.0],
      zoom: 6.4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("error", (e) => {
      // surface MapLibre errors instead of leaving a white canvas
      // eslint-disable-next-line no-console
      console.error("[maplibre]", e.error || e);
    });
    map.on("load", () => {
      styleLoadedRef.current = true;
      // Selected halo / radius sources are independent of parishes data — add them now.
      if (!map.getSource("selected")) {
        map.addSource("selected", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] } as any,
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
            "circle-color": colorExpression,
            "circle-radius": 9,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2,
          },
        });
      }
      if (!map.getSource("radius")) {
        map.addSource("radius", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] } as any,
        });
        map.addLayer({
          id: "radius-fill",
          type: "fill",
          source: "radius",
          paint: { "fill-color": "#0072B2", "fill-opacity": 0.06 },
        });
        map.addLayer({
          id: "radius-line",
          type: "line",
          source: "radius",
          paint: {
            "line-color": "#0072B2",
            "line-width": 1.5,
            "line-dasharray": [2, 2],
          },
        });
      }
      // Trigger data effect by bumping a render
      setStyleReady(true);
    });

    mapRef.current = map;

    // Resize observer guards against 0×0 init / late layout (SSR hydration, HMR)
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
  }, []);

  const [styleReady, setStyleReady] = useState(false);

  // Effect B: attach parishes source/layers once both style and data are ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !data) return;
    if (map.getSource("parishes")) {
      (map.getSource("parishes") as any).setData(data);
      return;
    }

    map.addSource("parishes", {
      type: "geojson",
      data: data as any,
      promoteId: "id",
      cluster: true,
      clusterRadius: 45,
      clusterMaxZoom: 9,
    });

    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "parishes",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#475569",
        "circle-opacity": 0.85,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
        "circle-radius": [
          "step", ["get", "point_count"],
          14, 10, 18, 50, 24, 200, 30,
        ],
      },
    }, map.getLayer("radius-fill") ? "radius-fill" : undefined);
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "parishes",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12,
        "text-font": ["Noto Sans Regular"],
      },
      paint: { "text-color": "#fff" },
    });
    map.addLayer({
      id: "points",
      type: "circle",
      source: "parishes",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": colorExpression,
        "circle-radius": radiusExpression,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-opacity": [
          "case",
          ["boolean", ["feature-state", "dimmed"], false], 0.18,
          0.95,
        ],
      },
    });

    map.on("click", "points", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const [lon, lat] = (f.geometry as any).coordinates as [number, number];
      const orig =
        data.features.find((x) => (x.id as number) === (f.id as number)) ??
        data.features.find((x) => {
          const [xlon, xlat] = x.geometry.coordinates;
          return Math.abs(xlon - lon) < 1e-6 && Math.abs(xlat - lat) < 1e-6;
        });
      if (orig) selectFeature(orig);
    });
    map.on("click", "clusters", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const clusterId = (f.properties as any).cluster_id;
      const src = map.getSource("parishes") as any;
      src.getClusterExpansionZoom(clusterId).then((zoom: number) => {
        map.easeTo({ center: (f.geometry as any).coordinates, zoom });
      });
    });
    map.on("mouseenter", "points", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "points", () => { map.getCanvas().style.cursor = ""; });
  }, [data, styleReady]);

  // Bucket filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const filter: any = ["all",
      ["!", ["has", "point_count"]],
      ["in", ["get", "bucket"], ["literal", [...enabledBuckets]]],
    ];
    if (map.getLayer("points")) map.setFilter("points", filter);
  }, [enabledBuckets]);

  // Apply neighbor dimming
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    if (!map.getSource("parishes")) return;
    if (neighborIds.size === 0) {
      data.features.forEach(f => {
        map.setFeatureState({ source: "parishes", id: f.id as number }, { dimmed: false });
      });
    } else {
      data.features.forEach(f => {
        const id = f.id as number;
        map.setFeatureState({ source: "parishes", id },
          { dimmed: !neighborIds.has(id) });
      });
    }
  }, [neighborIds, data]);

  function selectFeature(f: Feature) {
    setSelected(f);
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("selected") as any)?.setData({
      type: "FeatureCollection", features: [f],
    });
    map.flyTo({
      center: f.geometry.coordinates as [number, number],
      zoom: Math.max(map.getZoom(), 9),
      duration: 800,
      essential: true,
    });
  }

  function clearSelection() {
    setSelected(null);
    setNeighborIds(new Set());
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("selected") as any)?.setData({ type: "FeatureCollection", features: [] });
    (map.getSource("radius") as any)?.setData({ type: "FeatureCollection", features: [] });
  }

  function showRadius() {
    if (!selected) return;
    const [lon, lat] = selected.geometry.coordinates;
    const ids = new Set(neighborsWithin(points, lon, lat, 50));
    setNeighborIds(ids);
    const map = mapRef.current;
    (map?.getSource("radius") as any)?.setData({
      type: "FeatureCollection",
      features: [circlePolygon(lon, lat, 50)],
    });
  }

  function toggleBucket(b: string) {
    setEnabledBuckets(prev => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b); else next.add(b);
      return next.size === 0 ? new Set(BUCKET_ORDER) : next;
    });
  }

  const sel = selected?.properties;
  const nearbyCount = Math.max(0, neighborIds.size - 1);

  return (
    <div className="relative" style={{ width: "100%", height: "100%", minHeight: "100vh" }}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ position: "absolute", inset: 0 }}
      />

      {/* Top bar: search + lang */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto w-full max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              placeholder={T.search}
              aria-label={T.search}
              className="w-full rounded-xl border border-border bg-card/95 py-2.5 pl-10 pr-9 text-sm shadow-lg backdrop-blur outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button
                onClick={() => { setQuery(""); setShowResults(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent"
                aria-label={T.clear}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {showResults && query.trim().length >= 2 && (
              <div className="absolute mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
                {searchResults.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">{T.notFoundTitle}</div>
                ) : searchResults.map((f) => {
                  const p = f.properties;
                  return (
                    <button
                      key={f.id as number}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectFeature(f);
                        setQuery(p.settlement[lang] || p.settlement.en);
                        setShowResults(false);
                      }}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                    >
                      <span className="font-medium">
                        {p.settlement[lang] || p.settlement.en || "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {[p.church[lang] || p.church.en, p.uezd[lang] || p.uezd.en, p.region[lang] || p.region.en]
                          .filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur">
            {(["ru", "en"] as const).map(l => (
              <button
                key={l}
                onClick={() => onLangChange(l)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors",
                  lang === l
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
                aria-pressed={lang === l}
              >
                <Globe2 className="mr-1 inline h-3 w-3" />{l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom-left: detail card */}
      {selected && sel && (
        <div className="pointer-events-auto absolute bottom-3 left-3 z-10 w-[min(92vw,360px)] rounded-2xl border border-border bg-card/98 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-semibold leading-tight">
                {sel.settlement[lang] || sel.settlement.en || "—"}
              </h3>
              {(sel.church[lang] || sel.church.en) && (
                <p className="mt-0.5 text-sm italic text-muted-foreground">
                  {sel.church[lang] || sel.church.en}
                </p>
              )}
            </div>
            <button
              onClick={clearSelection}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              aria-label={T.clear}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            {(sel.region[lang] || sel.region.en) && (<>
              <dt className="text-muted-foreground">{T.region}</dt>
              <dd className="tabular-nums">{sel.region[lang] || sel.region.en}</dd>
            </>)}
            {(sel.uezd[lang] || sel.uezd.en) && (<>
              <dt className="text-muted-foreground">{T.uezd}</dt>
              <dd>{sel.uezd[lang] || sel.uezd.en}</dd>
            </>)}
            <dt className="text-muted-foreground">{T.years}</dt>
            <dd className="tabular-nums">
              {sel.startYear}–{sel.endYear}
              <span className="ml-1 text-muted-foreground">
                ({sel.coverage} {T.coverage})
              </span>
            </dd>
            {sel.missingRaw[lang] && (<>
              <dt className="text-muted-foreground">{T.missing}</dt>
              <dd className="tabular-nums text-xs">{sel.missingRaw[lang]}</dd>
            </>)}
          </dl>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button size="sm" onClick={showRadius} className="flex-1">
              <MapPin className="mr-1.5 h-4 w-4" />
              {T.showRadius}
            </Button>
          </div>
          {neighborIds.size > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {T.nearbyCount(nearbyCount)}
            </p>
          )}
        </div>
      )}

      {/* Bottom-right: legend + stats */}
      <div className="pointer-events-auto absolute bottom-3 right-3 z-10 w-[min(92vw,260px)] rounded-2xl border border-border bg-card/98 p-3 shadow-2xl backdrop-blur">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {T.legend}
        </div>
        <ul className="space-y-1.5">
          {BUCKET_ORDER.map(b => {
            const on = enabledBuckets.has(b);
            return (
              <li key={b}>
                <button
                  onClick={() => toggleBucket(b)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-opacity",
                    on ? "opacity-100" : "opacity-40",
                  )}
                  aria-pressed={on}
                >
                  <span
                    className="h-3 w-3 rounded-full ring-2 ring-white"
                    style={{ backgroundColor: BUCKET_COLORS[b] }}
                  />
                  <span className="tabular-nums">{T.bucket[b]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {stats && (
          <div className="mt-3 border-t border-border pt-2.5">
            <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Info className="h-3 w-3" />{T.stats}
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-y-0.5 text-xs">
              <dt className="text-muted-foreground">{T.total}</dt>
              <dd className="tabular-nums">{stats.total.toLocaleString()}</dd>
              <dt className="text-muted-foreground">{T.withCoords}</dt>
              <dd className="tabular-nums">
                {stats.withCoords.toLocaleString()} ({Math.round(stats.withCoords / stats.total * 100)}%)
              </dd>
              <dt className="text-muted-foreground">{T.withoutCoords}</dt>
              <dd className="tabular-nums">
                {stats.withoutCoords.toLocaleString()} ({Math.round(stats.withoutCoords / stats.total * 100)}%)
              </dd>
              <dt className="text-muted-foreground">{T.confidence}</dt>
              <dd className="tabular-nums">{Math.round(stats.geocodingConfidence * 100)}%</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
