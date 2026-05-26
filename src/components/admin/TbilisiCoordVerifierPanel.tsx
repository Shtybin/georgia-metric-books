import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  verifyTbilisiCoords,
  listTbilisiVerifications,
  reviewTbilisiVerification,
} from "@/lib/tbilisiCoordVerifier.functions";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  RotateCcw,
} from "lucide-react";

interface LogRow {
  churchId: number;
  name: string;
  status: "updated" | "kept" | "skipped" | "error";
  oldLat: number;
  oldLon: number;
  newLat?: number;
  newLon?: number;
  distanceM?: number;
  confidence?: number;
  reasoning?: string;
  sources?: { url: string; title?: string }[];
  note?: string;
}

interface BatchResult {
  processed: number;
  updated: number;
  kept: number;
  skipped: number;
  errors: number;
  remaining: number;
  log: LogRow[];
}

interface VerificationRow {
  id: string;
  church_id: number;
  old_lat: number;
  old_lon: number;
  new_lat: number;
  new_lon: number;
  distance_m: number;
  model_confidence: number;
  reasoning: string;
  sources: { url: string; title?: string }[];
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  created_at: string;
  church: {
    id: number;
    name: { ka: string; ru: string; en: string };
    address: string;
    district: string;
    confessionRaw: string;
    confidence: string;
  } | null;
}

export function TbilisiCoordVerifierPanel() {
  const runFn = useServerFn(verifyTbilisiCoords);
  const listFn = useServerFn(listTbilisiVerifications);
  const reviewFn = useServerFn(reviewTbilisiVerification);

  const [limit, setLimit] = useState(4);
  const [recheck, setRecheck] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; target: number } | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">(
    "pending",
  );
  const [pending, setPending] = useState<VerificationRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const reload = useCallback(async () => {
    setLoadingList(true);
    try {
      const rows = (await listFn({ data: { status: filter } })) as unknown as VerificationRow[];
      setPending(rows);
    } catch (e) {
      console.error("[list verifications]", e);
    } finally {
      setLoadingList(false);
    }
  }, [listFn, filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress({ done: 0, target: limit });
    const CHUNK = 2;
    const acc: BatchResult = {
      processed: 0,
      updated: 0,
      kept: 0,
      skipped: 0,
      errors: 0,
      remaining: 0,
      log: [],
    };
    try {
      let offset = 0;
      while (acc.processed < limit) {
        const left = limit - acc.processed;
        const r = (await runFn({
          data: { limit: Math.min(CHUNK, left), offset, recheck },
        })) as BatchResult;
        acc.processed += r.processed;
        acc.updated += r.updated;
        acc.kept += r.kept;
        acc.skipped += r.skipped;
        acc.errors += r.errors;
        acc.remaining = r.remaining;
        acc.log.push(...r.log);
        setResult({ ...acc });
        setProgress({ done: acc.processed, target: limit });
        if (r.processed === 0) break;
        offset += r.processed;
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  async function review(id: string, action: "approve" | "reject" | "reset") {
    try {
      await reviewFn({ data: { id, action } });
      await reload();
    } catch (e) {
      console.error("[review]", e);
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-start gap-2">
          <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-serif text-base font-semibold">
              AI-проверка координат тбилисских церквей
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Берёт церкви из <code>tbilisi-churches.json</code> с уверенностью ≠ high,
              запрашивает Nominatim, затем отправляет всё в Lovable AI
              (<b>openai/gpt-5</b>, reasoning=high) для глубокого исследования
              с цитированием источников. Результаты складываются в очередь
              на одобрение — ничего не публикуется автоматически.
              Одобренные правки применяются поверх датасета на странице{" "}
              <code>/tbilisi</code>.
            </p>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Модель медленная и дорогая: ~20–40 сек на церковь. Полный обход
              ~200 точек потратит ощутимую долю AI-кредитов.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">
              Сколько проверить за раз
            </span>
            <input
              type="number"
              min={1}
              max={50}
              value={limit === 0 ? "" : limit}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") return setLimit(0);
                const n = parseInt(raw, 10);
                if (!Number.isNaN(n)) setLimit(Math.min(50, Math.max(0, n)));
              }}
              onBlur={() => {
                if (!limit || limit < 1) setLimit(1);
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input
              type="checkbox"
              checked={recheck}
              onChange={(e) => setRecheck(e.target.checked)}
            />
            <span className="text-muted-foreground">
              Перепроверять уже верифицированные церкви (по умолчанию пропускаются)
            </span>
          </label>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button onClick={run} disabled={running} size="sm">
            {running ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Проверяю…
              </>
            ) : (
              <>
                <Sparkles className="mr-1 h-4 w-4" /> Запустить
              </>
            )}
          </Button>
          {running && progress && (
            <p className="text-xs text-muted-foreground">
              {progress.done}/{progress.target} обработано
            </p>
          )}
          {!running && result && (
            <p className="text-xs text-muted-foreground">
              ещё в очереди: <b>{result.remaining}</b>
            </p>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {result && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5">
              обработано: <b>{result.processed}</b>
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
              предложено правок: <b>{result.updated}</b>
            </span>
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-700 dark:text-sky-300">
              подтверждено как есть: <b>{result.kept}</b>
            </span>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
              пропущено: <b>{result.skipped}</b>
            </span>
            {result.errors > 0 && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
                ошибок: <b>{result.errors}</b>
              </span>
            )}
          </div>
        )}

        {result && result.log.length > 0 && (
          <ul className="mt-3 divide-y divide-border text-sm">
            {result.log.map((row, i) => (
              <li key={i} className="flex items-start gap-2 py-2">
                {row.status === "updated" && (
                  <ArrowRight className="mt-0.5 h-4 w-4 text-emerald-600" />
                )}
                {row.status === "kept" && (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-sky-600" />
                )}
                {row.status === "skipped" && (
                  <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                )}
                {row.status === "error" && (
                  <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {row.name}
                    {row.confidence != null && (
                      <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">
                        confidence {row.confidence.toFixed(2)}
                      </span>
                    )}
                    {row.distanceM != null && (
                      <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">
                        сдвиг {Math.round(row.distanceM)} м
                      </span>
                    )}
                  </div>
                  {row.reasoning && (
                    <div className="text-xs text-muted-foreground">{row.reasoning}</div>
                  )}
                  {row.note && (
                    <div className="text-xs italic text-muted-foreground">{row.note}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Moderation queue */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-sm font-semibold">Очередь модерации</h3>
          <div className="flex gap-1 text-xs">
            {(["pending", "approved", "rejected", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={
                  "rounded-md px-2 py-1 transition-colors " +
                  (filter === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent")
                }
              >
                {s === "pending"
                  ? "Ожидают"
                  : s === "approved"
                    ? "Одобрены"
                    : s === "rejected"
                      ? "Отклонены"
                      : "Все"}
              </button>
            ))}
          </div>
        </div>

        {loadingList ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Записей нет.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((v) => {
              const moved = v.distance_m >= 25;
              return (
                <li
                  key={v.id}
                  className="rounded-lg border border-border bg-background p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {v.church?.name.ru ||
                          v.church?.name.en ||
                          v.church?.name.ka ||
                          `#${v.church_id}`}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {v.church?.confessionRaw}
                          {v.church?.district ? ` · ${v.church.district}` : ""}
                        </span>
                      </div>
                      {v.church?.address && (
                        <div className="text-xs text-muted-foreground">
                          {v.church.address}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-3 text-xs tabular-nums">
                        <span className="text-muted-foreground">
                          было: {v.old_lat.toFixed(5)}, {v.old_lon.toFixed(5)}
                        </span>
                        <ArrowRight className="h-3 w-3 self-center text-muted-foreground" />
                        <span
                          className={
                            moved
                              ? "font-medium text-emerald-700 dark:text-emerald-300"
                              : "text-sky-700 dark:text-sky-300"
                          }
                        >
                          стало: {v.new_lat.toFixed(5)}, {v.new_lon.toFixed(5)}
                        </span>
                        <span className="text-muted-foreground">
                          сдвиг {Math.round(v.distance_m)} м · confidence{" "}
                          {Number(v.model_confidence).toFixed(2)}
                        </span>
                      </div>
                      {v.reasoning && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {v.reasoning}
                        </p>
                      )}
                      {v.sources && v.sources.length > 0 && (
                        <ul className="mt-1 flex flex-wrap gap-2 text-xs">
                          {v.sources.map((s, i) => (
                            <li key={i}>
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {s.title || new URL(s.url).hostname}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-1 flex gap-2 text-xs">
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${v.new_lat}&mlon=${v.new_lon}#map=18/${v.new_lat}/${v.new_lon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:underline"
                        >
                          OSM ↗
                        </a>
                        <a
                          href={`/tbilisi?lang=ru&h=1&o=70&d=1#${v.new_lat},${v.new_lon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:underline"
                        >
                          На карте Тбилиси ↗
                        </a>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {v.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => review(v.id, "approve")}
                            className="h-7"
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Одобрить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => review(v.id, "reject")}
                            className="h-7"
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Отклонить
                          </Button>
                        </>
                      ) : (
                        <>
                          <span
                            className={
                              "rounded-full px-2 py-0.5 text-center text-xs " +
                              (v.status === "approved"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground")
                            }
                          >
                            {v.status === "approved" ? "Одобрено" : "Отклонено"}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => review(v.id, "reset")}
                            className="h-6"
                          >
                            <RotateCcw className="mr-1 h-3 w-3" /> Вернуть в очередь
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
