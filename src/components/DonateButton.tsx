import { useState } from "react";
import { Heart, Copy, Check, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DONATE, validateDonate } from "@/lib/donate";
import type { Lang } from "@/lib/i18n";

const L = {
  ru: {
    btn: "Поддержать",
    btnHero: "Поддержать проект",
    title: "Поддержать проект",
    lead: "Все способы анонимны — мы не получаем ваших платёжных данных.",
    world: "🌍 Из любой страны",
    worldHint: "Карта Visa / Mastercard, Apple Pay, Google Pay",
    worldCta: "Поддержать в USD/EUR",
    ru: "🇷🇺 Из России",
    ruHint: "Карты МИР / Visa / MC, СБП — через CloudTips",
    ruCta: "Поддержать рублями",
    crypto: "₮ Криптовалютой",
    cryptoHint: "USDT в сети TRON (TRC-20). Не отправляйте через другие сети!",
    copy: "Скопировать адрес",
    copied: "Адрес скопирован",
    thanks: "Спасибо за вашу поддержку — это помогает развивать проект.",
    warnTitle: "Способ оплаты временно недоступен",
    warnTron: "TRON-адрес настроен неверно. Не отправляйте средства!",
    warnUrl: "Ссылка ещё не настроена.",
    invalidCopy: "Некорректный адрес — копирование отключено",
  },
  en: {
    btn: "Support",
    btnHero: "Support the project",
    title: "Support the project",
    lead: "All methods are anonymous — we never see your payment details.",
    world: "🌍 Worldwide",
    worldHint: "Visa / Mastercard, Apple Pay, Google Pay",
    worldCta: "Donate in USD / EUR",
    ru: "🇷🇺 From Russia",
    ruHint: "MIR / Visa / MC cards, SBP — via CloudTips",
    ruCta: "Donate in RUB",
    crypto: "₮ Crypto",
    cryptoHint: "USDT on TRON network (TRC-20). Do not send via other networks!",
    copy: "Copy address",
    copied: "Address copied",
    thanks: "Thank you — your support helps grow the project.",
    warnTitle: "Payment method temporarily unavailable",
    warnTron: "TRON address is invalid. Do not send funds!",
    warnUrl: "Link is not configured yet.",
    invalidCopy: "Invalid address — copy disabled",
  },
  ka: {
    btn: "მხარდაჭერა",
    btnHero: "მხარი დაუჭირეთ პროექტს",
    title: "მხარი დაუჭირეთ პროექტს",
    lead: "ყველა მეთოდი ანონიმურია — ჩვენ არ ვხედავთ თქვენს გადახდის მონაცემებს.",
    world: "🌍 მსოფლიო",
    worldHint: "Visa / Mastercard, Apple Pay, Google Pay",
    worldCta: "შემოწირულობა USD / EUR",
    ru: "🇷🇺 რუსეთიდან",
    ruHint: "MIR / Visa / MC ბარათები, SBP — CloudTips-ის გავლით",
    ruCta: "შემოწირულობა რუბლში",
    crypto: "₮ კრიპტო",
    cryptoHint: "USDT TRON ქსელში (TRC-20). არ გააგზავნოთ სხვა ქსელით!",
    copy: "მისამართის კოპირება",
    copied: "მისამართი დაკოპირდა",
    thanks: "გმადლობთ მხარდაჭერისთვის — ეს ეხმარება პროექტს განვითარებაში.",
    warnTitle: "გადახდის მეთოდი დროებით მიუწვდომელია",
    warnTron: "TRON მისამართი არასწორია. ნუ გააგზავნით სახსრებს!",
    warnUrl: "ბმული ჯერ არ არის კონფიგურირებული.",
    invalidCopy: "არასწორი მისამართი — კოპირება გათიშულია",
  },
} as const;

type Variant = "hero" | "compact" | "icon" | "inline";

interface Props {
  lang: Lang;
  variant?: Variant;
  className?: string;
}

export function DonateButton({ lang, variant = "compact", className }: Props) {
  const [open, setOpen] = useState(false);
  const t = L[lang];

  const baseTrigger = (() => {
    switch (variant) {
      case "hero":
        return (
          <button
            onClick={() => setOpen(true)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 px-5 py-3 text-sm font-medium text-white shadow-lg transition-transform hover:-translate-y-0.5",
              className,
            )}
          >
            <Heart className="h-4 w-4 fill-current" />
            {t.btnHero}
          </button>
        );
      case "icon":
        return (
          <button
            onClick={() => setOpen(true)}
            title={t.btn}
            aria-label={t.btn}
            className={cn(
              "pointer-events-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-300/60 bg-gradient-to-br from-amber-100 to-rose-100 text-rose-600 shadow-lg backdrop-blur transition-colors hover:from-amber-200 hover:to-rose-200 dark:border-rose-500/40 dark:from-amber-900/40 dark:to-rose-900/40 dark:text-rose-200",
              className,
            )}
          >
            <Heart className="h-3.5 w-3.5 fill-current" />
          </button>
        );
      case "inline":
        // Mobile pill — matches the other tiny pills in the bottom row.
        return (
          <button
            onClick={() => setOpen(true)}
            className={cn(
              "pointer-events-auto inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-rose-300/70 bg-gradient-to-r from-amber-100 to-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-700 shadow-md backdrop-blur hover:from-amber-200 hover:to-rose-200 dark:border-rose-500/40 dark:from-amber-900/40 dark:to-rose-900/40 dark:text-rose-100",
              className,
            )}
            aria-label={t.btn}
          >
            <Heart className="h-3 w-3 fill-current" />
            {t.btn}
          </button>
        );
      case "compact":
      default:
        return (
          <button
            onClick={() => setOpen(true)}
            className={cn(
              "pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-300/70 bg-gradient-to-r from-amber-100 to-rose-100 px-2.5 text-xs font-medium text-rose-700 shadow-lg backdrop-blur transition-colors hover:from-amber-200 hover:to-rose-200 dark:border-rose-500/40 dark:from-amber-900/40 dark:to-rose-900/40 dark:text-rose-100",
              className,
            )}
            title={t.btn}
          >
            <Heart className="h-3.5 w-3.5 fill-current" />
            <span className="hidden sm:inline">{t.btn}</span>
          </button>
        );
    }
  })();

  return (
    <>
      {baseTrigger}
      <DonateDialog open={open} onOpenChange={setOpen} lang={lang} />
    </>
  );
}

function DonateDialog({
  open,
  onOpenChange,
  lang,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
}) {
  const t = L[lang];
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(DONATE.tronAddress);
      setCopied(true);
      toast.success(t.copied);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard error");
    }
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=4&data=${encodeURIComponent(
    DONATE.tronAddress,
  )}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-xl">
            <Heart className="h-5 w-5 fill-rose-500 text-rose-500" />
            {t.title}
          </DialogTitle>
          <DialogDescription className="text-sm">{t.lead}</DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          {/* Worldwide — Buy Me a Coffee / Ko-fi */}
          <a
            href={DONATE.bmcUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{t.world}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.worldHint}</p>
              </div>
              <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              {t.worldCta}
            </div>
          </a>

          {/* Russia — CloudTips */}
          <a
            href={DONATE.cloudtipsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{t.ru}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.ruHint}</p>
              </div>
              <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              {t.ruCta}
            </div>
          </a>

          {/* Crypto — USDT TRC-20 */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="font-medium">{t.crypto}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.cryptoHint}</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <img
                src={qrUrl}
                alt="USDT TRC-20 QR"
                width={120}
                height={120}
                className="self-center rounded-md border border-border bg-white p-1 sm:self-auto"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <code className="block break-all rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] leading-snug">
                  {DONATE.tronAddress}
                </code>
                <button
                  onClick={handleCopy}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? t.copied : t.copy}
                </button>
              </div>
            </div>
          </div>

          <p className="pt-1 text-center text-xs text-muted-foreground">{t.thanks}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
