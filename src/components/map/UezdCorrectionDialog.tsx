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
import { Input } from "@/components/ui/input";
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
  currentUezd: MultiLang;
  onSubmitted?: (msg: string) => void;
}

export function UezdCorrectionDialog({
  open, onOpenChange, lang, featureId, settlement, region, currentUezd, onSubmitted,
}: Props) {
  const T = t(lang);
  const [proposed, setProposed] = useState<MultiLang>({ ru: "", en: "", ka: "" });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const has = (proposed.ru?.trim() || proposed.en?.trim() || proposed.ka?.trim());
    if (!has) { setError(T.suggestUezdEmpty); return; }
    setError(null);
    setSaving(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    const { error: err } = await supabase.from("uezd_corrections").insert({
      feature_id: featureId,
      settlement_snapshot: settlement as any,
      region_snapshot: region as any,
      current_uezd: currentUezd as any,
      proposed_uezd: {
        ru: proposed.ru?.trim() || "",
        en: proposed.en?.trim() || "",
        ka: proposed.ka?.trim() || "",
      } as any,
      note: note.trim() || null,
      created_by: uid,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setProposed({ ru: "", en: "", ka: "" });
    setNote("");
    onSubmitted?.(T.suggestUezdSubmitted);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{T.suggestUezdTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{T.suggestUezdHint}</p>

        <div className="mt-2 space-y-3 text-sm">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {T.suggestUezdCurrent}
            </div>
            <div className="text-foreground">
              {currentUezd[lang] || currentUezd.en || currentUezd.ru || "—"}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {T.suggestUezdProposed}
            </div>
            {(["ru", "en", "ka"] as const).map((l) => (
              <div key={l} className="grid grid-cols-[2.5rem_1fr] items-center gap-2">
                <label className="text-[10px] uppercase text-muted-foreground">{l}</label>
                <Input
                  value={proposed[l] ?? ""}
                  onChange={(e) => setProposed((p) => ({ ...p, [l]: e.target.value }))}
                  placeholder={currentUezd[l] ?? ""}
                />
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {T.suggestUezdNote}
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {T.suggestUezdCancel}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {T.suggestUezdSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
