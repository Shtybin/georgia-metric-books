import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, AlertTriangle, CheckCircle2, X as XIcon } from "lucide-react";
import {
  emptyFeatureData,
  validateFeatureData,
  type FeatureData,
} from "@/lib/featureOverrides";

type Row = Record<string, string>;

/** Target fields the user can map columns to. */
const TARGETS = [
  { key: "featureId", label: "ID точки (для обновления)" },
  { key: "settlement.ru", label: "Село — RU" },
  { key: "settlement.en", label: "Село — EN" },
  { key: "settlement.ka", label: "Село — KA" },
  { key: "church.ru", label: "Церковь — RU" },
  { key: "church.en", label: "Церковь — EN" },
  { key: "church.ka", label: "Церковь — KA" },
  { key: "region.ru", label: "Регион — RU" },
  { key: "region.en", label: "Регион — EN" },
  { key: "region.ka", label: "Регион — KA" },
  { key: "uezd.ru", label: "Уезд — RU" },
  { key: "uezd.en", label: "Уезд — EN" },
  { key: "uezd.ka", label: "Уезд — KA" },
  { key: "historicalName.ru", label: "Историческое название — RU" },
  { key: "historicalName.en", label: "Историческое название — EN" },
  { key: "historicalName.ka", label: "Историческое название — KA" },
  { key: "lat", label: "Широта (lat)" },
  { key: "lon", label: "Долгота (lon)" },
  { key: "yearsRaw", label: "Годы (текстом)" },
  { key: "missingYearsRaw", label: "Пропущенные годы" },
  { key: "startYear", label: "Год начала" },
  { key: "endYear", label: "Год конца" },
] as const;

type TargetKey = (typeof TARGETS)[number]["key"];

const NONE = "__none__";

const AUTO: Array<[RegExp, TargetKey]> = [
  [/^(feature[_ ]?id|fid|id)$/i, "featureId"],
  [/^(lat|latitude|широта)$/i, "lat"],
  [/^(lon|lng|long|longitude|долгота)$/i, "lon"],
  [/^(years?|годы)$/i, "yearsRaw"],
  [/^(missing[_ ]?years?|пропуски|пропущенные)$/i, "missingYearsRaw"],
  [/^(start[_ ]?year|год[_ ]?начала|начало)$/i, "startYear"],
  [/^(end[_ ]?year|год[_ ]?конца|конец)$/i, "endYear"],
  [/^(settlement|село|name)[_ -]*ru$/i, "settlement.ru"],
  [/^(settlement|село|name)[_ -]*en$/i, "settlement.en"],
  [/^(settlement|село|name)[_ -]*ka$/i, "settlement.ka"],
  [/^(church|церковь)[_ -]*ru$/i, "church.ru"],
  [/^(church|церковь)[_ -]*en$/i, "church.en"],
  [/^(church|церковь)[_ -]*ka$/i, "church.ka"],
  [/^(region|регион)[_ -]*ru$/i, "region.ru"],
  [/^(region|регион)[_ -]*en$/i, "region.en"],
  [/^(region|регион)[_ -]*ka$/i, "region.ka"],
  [/^(uezd|уезд)[_ -]*ru$/i, "uezd.ru"],
  [/^(uezd|уезд)[_ -]*en$/i, "uezd.en"],
  [/^(uezd|уезд)[_ -]*ka$/i, "uezd.ka"],
  [/^(hist(orical)?[_ ]?name|бывш(ее)?)[_ -]*ru$/i, "historicalName.ru"],
  [/^(hist(orical)?[_ ]?name|бывш(ее)?)[_ -]*en$/i, "historicalName.en"],
  [/^(hist(orical)?[_ ]?name|бывш(ее)?)[_ -]*ka$/i, "historicalName.ka"],
];

function autoDetect(headers: string[]): Record<TargetKey, string | null> {
  const out = Object.fromEntries(TARGETS.map((t) => [t.key, null])) as Record<TargetKey, string | null>;
  for (const h of headers) {
    for (const [re, k] of AUTO) {
      if (out[k] == null && re.test(h.trim())) {
        out[k] = h;
        break;
      }
    }
  }
  return out;
}

function applyMapping(row: Row, mapping: Record<TargetKey, string | null>): { data: FeatureData; featureId: number | null } {
  const d = emptyFeatureData();
  const get = (k: TargetKey) => {
    const col = mapping[k];
    if (!col) return "";
    const v = row[col];
    return v == null ? "" : String(v).trim();
  };
  const setMl = (field: "settlement" | "church" | "region" | "uezd" | "historicalName") => {
    const ru = get(`${field}.ru` as TargetKey);
    const en = get(`${field}.en` as TargetKey);
    const ka = get(`${field}.ka` as TargetKey);
    (d as any)[field] = { ru, en, ka };
  };
  setMl("settlement");
  setMl("church");
  setMl("region");
  setMl("uezd");
  setMl("historicalName");

  const lat = parseFloat(get("lat").replace(",", "."));
  const lon = parseFloat(get("lon").replace(",", "."));
  if (Number.isFinite(lat)) d.lat = lat;
  if (Number.isFinite(lon)) d.lon = lon;

  const yr = get("yearsRaw");
  if (yr) d.yearsRaw = { ru: yr, en: yr, ka: yr };
  const my = get("missingYearsRaw");
  if (my) d.missingYearsRaw = { ru: my, en: my, ka: my };

  const sy = parseInt(get("startYear"), 10);
  const ey = parseInt(get("endYear"), 10);
  if (Number.isInteger(sy)) d.startYear = sy;
  if (Number.isInteger(ey)) d.endYear = ey;
  // Default end to start if missing
  if (!Number.isInteger(ey) && Number.isInteger(sy)) d.endYear = sy;

  const fidRaw = get("featureId");
  const fid = fidRaw ? parseInt(fidRaw, 10) : NaN;

  return { data: d, featureId: Number.isInteger(fid) ? fid : null };
}

export function FeatureImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: () => void;
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<TargetKey, string | null>>(
    () => Object.fromEntries(TARGETS.map((t) => [t.key, null])) as any,
  );
  const [publish, setPublish] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: number; errors: string[] } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  function reset() {
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping(Object.fromEntries(TARGETS.map((t) => [t.key, null])) as any);
    setResult(null);
    setParseError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(file: File) {
    setParseError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      let parsedRows: Row[] = [];
      let parsedHeaders: string[] = [];
      if (isExcel) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
        parsedRows = json.map((r) => {
          const o: Row = {};
          for (const k of Object.keys(r)) o[k] = String(r[k] ?? "");
          return o;
        });
        parsedHeaders = parsedRows[0] ? Object.keys(parsedRows[0]) : [];
      } else {
        const text = await file.text();
        const res = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
        parsedRows = (res.data || []).filter((r) => r && Object.values(r).some((v) => String(v).trim() !== ""));
        parsedHeaders = res.meta.fields ?? (parsedRows[0] ? Object.keys(parsedRows[0]) : []);
      }
      if (!parsedHeaders.length) {
        setParseError("Не найдены заголовки колонок. Первая строка должна содержать названия полей.");
        return;
      }
      setHeaders(parsedHeaders);
      setRows(parsedRows);
      setMapping(autoDetect(parsedHeaders));
    } catch (e: any) {
      setParseError(e?.message ?? String(e));
    }
  }

  const preview = useMemo(() => {
    return rows.slice(0, 50).map((r, i) => {
      const m = applyMapping(r, mapping);
      const issues = validateFeatureData(m.data);
      return { idx: i, ...m, issues };
    });
  }, [rows, mapping]);

  const totalErrors = preview.reduce((s, p) => s + p.issues.filter((i) => i.severity === "error").length, 0);
  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const hasAnySettlement =
    !!mapping["settlement.ru"] || !!mapping["settlement.en"] || !!mapping["settlement.ka"];
  const hasCoords = !!mapping.lat && !!mapping.lon;

  async function runImport() {
    setImporting(true);
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;

    // Pre-load existing edit overrides keyed by feature_id, so updates "upsert".
    const featureIds = Array.from(
      new Set(
        rows
          .map((r) => applyMapping(r, mapping).featureId)
          .filter((x): x is number => x != null),
      ),
    );
    const existing = new Map<number, string>();
    if (featureIds.length) {
      const { data } = await supabase
        .from("feature_overrides")
        .select("id, feature_id, action")
        .in("feature_id", featureIds)
        .eq("action", "edit");
      for (const r of data ?? []) {
        if (r.feature_id != null) existing.set(r.feature_id, r.id as string);
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const { data, featureId } = applyMapping(rows[i], mapping);
      const issues = validateFeatureData(data);
      const errs = issues.filter((x) => x.severity === "error");
      if (errs.length) {
        failed++;
        errors.push(`Строка ${i + 2}: ${errs.map((e) => e.message).join("; ")}`);
        continue;
      }
      try {
        if (featureId != null) {
          const existingId = existing.get(featureId);
          if (existingId) {
            const { error } = await supabase
              .from("feature_overrides")
              .update({ data: data as any, published: publish })
              .eq("id", existingId);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("feature_overrides").insert({
              feature_id: featureId,
              action: "edit",
              data: data as any,
              published: publish,
              created_by: uid,
              notes: "imported",
            });
            if (error) throw error;
          }
        } else {
          const { error } = await supabase.from("feature_overrides").insert({
            feature_id: null,
            action: "add",
            data: data as any,
            published: publish,
            created_by: uid,
            notes: "imported",
          });
          if (error) throw error;
        }
        ok++;
      } catch (e: any) {
        failed++;
        errors.push(`Строка ${i + 2}: ${e?.message ?? String(e)}`);
      }
    }

    setImporting(false);
    setResult({ ok, failed, errors: errors.slice(0, 50) });
    if (ok > 0) onImported();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Импорт точек из CSV / Excel</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Загрузите .csv или .xlsx. Первая строка — заголовки. Сопоставьте колонки с полями ниже.
          Если указан «ID точки», существующая карточка будет обновлена; иначе добавится новая.
        </p>

        <div className="mt-2">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> Выбрать файл
            </Button>
            {fileName && (
              <span className="text-xs text-muted-foreground">
                {fileName} · строк: {rows.length} · колонок: {headers.length}
              </span>
            )}
            {fileName && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <XIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
          {parseError && <p className="mt-2 text-xs text-destructive">{parseError}</p>}
        </div>

        {headers.length > 0 && (
          <>
            <div className="mt-3 rounded-md border border-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Маппинг полей ({mappedCount} из {TARGETS.length})
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {TARGETS.map((t) => (
                  <div key={t.key} className="grid grid-cols-[1fr_1fr] items-center gap-2">
                    <label className="text-xs">{t.label}</label>
                    <Select
                      value={mapping[t.key] ?? NONE}
                      onValueChange={(v) =>
                        setMapping((m) => ({ ...m, [t.key]: v === NONE ? null : v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>—</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!hasAnySettlement && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Не сопоставлено ни одно поле «Село» — карточки не пройдут валидацию.
                </p>
              )}
              {!hasCoords && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Не сопоставлены координаты (lat/lon).
                </p>
              )}
            </div>

            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Превью (первые {preview.length} строк)
              </div>
              <div className="max-h-60 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">ID</th>
                      <th className="px-2 py-1 text-left">Село</th>
                      <th className="px-2 py-1 text-left">Уезд</th>
                      <th className="px-2 py-1 text-left">lat, lon</th>
                      <th className="px-2 py-1 text-left">Годы</th>
                      <th className="px-2 py-1 text-left">Проверка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p) => {
                      const errs = p.issues.filter((i) => i.severity === "error");
                      return (
                        <tr key={p.idx} className="border-t border-border">
                          <td className="px-2 py-1 tabular-nums text-muted-foreground">{p.idx + 2}</td>
                          <td className="px-2 py-1 tabular-nums">{p.featureId ?? "новая"}</td>
                          <td className="px-2 py-1">{p.data.settlement.ru || p.data.settlement.en || p.data.settlement.ka || "—"}</td>
                          <td className="px-2 py-1">{p.data.uezd.ru || p.data.uezd.en || "—"}</td>
                          <td className="px-2 py-1 tabular-nums">{p.data.lat.toFixed(4)}, {p.data.lon.toFixed(4)}</td>
                          <td className="px-2 py-1">{p.data.yearsRaw.ru || "—"}</td>
                          <td className="px-2 py-1">
                            {errs.length ? (
                              <span className="text-destructive" title={errs.map((e) => e.message).join("\n")}>
                                <AlertTriangle className="inline h-3.5 w-3.5" /> {errs.length}
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="inline h-3.5 w-3.5" />
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalErrors > 0 && (
                <p className="mt-1 text-xs text-destructive">
                  В превью {totalErrors} ошибок валидации. Такие строки будут пропущены при импорте.
                </p>
              )}
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Сразу опубликовать импортированные карточки
            </label>
          </>
        )}

        {result && (
          <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="font-medium">
              Импорт завершён: успешно {result.ok}, с ошибками {result.failed}.
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-1 ml-5 max-h-40 list-disc overflow-auto text-destructive">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={importing}>
            Закрыть
          </Button>
          <Button
            onClick={runImport}
            disabled={importing || rows.length === 0 || !hasAnySettlement || !hasCoords}
            title={!hasAnySettlement || !hasCoords ? "Сопоставьте Село и координаты" : undefined}
          >
            <Upload className="mr-1 h-4 w-4" />
            {importing ? "Импорт…" : `Импортировать ${rows.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
