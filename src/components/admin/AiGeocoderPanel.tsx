import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runAiGeocoder, listUnlocatedUezds } from "@/lib/aiGeocoder.functions";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, CheckCircle2, XCircle, AlertCircle, MapPin, GitMerge } from "lucide-react";

interface BatchResult {
  processed: number;
  scanned: number;
  inserted: number;
  skipped: number;
  rejected: number;
  merged: number;
  remaining?: number;
  errors: { settlement: string; reason: string }[];
  log: {
    settlement: string;
    uezd: string;
    status: "inserted" | "skipped" | "rejected" | "error" | "merged";
    confidence?: number;
    note?: string;
    lat?: number;
    lon?: number;
    featureId?: number;
  }[];
}

export function AiGeocoderPanel() {
  const runFn = useServerFn(runAiGeocoder);
  const listFn = useServerFn(listUnlocatedUezds);
  const [running, setRunning] = useState(false);
  const [limit, setLimit] = useState(10);
  const [minConfidence, setMinConfidence] = useState(0.6);
  const [minTokenLen, setMinTokenLen] = useState(3);
  const [prefixLen, setPrefixLen] = useState(5);
  const [geoStrict, setGeoStrict] = useState(true);
  const [conflictRadiusM, setConflictRadiusM] = useState(300);
  const [mergeRadiusM, setMergeRadiusM] = useState(1500);
  const [minMergeConfidence, setMinMergeConfidence] = useState(0.75);
  const [uezd, setUezd] = useState("");
  const [uezds, setUezds] = useState<{ uezd: string; count: number }[]>([]);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listFn({}).then(setUezds).catch((e) => console.error("[uezds]", e));
  }, [listFn]);

  const [progress, setProgress] = useState<{ done: number; target: number } | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress({ done: 0, target: limit });
    // Server processes max 3 per call to stay within ~30s timeout.
    // Loop client-side, accumulating logs, until target reached or queue empty.
    const CHUNK = 3;
    const acc: BatchResult = {
      processed: 0, scanned: 0, inserted: 0, skipped: 0, rejected: 0, merged: 0,
      remaining: 0, errors: [], log: [],
    };
    try {
      let offset = 0;
      while (acc.processed < limit) {
        const r = (await runFn({
          data: {
            limit: CHUNK,
            minConfidence,
            minTokenLen,
            prefixLen,
            geoStrict,
            conflictRadiusM,
            mergeRadiusM,
            minMergeConfidence,
            uezd: uezd || undefined,
            offset,
          },
        })) as BatchResult;
        acc.processed += r.processed;
        acc.scanned += r.scanned;
        acc.inserted += r.inserted;
        acc.skipped += r.skipped;
        acc.rejected += r.rejected;
        acc.merged += r.merged;
        acc.remaining = r.remaining ?? 0;
        acc.errors.push(...r.errors);
        acc.log.push(...r.log);
        setResult({ ...acc });
        setProgress({ done: acc.processed, target: limit });
        if (r.scanned === 0) break; // queue exhausted
        offset += r.scanned;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-start gap-2">
          <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-serif text-base font-semibold">AI-геокодер</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Берёт сёла из списка «без координат», ищет их в OpenStreetMap (Nominatim)
              и арбитрирует Lovable AI (Gemini). Если рядом с найденной точкой уже есть
              опубликованное село с тем же названием и совпавшим уездом или регионом —
              данные <b>сливаются</b> в существующую точку (объединяются годы и церковь).
              Иначе кандидат идёт в очередь модерации на вкладке «Координаты». Ничего
              нового не публикуется автоматически. Скорость ≈ 3–4 секунды на село
              (лимит Nominatim 1 запрос/сек). За один запуск можно обработать не более
              100 сёл.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Сколько обработать</span>
            <input
              type="number"
              min={1}
              max={100}
              value={limit === 0 ? "" : limit}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") { setLimit(0); return; }
                const n = parseInt(raw, 10);
                if (Number.isNaN(n)) return;
                setLimit(Math.min(100, Math.max(0, n)));
              }}
              onBlur={() => { if (!limit || limit < 1) setLimit(1); }}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">
              Мин. уверенность ({minConfidence.toFixed(2)})
            </span>
            <input
              type="range"
              min={0.3}
              max={0.95}
              step={0.05}
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-full"
            />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className="mb-1 block text-muted-foreground">Уезд (необязательно)</span>
            <select
              value={uezd}
              onChange={(e) => setUezd(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— все уезды —</option>
              {uezds.map((u) => (
                <option key={u.uezd} value={u.uezd}>
                  {u.uezd} ({u.count})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">
              Мин. длина токена ({minTokenLen}) — короче = строже
            </span>
            <input
              type="range"
              min={2}
              max={6}
              step={1}
              value={minTokenLen}
              onChange={(e) => setMinTokenLen(parseInt(e.target.value))}
              className="w-full"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">
              Фаззи-префикс ({prefixLen}) — общий «корень» слова для матча словоформ
            </span>
            <input
              type="range"
              min={3}
              max={8}
              step={1}
              value={prefixLen}
              onChange={(e) => setPrefixLen(parseInt(e.target.value))}
              className="w-full"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">
              Радиус конфликта ({conflictRadiusM} м)
            </span>
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              value={conflictRadiusM}
              onChange={(e) => setConflictRadiusM(parseInt(e.target.value))}
              className="w-full"
            />
          </label>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={geoStrict}
              onChange={(e) => setGeoStrict(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-muted-foreground">
              Строгая проверка региона/уезда. Выключите, чтобы пропускать кандидатов,
              у которых совпадает название села, но историческое название уезда не
              находится в адресе OSM (станет предупреждением).
            </span>
          </label>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button onClick={run} disabled={running} size="sm">
            {running ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Обрабатываю…
              </>
            ) : (
              <>
                <Sparkles className="mr-1 h-4 w-4" /> Запустить
              </>
            )}
          </Button>
          {running && progress && (
            <p className="text-xs text-muted-foreground">
              {progress.done}/{progress.target} обработано · ~{Math.ceil((progress.target - progress.done) * 4)} сек. Не закрывайте вкладку.
            </p>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {result && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap gap-3 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5">
              просмотрено: <b className="tabular-nums">{result.scanned}</b>
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5">
              обработано: <b className="tabular-nums">{result.processed}</b>
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
              добавлено в очередь: <b className="tabular-nums">{result.inserted}</b>
            </span>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
              пропущено (низкая уверенность): <b className="tabular-nums">{result.skipped}</b>
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              отклонено: <b className="tabular-nums">{result.rejected}</b>
            </span>
            {result.errors.length > 0 && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
                ошибок: <b className="tabular-nums">{result.errors.length}</b>
              </span>
            )}
          </div>

          <ul className="divide-y divide-border text-sm">
            {result.log.map((row, i) => (
              <li key={i} className="flex items-start gap-2 py-2">
                {row.status === "inserted" && (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                )}
                {row.status === "skipped" && (
                  <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                )}
                {row.status === "rejected" && (
                  <XCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                )}
                {row.status === "error" && (
                  <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {row.settlement}{" "}
                    {row.uezd && (
                      <span className="text-xs font-normal text-muted-foreground">
                        · {row.uezd}
                      </span>
                    )}
                    {row.confidence != null && (
                      <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                        confidence {row.confidence.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {row.note && (
                    <div className="text-xs text-muted-foreground">{row.note}</div>
                  )}
                  {row.lat != null && row.lon != null && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {row.lat.toFixed(4)}, {row.lon.toFixed(4)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {result.inserted > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Перейдите на вкладку «Координаты» (фильтр «Ожидают») чтобы проверить и
              одобрить или отклонить найденные точки.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
