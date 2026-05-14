import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { t, type Lang } from "@/lib/i18n";

interface MultiLang { ru?: string; en?: string; ka?: string }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lang: Lang;
  featureId: number | null;
  settlement: MultiLang;
  region: MultiLang;
  /** Currently shown missing-years string (any one language is fine for context). */
  currentMissing: string;
  onSubmitted?: (msg: string) => void;
}

export function MissingYearsSuggestionDialog({
  open, onOpenChange, lang, featureId, settlement, region, currentMissing, onSubmitted,
}: Props) {
  const T = t(lang);
  const [proposed, setProposed] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!proposed.trim()) { setError(T.suggestMissingEmpty); return; }
    setError(null);
    setSaving(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    const { error: err } = await supabase.from("missing_years_suggestions").insert({
      feature_id: featureId,
      settlement_snapshot: { settlement, region } as any,
      current_missing: currentMissing.slice(0, 2000),
      proposed_missing: proposed.trim().slice(0, 2000),
      note: note.trim() ? note.trim().slice(0, 2000) : null,
      created_by: uid,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setProposed("");
    setNote("");
    onSubmitted?.(T.suggestMissingSubmitted);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{T.suggestMissingTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{T.suggestMissingHint}</p>

        <div className="mt-2 space-y-3 text-sm">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {T.suggestMissingCurrent}
            </div>
            <div className="text-foreground whitespace-pre-line break-words">
              {currentMissing.trim() || "—"}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {T.suggestMissingProposed}
            </div>
            <Textarea
              value={proposed}
              onChange={(e) => setProposed(e.target.value)}
              rows={3}
              placeholder={T.suggestMissingPlaceholder}
            />
          </div>

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {T.suggestMissingNote}
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {T.suggestMissingCancel}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {T.suggestMissingSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
