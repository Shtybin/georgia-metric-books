import { useState } from "react";
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
}

export function ReportProblemButton({ lang }: Props) {
  const T = t(lang);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentToast, setSentToast] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const trimmed = message.trim();
    if (!trimmed) {
      setError(T.reportEmpty);
      return;
    }
    setSending(true);
    const { error: dbError } = await supabase.from("problem_reports").insert({
      message: trimmed.slice(0, 4000),
      contact: contact.trim().slice(0, 200) || null,
      page_url: typeof window !== "undefined" ? window.location.href.slice(0, 500) : null,
      lang,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
    setSending(false);
    if (dbError) {
      setError(T.reportError);
      return;
    }
    setMessage("");
    setContact("");
    setOpen(false);
    setSentToast(T.reportSent);
    setTimeout(() => setSentToast(null), 4000);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="pointer-events-auto absolute bottom-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-lg backdrop-blur hover:bg-accent hover:text-foreground"
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
        <div className="pointer-events-none absolute bottom-14 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-card/98 px-3 py-1.5 text-xs shadow-2xl backdrop-blur">
          {sentToast}
        </div>
      )}
    </>
  );
}
