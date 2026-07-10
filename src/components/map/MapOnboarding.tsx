import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";

const STORAGE_KEY = "map_onboarding_v1";

const COPY: Record<Lang, { title: string; steps: string[]; skip: string; next: string; done: string }> = {
  ru: {
    title: "Как пользоваться картой",
    steps: [
      "Сверху — фильтры по региону и уезду. Выберите, чтобы подсветить приходы.",
      "Строка поиска ищет по названию села, церкви, уезда — с учётом ru / en / ka.",
      "Кликните точку — появится карточка прихода со ссылками на источники и годами метрических книг.",
    ],
    skip: "Пропустить",
    next: "Далее",
    done: "Понятно",
  },
  en: {
    title: "How to use the map",
    steps: [
      "Top bar has region and district filters — pick one to highlight parishes.",
      "The search field looks up villages, churches and districts in RU / EN / KA.",
      "Click a point to open a parish card with source links and record years.",
    ],
    skip: "Skip",
    next: "Next",
    done: "Got it",
  },
  ka: {
    title: "როგორ ვისარგებლოთ რუკით",
    steps: [
      "ზემოთ — რეგიონისა და მაზრის ფილტრები. აირჩიეთ სამრევლოების მოსანიშნად.",
      "საძიებო ველი ეძებს სოფლის, ეკლესიის, მაზრის სახელს (რუ / ინგ / ქა).",
      "დააწკაპუნეთ წერტილს — გამოჩნდება ბარათი წყაროებით და წიგნების წლებით.",
    ],
    skip: "გამოტოვება",
    next: "შემდეგი",
    done: "გასაგებია",
  },
};

export function MapOnboarding({ lang }: { lang: Lang }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        const id = window.setTimeout(() => {
          setVisible(true);
          trackEvent("map_onboarding_start", {}, lang);
        }, 600);
        return () => window.clearTimeout(id);
      }
    } catch {
      /* ignore */
    }
  }, [lang]);

  if (!visible) return null;
  const c = COPY[lang] ?? COPY.ru;
  const isLast = step >= c.steps.length - 1;

  const close = (reason: "skip" | "done" = "skip") => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    trackEvent(reason === "done" ? "map_onboarding_done" : "map_onboarding_skip", { step }, lang);
    setVisible(false);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div
        className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-card/98 p-5 shadow-2xl backdrop-blur"
        role="dialog"
        aria-label={c.title}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{c.title}</h2>
          <button
            onClick={() => close("skip")}
            aria-label={c.skip}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90">{c.steps[step]}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {c.steps.map((_, i) => (
              <span
                key={i}
                className={
                  "h-1.5 w-1.5 rounded-full " +
                  (i === step ? "bg-primary" : "bg-muted-foreground/30")
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => close("skip")}
              className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {c.skip}
            </button>
            <button
              onClick={() => {
                if (isLast) {
                  close("done");
                } else {
                  const next = step + 1;
                  setStep(next);
                  trackEvent("map_onboarding_step", { step: next }, lang);
                }
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              {isLast ? c.done : c.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
