import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP_STYLE, attachBasemapFallback } from "@/lib/map-style";
import { fetchTbilisiChurches, type TbilisiChurch } from "@/lib/tbilisiChurches";
import { CONFESSION_COLORS, TBILISI_BBOX } from "@/lib/i18n-tbilisi";
import { TBILISI_1898, DISTRICTS_1898_URL } from "@/lib/tbilisi-historical";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Search, Check } from "lucide-react";

interface Override {
  church_id: number;
  new_lat: number;
  new_lon: number;
}

/** Admin panel: drag church markers on top of Tbilisi 1898 raster, save to DB. */
export function TbilisiCoordEditorPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  const [rows, setRows] = useState<TbilisiChurch[] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [histOn, setHistOn] = useState(true);
  const [histOpacity, setHistOpacity] = useState(75);
  const [districtsOn, setDistrictsOn] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "not_high" | "low_only">("not_high");
  const [query, setQuery] = useState("");
  const [editedIds, setEditedIds] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Load churches once
  useEffect(() => {
    fetchTbilisiChurches().then(setRows);
  }, []);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [(TBILISI_BBOX[0] + TBILISI_BBOX[2]) / 2, (TBILISI_BBOX[1] + TBILISI_BBOX[3]) / 2],
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    attachBasemapFallback(map);
    map.on("load", () => {
      if (TBILISI_1898) {
        if (TBILISI_1898.kind === "tiles") {
          map.addSource("hist-1898", {
            type: "raster",
            tiles: [TBILISI_1898.tiles],
            tileSize: 256,
            minzoom: TBILISI_1898.minzoom ?? 10,
            maxzoom: TBILISI_1898.maxzoom ?? 18,
          });
        } else {
          map.addSource("hist-1898", {
            type: "image",
            url: TBILISI_1898.url,
            coordinates: TBILISI_1898.coordinates,
          } as maplibregl.ImageSourceSpecification);
        }
        map.addLayer({
          id: "hist-1898",
          type: "raster",
          source: "hist-1898",
          paint: { "raster-opacity": histOpacity / 100 },
        });
      }
      map.addSource("districts-1898", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "districts-1898-fill",
        type: "fill",
        source: "districts-1898",
        paint: { "fill-color": "#b45309", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: "districts-1898-line",
        type: "line",
        source: "districts-1898",
        paint: { "line-color": "#92400e", "line-width": 2, "line-dasharray": [3, 2], "line-opacity": 0.85 },
      });
      setMapReady(true);
    });
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    // Load district polygons
    fetch(DISTRICTS_1898_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.features?.length) return;
        const onReady = () => {
          const src = map.getSource("districts-1898") as GeoJSONSource | undefined;
          if (src) src.setData(d);
        };
        if (map.isStyleLoaded()) onReady();
        else map.once("load", onReady);
      })
      .catch(() => {});

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // React to histOn/opacity/districts toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer("hist-1898")) {
      map.setLayoutProperty("hist-1898", "visibility", histOn ? "visible" : "none");
      map.setPaintProperty("hist-1898", "raster-opacity", histOpacity / 100);
    }
    for (const id of ["districts-1898-fill", "districts-1898-line"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", districtsOn ? "visible" : "none");
      }
    }
  }, [histOn, histOpacity, districtsOn, mapReady]);

  // Filter rows for visible markers
  const visibleRows = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "not_high" && r.confidence === "high") return false;
      if (filter === "low_only" && !r.confidence.startsWith("low")) return false;
      if (q) {
        const hay = (r.name.ru + " " + r.name.en + " " + r.name.ka + " " + r.address).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, query]);

  // Sync markers with visibleRows
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !rows) return;
    const want = new Set(visibleRows.map((r) => r.id));

    // Remove markers no longer wanted
    for (const [id, m] of markersRef.current) {
      if (!want.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }

    // Add/update
    for (const r of visibleRows) {
      let m = markersRef.current.get(r.id);
      if (!m) {
        const el = document.createElement("div");
        el.style.cssText = `width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.4);cursor:grab;background:${CONFESSION_COLORS[r.confession] ?? "#888"};`;
        el.title = r.name.ru;
        m = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([r.lon, r.lat]).addTo(map);
        m.on("dragstart", () => {
          el.style.cursor = "grabbing";
        });
        m.on("dragend", async () => {
          el.style.cursor = "grab";
          const { lat, lng } = m!.getLngLat();
          await saveOverride(r, lat, lng);
        });
        el.addEventListener("click", () => setSelectedId(r.id));
        markersRef.current.set(r.id, m);
      } else {
        const cur = m.getLngLat();
        if (Math.abs(cur.lat - r.lat) > 1e-7 || Math.abs(cur.lng - r.lon) > 1e-7) {
          m.setLngLat([r.lon, r.lat]);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, mapReady, rows]);

  async function saveOverride(church: TbilisiChurch, newLat: number, newLon: number) {
    setSavingId(church.id);
    setError(null);
    // Need user id for created_by/reviewed_by
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      church_id: church.id,
      old_lat: church.lat,
      old_lon: church.lon,
      new_lat: newLat,
      new_lon: newLon,
      distance_m: haversine(church.lat, church.lon, newLat, newLon),
      model_confidence: 1.0,
      reasoning: "Manual admin placement on 1898 map overlay",
      sources: [{ kind: "admin_manual", note: "Drag-and-drop in admin panel" }],
      osm_candidates: [],
      status: "approved" as const,
      created_by: user?.id ?? null,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("tbilisi_coord_verifications")
      .upsert(payload, { onConflict: "church_id" });
    setSavingId(null);
    if (error) {
      setError(`${church.name.ru}: ${error.message}`);
      // Revert marker
      const m = markersRef.current.get(church.id);
      if (m) m.setLngLat([church.lon, church.lat]);
      return;
    }
    // Update local rows so future filter/redraw uses new coords
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.id === church.id
              ? { ...r, lat: newLat, lon: newLon, confidence: "high" as const, verifiedByAi: true }
              : r,
          )
        : prev,
    );
    setEditedIds((s) => new Set(s).add(church.id));
    setSavedId(church.id);
    setTimeout(() => setSavedId((v) => (v === church.id ? null : v)), 1500);
  }

  async function exportJson() {
    if (!rows) return;
    // Re-fetch fresh JSON from source and apply all approved overrides
    const [base, { data: overrides }] = await Promise.all([
      fetch("/data/tbilisi-churches.json").then((r) => r.json()),
      supabase
        .from("tbilisi_coord_verifications")
        .select("church_id, new_lat, new_lon")
        .eq("status", "approved"),
    ]);
    const byId = new Map((overrides || []).map((o: any) => [o.church_id, o]));
    const merged = (base as any[]).map((c) => {
      const o = byId.get(c.id);
      if (!o) return c;
      return { ...c, lat: o.new_lat, lon: o.new_lon, confidence: "high" };
    });
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tbilisi-churches.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function flyTo(r: TbilisiChurch) {
    const m = mapRef.current;
    if (!m) return;
    setSelectedId(r.id);
    m.flyTo({ center: [r.lon, r.lat], zoom: Math.max(m.getZoom(), 16) });
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-xs">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={histOn} onChange={(e) => setHistOn(e.target.checked)} />
          Карта 1898 г.
        </label>
        <label className="flex items-center gap-2">
          Прозрачность
          <input
            type="range"
            min={0}
            max={100}
            value={histOpacity}
            onChange={(e) => setHistOpacity(Number(e.target.value))}
            className="w-32"
          />
          <span className="tabular-nums text-muted-foreground">{histOpacity}%</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={districtsOn} onChange={(e) => setDistrictsOn(e.target.checked)} />
          Полицейские участки
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground">Показ:</span>
          {([
            ["not_high", "Кроме high"],
            ["low_only", "Только low"],
            ["all", "Все"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={
                "rounded-md px-2 py-1 transition-colors " +
                (filter === k
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent")
              }
            >
              {label}
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={exportJson}>
            <Download className="mr-1 h-3.5 w-3.5" /> Экспорт JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[70vh] min-h-[480px] overflow-hidden rounded-xl border border-border bg-muted">
          <div ref={containerRef} className="absolute inset-0" />
          {(savingId != null || savedId != null) && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-md bg-card/95 px-3 py-1.5 text-xs shadow-lg">
              {savingId != null ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Сохранение…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" /> Сохранено
                </span>
              )}
            </div>
          )}
        </div>

        <aside className="flex max-h-[70vh] flex-col gap-2 rounded-xl border border-border bg-card p-3 text-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск церкви…"
              className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="text-[11px] text-muted-foreground">
            {visibleRows.length} церквей · отредактировано в этой сессии: {editedIds.size}
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">{error}</div>
          )}
          <ul className="-mx-1 flex-1 space-y-0.5 overflow-y-auto">
            {visibleRows.map((r) => {
              const isSel = selectedId === r.id;
              const isEdited = editedIds.has(r.id);
              return (
                <li key={r.id}>
                  <button
                    onClick={() => flyTo(r)}
                    className={
                      "w-full rounded-md px-2 py-1 text-left transition-colors " +
                      (isSel ? "bg-accent" : "hover:bg-muted")
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: CONFESSION_COLORS[r.confession] ?? "#888" }}
                      />
                      <span className="truncate">{r.name.ru}</span>
                      {isEdited && <Check className="ml-auto h-3 w-3 shrink-0 text-emerald-500" />}
                    </div>
                    <div className="ml-4 text-[10px] tabular-nums text-muted-foreground">
                      {r.confidence} · {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-border pt-2 text-[10px] leading-snug text-muted-foreground">
            Перетащите маркер на карте 1898 г. — координаты сразу сохраняются в БД (статус
            «approved»). Они автоматически перекрывают точки в JSON на странице{" "}
            <code className="font-mono">/tbilisi</code>. Кнопка «Экспорт JSON» отдаёт готовый файл с
            применёнными правками для коммита в репозиторий.
          </p>
        </aside>
      </div>
    </section>
  );
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
