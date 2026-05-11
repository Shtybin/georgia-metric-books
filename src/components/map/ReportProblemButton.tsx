import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface Props {
  lang: Lang;
  getMapState?: () => { lat: number; lon: number; zoom: number } | null;
}

const STORAGE_KEY = "pr_submits_v1";
const MIN_FORM_MS = 3000;
const COOLDOWN_MS = 30_000;
const HOURLY_LIMIT = 5;

function readHistory(): number[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}
function writeHistory(arr: number[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function ReportProblemButton({ lang, getMapState }: Props) {
  const T = t(lang);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [honeypot, setHoneypot] = useState(""); // hidden field — bots fill it
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentToast, setSentToast] = useState<string | null>(null);
  const openedAtRef = useRef<number>(0);
  const [captchaSeed, setCaptchaSeed] = useState(0);

  // Math captcha numbers; regenerate when dialog opens or seed changes
  const captcha = useMemo(() => {
    const a = 1 + Math.floor(Math.random() * 8);
    const b = 1 + Math.floor(Math.random() * 8);
    return { a, b, sum: a + b };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captchaSeed, open]);

  useEffect(() => {
    if (open) {
      openedAtRef.current = Date.now();
      setCaptchaSeed((s) => s + 1);
      setCaptchaAnswer("");
      setHoneypot("");
      setError(null);
    }
  }, [open]);

  // ===== Collision-aware anchor =====
  // The button picks among 4 corners and falls back to the corner with the
  // smallest overlap against sibling overlays in the same map container.
  type Anchor = "br" | "bl" | "tr" | "tl";
  const ANCHOR_PRIORITY: Anchor[] = ["br", "bl", "tr", "tl"];
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<Anchor>("br");

  useLayoutEffect(() => {
    const btn = btnRef.current;
    const parent = btn?.parentElement;
    if (!btn || !parent) return;

    const overlap = (a: { left: number; right: number; top: number; bottom: number }, b: DOMRect) =>
      !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    const overlapArea = (a: { left: number; right: number; top: number; bottom: number }, b: DOMRect) => {
      const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return x * y;
    };

    const pick = () => {
      const btnRect = btn.getBoundingClientRect();
      const w = btnRect.width || 140;
      const h = btnRect.height || 26;
      const pr = parent.getBoundingClientRect();
      const m = 12;

      const obstacles: DOMRect[] = [];
      for (const el of Array.from(parent.children) as HTMLElement[]) {
        if (el === btn) continue;
        if (el.dataset.reportToast !== undefined) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        obstacles.push(r);
      }

      const cands: Record<Anchor, { left: number; right: number; top: number; bottom: number }> = {
        br: { left: pr.right - m - w, right: pr.right - m, top: pr.bottom - m - h, bottom: pr.bottom - m },
        bl: { left: pr.left + m, right: pr.left + m + w, top: pr.bottom - m - h, bottom: pr.bottom - m },
        tr: { left: pr.right - m - w, right: pr.right - m, top: pr.top + m, bottom: pr.top + m + h },
        tl: { left: pr.left + m, right: pr.left + m + w, top: pr.top + m, bottom: pr.top + m + h },
      };

      let best: Anchor = "br";
      let bestScore = Infinity;
      for (const a of ANCHOR_PRIORITY) {
        const rect = cands[a];
        let score = 0;
        for (const o of obstacles) if (overlap(rect, o)) score += overlapArea(rect, o);
        if (score === 0) { best = a; break; }
        if (score < bestScore) { bestScore = score; best = a; }
      }
      setAnchor((prev) => (prev === best ? prev : best));
    };

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(pick);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(parent);
    for (const el of Array.from(parent.children)) ro.observe(el as Element);
    const mo = new MutationObserver(() => {
      // Re-observe new siblings, then re-pick
      for (const el of Array.from(parent.children)) {
        if (el !== btn) ro.observe(el as Element);
      }
      schedule();
    });
    mo.observe(parent, { childList: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [open, sentToast]);

  const anchorStyle = (a: Anchor, toast = false): CSSProperties => {
    const off = toast ? " + var(--map-overlay-toast-offset)" : "";
    const vert =
      a[0] === "b"
        ? { bottom: `calc(var(--map-overlay-gap-bottom)${off})` }
        : { top: `calc(var(--map-overlay-gap-top)${off})` };
    const horz =
      a[1] === "r"
        ? { right: "var(--map-overlay-gap-right)" }
        : { left: "var(--map-overlay-gap-left)" };
    return { ...vert, ...horz };
  };

  async function submit() {
    setError(null);
    const trimmed = message.trim();
    if (!trimmed) {
      setError(T.reportEmpty);
      return;
    }

    // 1. Honeypot — silent reject if filled (bots target hidden inputs)
    if (honeypot.trim() !== "") {
      // Pretend success to not give signal to bots
      setMessage("");
      setContact("");
      setOpen(false);
      setSentToast(T.reportSent);
      setTimeout(() => setSentToast(null), 4000);
      return;
    }

    // 2. Min time on form
    if (Date.now() - openedAtRef.current < MIN_FORM_MS) {
      setError(T.tooFastError);
      return;
    }

    // 3. Captcha
    const ans = parseInt(captchaAnswer.trim(), 10);
    if (!Number.isFinite(ans) || ans !== captcha.sum) {
      setError(T.captchaError);
      setCaptchaSeed((s) => s + 1);
      setCaptchaAnswer("");
      return;
    }

    // 4. Local cooldown + hourly cap
    const now = Date.now();
    const history = readHistory().filter((ts) => now - ts < 60 * 60 * 1000);
    if (history.length > 0 && now - history[history.length - 1] < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - history[history.length - 1])) / 1000);
      setError(T.cooldownError(wait));
      return;
    }
    if (history.length >= HOURLY_LIMIT) {
      setError(T.floodError);
      return;
    }

    setSending(true);
    const ms = getMapState?.() ?? null;
    const { error: dbError } = await supabase.from("problem_reports").insert({
      message: trimmed.slice(0, 4000),
      contact: contact.trim().slice(0, 200) || null,
      page_url: typeof window !== "undefined" ? window.location.href.slice(0, 500) : null,
      lang,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
      lat: ms ? Number(ms.lat.toFixed(6)) : null,
      lon: ms ? Number(ms.lon.toFixed(6)) : null,
      zoom: ms ? Number(ms.zoom.toFixed(2)) : null,
    });
    setSending(false);
    if (dbError) {
      setError(T.reportError);
      return;
    }
    writeHistory([...history, now]);
    setMessage("");
    setContact("");
    setOpen(false);
    setSentToast(T.reportSent);
    setTimeout(() => setSentToast(null), 4000);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(true)}
        style={anchorStyle(anchor)}
        className="pointer-events-auto absolute z-20 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-md backdrop-blur transition-[top,bottom,left,right] duration-200 hover:bg-accent hover:text-foreground"
        aria-label={T.reportButton}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        {T.reportButton}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{T.reportTitle}</DialogTitle>
            <DialogDescription>{T.reportHint}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
              placeholder={T.reportPlaceholder}
              rows={5}
              maxLength={4000}
              className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {T.reportContactLabel}
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value.slice(0, 200))}
                maxLength={200}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Honeypot — visually hidden but reachable to bots */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-10000px",
                top: "auto",
                width: 1,
                height: 1,
                overflow: "hidden",
              }}
            >
              <label>
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {T.captchaLabel(captcha.a, captcha.b)}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value.slice(0, 4))}
                maxLength={4}
                className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={sending}>
                {T.cancel}
              </Button>
              <Button size="sm" onClick={submit} disabled={sending}>
                {sending ? "…" : T.reportSend}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {sentToast && (
        <div
          style={{ bottom: "var(--report-toast-bottom)", right: "var(--report-toast-right)" }}
          className="pointer-events-none absolute z-30 rounded-md border border-border bg-card/98 px-3 py-1.5 text-xs shadow-2xl backdrop-blur"
        >
          {sentToast}
        </div>
      )}
    </>
  );
}
