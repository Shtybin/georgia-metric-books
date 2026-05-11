import { useEffect, useMemo, useState } from "react";
import { Search, X, MapPin, MapPinPlus, Check } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type LocaleStr = { en: string; ru: string; ka?: string };
export type UnlocatedItem = {
  settlement: LocaleStr;
  church: LocaleStr;
  region: LocaleStr;
  uezd: LocaleStr;
  years: string;
  startYear: number | null;
  endYear: number | null;
  count: number;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  /** Map of `${settlementLower}|${uezdLower}` → feature id, for jump-to-map */
  locatedIndex: Map<string, number>;
  onJumpToFeature: (featureId: number) => void;
  /** Keys of items already pinned by the user — should be hidden from the list. */
  excludeKeys: Set<string>;
  /** User submits new coordinates for an item. */
  onAddCoords: (item: UnlocatedItem, lat: number, lon: number) => void;
}

const MAX_VISIBLE = 250;

function pick(s: LocaleStr, lang: Lang): string {
  return s[lang] || s.en || s.ru || "";
}

function itemKey(it: UnlocatedItem): string {
  const s = (it.settlement.ru || it.settlement.en || "").toLocaleLowerCase().trim();
  const u = (it.uezd.ru || it.uezd.en || "").toLocaleLowerCase().trim();
  return `${s}|${u}`;
}

export function UnlocatedPanel({
  open,
  onOpenChange,
  lang,
  locatedIndex,
  onJumpToFeature,
  excludeKeys,
  onAddCoords,
}: Props) {
  const T = t(lang);
  const [items, setItems] = useState<UnlocatedItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [uezd, setUezd] = useState<string>("");
  const [debounced, setDebounced] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Lazy load on first open
  useEffect(() => {
    if (!open || items) return;
    fetch("/data/unlocated.json")
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  }, [open, items]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim().toLocaleLowerCase()), 150);
    return () => clearTimeout(id);
  }, [query]);

  const visibleItems = useMemo(() => {
    if (!items) return [];
    return items.filter(
      (it) =>
        (it.settlement.ru || it.settlement.en).trim().length > 0 &&
        !excludeKeys.has(itemKey(it)),
    );
  }, [items, excludeKeys]);

  const uezds = useMemo(() => {
    const set = new Map<string, string>();
    for (const it of visibleItems) {
      const label = pick(it.uezd, lang);
      if (label) set.set(label.toLocaleLowerCase(), label);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [visibleItems, lang]);

  const filtered = useMemo(() => {
    let out = visibleItems;
    if (uezd) {
      const u = uezd.toLocaleLowerCase();
      out = out.filter((it) => pick(it.uezd, lang).toLocaleLowerCase() === u);
    }
    if (debounced) {
      out = out.filter((it) => {
        const blob =
          pick(it.settlement, lang) +
          " " +
          pick(it.church, lang) +
          " " +
          pick(it.uezd, lang) +
          " " +
          pick(it.region, lang);
        return blob.toLocaleLowerCase().includes(debounced);
      });
    }
    return out;
  }, [visibleItems, debounced, uezd, lang]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  const grouped = useMemo(() => {
    const groups: { uezd: string; items: UnlocatedItem[] }[] = [];
    let current: string | null = null;
    for (const it of visible) {
      const label = pick(it.uezd, lang) || "—";
      if (label !== current) {
        groups.push({ uezd: label, items: [] });
        current = label;
      }
      groups[groups.length - 1].items.push(it);
    }
    return groups;
  }, [visible, lang]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "flex flex-col gap-0 p-0",
          isMobile
            ? "h-[80vh] rounded-t-2xl"
            : "w-full sm:max-w-md",
        )}
      >
        <SheetHeader className="border-b border-border px-4 py-3 text-left">
          <SheetTitle className="font-serif text-lg">
            {T.unlocatedTitle}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · {visibleItems.length}
            </span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            {T.unlocatedHint}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={T.unlocatedSearch}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label={T.clear}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={uezd}
            onChange={(e) => setUezd(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{T.unlocatedAllUezds}</option>
            {uezds.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {!items ? (
            <div className="p-4 text-sm text-muted-foreground">…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{T.unlocatedEmpty}</div>
          ) : (
            <>
              {filtered.length > MAX_VISIBLE && (
                <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                  {T.unlocatedShowingFirst(MAX_VISIBLE, filtered.length)}
                </div>
              )}
              {grouped.map((g) => (
                <div key={g.uezd}>
                  <div className="sticky top-0 z-[1] border-b border-border bg-card/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                    {g.uezd}
                  </div>
                  {g.items.map((it, idx) => {
                    const settlement = pick(it.settlement, lang);
                    const church = pick(it.church, lang);
                    const region = pick(it.region, lang);
                    const k = itemKey(it);
                    const featureId = locatedIndex.get(k);
                    const isEditing = editingKey === k;
                    return (
                      <div
                        key={`${g.uezd}-${idx}-${settlement}`}
                        className="border-b border-border last:border-b-0"
                      >
                        <div className="flex items-start gap-2 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium leading-snug">
                              {settlement || "—"}
                            </div>
                            {church && (
                              <div className="mt-0.5 text-xs italic text-muted-foreground">
                                {church.replace(/\|/g, " · ")}
                              </div>
                            )}
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                              {region && <span>{region}</span>}
                              {it.years && <span>{it.years}</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {featureId !== undefined && (
                              <button
                                onClick={() => {
                                  onJumpToFeature(featureId);
                                  onOpenChange(false);
                                }}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                aria-label={T.findOnMap}
                                title={T.findOnMap}
                              >
                                <MapPin className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setEditingKey(isEditing ? null : k)}
                              className={cn(
                                "inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors",
                                isEditing
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                              )}
                              aria-label={T.addCoords}
                              title={T.addCoords}
                            >
                              <MapPinPlus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {isEditing && (
                          <CoordsForm
                            lang={lang}
                            onCancel={() => setEditingKey(null)}
                            onSave={(lat, lon) => {
                              onAddCoords(it, lat, lon);
                              setEditingKey(null);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CoordsForm({
  lang,
  onCancel,
  onSave,
}: {
  lang: Lang;
  onCancel: () => void;
  onSave: (lat: number, lon: number) => void;
}) {
  const T = t(lang);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    const la = parseFloat(lat.replace(",", "."));
    const lo = parseFloat(lon.replace(",", "."));
    if (
      !isFinite(la) || !isFinite(lo) ||
      la < -90 || la > 90 || lo < -180 || lo > 180
    ) {
      setErr(T.invalidCoords);
      return;
    }
    onSave(la, lo);
  }

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            {T.latitude}
          </span>
          <input
            value={lat}
            onChange={(e) => { setLat(e.target.value); setErr(""); }}
            inputMode="decimal"
            placeholder="42.0850"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
            {T.longitude}
          </span>
          <input
            value={lon}
            onChange={(e) => { setLon(e.target.value); setErr(""); }}
            inputMode="decimal"
            placeholder="44.7000"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
        >
          {T.cancel}
        </button>
        <button
          onClick={submit}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Check className="h-3.5 w-3.5" />
          {T.save}
        </button>
      </div>
    </div>
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return mobile;
}
