import { useEffect, useMemo, useState } from "react";
import { Search, X, MapPin } from "lucide-react";
import { Lang, t } from "@/lib/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type LocaleStr = { en: string; ru: string };
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
}

const MAX_VISIBLE = 250;

function pick(s: LocaleStr, lang: Lang): string {
  return s[lang] || s.en || s.ru || "";
}

export function UnlocatedPanel({
  open,
  onOpenChange,
  lang,
  locatedIndex,
  onJumpToFeature,
}: Props) {
  const T = t(lang);
  const [items, setItems] = useState<UnlocatedItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [uezd, setUezd] = useState<string>("");
  const [debounced, setDebounced] = useState("");
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

  const uezds = useMemo(() => {
    if (!items) return [];
    const set = new Map<string, string>();
    for (const it of items) {
      const label = pick(it.uezd, lang);
      if (label) set.set(label.toLocaleLowerCase(), label);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [items, lang]);

  const filtered = useMemo(() => {
    if (!items) return [];
    let out = items;
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
  }, [items, debounced, uezd, lang]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  // Group by uezd for headers (only when no search query active)
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
              · {items?.length ?? "…"}
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
                    const key = `${(it.settlement.ru || it.settlement.en).toLocaleLowerCase()}|${(it.uezd.ru || it.uezd.en).toLocaleLowerCase()}`;
                    const featureId = locatedIndex.get(key);
                    return (
                      <div
                        key={`${g.uezd}-${idx}-${settlement}`}
                        className="flex items-start gap-2 border-b border-border px-4 py-3 last:border-b-0"
                      >
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
                        {featureId !== undefined ? (
                          <button
                            onClick={() => {
                              onJumpToFeature(featureId);
                              onOpenChange(false);
                            }}
                            className="shrink-0 rounded-md border border-border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            aria-label={T.findOnMap}
                            title={T.findOnMap}
                          >
                            <MapPin className="h-4 w-4" />
                          </button>
                        ) : (
                          <span
                            className="shrink-0 rounded-md border border-dashed border-border p-1.5 text-muted-foreground/40"
                            title={T.noCoordsTooltip}
                          >
                            <MapPin className="h-4 w-4" />
                          </span>
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
