import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fetchTbilisiChurches, type TbilisiChurch } from "@/lib/tbilisiChurches";
import { CONFESSION_COLORS, TBILISI_BBOX } from "@/lib/i18n-tbilisi";
import { HISTORICAL_MAPS, type HistoricalMapEntry } from "@/lib/tbilisi-historical";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Download, Loader2, Search, Check, X, Undo2, AlertTriangle } from "lucide-react";

/** В админке показываем только реально привязанные подложки. */
const AVAILABLE_MAPS = HISTORICAL_MAPS.filter((m) => m.config?.kind === "tiles");

interface PendingMove {
  churchId: number;
  oldLat: number;
  oldLon: number;
  newLat: number;
  newLon: number;
}

const ADMIN_BASEMAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/** Admin panel: drag church markers on top of Tbilisi 1898 raster, save to DB. */
export function TbilisiCoordEditorPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  // Keep latest rows accessible to map event closures without re-creating markers.
  const rowsRef = useRef<TbilisiChurch[] | null>(null);
  const [rows, setRows] = useState<TbilisiChurch[] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [histOpacity, setHistOpacity] = useState(75);
  const [districtsOn, setDistrictsOn] = useState(true);
  /** "none" = без подложки; иначе id одной из AVAILABLE_MAPS. */
  const [mapId, setMapId] = useState<string>(() => AVAILABLE_MAPS[0]?.id ?? "none");
  const histOn = mapId !== "none";
  const selectedMap: HistoricalMapEntry | undefined = useMemo(
    () => AVAILABLE_MAPS.find((m) => m.id === mapId),
    [mapId],
  );
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "not_high" | "low_only">("all");
  const [showAllYears, setShowAllYears] = useState(() => {
    try {
      const v = localStorage.getItem("tbilisi-admin-showAllYears");
      // По умолчанию показываем ВСЕ годы — иначе при первом открытии многие
      // церкви с записями после года карты не видны и кажется, что точки пропали.
      return v === null ? true : v === "true";
    } catch {
      return true;
    }
  });
  const [query, setQuery] = useState("");
  const [searchLang, setSearchLang] = useState<"ru" | "en">("ru");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [editedIds, setEditedIds] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Persist year filter toggle across reloads / tabs
  useEffect(() => {
    try {
      localStorage.setItem("tbilisi-admin-showAllYears", String(showAllYears));
    } catch {}
  }, [showAllYears]);

  // Load churches once
  useEffect(() => {
    fetchTbilisiChurches().then(setRows);
  }, []);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);


  // Init map once. Some browsers / iframes give the container 0×0 size on the
  // first paint after a tab switch; we poll briefly until it actually has
  // dimensions, otherwise MapLibre creates a canvas that never repaints.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    let attempts = 0;
    let ro: ResizeObserver | undefined;

    const tryInit = () => {
      if (cancelled || mapRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if ((w < 50 || h < 50) && attempts < 40) {
        attempts++;
        setTimeout(tryInit, 50);
        return;
      }

      let map: MLMap;
      try {
        map = new maplibregl.Map({
          container: el,
          style: ADMIN_BASEMAP_STYLE,
          center: [(TBILISI_BBOX[0] + TBILISI_BBOX[2]) / 2, (TBILISI_BBOX[1] + TBILISI_BBOX[3]) / 2],
          zoom: 13,
          attributionControl: { compact: true },
        });
      } catch (e) {
        console.error("[TbilisiCoordEditor] map ctor failed", e);
        setMapError(
          (e as Error)?.message ||
            "MapLibre не смог инициализировать WebGL — попробуйте обновить страницу или включить аппаратное ускорение в браузере.",
        );
        return;
      }

      let styleFailed = false;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

      map.on("error", (e) => {
        const err = e?.error as (Error & { status?: number }) | undefined;
        console.warn("[TbilisiCoordEditor] map error", err);
        // If the style itself failed to load (e.g. Stadia 401 on lovableproject.com
        // sandbox domain), swap to a plain OSM raster style so the editor still works.
        const msg = err?.message ?? "";
        if (!styleFailed && (msg.includes("style") || msg.includes("Failed to fetch") || (err as any)?.status === 401)) {
          styleFailed = true;
          try {
            map.setStyle(ADMIN_BASEMAP_STYLE);
            console.warn("[TbilisiCoordEditor] switched to OSM fallback style");
          } catch (e2) {
            console.error("[TbilisiCoordEditor] fallback style failed", e2);
          }
        }
      });

      const onStyleReady = () => {
        if (!map.getSource("districts-overlay")) {
          map.addSource("districts-overlay", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "districts-overlay-fill",
            type: "fill",
            source: "districts-overlay",
            paint: { "fill-color": "#b45309", "fill-opacity": 0.06 },
          });
          map.addLayer({
            id: "districts-overlay-line",
            type: "line",
            source: "districts-overlay",
            paint: { "line-color": "#92400e", "line-width": 2, "line-dasharray": [3, 2], "line-opacity": 0.85 },
          });
        }
        setMapReady(true);
        // Bump version so the hist-overlay effect re-runs and re-adds the
        // raster if a style swap (fallback) wiped custom sources/layers.
        setStyleVersion((v) => v + 1);
        requestAnimationFrame(() => map.resize());
      };

      map.on("load", onStyleReady);
      // setStyle (fallback) fires `styledata` again — re-add overlays on top.
      map.on("styledata", () => {
        if (mapRef.current && map.isStyleLoaded()) onStyleReady();
      });

      mapRef.current = map;
      ro = new ResizeObserver(() => map.resize());
      ro.observe(el);
    };

    tryInit();

    return () => {
      cancelled = true;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // (Re)build the historical raster + districts when the selected map changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Tear down previous raster, if any.
    if (map.getLayer("hist-overlay")) map.removeLayer("hist-overlay");
    if (map.getSource("hist-overlay")) map.removeSource("hist-overlay");

    const cfg = selectedMap?.config ?? null;
    if (cfg) {
      if (cfg.kind === "tiles") {
        map.addSource("hist-overlay", {
          type: "raster",
          tiles: [cfg.tiles],
          tileSize: 256,
          minzoom: cfg.minzoom ?? 10,
          maxzoom: cfg.maxzoom ?? 18,
        });
      } else {
        map.addSource("hist-overlay", {
          type: "image",
          url: cfg.url,
          coordinates: cfg.coordinates,
        } as maplibregl.ImageSourceSpecification);
      }
      // Insert below district fills so polygons stay visible.
      const beforeId = map.getLayer("districts-overlay-fill") ? "districts-overlay-fill" : undefined;
      map.addLayer(
        {
          id: "hist-overlay",
          type: "raster",
          source: "hist-overlay",
          paint: { "raster-opacity": histOpacity / 100 },
          layout: { visibility: histOn ? "visible" : "none" },
        },
        beforeId,
      );
    }

    // Refresh districts: fetch new URL or clear if none.
    const src = map.getSource("districts-overlay") as GeoJSONSource | undefined;
    const url = selectedMap?.districtsUrl;
    if (!url) {
      if (src) src.setData({ type: "FeatureCollection", features: [] });
    } else {
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const s = map.getSource("districts-overlay") as GeoJSONSource | undefined;
          if (s) s.setData(d && d.features?.length ? d : { type: "FeatureCollection", features: [] });
        })
        .catch(() => {
          const s = map.getSource("districts-overlay") as GeoJSONSource | undefined;
          if (s) s.setData({ type: "FeatureCollection", features: [] });
        });
    }
  }, [selectedMap, mapReady, styleVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to histOn/opacity/districts toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer("hist-overlay")) {
      map.setLayoutProperty("hist-overlay", "visibility", histOn ? "visible" : "none");
      map.setPaintProperty("hist-overlay", "raster-opacity", histOpacity / 100);
    }
    for (const id of ["districts-overlay-fill", "districts-overlay-line"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", districtsOn ? "visible" : "none");
      }
    }
  }, [histOn, histOpacity, districtsOn, mapReady]);

  // Filter rows for visible markers
  const visibleRows = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    const histYear = histOn ? selectedMap?.year ?? null : null;
    return rows.filter((r) => {
      const isEdited = editedIds.has(r.id);
      if (!isEdited) {
        if (filter === "not_high" && r.confidence === "high") return false;
        if (filter === "low_only" && !r.confidence.startsWith("low")) return false;
        // Hide churches whose records start after the active historical map's
        // year (e.g. startYear 1902 on the 1898 map). Toggle off via "Все годы".
        if (!showAllYears && histYear != null && r.startYear != null && r.startYear > histYear) return false;
      }
      if (q) {
        const hay = (r.name.ru + " " + r.name.en + " " + r.name.ka + " " + r.address).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, query, editedIds, histOn, selectedMap, showAllYears]);

  // Autocomplete suggestions — across ALL rows (ignore confidence filter so
  // hidden churches are still findable), ranked by match quality in the
  // currently selected language.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!rows || q.length < 1) return [];
    type Scored = { row: TbilisiChurch; score: number };
    const scored: Scored[] = [];
    for (const r of rows) {
      const primary = (searchLang === "ru" ? r.name.ru : r.name.en).toLowerCase();
      const other = (searchLang === "ru" ? r.name.en : r.name.ru).toLowerCase();
      const ka = r.name.ka.toLowerCase();
      const addr = (r.address ?? "").toLowerCase();
      let score = 0;
      if (primary.startsWith(q)) score = 100;
      else if (primary.includes(q)) score = 80;
      else if (other.startsWith(q)) score = 60;
      else if (other.includes(q)) score = 50;
      else if (ka.includes(q)) score = 40;
      else if (addr.includes(q)) score = 20;
      if (score > 0) scored.push({ row: r, score });
    }
    scored.sort((a, b) => b.score - a.score || a.row.name.ru.localeCompare(b.row.name.ru));
    return scored.slice(0, 8).map((s) => s.row);
  }, [rows, query, searchLang]);

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
      const isSel = selectedId === r.id;
      if (!m) {
        // Wrapper element is positioned by MapLibre via transform: translate(...).
        // We MUST NOT set `transform` on it, otherwise the marker jumps to (0,0).
        // Visual styling + hover scale go on an inner child element.
        const el = document.createElement("div");
        el.style.cssText = "width:18px;height:18px;cursor:move;";
        const dot = document.createElement("div");
        dot.dataset.role = "tbilisi-marker-dot";
        dot.style.cssText = `width:100%;height:100%;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.4);background:${CONFESSION_COLORS[r.confession] ?? "#888"};transition:transform 120ms ease, box-shadow 120ms ease;transform-origin:center;`;
        el.appendChild(dot);

        // Hover popup: church name + confession + current coords.
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 14,
          className: "tbilisi-admin-marker-popup",
        });
        const churchId = r.id;
        const renderPopupHtml = () => {
          const cur = rowsRef.current?.find((x) => x.id === churchId) ?? r;
          const nameRu = escapeHtml(cur.name.ru || cur.name.en || cur.name.ka);
          const nameEn = cur.name.en && cur.name.en !== cur.name.ru ? `<div style="font-size:10px;color:#666;">${escapeHtml(cur.name.en)}</div>` : "";
          const nameKa = cur.name.ka ? `<div style="font-size:10px;color:#666;direction:ltr;">${escapeHtml(cur.name.ka)}</div>` : "";
          const addr = cur.address ? `<div style="font-size:10px;color:#888;margin-top:2px;">${escapeHtml(cur.address)}</div>` : "";
          return `
            <div style="font:11px/1.35 system-ui,-apple-system,sans-serif;min-width:180px;max-width:260px;">
              <div style="font-weight:600;">#${cur.id} · ${nameRu}</div>
              ${nameEn}${nameKa}${addr}
              <div style="margin-top:4px;font-size:10px;color:#666;font-variant-numeric:tabular-nums;">
                ${cur.lat.toFixed(5)}, ${cur.lon.toFixed(5)} · ${escapeHtml(cur.confidence)}
              </div>
            </div>`;
        };

        el.addEventListener("mouseenter", () => {
          dot.style.transform = "scale(1.35)";
          dot.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.35)";
          popup.setLngLat(m!.getLngLat()).setHTML(renderPopupHtml()).addTo(map);
        });
        el.addEventListener("mouseleave", () => {
          const stillSelected = markersRef.current.get(churchId) && rowsRef.current?.find((x) => x.id === churchId);
          dot.style.transform = "scale(1)";
          dot.style.boxShadow = stillSelected && selectedIdRef.current === churchId
            ? "0 0 0 3px rgba(59,130,246,0.7)"
            : "0 0 0 1px rgba(0,0,0,0.4)";
          popup.remove();
        });

        m = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([r.lon, r.lat]).addTo(map);

        m.on("dragstart", () => {
          el.style.cursor = "grabbing";
          popup.remove();
        });
        m.on("drag", () => {
          // Keep popup pinned if visible
          if (popup.isOpen()) popup.setLngLat(m!.getLngLat()).setHTML(renderPopupHtml());
        });
        m.on("dragend", () => {
          el.style.cursor = "move";
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
      // Highlight selected marker
      const dot = (m.getElement().firstElementChild as HTMLDivElement | null);
      if (dot) {
        dot.style.boxShadow = isSel
          ? "0 0 0 3px rgba(59,130,246,0.7)"
          : "0 0 0 1px rgba(0,0,0,0.4)";
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, mapReady, rows, selectedId]);

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
      reasoning: `Manual admin placement on overlay: ${selectedMap?.title ?? mapId}`,
      sources: [{ kind: "admin_manual", note: `Drag-and-drop in admin panel (map=${mapId})` }],
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
        <label className="flex items-center gap-2" title={selectedMap?.notes ?? ""}>
          <input
            type="checkbox"
            checked={histOn}
            onChange={(e) => setHistOn(e.target.checked)}
            disabled={!selectedMap?.config}
          />
          Старая карта:
          <select
            value={mapId}
            onChange={(e) => setMapId(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {HISTORICAL_MAPS.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.config}>
                {m.title}
                {!m.config ? " — нет данных" : ""}
              </option>
            ))}
          </select>
        </label>
        {!selectedMap?.config && (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">
            Заготовка без растра — заполните HISTORICAL_MAPS в src/lib/tbilisi-historical.ts.
          </span>
        )}
        <label className="flex items-center gap-2">
          Прозрачность
          <Slider
            value={[histOpacity]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => setHistOpacity(v)}
            className="w-32"
            disabled={!selectedMap?.config || !histOn}
          />
          <span className="tabular-nums text-muted-foreground">{histOpacity}%</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={districtsOn}
            onChange={(e) => setDistrictsOn(e.target.checked)}
            disabled={!selectedMap?.districtsUrl}
          />
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
          <button
            onClick={() => setShowAllYears((v) => !v)}
            title={
              showAllYears
                ? "Сейчас показаны все церкви, в т.ч. с записями позже года выбранной карты"
                : `Скрыты церкви с записями позже ${selectedMap?.year ?? "года карты"} — нажмите, чтобы показать все`
            }
            className={
              "rounded-md px-2 py-1 transition-colors " +
              (showAllYears
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent")
            }
          >
            {showAllYears ? "Все годы" : `По году карты${selectedMap?.year ? ` (≤${selectedMap.year})` : ""}`}
          </button>
          <Button size="sm" variant="outline" onClick={exportJson}>
            <Download className="mr-1 h-3.5 w-3.5" /> Экспорт JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[70vh] min-h-[480px] overflow-hidden rounded-xl border border-border bg-muted">
          <div ref={containerRef} className="tbilisi-admin-map absolute inset-0" />

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
              onChange={(e) => {
                setQuery(e.target.value);
                setSuggestOpen(true);
                setSuggestIdx(0);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
              onKeyDown={(e) => {
                if (!suggestOpen || suggestions.length === 0) {
                  if (e.key === "ArrowDown" && suggestions.length > 0) setSuggestOpen(true);
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSuggestIdx((i) => Math.min(i + 1, suggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSuggestIdx((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const pick = suggestions[suggestIdx];
                  if (pick) {
                    flyTo(pick);
                    setQuery(searchLang === "ru" ? pick.name.ru : pick.name.en);
                    setSuggestOpen(false);
                  }
                } else if (e.key === "Escape") {
                  setSuggestOpen(false);
                }
              }}
              placeholder={searchLang === "ru" ? "Поиск церкви…" : "Search church…"}
              className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-16 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 overflow-hidden rounded border border-border">
              {(["ru", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setSearchLang(l)}
                  className={
                    "px-1.5 py-0.5 text-[10px] font-medium uppercase transition-colors " +
                    (searchLang === l
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent")
                  }
                >
                  {l}
                </button>
              ))}
            </div>
            {suggestOpen && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg">
                {suggestions.map((s, idx) => {
                  const primary = searchLang === "ru" ? s.name.ru : s.name.en;
                  const secondary = searchLang === "ru" ? s.name.en : s.name.ru;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setSuggestIdx(idx)}
                        onClick={() => {
                          flyTo(s);
                          setQuery(primary);
                          setSuggestOpen(false);
                        }}
                        className={
                          "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs " +
                          (idx === suggestIdx ? "bg-accent" : "hover:bg-muted")
                        }
                      >
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: CONFESSION_COLORS[s.confession] ?? "#888" }}
                        />
                        <span className="flex-1 truncate">
                          <span className="font-medium">{primary}</span>
                          {secondary && secondary !== primary && (
                            <span className="ml-1 text-muted-foreground">· {secondary}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {s.confidence}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
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
                      <span className="truncate">{searchLang === "ru" ? r.name.ru : r.name.en}</span>
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

