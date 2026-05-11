import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, MapGeoJSONFeature, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Fuse from "fuse.js";
import { Search, X, Globe2, MapPin, Info, ListX, Undo2, HelpCircle, RotateCcw, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { UnlocatedPanel, UnlocatedItem } from "./UnlocatedPanel";
import { Lang, t, compactYears } from "@/lib/i18n";
import { useUserCoords, userRecordToFeature, unlocatedKey } from "@/lib/userCoords";
import { useApprovedSuggestions, approvedToFeature, submitSuggestion } from "@/lib/communityCoords";
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
  uniqueLocations?: number;
  unlocatedGroups?: number;
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
  const [baseData, setBaseData] = useState<FC | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Feature | null>(null);
  const [neighborIds, setNeighborIds] = useState<Set<number>>(new Set());
  const [highlightMode, setHighlightMode] = useState<"radius" | "area" | null>(null);
  const [enabledBuckets, setEnabledBuckets] = useState<Set<string>>(
    new Set(BUCKET_ORDER),
  );
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [uezdFilter, setUezdFilter] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [unlocatedOpen, setUnlocatedOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const userCoords = useUserCoords();
  const approved = useApprovedSuggestions();
  const [submitToast, setSubmitToast] = useState<string | null>(null);
  const T = t(lang);

  // Merge base GeoJSON with community-approved + user-pinned features.
  const data: FC | null = useMemo(() => {
    if (!baseData) return null;
    const baseLen = baseData.features.length;
    const userFeatures = Object.values(userCoords.records).map((rec, i) =>
      userRecordToFeature(rec, 1_000_000 + i + baseLen),
    );
    const approvedFeatures = approved.map((s, i) =>
      approvedToFeature(s, 2_000_000 + i + baseLen),
    );
    if (userFeatures.length === 0 && approvedFeatures.length === 0) return baseData;
    return {
      ...baseData,
      features: [...baseData.features, ...approvedFeatures, ...userFeatures],
    };
  }, [baseData, userCoords.records, approved]);

  const dataRef = useRef<FC | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);

  // Index for "find on map" jumps from the unlocated panel
  const locatedIndex = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const f of data.features) {
      const p: any = f.properties;
      const s = (p.settlement?.ru || p.settlement?.en || "").toLocaleLowerCase();
      const u = (p.uezd?.ru || p.uezd?.en || "").toLocaleLowerCase();
      if (s) m.set(`${s}|${u}`, f.id as number);
    }
    return m;
  }, [data]);

  // Hide already-pinned items from the unlocated list
  const userPinnedKeys = useMemo(
    () => new Set(Object.keys(userCoords.records)),
    [userCoords.records],
  );

  const jumpToFeature = (id: number) => {
    const f = data?.features.find((x) => (x.id as number) === id);
    if (f) selectFeature(f as Feature);
  };

  const handleAddCoords = (item: UnlocatedItem, lat: number, lon: number) => {
    userCoords.add(item, lat, lon);
    setUnlocatedOpen(false);
    // Fire-and-forget submission to community moderation queue.
    submitSuggestion(item, lat, lon)
      .then(() => setSubmitToast(T.suggestionSent))
      .catch((e) => console.error("[submitSuggestion]", e));
    // Build a synthetic feature now so we can fly there immediately,
    // before React re-renders with the merged dataset.
    const tempId = 1_000_000 + Date.now();
    const feat = userRecordToFeature(
      { key: unlocatedKey(item), lat, lon, item, addedAt: Date.now() },
      tempId,
    ) as Feature;
    setTimeout(() => selectFeature(feat), 60);
  };

  useEffect(() => {
    if (!submitToast) return;
    const id = setTimeout(() => setSubmitToast(null), 4000);
    return () => clearTimeout(id);
  }, [submitToast]);

  // Load data once
  useEffect(() => {
    fetch("/data/parishes.geojson").then(r => r.json()).then(setBaseData);
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

  // Build uezd/region → feature ids index for "highlight all in area" search
  const areaIndex = useMemo(() => {
    type Entry = { label: string; ids: number[] };
    const uezdMap = new Map<string, Entry>();
    const regionMap = new Map<string, Entry>();
    if (!data) return { uezds: [] as Array<{ key: string } & Entry>, regions: [] as Array<{ key: string } & Entry> };
    for (const f of data.features) {
      const p: any = f.properties;
      const id = f.id as number;
      const uLabel: string | undefined = p.uezd?.[lang] || p.uezd?.en || p.uezd?.ru;
      if (uLabel) {
        const key = uLabel.toLocaleLowerCase();
        const entry: Entry = uezdMap.get(key) || { label: uLabel, ids: [] };
        entry.ids.push(id);
        uezdMap.set(key, entry);
      }
      const rLabel: string | undefined = p.region?.[lang] || p.region?.en || p.region?.ru;
      if (rLabel) {
        const key = rLabel.toLocaleLowerCase();
        const entry: Entry = regionMap.get(key) || { label: rLabel, ids: [] };
        entry.ids.push(id);
        regionMap.set(key, entry);
      }
    }
    return {
      uezds: [...uezdMap.entries()].map(([k, v]) => ({ key: k, ...v })),
      regions: [...regionMap.entries()].map(([k, v]) => ({ key: k, ...v })),
    };
  }, [data, lang]);

  const areaMatches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (q.length < 2) return { uezds: [] as typeof areaIndex.uezds, regions: [] as typeof areaIndex.regions };
    const filt = (arr: typeof areaIndex.uezds) =>
      arr.filter((x) => x.key.includes(q)).slice(0, 3);
    return { uezds: filt(areaIndex.uezds), regions: filt(areaIndex.regions) };
  }, [areaIndex, query]);

  // Sorted region/uezd lists for the dropdown filters under the search bar.
  const regionList = useMemo(
    () => [...areaIndex.regions].sort((a, b) => a.label.localeCompare(b.label)),
    [areaIndex],
  );
  const uezdList = useMemo(
    () => [...areaIndex.uezds].sort((a, b) => a.label.localeCompare(b.label)),
    [areaIndex],
  );
  // When a region is chosen, restrict the uezd dropdown to uezds inside it.
  const uezdsForRegion = useMemo(() => {
    if (!regionFilter) return uezdList;
    const region = areaIndex.regions.find((r) => r.key === regionFilter);
    if (!region) return uezdList;
    const regionIds = new Set(region.ids);
    return uezdList.filter((u) => u.ids.some((id) => regionIds.has(id)));
  }, [uezdList, regionFilter, areaIndex]);

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

  const parishesSetupRef = useRef(false);

  // Effect B: attach parishes source/layers ONCE when style and data are first ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !data) return;
    if (parishesSetupRef.current) return;
    parishesSetupRef.current = true;

    map.addSource("parishes", {
      type: "geojson",
      data: data as any,
      cluster: false,
      promoteId: undefined,
      generateId: false,
    });

    map.addLayer({
      id: "points",
      type: "circle",
      source: "parishes",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": colorExpression,
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          4, [
            "case",
            ["boolean", ["feature-state", "highlighted"], false],
            ["+", ["max", 3, ["*", ["sqrt", ["get", "coverage"]], 1.0]], 3],
            ["max", 3, ["*", ["sqrt", ["get", "coverage"]], 1.0]],
          ],
          10, [
            "case",
            ["boolean", ["feature-state", "highlighted"], false],
            ["+", ["max", 4, ["*", ["sqrt", ["get", "coverage"]], 1.6]], 3],
            ["max", 4, ["*", ["sqrt", ["get", "coverage"]], 1.6]],
          ],
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "highlighted"], false], 2.5,
          1.5,
        ],
        "circle-opacity": [
          "case",
          ["boolean", ["feature-state", "dimmed"], false], 0.10,
          0.95,
        ],
      },
    });

    // Top layer: only highlighted points (filtered by id list). Rendered above
    // the base "points" layer so the selected area visually stands out, even
    // when neighbours are densely packed.
    map.addLayer({
      id: "points-top",
      type: "circle",
      source: "parishes",
      filter: ["in", ["id"], ["literal", []]],
      paint: {
        "circle-color": colorExpression,
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          4, ["+", ["max", 5, ["*", ["sqrt", ["get", "coverage"]], 1.4]], 2],
          10, ["+", ["max", 7, ["*", ["sqrt", ["get", "coverage"]], 2.0]], 2],
        ],
        "circle-stroke-color": "#0f172a",
        "circle-stroke-width": 2,
        "circle-opacity": 1,
      },
    });




    const findOriginalFeature = (f: MapGeoJSONFeature): Feature | undefined => {
      if (!f) return;
      const fc = dataRef.current;
      if (!fc) return;
      const [lon, lat] = (f.geometry as any).coordinates as [number, number];
      return (
        fc.features.find((x) => (x.id as number) === (f.id as number)) ??
        fc.features.find((x) => {
          const [xlon, xlat] = x.geometry.coordinates;
          return Math.abs(xlon - lon) < 1e-6 && Math.abs(xlat - lat) < 1e-6;
        })
      );
    };

    const findNearestFeature = (point: { x: number; y: number }, maxDistance: number) => {
      const fc = dataRef.current;
      if (!fc) return undefined;
      let nearest: Feature | undefined;
      let nearestDistance = maxDistance * maxDistance;
      fc.features.forEach((feature) => {
        const projected = map.project(feature.geometry.coordinates as [number, number]);
        const dx = projected.x - point.x;
        const dy = projected.y - point.y;
        const distance = dx * dx + dy * dy;
        if (distance <= nearestDistance) {
          nearest = feature;
          nearestDistance = distance;
        }
      });
      return nearest;
    };

    map.on("click", (e) => {
      const hitbox = 14;
      const features = map.queryRenderedFeatures(
        [
          [e.point.x - hitbox, e.point.y - hitbox],
          [e.point.x + hitbox, e.point.y + hitbox],
        ],
        { layers: ["points-top", "points"] },
      );
      const orig = features[0] ? findOriginalFeature(features[0]) : findNearestFeature(e.point, hitbox);
      if (!orig) return;
      e.preventDefault();
      selectFeature(orig);
    });
    map.on("mouseenter", "points", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "points", () => { map.getCanvas().style.cursor = ""; });
  }, [data, styleReady]);

  // Push subsequent data updates (e.g. user-added coords) into the source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    const src = map.getSource("parishes") as any;
    if (src && typeof src.setData === "function") {
      src.setData(data);
    }
  }, [data]);

  // Bucket filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const filter: any = ["all",
      ["!", ["has", "point_count"]],
      ["in", ["get", "bucket"], ["literal", [...enabledBuckets]]],
    ];
    if (map.getLayer("points")) map.setFilter("points", filter);
  }, [enabledBuckets, styleReady]);

  // Apply neighbor dimming + (for area) highlighted boost
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    if (!map.getSource("parishes")) return;
    if (neighborIds.size === 0) {
      data.features.forEach(f => {
        map.setFeatureState({ source: "parishes", id: f.id as number }, { dimmed: false, highlighted: false });
      });
    } else {
      const boost = highlightMode === "area";
      data.features.forEach(f => {
        const id = f.id as number;
        const inSet = neighborIds.has(id);
        map.setFeatureState({ source: "parishes", id },
          { dimmed: !inSet, highlighted: boost && inSet });
      });
    }
  }, [neighborIds, data, highlightMode]);

  // Toggle the "points-top" layer filter so it only renders highlighted ids
  // (area mode). Stays empty in radius / no-highlight mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (!map.getLayer("points-top")) return;
    const ids = highlightMode === "area" ? [...neighborIds] : [];
    map.setFilter("points-top", ["in", ["id"], ["literal", ids]]);
  }, [neighborIds, highlightMode, styleReady]);

  function selectFeature(f: Feature) {
    setSelected(f);
    // Если активен фильтр по региону/уезду — сохраняем подсветку района,
    // чтобы выбор отдельной точки не сбрасывал контекст. Иначе сбрасываем
    // прежний радиус/районную подсветку, как и раньше.
    if (!regionFilter && !uezdFilter) {
      setNeighborIds(new Set());
      setHighlightMode(null);
    }
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("selected") as any)?.setData({
      type: "FeatureCollection", features: [f],
    });
    (map.getSource("radius") as any)?.setData({ type: "FeatureCollection", features: [] });
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
    setHighlightMode(null);
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("selected") as any)?.setData({ type: "FeatureCollection", features: [] });
    (map.getSource("radius") as any)?.setData({ type: "FeatureCollection", features: [] });
  }

  function showRadius() {
    if (!selected) return;
    const [lon, lat] = selected.geometry.coordinates;
    const ids = new Set(neighborsWithin(points, lon, lat, 10));
    setNeighborIds(ids);
    setHighlightMode("radius");
    const map = mapRef.current;
    (map?.getSource("radius") as any)?.setData({
      type: "FeatureCollection",
      features: [circlePolygon(lon, lat, 10)],
    });
  }

  function highlightArea(ids: number[]) {
    setNeighborIds(new Set(ids));
    setHighlightMode("area");
    const map = mapRef.current;
    (map?.getSource("radius") as any)?.setData({ type: "FeatureCollection", features: [] });
    (map?.getSource("selected") as any)?.setData({ type: "FeatureCollection", features: [] });
    setSelected(null);
    // Карту намеренно не перемещаем при выборе уезда/региона —
    // пользователь сам решит, приближать ли подсвеченный кластер.
  }

  function resetView() {
    clearSelection();
    setQuery("");
    setRegionFilter("");
    setUezdFilter("");
    setShowResults(false);
    setEnabledBuckets(new Set(BUCKET_ORDER));
    const map = mapRef.current;
    if (map) {
      map.easeTo({ center: [43.5, 42.0], zoom: 6.4, duration: 700 });
    }
  }

  function toggleBucket(b: string) {
    setEnabledBuckets(prev => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b); else next.add(b);
      return next.size === 0 ? new Set(BUCKET_ORDER) : next;
    });
  }

  // When the user clears the search input, also drop any area highlight
  // (unless a region/uezd dropdown filter is active).
  useEffect(() => {
    if (
      query.trim().length === 0 &&
      highlightMode === "area" &&
      !regionFilter &&
      !uezdFilter
    ) {
      clearSelection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // React to Region / Uezd dropdown filters: highlight matching ids (intersection).
  useEffect(() => {
    if (!regionFilter && !uezdFilter) {
      if (highlightMode === "area") clearSelection();
      return;
    }
    const r = regionFilter ? areaIndex.regions.find((x) => x.key === regionFilter) : null;
    const u = uezdFilter ? areaIndex.uezds.find((x) => x.key === uezdFilter) : null;
    let ids: number[] = [];
    if (r && u) {
      const us = new Set(u.ids);
      ids = r.ids.filter((id) => us.has(id));
    } else if (r) ids = r.ids;
    else if (u) ids = u.ids;
    if (ids.length > 0) highlightArea(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilter, uezdFilter, areaIndex]);

  const sel = selected?.properties;
  const nearbyCount = Math.max(0, neighborIds.size - 1);
  const mapLoading = !styleReady || !data;

  return (
    <div
      className="relative overflow-hidden overscroll-none"
      style={{ width: "100%", height: "100dvh" }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ position: "absolute", inset: 0 }}
      />

      {mapLoading && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-muted/30 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm text-muted-foreground shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin" />
            {T.loadingMap}
          </div>
        </div>
      )}

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
              <div className="absolute mt-2 max-h-[70vh] w-full overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
                {(areaMatches.uezds.length > 0 || areaMatches.regions.length > 0) && (
                  <div className="border-b border-border bg-muted/40">
                    {areaMatches.uezds.map((u) => (
                      <button
                        key={"u-" + u.key}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          highlightArea(u.ids);
                          setQuery(u.label);
                          setShowResults(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                      >
                        <span>
                          <span className="text-xs text-muted-foreground">{T.uezdLabel}</span>{" "}
                          <span className="font-medium">{u.label}</span>
                        </span>
                        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                          {u.ids.length}
                        </span>
                      </button>
                    ))}
                    {areaMatches.regions.map((r) => (
                      <button
                        key={"r-" + r.key}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          highlightArea(r.ids);
                          setQuery(r.label);
                          setShowResults(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                      >
                        <span>
                          <span className="text-xs text-muted-foreground">{T.regionLabel}</span>{" "}
                          <span className="font-medium">{r.label}</span>
                        </span>
                        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                          {r.ids.length}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.length === 0 && areaMatches.uezds.length === 0 && areaMatches.regions.length === 0 ? (
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
          {/* Region / Uezd dropdown filters — highlight all matching points. */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={regionFilter}
              onChange={(e) => {
                setRegionFilter(e.target.value);
                setUezdFilter("");
              }}
              aria-label={T.regionLabel}
              className="w-full rounded-lg border border-border bg-card/95 px-2 py-1.5 text-xs shadow-lg backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{T.allRegions}</option>
              {regionList.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <select
              value={uezdFilter}
              onChange={(e) => setUezdFilter(e.target.value)}
              aria-label={T.uezdLabel}
              className="w-full rounded-lg border border-border bg-card/95 px-2 py-1.5 text-xs shadow-lg backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{T.allUezds}</option>
              {uezdsForRegion.map((u) => (
                <option key={u.key} value={u.key}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={resetView}
            title={T.resetView}
            aria-label={T.resetView}
            className="hidden items-center justify-center rounded-lg border border-border bg-card/95 p-2 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent sm:flex"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setUnlocatedOpen(true)}
            title={T.unlocatedTitle}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent"
          >
            <ListX className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{T.unlocatedButton}</span>
            {(stats?.unlocatedGroups ?? stats?.withoutCoords) ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {(stats!.unlocatedGroups ?? stats!.withoutCoords).toLocaleString()}
              </span>
            ) : null}
          </button>
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

      <UnlocatedPanel
        open={unlocatedOpen}
        onOpenChange={setUnlocatedOpen}
        lang={lang}
        locatedIndex={locatedIndex}
        onJumpToFeature={jumpToFeature}
        excludeKeys={userPinnedKeys}
        onAddCoords={handleAddCoords}
      />

      {userCoords.lastAction && (
        <div className="pointer-events-auto absolute left-1/2 top-16 z-20 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/98 px-3 py-1.5 text-xs shadow-2xl backdrop-blur sm:top-20">
          <span className="text-muted-foreground">
            {userCoords.lastAction.type === "add" &&
              T.coordsAdded(
                userCoords.records[userCoords.lastAction.key]?.item.settlement[lang] ||
                userCoords.records[userCoords.lastAction.key]?.item.settlement.en ||
                "—",
              )}
          </span>
          <button
            onClick={userCoords.undo}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Undo2 className="h-3 w-3" />
            {T.undo}
          </button>
          <button
            onClick={userCoords.dismissUndo}
            aria-label={T.clear}
            className="rounded-full p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {submitToast && (
        <div className="pointer-events-auto absolute left-1/2 top-28 z-20 max-w-[92vw] -translate-x-1/2 rounded-full border border-border bg-card/98 px-3 py-1.5 text-xs text-muted-foreground shadow-2xl backdrop-blur sm:top-32">
          {submitToast}
        </div>
      )}

      {/* Bottom-left: detail card */}
      {selected && sel && (() => {
        const churchStr: string = sel.church[lang] || sel.church.en || "";
        const churchList = churchStr ? churchStr.split("|").map((s: string) => s.trim()).filter(Boolean) : [];
        const manyChurches = churchList.length > 3;
        return (
        <div className="pointer-events-auto absolute bottom-3 left-3 z-10 flex w-[min(92vw,360px)] max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-2xl border border-border bg-card/98 shadow-2xl backdrop-blur">
          {/* Sticky header */}
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 pb-2 pt-4">
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-semibold leading-tight">
                {sel.settlement[lang] || sel.settlement.en || "—"}
              </h3>
              {!manyChurches && churchList.length > 0 && (
                <p className="mt-0.5 text-sm italic text-muted-foreground">
                  {churchList.join(" · ")}
                </p>
              )}
            </div>
            <button
              onClick={clearSelection}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent"
              aria-label={T.clear}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
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
              <dt className="text-muted-foreground">{T.missing}</dt>
              <dd className="tabular-nums text-xs">
                {sel.missingRaw[lang] || sel.missingRaw.en
                  ? (sel.missingRaw[lang] || sel.missingRaw.en)
                  : sel.missingCount === 0
                    ? T.noGaps
                    : "—"}
              </dd>
            </dl>

            {manyChurches && (
              <div className="mt-3">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {T.churches} ({churchList.length})
                </div>
                <ul className="max-h-48 space-y-0.5 overflow-y-auto overscroll-contain rounded-md border border-border bg-background/50 p-2 text-sm">
                  {churchList.map((c: string, i: number) => (
                    <li key={i} className="leading-snug">{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sticky footer */}
          <div className="border-t border-border px-4 py-3">
            <Button size="sm" onClick={showRadius} className="w-full">
              <MapPin className="mr-1.5 h-4 w-4" />
              {T.showRadius}
            </Button>
            {neighborIds.size > 0 && highlightMode === "radius" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {T.nearbyCount(nearbyCount)}
              </p>
            )}
            {neighborIds.size > 0 && highlightMode === "area" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {T.areaSelectedCount(neighborIds.size)}
              </p>
            )}
          </div>
        </div>
        );
      })()}

      {/* Mobile: 2-row legend along the bottom + docs button. Hidden when a card is open. */}
      {!selected && (
        <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-10 flex flex-col gap-1.5 sm:hidden">
          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur">
            {BUCKET_ORDER.map((b) => {
              const on = enabledBuckets.has(b);
              return (
                <button
                  key={b}
                  onClick={() => toggleBucket(b)}
                  aria-pressed={on}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums transition-opacity",
                    on ? "opacity-100" : "opacity-40",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white"
                    style={{ backgroundColor: BUCKET_COLORS[b] }}
                  />
                  <span className="truncate">{T.bucket[b]}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setDocsOpen(true)}
            className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1 text-[11px] font-medium text-foreground shadow-lg backdrop-blur hover:bg-accent"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {T.docsButton}
          </button>
        </div>
      )}

      {/* Desktop: floating docs button at the bottom center. */}
      <button
        onClick={() => setDocsOpen(true)}
        className="pointer-events-auto absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent sm:inline-flex"
      >
        <HelpCircle className="h-4 w-4" />
        {T.docsButton}
      </button>

      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{T.docsTitle}</DialogTitle>
          </DialogHeader>
          <DialogDescription asChild>
            <div
              className="text-sm leading-relaxed text-foreground"
              dangerouslySetInnerHTML={{ __html: T.docsBodyHtml }}
            />
          </DialogDescription>
        </DialogContent>
      </Dialog>

      {/* Desktop: full legend + stats panel. */}
      <div
        className={cn(
          "pointer-events-auto absolute bottom-3 right-3 z-10 w-[min(92vw,260px)] rounded-2xl border border-border bg-card/98 p-3 shadow-2xl backdrop-blur",
          "hidden sm:block",
        )}
      >
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
              {(() => {
                const withC = stats.uniqueLocations ?? Math.max(0, stats.total - stats.withoutCoords);
                const without = stats.unlocatedGroups ?? stats.withoutCoords;
                const total = withC + without;
                const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
                return (
                  <>
                    <dt className="text-muted-foreground">{T.total}</dt>
                    <dd className="tabular-nums">{total.toLocaleString()}</dd>
                    <dt className="text-muted-foreground">{T.withCoords}</dt>
                    <dd className="tabular-nums">{withC.toLocaleString()} ({pct(withC)}%)</dd>
                    <dt className="text-muted-foreground">{T.withoutCoords}</dt>
                    <dd className="tabular-nums">{without.toLocaleString()} ({pct(without)}%)</dd>
                  </>
                );
              })()}
              <dt className="text-muted-foreground">{T.confidence}</dt>
              <dd className="tabular-nums">{Math.round(stats.geocodingConfidence * 100)}%</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
