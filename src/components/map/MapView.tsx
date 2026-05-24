import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, MapGeoJSONFeature, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Fuse from "fuse.js";
import { Search, X, Globe2, MapPin, Info, ListX, Undo2, HelpCircle, RotateCcw, Loader2, CalendarClock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { UnlocatedPanel, UnlocatedItem } from "./UnlocatedPanel";
import { ReportProblemButton } from "./ReportProblemButton";
import { Lang, t, compactYears } from "@/lib/i18n";
import { useUserCoords, userRecordToFeature, unlocatedKey } from "@/lib/userCoords";
import { useApprovedSuggestions, approvedToFeature, submitSuggestion } from "@/lib/communityCoords";
import { usePublishedOverrides, applyOverrides } from "@/lib/featureOverrides";
import { MissingYearsSuggestionDialog } from "./MissingYearsSuggestionDialog";
import { supabase } from "@/integrations/supabase/client";
import {
  BASEMAP_STYLE,
  attachBasemapFallback,
  BUCKET_COLORS,
  BUCKET_ORDER,
  colorExpression,
  radiusExpression,
} from "@/lib/map-style";
import { circlePolygon, neighborsWithin } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizeName, normalizeAdmin, isProbableMatch, similarity } from "@/lib/fuzzyMatch";
import { ExternalSourcesList } from "@/components/map/ExternalSourcesList";
import { isInsideTbilisi, tT } from "@/lib/i18n-tbilisi";
import { MapAuthorBadge, MapHomeButton } from "@/components/AuthorCredit";
import { Link } from "@tanstack/react-router";
import { Landmark } from "lucide-react";

type Feature = GeoJSON.Feature<GeoJSON.Point, any>;
type FC = GeoJSON.FeatureCollection<GeoJSON.Point, any>;

// Trailing parenthetical "(бывш. X)" / "(formerly X)" / "(ყოფ. X)" markers
// used in source data to record former settlement names. We extract them into
// a structured `aliases` field so the UI can show a clean primary name plus a
// "former name" badge, and so search can match the alias.
const ALIAS_MARKERS = [
  /\(\s*(?:бывш\.?|ранее)\s+([^)]+?)\s*\)/gi,
  /\(\s*formerly\s+([^)]+?)\s*\)/gi,
  /\(\s*ყოფ\.?\s+([^)]+?)\s*\)/gi,
];

function splitAliases(name: string): { clean: string; aliases: string[] } {
  if (!name) return { clean: "", aliases: [] };
  const aliases: string[] = [];
  let clean = name;
  for (const re of ALIAS_MARKERS) {
    clean = clean.replace(re, (_m, cap: string) => {
      const v = (cap || "").trim();
      if (v) aliases.push(v);
      return "";
    });
  }
  return { clean: clean.replace(/\s{2,}/g, " ").trim(), aliases };
}

/** Wrap matched character ranges (Fuse.js indices) in <mark>. */
function renderHighlight(
  text: string,
  indices: ReadonlyArray<readonly [number, number]> | undefined,
): React.ReactNode {
  if (!text) return text;
  if (!indices || indices.length === 0) return text;
  const sorted = [...indices].sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let cursor = 0;
  sorted.forEach(([start, end], i) => {
    if (start > cursor) out.push(text.slice(cursor, start));
    out.push(
      <mark
        key={i}
        className="rounded bg-amber-500/30 px-0.5 text-foreground"
      >
        {text.slice(start, end + 1)}
      </mark>,
    );
    cursor = end + 1;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/** Normalize features: pull "(бывш. X)" out of the settlement name into
 *  `properties.aliases` and `properties.historicalName` (when not set). */
function normalizeAliases(fc: FC): FC {
  let changed = false;
  const next: any[] = fc.features.map((f) => {
    const p: any = f.properties ?? {};
    const s = p.settlement ?? {};
    const ru = splitAliases(s.ru || "");
    const en = splitAliases(s.en || "");
    const ka = splitAliases(s.ka || "");
    const hasAny = ru.aliases.length || en.aliases.length || ka.aliases.length;
    if (!hasAny) return f;
    changed = true;
    const aliases = { ru: ru.aliases, en: en.aliases, ka: ka.aliases };
    const histExisting = p.historicalName;
    const histFilled = histExisting && (histExisting.ru || histExisting.en || histExisting.ka)
      ? histExisting
      : {
          ru: ru.aliases[0] || histExisting?.ru || "",
          en: en.aliases[0] || histExisting?.en || "",
          ka: ka.aliases[0] || histExisting?.ka || "",
        };
    return {
      ...f,
      properties: {
        ...p,
        settlement: {
          ...s,
          ru: ru.clean || s.ru,
          en: en.clean || s.en,
          ka: ka.clean || s.ka,
        },
        aliases,
        historicalName: histFilled,
      },
    };
  });
  return changed ? { ...fc, features: next as any } : fc;
}

// Set basemap label fields based on current UI language.
// ka → name:ka, ru → name:ru, en → name:en, each with sensible fallbacks.
function applyBasemapLabels(map: MLMap, lang: Lang) {
  try {
    const style = map.getStyle();
    // Primary localized label (with sensible fallbacks).
    const basePrimary: any = lang === "ka"
      ? ["coalesce", ["get", "name:ka"], ["get", "name:en"], ["get", "name:latin"], ["get", "name_en"], ["get", "name"]]
      : lang === "ru"
      ? ["coalesce", ["get", "name:ru"], ["get", "name:en"], ["get", "name:latin"], ["get", "name_en"], ["get", "name"]]
      : ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name_en"], ["get", "name"]];

    // Manual overrides for ru/en (keep ka as-is). Matched by Georgian name.
    const overrideRu = lang === "ru"
      ? ["case", ["==", ["get", "name:ka"], "სოხუმი"], "Сухум-Кале", basePrimary]
      : null;
    const overrideEn = lang === "en"
      ? ["case", ["==", ["get", "name:ka"], "სოხუმი"], "Sukhum-Kale", basePrimary]
      : null;
    const primary: any = overrideRu ?? overrideEn ?? basePrimary;

    // For ru/en: append the Georgian name on a second line when it exists
    // and differs from the primary label. For ka: show only the Georgian name.
    const expr: any =
      lang === "ka"
        ? primary
        : [
            "case",
            [
              "all",
              ["has", "name:ka"],
              ["!=", ["get", "name:ka"], primary],
            ],
            [
              "format",
              primary,
              {},
              "\n",
              {},
              ["get", "name:ka"],
              { "font-scale": 0.8 },
            ],
            primary,
          ];

    for (const layer of style.layers || []) {
      if (layer.type !== "symbol") continue;
      const layout: any = (layer as any).layout;
      if (!layout || !("text-field" in layout)) continue;
      map.setLayoutProperty(layer.id, "text-field", expr);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[maplibre] label localization failed", e);
  }
}

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

function useIsMobileSm() {
  const [m, setM] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setM(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return m;
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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [uezdFilter, setUezdFilter] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [unlocatedOpen, setUnlocatedOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const userCoords = useUserCoords();
  const approved = useApprovedSuggestions();
  const overrides = usePublishedOverrides();
  const [submitToast, setSubmitToast] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [missingDialogOpen, setMissingDialogOpen] = useState(false);
  const [compareMode, setCompareMode] = useState<"after" | "base">("after");
  useEffect(() => {
    let mounted = true;
    (async () => {
      // Use getUser() so the JWT is re-validated server-side; getSession()
      // only reads localStorage and can be spoofed/stale.
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) return;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (mounted && !error && data === true) setIsAdmin(true);
    })();
    return () => { mounted = false; };
  }, []);
  const T = t(lang);
  const isMobile = useIsMobileSm();
  const [showTbilisiCta, setShowTbilisiCta] = useState(false);
  useEffect(() => {
    let detach: (() => void) | undefined;
    const interval = setInterval(() => {
      const m = mapRef.current;
      if (!m) return;
      clearInterval(interval);
      const update = () => {
        const c = m.getCenter();
        setShowTbilisiCta(m.getZoom() >= 10.5 && isInsideTbilisi(c.lng, c.lat));
      };
      m.on("moveend", update);
      m.on("zoomend", update);
      update();
      detach = () => { m.off("moveend", update); m.off("zoomend", update); };
    }, 200);
    return () => { clearInterval(interval); detach?.(); };
  }, []);

  // Merge base GeoJSON with admin overrides + community-approved + user-pinned features.
  const data: FC | null = useMemo(() => {
    if (!baseData) return null;
    const effectiveOverrides = compareMode === "base" ? [] : overrides;
    const overridden = normalizeAliases(applyOverrides(baseData, effectiveOverrides));
    const baseLen = overridden.features.length;
    const userFeatures = Object.values(userCoords.records).map((rec, i) =>
      userRecordToFeature(rec, 1_000_000 + i + baseLen),
    );
    const approvedFeatures = approved.map((s, i) =>
      approvedToFeature(s, 2_000_000 + i + baseLen),
    );
    if (userFeatures.length === 0 && approvedFeatures.length === 0) return overridden;
    return {
      ...overridden,
      features: [...overridden.features, ...approvedFeatures, ...userFeatures],
    };
  }, [baseData, userCoords.records, approved, overrides, compareMode]);

  const dataRef = useRef<FC | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  // Lock html/body to viewport height only while the fullscreen map is mounted.
  useEffect(() => {
    document.body.dataset.fullscreenMap = "true";
    return () => { delete document.body.dataset.fullscreenMap; };
  }, []);
  // Refs so the (once-registered) map click handler reads up-to-date values.
  const regionFilterRef = useRef("");
  const uezdFilterRef = useRef("");
  useEffect(() => { regionFilterRef.current = regionFilter; }, [regionFilter]);
  useEffect(() => { uezdFilterRef.current = uezdFilter; }, [uezdFilter]);
  // Ref so the once-registered map "load" handler reads the current language.
  const langRef = useRef<Lang>(lang);
  useEffect(() => {
    langRef.current = lang;
    const map = mapRef.current;
    if (map && styleLoadedRef.current) applyBasemapLabels(map, lang);
  }, [lang]);

  // Resolver for "find on map" jumps from the unlocated panel.
  // Strategy: build an index of features keyed by the normalized settlement
  // name, then for any incoming (settlement, uezd) pair try in order:
  //   1. exact normalized name + same normalized uezd
  //   2. exact normalized name (any uezd) — single candidate
  //   3. fuzzy normalized name (Levenshtein-bounded) + same uezd
  //   4. fuzzy normalized name (any uezd) — single best candidate by similarity
  const locatedIndex = useMemo(() => {
    type Entry = { id: number; nameN: string; uezdN: string };
    const byName = new Map<string, Entry[]>();
    const all: Entry[] = [];
    if (data) {
      for (const f of data.features) {
        const p: any = f.properties;
        const nameN = normalizeName(p.settlement?.ru || p.settlement?.en);
        if (!nameN) continue;
        const uezdN = normalizeAdmin(p.uezd?.ru || p.uezd?.en);
        const e: Entry = { id: f.id as number, nameN, uezdN };
        all.push(e);
        const arr = byName.get(nameN) ?? [];
        arr.push(e);
        byName.set(nameN, arr);
        // Also index by aliases (former names) for better recall
        const aliases: string[] = Array.isArray(p.aliases) ? p.aliases : [];
        for (const a of aliases) {
          const an = normalizeName(a);
          if (!an || an === nameN) continue;
          const arr2 = byName.get(an) ?? [];
          arr2.push(e);
          byName.set(an, arr2);
        }
      }
    }
    return (settlement: string, uezd: string): number | undefined => {
      const sN = normalizeName(settlement);
      if (!sN) return undefined;
      const uN = normalizeAdmin(uezd);
      // 1) exact name + matching uezd
      const exact = byName.get(sN);
      if (exact) {
        if (uN) {
          const sameU = exact.find((e) => e.uezdN === uN);
          if (sameU) return sameU.id;
        }
        if (exact.length === 1) return exact[0].id;
      }
      // 3+4) fuzzy fallback — bounded by Levenshtein threshold inside
      // isProbableMatch; rank by uezd match then similarity.
      let best: { id: number; score: number } | undefined;
      for (const e of all) {
        if (!isProbableMatch(sN, e.nameN)) continue;
        const nameSim = similarity(sN, e.nameN);
        const uezdBoost = uN && e.uezdN === uN ? 0.5 : 0;
        const score = nameSim + uezdBoost;
        if (!best || score > best.score) best = { id: e.id, score };
      }
      // Require a reasonable confidence to avoid false positives.
      return best && best.score >= 0.7 ? best.id : undefined;
    };
  }, [data]);

  // Index of "probable matches": features sharing the same settlement name
  // (fuzzy/normalized) but residing in a different uezd. Useful to flag
  // administrative-attribution changes (e.g. one parish split between Gori
  // and Tbilisi uezds) and possible duplicates from transliteration drift.
  const nameMismatchIndex = useMemo(() => {
    const out = new Map<number, Array<{
      id: number;
      settlement: string;
      uezd: string;
      region: string;
      years: string;
    }>>();
    if (!data) return out;
    type Bucket = { id: number; nameN: string; uezdN: string; props: any };
    // Step 1: bucket by normalized name (exact)
    const exactBuckets = new Map<string, Bucket[]>();
    const allBuckets: Bucket[] = [];
    for (const f of data.features) {
      const p: any = f.properties ?? {};
      const nameN = normalizeName(p.settlement?.ru || p.settlement?.en);
      if (!nameN) continue;
      const b: Bucket = {
        id: f.id as number,
        nameN,
        uezdN: normalizeAdmin(p.uezd?.ru || p.uezd?.en),
        props: p,
      };
      allBuckets.push(b);
      const arr = exactBuckets.get(nameN) ?? [];
      arr.push(b);
      exactBuckets.set(nameN, arr);
    }
    // Step 2: cluster fuzzy-equivalent buckets. Index by 2-char prefix to
    // bound pairwise comparisons (avoids N² over the full dataset).
    const byPrefix = new Map<string, string[]>();
    for (const k of exactBuckets.keys()) {
      const pref = k.slice(0, 2);
      const arr = byPrefix.get(pref) ?? [];
      arr.push(k);
      byPrefix.set(pref, arr);
    }
    // Union-Find over name keys
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let p = parent.get(x) ?? x;
      if (p === x) return x;
      p = find(p);
      parent.set(x, p);
      return p;
    };
    const union = (a: string, b: string) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (const keys of byPrefix.values()) {
      if (keys.length < 2) continue;
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          if (isProbableMatch(keys[i], keys[j])) union(keys[i], keys[j]);
        }
      }
    }
    // Step 3: collect each cluster's full bucket list
    const clusters = new Map<string, Bucket[]>();
    for (const [name, list] of exactBuckets) {
      const root = find(name);
      const arr = clusters.get(root) ?? [];
      arr.push(...list);
      clusters.set(root, arr);
    }
    // Step 4: emit "probable match" records for features whose siblings sit
    // in a *different* uezd (same-uezd duplicates aren't surfaced here).
    for (const arr of clusters.values()) {
      if (arr.length < 2) continue;
      for (const me of arr) {
        const others = arr.filter(
          (o) => o.id !== me.id && o.uezdN && me.uezdN && o.uezdN !== me.uezdN,
        );
        if (!others.length) continue;
        out.set(
          me.id,
          others.map((o) => ({
            id: o.id,
            settlement: o.props.settlement?.ru || o.props.settlement?.en || "",
            uezd: o.props.uezd?.ru || o.props.uezd?.en || "",
            region: o.props.region?.ru || o.props.region?.en || "",
            years: o.props.yearsRaw?.ru || o.props.yearsRaw?.en || `${o.props.startYear ?? ""}–${o.props.endYear ?? ""}`,
          })),
        );
      }
    }
    return out;
  }, [data]);
  const userPinnedKeys = useMemo(
    () => new Set(Object.keys(userCoords.records)),
    [userCoords.records],
  );
  // Keys of community-approved suggestions already saved in DB —
  // formatted identically to unlocatedKey() so we can dedupe against
  // user pins and exclude them from the unlocated panel.
  const approvedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const a of approved) {
      const settlement = (a.settlement_ru || a.settlement_en || "")
        .toLocaleLowerCase()
        .trim();
      // Use normalizeAdmin so уезд/район/district variants collapse to the
      // same dedup key as unlocatedKey() produces.
      const uezd = normalizeAdmin(a.uezd_ru || a.uezd_en);
      if (settlement) s.add(`${settlement}|${uezd}`);
    }
    return s;
  }, [approved]);
  // Unified set used by all three counters (button, panel, legend)
  // and as the panel's excludeKeys. Deduped via Set union.
  const addedKeys = useMemo(() => {
    const s = new Set<string>(approvedKeys);
    for (const k of userPinnedKeys) s.add(k);
    return s;
  }, [approvedKeys, userPinnedKeys]);

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
      .catch((e) => {
        console.error("[submitSuggestion]", e);
        setSubmitToast(T.suggestionError);
      });
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
        { name: "properties.settlement.ru", weight: 1.0 },
        { name: "properties.settlement.en", weight: 1.0 },
        { name: "properties.settlement.ka", weight: 1.0 },
        { name: "properties.church.ru", weight: 0.9 },
        { name: "properties.church.en", weight: 0.9 },
        { name: "properties.church.ka", weight: 0.9 },
        { name: "properties.uezd.ru", weight: 0.6 },
        { name: "properties.uezd.en", weight: 0.6 },
        { name: "properties.uezd.ka", weight: 0.6 },
        { name: "properties.region.ru", weight: 0.5 },
        { name: "properties.region.en", weight: 0.5 },
        { name: "properties.region.ka", weight: 0.5 },
        // Aliases / historical names ranked equal to current settlement so
        // a query like "Ахалкалаки" finds renamed places (e.g. former
        // "Ахалкалаки" → modern "X") with equal confidence.
        { name: "properties.aliases.ru", weight: 1.0 },
        { name: "properties.aliases.en", weight: 1.0 },
        { name: "properties.aliases.ka", weight: 1.0 },
        { name: "properties.historicalName.ru", weight: 1.0 },
        { name: "properties.historicalName.en", weight: 1.0 },
        { name: "properties.historicalName.ka", weight: 1.0 },
      ],
      threshold: 0.35,
      minMatchCharLength: 1,
      ignoreLocation: true,
      includeScore: true,
      includeMatches: true,
    });
  }, [data]);

  const minQueryLen = isMobile ? 1 : 2;

  // Debounce search query so we don't re-run fuse / re-render the dropdown
  // on every keystroke. Short delay on desktop, slightly longer on mobile
  // where typing is more frequent and lists must stay snappy.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), isMobile ? 140 : 90);
    return () => clearTimeout(id);
  }, [query, isMobile]);

  const RESULT_LIMIT = isMobile ? 10 : 8;
  const searchResults = useMemo(() => {
    if (!fuse || debouncedQuery.trim().length < minQueryLen) return [];
    const q = debouncedQuery.trim();
    type MatchInfo = {
      key?: string;
      value?: string;
      indices?: ReadonlyArray<readonly [number, number]>;
    };
    const pickBest = (matches: ReadonlyArray<MatchInfo>, prefix: string) => {
      let best: MatchInfo | undefined;
      let bestLen = -1;
      for (const m of matches) {
        if (!m.key?.startsWith(prefix)) continue;
        const len = (m.indices ?? []).reduce(
          (s, [a, b]) => s + (b - a + 1),
          0,
        );
        if (len > bestLen) { best = m; bestLen = len; }
      }
      return best;
    };
    return fuse
      .search(q, { limit: RESULT_LIMIT * 2 })
      .map((r) => {
        const matches = (r.matches ?? []) as ReadonlyArray<MatchInfo>;
        const aliasHit = pickBest(matches, "properties.aliases");
        const histHit  = pickBest(matches, "properties.historicalName");
        const settHit  = pickBest(matches, "properties.settlement");
        const churchHit = pickBest(matches, "properties.church");
        // Reason ranking: alias/historical first (the user is looking for the
        // historical name), then settlement, then church, then other.
        const reason: "alias" | "historical" | "settlement" | "church" | "other" =
          aliasHit ? "alias"
          : histHit ? "historical"
          : settHit ? "settlement"
          : churchHit ? "church"
          : "other";
        const reasonRank = { alias: 0, historical: 1, settlement: 2, church: 3, other: 4 }[reason];
        return {
          feature: r.item as Feature,
          score: r.score ?? 1,
          reason,
          reasonRank,
          aliasHit,
          histHit,
          churchHit,
          churchMatch: !!churchHit && !aliasHit && !histHit && !settHit,
        };
      })
      .sort((a, b) => {
        // Strong reason wins; within the same reason, lower fuse score is better.
        if (a.reasonRank !== b.reasonRank) return a.reasonRank - b.reasonRank;
        return a.score - b.score;
      })
      .slice(0, RESULT_LIMIT);
  }, [fuse, debouncedQuery, minQueryLen, RESULT_LIMIT]);

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
    const q = debouncedQuery.trim().toLocaleLowerCase();
    if (q.length < minQueryLen) return { uezds: [] as typeof areaIndex.uezds, regions: [] as typeof areaIndex.regions };
    const filt = (arr: typeof areaIndex.uezds) =>
      arr.filter((x) => x.key.includes(q)).slice(0, 3);
    return { uezds: filt(areaIndex.uezds), regions: filt(areaIndex.regions) };
  }, [areaIndex, debouncedQuery, minQueryLen]);

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
    attachBasemapFallback(map);
    map.on("error", (e) => {
      // surface MapLibre errors instead of leaving a white canvas
      // eslint-disable-next-line no-console
      console.error("[maplibre]", e.error || e);
    });
    map.on("load", () => {
      styleLoadedRef.current = true;
      applyBasemapLabels(map, langRef.current);
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
          0.6,
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

  const pulseRafRef = useRef<number | null>(null);
  function pulseHalo() {
    const map = mapRef.current;
    if (!map || !map.getLayer("selected-halo")) return;
    if (pulseRafRef.current) cancelAnimationFrame(pulseRafRef.current);
    const start = performance.now();
    const DUR = 1800;
    const PULSES = 3;
    const step = (now: number) => {
      const m = mapRef.current;
      if (!m || !m.getLayer("selected-halo")) { pulseRafRef.current = null; return; }
      const t = Math.min(1, (now - start) / DUR);
      const phase = (t * PULSES) % 1;
      const ease = Math.sin(phase * Math.PI); // 0 → 1 → 0
      const r = 22 + ease * 16;
      const op = 0.9 - ease * 0.55;
      m.setPaintProperty("selected-halo", "circle-radius", r);
      m.setPaintProperty("selected-halo", "circle-stroke-opacity", op);
      m.setPaintProperty("selected-halo", "circle-stroke-width", 3 + ease * 1.5);
      if (t < 1) {
        pulseRafRef.current = requestAnimationFrame(step);
      } else {
        m.setPaintProperty("selected-halo", "circle-radius", 22);
        m.setPaintProperty("selected-halo", "circle-stroke-opacity", 0.9);
        m.setPaintProperty("selected-halo", "circle-stroke-width", 3);
        pulseRafRef.current = null;
      }
    };
    pulseRafRef.current = requestAnimationFrame(step);
  }

  function selectFeature(f: Feature) {
    setSelected(f);
    // Если активен фильтр по региону/уезду — сохраняем подсветку района,
    // чтобы выбор отдельной точки не сбрасывал контекст. Иначе сбрасываем
    // прежний радиус/районную подсветку, как и раньше.
    if (!regionFilterRef.current && !uezdFilterRef.current) {
      setNeighborIds(new Set());
      setHighlightMode(null);
    }
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("selected") as any)?.setData({
      type: "FeatureCollection", features: [f],
    });
    (map.getSource("radius") as any)?.setData({ type: "FeatureCollection", features: [] });
    // Плавный перелёт с сохранением видимости точки: на мобильных смещаем
    // центр выше, чтобы карточка снизу не перекрывала выбранную точку.
    const targetZoom = Math.max(map.getZoom(), 9);
    map.flyTo({
      center: f.geometry.coordinates as [number, number],
      zoom: targetZoom,
      duration: 900,
      curve: 1.42,
      speed: 0.9,
      offset: isMobile ? [0, -120] : [0, -40],
      essential: true,
    });
    pulseHalo();
  }

  // Compute highlighted ids based on the currently chosen region / uezd
  // dropdown filters (intersection if both). Returns [] when neither is set.
  function currentFilterIds(): number[] {
    const r = regionFilterRef.current
      ? areaIndex.regions.find((x) => x.key === regionFilterRef.current)
      : null;
    const u = uezdFilterRef.current
      ? areaIndex.uezds.find((x) => x.key === uezdFilterRef.current)
      : null;
    if (r && u) {
      const us = new Set(u.ids);
      return r.ids.filter((id) => us.has(id));
    }
    if (r) return r.ids;
    if (u) return u.ids;
    return [];
  }

  function clearSelection() {
    setSelected(null);
    const map = mapRef.current;
    if (map) {
      (map.getSource("selected") as any)?.setData({ type: "FeatureCollection", features: [] });
      (map.getSource("radius") as any)?.setData({ type: "FeatureCollection", features: [] });
    }
    // Если активен фильтр по уезду/региону — возвращаемся к его подсветке,
    // иначе полностью снимаем выделение.
    const ids = currentFilterIds();
    if (ids.length > 0) {
      setNeighborIds(new Set(ids));
      setHighlightMode("area");
    } else {
      setNeighborIds(new Set());
      setHighlightMode(null);
    }
  }

  function showRadius() {
    if (!selected) return;
    const map = mapRef.current;
    // Toggle: если радиус уже включён — выключаем и возвращаем фильтр уезда/региона
    // (если он был активен).
    if (highlightMode === "radius") {
      (map?.getSource("radius") as any)?.setData({ type: "FeatureCollection", features: [] });
      const ids = currentFilterIds();
      if (ids.length > 0) {
        setNeighborIds(new Set(ids));
        setHighlightMode("area");
      } else {
        setNeighborIds(new Set());
        setHighlightMode(null);
      }
      return;
    }
    const [lon, lat] = selected.geometry.coordinates;
    const ids = new Set(neighborsWithin(points, lon, lat, 10));
    setNeighborIds(ids);
    setHighlightMode("radius");
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
      data-card-open={selected ? "true" : "false"}
      data-legend-visible={!selected ? "true" : "false"}
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

      {/* Floating CTA — appears when zoomed into Tbilisi */}
      {showTbilisiCta && (
        <Link
          to="/tbilisi"
          search={{ lang }}
          className="pointer-events-auto absolute left-1/2 top-20 z-20 inline-flex -translate-x-1/2 animate-in fade-in slide-in-from-top-2 items-center gap-2 rounded-full border border-primary/40 bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-2xl hover:-translate-y-0.5 transition sm:top-24"
        >
          <Landmark className="h-4 w-4" />
          {tT(lang).cityZoomCta}
        </Link>
      )}


      {/* Top bar: search + lang */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-stretch gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:p-4">
        <div className="pointer-events-auto w-full sm:max-w-md">
          {/* Region / Uezd dropdown filters — highlight all matching points. */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={regionFilter}
              onChange={(e) => {
                setRegionFilter(e.target.value);
                setUezdFilter("");
              }}
              aria-label={T.regionLabel}
              className="w-full rounded-lg border border-border bg-card/95 px-2 py-1.5 text-xs shadow-lg backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{isMobile ? T.regionLabel : T.allRegions}</option>
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
              <option value="">{isMobile ? T.uezdLabel : T.allUezds}</option>
              {uezdsForRegion.map((u) => (
                <option key={u.key} value={u.key}>{u.label}</option>
              ))}
            </select>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (searchResults[0]) {
                    const f = searchResults[0].feature;
                    selectFeature(f);
                    setQuery(f.properties.settlement[lang] || f.properties.settlement.en);
                    setShowResults(false);
                    (e.currentTarget as HTMLInputElement).blur();
                  } else if (areaMatches.uezds[0]) {
                    highlightArea(areaMatches.uezds[0].ids);
                    setQuery(areaMatches.uezds[0].label);
                    setShowResults(false);
                    (e.currentTarget as HTMLInputElement).blur();
                  } else if (areaMatches.regions[0]) {
                    highlightArea(areaMatches.regions[0].ids);
                    setQuery(areaMatches.regions[0].label);
                    setShowResults(false);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                } else if (e.key === "Escape") {
                  setShowResults(false);
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              placeholder={T.searchShort}
              aria-label={T.search}
              title={T.search}
              aria-autocomplete="list"
              aria-expanded={showResults && query.trim().length >= minQueryLen}
              role="combobox"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full rounded-xl border border-border bg-card/95 py-2.5 pl-10 pr-9 text-sm shadow-lg backdrop-blur outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery("");
                  setShowResults(false);
                  clearSelection();
                }}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent active:bg-accent"
                aria-label={T.clear}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {showResults && query.trim().length >= minQueryLen && (
              <div
                role="listbox"
                className="absolute mt-2 w-full overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl animate-fade-in max-h-[50vh] sm:max-h-[70vh]"
              >
                {(areaMatches.uezds.length > 0 || areaMatches.regions.length > 0) && (
                  <div className="border-b border-border bg-muted/40">
                    {areaMatches.uezds.map((u) => (
                      <button
                        key={"u-" + u.key}
                        type="button"
                        role="option"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          highlightArea(u.ids);
                          setQuery(u.label);
                          setShowResults(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-3 text-left text-sm last:border-b-0 hover:bg-accent active:bg-accent sm:py-2"
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
                        type="button"
                        role="option"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          highlightArea(r.ids);
                          setQuery(r.label);
                          setShowResults(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-3 text-left text-sm last:border-b-0 hover:bg-accent active:bg-accent sm:py-2"
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
                  <div className="p-3 text-sm text-muted-foreground">
                    {query !== debouncedQuery ? "…" : T.notFoundTitle}
                  </div>
                ) : searchResults.map(({ feature: f, churchMatch, reason, aliasHit, histHit }) => {
                  const p = f.properties;
                  const settlementName = p.settlement[lang] || p.settlement.en || "—";
                  const churchName = p.church[lang] || p.church.en;
                  const aliasLabel =
                    reason === "alias" ? (aliasHit?.value ?? "") :
                    reason === "historical" ? (histHit?.value ?? "") : "";
                  const aliasIndices =
                    reason === "alias" ? aliasHit?.indices :
                    reason === "historical" ? histHit?.indices : undefined;
                  const showAliasRow = (reason === "alias" || reason === "historical")
                    && aliasLabel && aliasLabel.toLocaleLowerCase() !== settlementName.toLocaleLowerCase();
                  return (
                    <button
                      key={f.id as number}
                      type="button"
                      role="option"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        selectFeature(f);
                        setQuery(settlementName);
                        setShowResults(false);
                      }}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-3 text-left text-sm last:border-b-0 hover:bg-accent active:bg-accent sm:py-2"
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium">
                          {showAliasRow
                            ? renderHighlight(aliasLabel, aliasIndices)
                            : churchMatch && churchName
                              ? churchName
                              : settlementName}
                        </span>
                        {showAliasRow && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                            {reason === "historical" ? T.historyBadgeFormer : T.historyFormer}
                          </span>
                        )}
                        {!showAliasRow && churchMatch && churchName && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {T.church}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(showAliasRow
                          ? [`→ ${settlementName}`, p.uezd[lang] || p.uezd.en, p.region[lang] || p.region.en]
                          : churchMatch && churchName
                            ? [settlementName, p.uezd[lang] || p.uezd.en, p.region[lang] || p.region.en]
                            : [churchName, p.uezd[lang] || p.uezd.en, p.region[lang] || p.region.en]
                        ).filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  );
                })}
              </div>
        )}
      </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          {!embed && <MapHomeButton lang={lang} />}
          <button
            onClick={resetView}
            title={T.resetView}
            aria-label={T.resetView}
            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-border bg-card/95 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent lg:flex"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setUnlocatedOpen(true)}
            title={T.unlocatedButton}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent"
          >
            <ListX className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">{T.unlocatedButton}</span>
            <span className="lg:hidden">{T.unlocatedButtonShort}</span>
            {(() => {
              const base = stats?.unlocatedGroups ?? stats?.withoutCoords;
              if (!base) return null;
              const remaining = Math.max(0, base - addedKeys.size);
              return (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {remaining.toLocaleString()}
                </span>
              );
            })()}
          </button>
          {/* Compact language switcher: single globe icon + 3 letter buttons */}
          <div className="flex h-8 items-center overflow-hidden rounded-lg border border-border bg-card/95 shadow-lg backdrop-blur">
            <span className="hidden items-center pl-1.5 pr-0.5 text-muted-foreground sm:flex">
              <Globe2 className="h-3 w-3" />
            </span>
            {(["ru", "en", "ka"] as const).map(l => (
              <button
                key={l}
                onClick={() => onLangChange(l)}
                className={cn(
                  "h-full px-2 text-xs font-medium uppercase tracking-wide transition-colors",
                  lang === l
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
                aria-pressed={lang === l}
              >
                {l === "ka" ? "ქა" : l}
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
        excludeKeys={addedKeys}
        totalCount={Math.max(
          0,
          (stats?.unlocatedGroups ?? stats?.withoutCoords ?? 0) - addedKeys.size,
        )}
        onAddCoords={handleAddCoords}
      />

      {!embed && (
        <ReportProblemButton
          lang={lang}
          getMapState={() => {
            const m = mapRef.current;
            if (!m) return null;
            const c = m.getCenter();
            return { lat: c.lat, lon: c.lng, zoom: m.getZoom() };
          }}
        />
      )}

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
         const histRaw = sel.historicalName as { ru?: string; en?: string; ka?: string } | undefined;
         const histName = histRaw ? (histRaw[lang] || histRaw.en || histRaw.ru || "") : "";
         const aliasRaw = sel.aliases as { ru?: string[]; en?: string[]; ka?: string[] } | string[] | undefined;
         const aliasList: string[] = (() => {
           if (!aliasRaw) return [];
           if (Array.isArray(aliasRaw)) return aliasRaw.filter(Boolean);
           const arr = (aliasRaw[lang] && aliasRaw[lang]!.length ? aliasRaw[lang] : (aliasRaw.en?.length ? aliasRaw.en : aliasRaw.ru)) || [];
           return arr.filter(Boolean);
         })();
         const extraAliases = aliasList.filter((a) => a && a !== histName);
        const noteRaw = sel.discrepancyNote as { ru?: string; en?: string; ka?: string } | undefined;
        const noteText = noteRaw ? (noteRaw[lang] || noteRaw.en || noteRaw.ru || "") : "";
        const mismatches = nameMismatchIndex.get(selected.id as number) ?? [];
         const aliasByLang: { code: "ru" | "en" | "ka"; label: string; values: string[] }[] = (() => {
           const raw = sel.aliases as { ru?: string[]; en?: string[]; ka?: string[] } | string[] | undefined;
           if (!raw) return [];
           if (Array.isArray(raw)) {
             const vals = raw.filter(Boolean);
             return vals.length ? [{ code: "ru" as const, label: "RU", values: vals }] : [];
           }
           const labels: Record<"ru" | "en" | "ka", string> = { ru: "RU", en: "EN", ka: "KA" };
           return (["ru", "en", "ka"] as const)
             .map((code) => ({ code, label: labels[code], values: (raw[code] || []).filter(Boolean) }))
             .filter((g) => g.values.length > 0);
         })();
         const hasAliasBlock = aliasByLang.length > 0;
         const hasHistory = !!(histName || noteText || mismatches.length || extraAliases.length);
        return (
        <div className="pointer-events-auto absolute bottom-3 left-3 z-10 flex w-[min(92vw,360px)] max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-2xl border border-border bg-card/98 shadow-2xl backdrop-blur">
          {/* Sticky header */}
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 pb-2 pt-4">
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-semibold leading-tight">
                {sel.settlement[lang] || sel.settlement.en || "—"}
              </h3>
              {(histName || extraAliases.length > 0 || mismatches.length > 0) && (
                 <div className="mt-1 flex flex-wrap items-center gap-1">
                   {histName && (
                     <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                       {T.historyBadgeFormer}: {histName}
                     </span>
                   )}
                   {extraAliases.map((a) => (
                     <span
                       key={a}
                       className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700/90 dark:text-amber-300/90"
                       title={T.historyBadgeFormer}
                     >
                       бывш. {a}
                     </span>
                   ))}
                   {mismatches.length > 0 && (
                     <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                       ⚠ {T.historyBadgeMatch}
                     </span>
                   )}
                 </div>
               )}
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

            {hasAliasBlock && (
              <section className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2" aria-label="Бывшие названия">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Бывшие названия
                </div>
                <ul className="space-y-1.5">
                  {aliasByLang.map((g) => (
                    <li key={g.code} className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex min-w-[24px] justify-center rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        {g.label}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {g.values.map((v) => (
                          <span
                            key={v}
                            className="inline-flex items-center rounded-full border border-amber-500/30 bg-background/60 px-2 py-0.5 text-xs text-foreground"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

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

            {hasHistory && (
              <details
                className="group mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 open:bg-amber-500/10"
                aria-label={T.historyTitle}
              >
                <summary
                  className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-amber-700 outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-300"
                  aria-label={`${T.historyTitle}${mismatches.length ? ` — ${mismatches.length}` : ""}`}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block transition-transform group-open:rotate-180"
                  >
                    ▾
                  </span>
                  <span>{T.historyTitle}</span>
                </summary>
                <div className="space-y-2 px-2.5 pb-2.5 pt-1 text-xs">
                  {histName && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {T.historyFormer}
                      </div>
                      <div className="text-foreground">{histName}</div>
                    </div>
                  )}
                  {noteText && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {T.historyNote}
                      </div>
                      <div className="whitespace-pre-line text-foreground">{noteText}</div>
                    </div>
                  )}
                  {mismatches.length > 0 && (
                    <MatchesList
                      title={T.historyMatchTitle}
                      hint={T.historyMatchHint}
                      items={mismatches}
                      onPick={(id) => {
                        const f = data?.features.find((x) => (x.id as number) === id);
                        if (f) selectFeature(f as Feature);
                      }}
                    />
                  )}
                </div>
              </details>
            )}

            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setMissingDialogOpen(true)}
              >
                <CalendarClock className="mr-1.5 h-4 w-4" />
                {T.suggestMissingAction}
              </Button>
            </div>

            <ExternalSourcesList
              lang={lang}
              featureId={typeof selected.id === "number" ? (selected.id as number) : null}
              uezdRu={(sel.uezd as { ru?: string; en?: string; ka?: string })?.ru ?? null}
              uezdEn={(sel.uezd as { ru?: string; en?: string; ka?: string })?.en ?? null}
            />
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

      {selected && sel && (
        <MissingYearsSuggestionDialog
          open={missingDialogOpen}
          onOpenChange={setMissingDialogOpen}
          lang={lang}
          featureId={typeof selected.id === "number" ? (selected.id as number) : null}
          settlement={sel.settlement}
          region={sel.region}
          currentMissing={sel.missingRaw?.[lang] || sel.missingRaw?.en || sel.missingRaw?.ru || ""}
          onSubmitted={(msg) => setSubmitToast(msg)}
        />
      )}

      {/* Mobile: docs button + author badge on the same row (bottom-left),
          and the 2-row legend pinned to the very bottom. Hidden when a card is open. */}
      {!selected && (
        <>
          <div
            style={{
              bottom: "var(--map-overlay-gap-bottom)",
              left: "var(--map-overlay-gap-left)",
              right: "var(--map-overlay-gap-right)",
            }}
            className="pointer-events-none absolute z-10 flex items-center justify-between gap-2 sm:hidden"
          >
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setDocsOpen(true)}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-md backdrop-blur hover:bg-accent"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                {T.docsButton}
              </button>
              <MapAuthorBadge lang={lang} inline />
            </div>
          </div>
          <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-10 sm:hidden">
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
          </div>
        </>
      )}

      {/* Desktop: docs button stacked above the legend (right side). */}
      <div className="pointer-events-none absolute bottom-12 right-3 z-10 hidden w-[min(92vw,260px)] flex-col items-stretch gap-2 sm:flex">
        <button
          onClick={() => setDocsOpen(true)}
          className="pointer-events-auto inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent"
        >
          <HelpCircle className="h-4 w-4" />
          {T.docsButton}
        </button>

        {/* Desktop: full legend + stats panel. */}
        <div className="pointer-events-auto rounded-2xl border border-border bg-card/98 p-3 shadow-2xl backdrop-blur">

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
                const extra = addedKeys.size;
                const total = stats.total;
                const withC = Math.max(0, stats.total - stats.withoutCoords + extra);
                const without = Math.max(0, stats.withoutCoords - extra);
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

      {/* Size legend (bottom-left). Hidden when a point card is open
          (the card occupies the same corner) and on mobile (cramped). */}
      {!sel && (
        <div className="pointer-events-none absolute bottom-12 left-3 z-[5] hidden rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur sm:block">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {T.sizeLegend}
          </div>
          <div className="flex items-end gap-3">
            {[
              { years: 1,   r: Math.max(4, Math.sqrt(1)   * 1.6) },
              { years: 10,  r: Math.max(4, Math.sqrt(10)  * 1.6) },
              { years: 25,  r: Math.max(4, Math.sqrt(25)  * 1.6) },
              { years: 50,  r: Math.max(4, Math.sqrt(50)  * 1.6) },
              { years: 100, r: Math.max(4, Math.sqrt(100) * 1.6) },
              { years: 150, r: Math.max(4, Math.sqrt(150) * 1.6) },
            ].map(({ years, r }) => (
              <div key={years} className="flex flex-col items-center gap-1">
                <span
                  className="rounded-full bg-foreground ring-1 ring-white"
                  style={{ width: r * 2, height: r * 2, opacity: 0.6 }}
                />
                <span className="text-[10px] tabular-nums text-muted-foreground">{years}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <MapAuthorBadge lang={lang} />
    </div>
  );
}

/** Keyboard-navigable list of "probable match" candidates.
 *  - Tab moves focus to the first item, then Tab leaves the list.
 *  - ArrowDown / ArrowUp move focus between items (roving tabindex).
 *  - Home / End jump to first / last item.
 *  - Enter / Space activate the focused item (native button behavior). */
function MatchesList({
  title,
  hint,
  items,
  onPick,
}: {
  title: string;
  hint: string;
  items: Array<{ id: number; settlement: string; uezd: string; region: string; years: string }>;
  onPick: (id: number) => void;
}) {
  const [focusIdx, setFocusIdx] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = `matches-${items[0]?.id ?? "x"}`;

  const focusAt = (i: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    setFocusIdx(clamped);
    itemRefs.current[clamped]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); focusAt(focusIdx + 1); break;
      case "ArrowUp":   e.preventDefault(); focusAt(focusIdx - 1); break;
      case "Home":      e.preventDefault(); focusAt(0); break;
      case "End":       e.preventDefault(); focusAt(items.length - 1); break;
    }
  };

  return (
    <div role="group" aria-labelledby={`${listId}-label`}>
      <div
        id={`${listId}-label`}
        className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        ⚠ {title}
      </div>
      <p id={`${listId}-hint`} className="mb-1 text-muted-foreground">{hint}</p>
      <ul
        role="list"
        aria-describedby={`${listId}-hint`}
        aria-label={`${title} (${items.length})`}
        className="space-y-1"
        onKeyDown={onKeyDown}
      >
        {items.map((m, i) => {
          const meta = [m.uezd, m.region].filter(Boolean).join(" · ");
          const label = `${m.settlement}${meta ? `, ${meta}` : ""}${m.years ? `, ${m.years}` : ""}`;
          return (
            <li key={m.id}>
              <button
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                onClick={() => onPick(m.id)}
                onFocus={() => setFocusIdx(i)}
                tabIndex={i === focusIdx ? 0 : -1}
                aria-label={label}
                aria-posinset={i + 1}
                aria-setsize={items.length}
                className="w-full rounded border border-border bg-background/60 px-2 py-1 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="font-medium" aria-hidden="true">{m.settlement}</div>
                {meta || m.years ? (
                  <div className="text-[10px] text-muted-foreground" aria-hidden="true">
                    {meta}{m.years ? ` · ${m.years}` : ""}
                  </div>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
