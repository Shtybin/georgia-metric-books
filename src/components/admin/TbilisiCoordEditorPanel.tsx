import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP_STYLE, attachBasemapFallback } from "@/lib/map-style";
import { fetchTbilisiChurches, type TbilisiChurch } from "@/lib/tbilisiChurches";
import { CONFESSION_COLORS, TBILISI_BBOX } from "@/lib/i18n-tbilisi";
import { HISTORICAL_MAPS, type HistoricalMapEntry } from "@/lib/tbilisi-historical";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Search, Check, X, Undo2, AlertTriangle } from "lucide-react";

interface PendingMove {
  churchId: number;
  oldLat: number;
  oldLon: number;
  newLat: number;
  newLon: number;
}

/** Admin panel: drag church markers on top of Tbilisi 1898 raster, save to DB. */
export function TbilisiCoordEditorPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  // Keep latest rows accessible to map event closures without re-creating markers.
  const rowsRef = useRef<TbilisiChurch[] | null>(null);
  const [rows, setRows] = useState<TbilisiChurch[] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
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
  const [pending, setPending] = useState<PendingMove | null>(null);

  // Load churches once
  useEffect(() => {
    fetchTbilisiChurches().then(setRows);
  }, []);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: MLMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASEMAP_STYLE,
        center: [(TBILISI_BBOX[0] + TBILISI_BBOX[2]) / 2, (TBILISI_BBOX[1] + TBILISI_BBOX[3]) / 2],
        zoom: 13,
        attributionControl: { compact: true },
      });
    } catch (e) {
      setMapError(
        (e as Error)?.message ||
          "MapLibre не смог инициализировать WebGL — попробуйте обновить страницу или включить аппаратное ускорение в браузере.",
      );
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    attachBasemapFallback(map);
    map.on("error", (e) => {
      // Tile/style errors are non-fatal; surface only the first one for diagnostics.
      console.warn("[TbilisiCoordEditor] map error", e?.error);
    });
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
      // After tab switch the container might have laid out late; force resize.
      requestAnimationFrame(() => map.resize());
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
        const churchId = r.id;
        m = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([r.lon, r.lat]).addTo(map);
        m.on("dragstart", () => {
          el.style.cursor = "grabbing";
        });
        m.on("dragend", () => {
          el.style.cursor = "grab";
          const { lat, lng } = m!.getLngLat();
          // Read CURRENT row coords from rowsRef, not the stale `r` closure.
          const current = rowsRef.current?.find((x) => x.id === churchId);
          if (!current) return;
          setPending({
            churchId,
            oldLat: current.lat,
            oldLon: current.lon,
            newLat: lat,
            newLon: lng,
          });
        });
        el.addEventListener("click", () => setSelectedId(churchId));
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

  async function confirmPending() {
    if (!pending) return;
    const church = rowsRef.current?.find((r) => r.id === pending.churchId);
    if (!church) {
      setPending(null);
      return;
    }
    setSavingId(church.id);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      church_id: church.id,
      old_lat: pending.oldLat,
      old_lon: pending.oldLon,
      new_lat: pending.newLat,
      new_lon: pending.newLon,
      distance_m: haversine(pending.oldLat, pending.oldLon, pending.newLat, pending.newLon),
      model_confidence: 1.0,
      reasoning: "Manual admin placement on 1898 map overlay",
      sources: [{ kind: "admin_manual", note: "Drag-and-drop in admin panel" }],
      osm_candidates: [],
      status: "approved" as const,
      created_by: user?.id ?? null,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    };
    const { error: dbErr } = await supabase
      .from("tbilisi_coord_verifications")
      .upsert(payload, { onConflict: "church_id" });
    setSavingId(null);
    if (dbErr) {
      setError(`${church.name.ru}: ${dbErr.message}`);
      // Revert marker
      const m = markersRef.current.get(church.id);
      if (m) m.setLngLat([pending.oldLon, pending.oldLat]);
      setPending(null);
      return;
    }
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.id === church.id
              ? { ...r, lat: pending.newLat, lon: pending.newLon, confidence: "high" as const, verifiedByAi: true }
              : r,
          )
        : prev,
    );
    setEditedIds((s) => new Set(s).add(church.id));
    setSavedId(church.id);
    setPending(null);
    setTimeout(() => setSavedId((v) => (v === church.id ? null : v)), 1500);
  }

  function cancelPending() {
    if (!pending) return;
    const m = markersRef.current.get(pending.churchId);
    if (m) m.setLngLat([pending.oldLon, pending.oldLat]);
    setPending(null);
  }

  async function revertChurch(church: TbilisiChurch) {
    if (!confirm(`Удалить сохранённую правку для «${church.name.ru}» и вернуть координаты из JSON?`)) return;
    setSavingId(church.id);
    const { error: dbErr } = await supabase
      .from("tbilisi_coord_verifications")
      .delete()
      .eq("church_id", church.id);
    setSavingId(null);
    if (dbErr) {
      setError(`${church.name.ru}: ${dbErr.message}`);
      return;
    }
    // Re-fetch base JSON coords for this church so marker snaps back.
    const base = await fetch("/data/tbilisi-churches.json").then((r) => r.json());
    const orig = (base as TbilisiChurch[]).find((c) => c.id === church.id);
    if (!orig) return;
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.id === church.id
              ? { ...r, lat: orig.lat, lon: orig.lon, confidence: orig.confidence, verifiedByAi: false }
              : r,
          )
        : prev,
    );
    const m = markersRef.current.get(church.id);
    if (m) m.setLngLat([orig.lon, orig.lat]);
    setEditedIds((s) => {
      const n = new Set(s);
      n.delete(church.id);
      return n;
    });
  }

  async function exportJson() {
    if (!rows) return;
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

  const pendingChurch = pending ? rowsRef.current?.find((r) => r.id === pending.churchId) : null;
  const pendingDistance = pending
    ? haversine(pending.oldLat, pending.oldLon, pending.newLat, pending.newLon)
    : 0;

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

          {mapError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/95 p-6 text-center text-xs">
              <div className="max-w-md space-y-2">
                <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
                <p className="font-medium">Карта не загрузилась</p>
                <p className="text-muted-foreground">{mapError}</p>
              </div>
            </div>
          )}

          {pending && pendingChurch && (
            <div className="absolute left-1/2 top-3 z-10 w-[min(420px,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-border bg-card p-3 shadow-lg">
              <div className="text-xs font-medium">Сохранить новые координаты?</div>
              <div className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{pendingChurch.name.ru}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                <span>было: {pending.oldLat.toFixed(5)}, {pending.oldLon.toFixed(5)}</span>
                <span>стало: {pending.newLat.toFixed(5)}, {pending.newLon.toFixed(5)}</span>
                <span className="col-span-2">смещение: {pendingDistance < 1000 ? `${pendingDistance.toFixed(0)} м` : `${(pendingDistance / 1000).toFixed(2)} км`}</span>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={cancelPending} disabled={savingId != null}>
                  <X className="mr-1 h-3.5 w-3.5" /> Отменить
                </Button>
                <Button size="sm" onClick={confirmPending} disabled={savingId != null}>
                  {savingId != null ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-3.5 w-3.5" />
                  )}
                  Сохранить
                </Button>
              </div>
            </div>
          )}

          {savedId != null && !pending && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-md bg-card/95 px-3 py-1.5 text-xs shadow-lg">
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="h-3 w-3" /> Сохранено
              </span>
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
              const isEdited = editedIds.has(r.id) || r.verifiedByAi;
              return (
                <li key={r.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => flyTo(r)}
                    className={
                      "flex-1 rounded-md px-2 py-1 text-left transition-colors " +
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
                  {isEdited && (
                    <button
                      onClick={() => revertChurch(r)}
                      title="Удалить сохранённую правку и вернуть координаты из JSON"
                      className="rounded-md p-1 text-muted-foreground opacity-0 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                      <Undo2 className="h-3 w-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="border-t border-border pt-2 text-[10px] leading-snug text-muted-foreground">
            Перетащите маркер — появится подтверждение «Сохранить / Отменить». При сохранении точка
            уходит в БД (статус «approved») и перекрывает координаты на странице{" "}
            <code className="font-mono">/tbilisi</code>. Кнопка <Undo2 className="inline h-3 w-3" />{" "}
            у церкви удаляет сохранённую правку и возвращает оригинальные координаты из JSON.
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
