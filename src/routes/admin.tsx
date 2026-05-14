import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AdminMiniMap } from "@/components/map/AdminMiniMap";
import { OsmLeafletDialog } from "@/components/map/OsmLeafletDialog";
import { FeatureCardsEditor } from "@/components/admin/FeatureCardsEditor";
import { Check, X, LogOut, ExternalLink, MessageSquare, Trash2, History, Activity, ChevronDown, ChevronRight, RefreshCw, Map as MapIcon, FileEdit } from "lucide-react";

interface OsmActionProps {
  lat: number;
  lon: number;
  zoom?: number | null;
  title?: string;
}

function OsmAction({ lat, lon, zoom, title }: OsmActionProps) {
  const accessibleLabel = title
    ? `Открыть карту OpenStreetMap для ${title} (${lat.toFixed(5)}, ${lon.toFixed(5)})`
    : `Открыть карту OpenStreetMap для координат ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  return (
    <OsmLeafletDialog
      lat={lat}
      lon={lon}
      zoom={zoom}
      title={title}
      trigger={
        <button
          type="button"
          aria-label={accessibleLabel}
          className="inline-flex items-center gap-0.5 rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <MapIcon aria-hidden="true" className="h-3 w-3" /> OSM
        </button>
      }
    />
  );
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Georgia Metric Books Atlas" },
      { name: "description", content: "Moderation dashboard for the Georgia Metric Books Atlas: review user reports, coordinate suggestions, and content edits." },
      { property: "og:title", content: "Admin — Georgia Metric Books Atlas" },
      { property: "og:description", content: "Moderation dashboard for the Georgia Metric Books Atlas." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

interface ProblemReport {
  id: string;
  created_at: string;
  message: string;
  contact: string | null;
  page_url: string | null;
  lang: string | null;
  user_agent: string | null;
  status: "new" | "in_progress" | "resolved";
  lat: number | null;
  lon: number | null;
  zoom: number | null;
  admin_notes: string | null;
}

interface ReportHistoryEntry {
  id: string;
  changed_at: string;
  changed_by: string | null;
  old_status: "new" | "in_progress" | "resolved" | null;
  new_status: "new" | "in_progress" | "resolved";
  note: string | null;
}

interface Suggestion {
  id: string;
  settlement_ru: string;
  settlement_en: string;
  uezd_ru: string;
  uezd_en: string;
  region_ru: string;
  region_en: string;
  church_ru: string;
  years: string;
  lat: number;
  lon: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface Diagnostics {
  checkedAt: string;
  sessionPresent: boolean;
  userId: string | null;
  email: string | null;
  expiresAt: string | null;
  provider: string | null;
  rpcOk: boolean;
  rpcResult: unknown;
  rpcError: string | null;
}

function AdminPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [tab, setTab] = useState<"coords" | "reports" | "cards">("coords");
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportFilter, setReportFilter] = useState<"new" | "in_progress" | "resolved" | "all">("new");
  const [reports, setReports] = useState<ProblemReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [reportSearchDebounced, setReportSearchDebounced] = useState("");
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [reportsTotal, setReportsTotal] = useState<number | null>(null);
  const [reportsLoadingMore, setReportsLoadingMore] = useState(false);
  const REPORTS_PAGE = 25;
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [notesSaving, setNotesSaving] = useState<Record<string, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [historyData, setHistoryData] = useState<Record<string, ReportHistoryEntry[]>>({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});

  async function runDiagnostics(): Promise<{ admin: boolean; email: string | null }> {
    const { data: sess } = await supabase.auth.getSession();
    const session = sess.session;
    let rpcOk = false;
    let rpcResult: unknown = null;
    let rpcError: string | null = null;
    let admin = false;
    if (session) {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      rpcResult = data;
      rpcOk = !error;
      rpcError = error?.message ?? null;
      admin = !error && data === true;
    }
    setDiagnostics({
      checkedAt: new Date().toISOString(),
      sessionPresent: !!session,
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      provider: (session?.user.app_metadata?.provider as string) ?? null,
      rpcOk,
      rpcResult,
      rpcError,
    });
    return { admin, email: session?.user.email ?? null };
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/login" });
        return;
      }
      const { admin, email: e } = await runDiagnostics();
      if (!mounted) return;
      setEmail(e);
      setIsAdmin(admin);
      setChecking(false);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("coord_suggestions")
      .select(
        "id, settlement_ru, settlement_en, uezd_ru, uezd_en, region_ru, region_en, church_ru, years, lat, lon, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) console.error(error);
    setItems((data as Suggestion[]) || []);
    setLoading(false);
  }

  function escapeForOr(s: string) {
    // Postgrest .or() uses commas/parens as separators; also escape % and _
    return s.replace(/[(),%_*]/g, " ").trim();
  }

  async function loadReports(opts: { append?: boolean; offset?: number } = {}) {
    const offset = opts.offset ?? 0;
    if (opts.append) setReportsLoadingMore(true);
    else setReportsLoading(true);
    let q = supabase
      .from("problem_reports")
      .select("id, created_at, message, contact, page_url, lang, user_agent, status, lat, lon, zoom, admin_notes", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + REPORTS_PAGE - 1);
    if (reportFilter !== "all") q = q.eq("status", reportFilter);
    const term = escapeForOr(reportSearchDebounced);
    if (term) {
      const pat = `%${term}%`;
      q = q.or(`message.ilike.${pat},contact.ilike.${pat}`);
    }
    const { data, error, count } = await q;
    if (error) console.error(error);
    const rows = (data as ProblemReport[]) || [];
    setReports((prev) => (opts.append ? [...prev, ...rows] : rows));
    setReportsTotal(count ?? null);
    setReportsHasMore(rows.length === REPORTS_PAGE && (count == null || offset + rows.length < count));
    if (opts.append) setReportsLoadingMore(false);
    else setReportsLoading(false);
  }

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setReportSearchDebounced(reportSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [reportSearch]);

  useEffect(() => {
    if (isAdmin && tab === "coords") load();
    if (isAdmin && tab === "reports") loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, tab, filter, reportFilter, reportSearchDebounced]);

  async function setReportStatus(id: string, status: ProblemReport["status"]) {
    const { data: sess } = await supabase.auth.getSession();
    const reviewer = sess.session?.user.id ?? null;
    const { error } = await supabase
      .from("problem_reports")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: reviewer })
      .eq("id", id);
    if (error) { alert(error.message); return; }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    // If history panel is open, refresh it
    if (historyOpen[id]) loadHistory(id);
  }

  async function saveNotes(id: string) {
    const value = (notesDraft[id] ?? "").slice(0, 4000);
    setNotesSaving((s) => ({ ...s, [id]: true }));
    const { error } = await supabase
      .from("problem_reports")
      .update({ admin_notes: value || null })
      .eq("id", id);
    setNotesSaving((s) => ({ ...s, [id]: false }));
    if (error) { alert(error.message); return; }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, admin_notes: value || null } : r)));
    setNotesDraft((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  }

  async function loadHistory(id: string) {
    setHistoryLoading((s) => ({ ...s, [id]: true }));
    const { data, error } = await supabase
      .from("problem_report_history")
      .select("id, changed_at, changed_by, old_status, new_status, note")
      .eq("report_id", id)
      .order("changed_at", { ascending: false });
    setHistoryLoading((s) => ({ ...s, [id]: false }));
    if (error) { console.error(error); return; }
    setHistoryData((h) => ({ ...h, [id]: (data as ReportHistoryEntry[]) || [] }));
  }

  function toggleHistory(id: string) {
    const willOpen = !historyOpen[id];
    setHistoryOpen((s) => ({ ...s, [id]: willOpen }));
    if (willOpen && !historyData[id]) loadHistory(id);
  }

  async function deleteReport(id: string) {
    if (!confirm("Удалить сообщение?")) return;
    const { error } = await supabase.from("problem_reports").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    setReports((prev) => prev.filter((r) => r.id !== id));
    setReportsTotal((t) => (t != null ? Math.max(0, t - 1) : t));
  }

  async function setStatus(id: string, status: "approved" | "rejected") {
    const { error } = await supabase
      .from("coord_suggestions")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Проверка доступа…</main>;
  }

  const diagPanel = (
    <DiagnosticsPanel
      open={diagOpen}
      onToggle={() => setDiagOpen((v) => !v)}
      isAdmin={isAdmin}
      diagnostics={diagnostics}
      onRefresh={async () => {
        const { admin } = await runDiagnostics();
        setIsAdmin(admin);
      }}
    />
  );

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <h1 className="font-serif text-2xl">Доступ запрещён</h1>
        <p className="text-sm text-muted-foreground">
          Учётной записи <span className="font-mono">{email}</span> не назначена роль admin.
        </p>
        <div className="flex gap-2">
          <Button onClick={logout} variant="outline" size="sm">
            <LogOut className="mr-1 h-4 w-4" /> Выйти
          </Button>
          <Link to="/map" search={{ lang: "ru" }}>
            <Button size="sm" variant="ghost">На карту</Button>
          </Link>
        </div>
        <div className="w-full max-w-xl text-left">{diagPanel}</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <div>
            <h1 className="font-serif text-lg font-semibold">
              {tab === "coords" ? "Модерация координат" : "Сообщения от пользователей"}
            </h1>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/map" search={{ lang: "ru" }}>
              <Button variant="outline" size="sm">На карту</Button>
            </Link>
            <Button onClick={logout} variant="ghost" size="sm">
              <LogOut className="mr-1 h-4 w-4" /> Выйти
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3">{diagPanel}</div>
        <div className="mx-auto flex max-w-6xl gap-1 border-b border-border/60 px-4 text-xs">
          {(["coords", "reports"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={
                "border-b-2 px-3 py-2 transition-colors " +
                (tab === k
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {k === "coords" ? "Координаты" : (
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" /> Сообщения
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2 text-xs">
          {tab === "coords"
            ? (["pending", "approved", "rejected", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={
                    "rounded-md px-3 py-1 transition-colors " +
                    (filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")
                  }
                >
                  {s === "pending" ? "Ожидают" : s === "approved" ? "Одобрены" : s === "rejected" ? "Отклонены" : "Все"}
                </button>
              ))
            : (
              <>
                {(["new", "in_progress", "resolved", "all"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setReportFilter(s)}
                    className={
                      "rounded-md px-3 py-1 transition-colors " +
                      (reportFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")
                    }
                  >
                    {s === "new" ? "Новые" : s === "in_progress" ? "В работе" : s === "resolved" ? "Решено" : "Все"}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  <input
                    type="search"
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Поиск по тексту или контакту…"
                    className="w-56 rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {reportsTotal != null && (
                    <span className="text-muted-foreground tabular-nums">
                      {reports.length} / {reportsTotal}
                    </span>
                  )}
                </div>
              </>
            )}
        </div>
      </header>

      {tab === "coords" ? (
        <section className="mx-auto max-w-6xl px-4 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Записей нет.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {it.settlement_ru || it.settlement_en || "—"}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {[it.uezd_ru || it.uezd_en, it.region_ru || it.region_en].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      {it.church_ru && (
                        <div className="text-xs italic text-muted-foreground">{it.church_ru.replace(/\|/g, " · ")}</div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
                        <span>lat {it.lat.toFixed(4)}, lon {it.lon.toFixed(4)}</span>
                        {it.years && <span>{it.years}</span>}
                        <span>{new Date(it.created_at).toLocaleString("ru-RU")}</span>
                        <OsmAction
                          lat={it.lat}
                          lon={it.lon}
                          title={it.settlement_ru || it.settlement_en || undefined}
                        />
                      </div>
                    </div>
                    {it.status === "pending" && (
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" onClick={() => setStatus(it.id, "approved")}>
                          <Check className="mr-1 h-3.5 w-3.5" /> Одобрить
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setStatus(it.id, "rejected")}>
                          <X className="mr-1 h-3.5 w-3.5" /> Отклонить
                        </Button>
                      </div>
                    )}
                    {it.status !== "pending" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {it.status === "approved" ? "одобрено" : "отклонено"}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="mx-auto max-w-6xl px-4 py-4">
          {reportsLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Сообщений нет.</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-sm">{r.message}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{new Date(r.created_at).toLocaleString("ru-RU")}</span>
                        {r.contact && <span className="font-medium text-foreground">{r.contact}</span>}
                        {r.lang && <span className="uppercase">{r.lang}</span>}
                        {r.page_url && (
                          <a
                            href={r.page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-primary hover:underline"
                          >
                            страница <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <span className={
                          "rounded-full px-2 py-0.5 " +
                          (r.status === "new"
                            ? "bg-primary/15 text-primary"
                            : r.status === "in_progress"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "bg-muted")
                        }>
                          {r.status === "new" ? "новое" : r.status === "in_progress" ? "в работе" : "решено"}
                        </span>
                      </div>
                      {r.user_agent && (
                        <p className="mt-1 truncate text-[10px] text-muted-foreground/70" title={r.user_agent}>
                          {r.user_agent}
                        </p>
                      )}
                      {r.lat != null && r.lon != null && (
                        <div className="mt-2 w-full max-w-sm">
                          <div className="overflow-hidden rounded-md border border-border">
                            <AdminMiniMap lat={r.lat} lon={r.lon} zoom={r.zoom} className="h-40 w-full" />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
                            <span>
                              {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
                              {r.zoom != null && <> · z{r.zoom.toFixed(1)}</>}
                            </span>
                            <OsmAction lat={r.lat} lon={r.lon} zoom={r.zoom} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {r.status !== "in_progress" && (
                        <Button size="sm" variant="outline" onClick={() => setReportStatus(r.id, "in_progress")}>
                          В работу
                        </Button>
                      )}
                      {r.status !== "resolved" && (
                        <Button size="sm" onClick={() => setReportStatus(r.id, "resolved")}>
                          <Check className="mr-1 h-3.5 w-3.5" /> Решено
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteReport(r.id)} aria-label="Удалить">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-border pt-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Заметки модератора
                    </label>
                    <textarea
                      value={notesDraft[r.id] ?? r.admin_notes ?? ""}
                      onChange={(e) =>
                        setNotesDraft((d) => ({ ...d, [r.id]: e.target.value.slice(0, 4000) }))
                      }
                      rows={2}
                      maxLength={4000}
                      placeholder="Внутренние заметки видны только администраторам…"
                      className="w-full rounded-md border border-border bg-background p-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleHistory(r.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <History className="h-3 w-3" />
                        {historyOpen[r.id] ? "Скрыть историю" : "История изменений"}
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          notesSaving[r.id] ||
                          notesDraft[r.id] === undefined ||
                          (notesDraft[r.id] ?? "") === (r.admin_notes ?? "")
                        }
                        onClick={() => saveNotes(r.id)}
                      >
                        {notesSaving[r.id] ? "Сохранение…" : "Сохранить заметки"}
                      </Button>
                    </div>

                    {historyOpen[r.id] && (
                      <div className="mt-2 rounded-md bg-muted/40 p-2">
                        {historyLoading[r.id] ? (
                          <p className="text-[11px] text-muted-foreground">Загрузка истории…</p>
                        ) : (historyData[r.id]?.length ?? 0) === 0 ? (
                          <p className="text-[11px] text-muted-foreground">История пуста.</p>
                        ) : (
                          <ol className="space-y-1 text-[11px]">
                            {historyData[r.id].map((h) => {
                              const label = (s: ReportHistoryEntry["new_status"] | null) =>
                                s === "new" ? "новое" : s === "in_progress" ? "в работе" : s === "resolved" ? "решено" : "—";
                              return (
                                <li key={h.id} className="flex flex-wrap items-baseline gap-x-2">
                                  <span className="tabular-nums text-muted-foreground">
                                    {new Date(h.changed_at).toLocaleString("ru-RU")}
                                  </span>
                                  <span>
                                    {h.old_status ? (
                                      <>
                                        <span className="text-muted-foreground">{label(h.old_status)}</span>
                                        {" → "}
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground">создано · </span>
                                    )}
                                    <span className="font-medium">{label(h.new_status)}</span>
                                  </span>
                                  {h.note && <span className="text-muted-foreground">«{h.note}»</span>}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!reportsLoading && reportsHasMore && (
            <div className="mt-3 flex justify-center">
              <Button
                size="sm"
                variant="outline"
                disabled={reportsLoadingMore}
                onClick={() => loadReports({ append: true, offset: reports.length })}
              >
                {reportsLoadingMore ? "Загрузка…" : "Показать ещё"}
              </Button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function DiagnosticsPanel({
  open,
  onToggle,
  isAdmin,
  diagnostics,
  onRefresh,
}: {
  open: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  diagnostics: Diagnostics | null;
  onRefresh: () => void | Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const sessionOk = !!diagnostics?.sessionPresent;
  const expiresInMs = diagnostics?.expiresAt
    ? new Date(diagnostics.expiresAt).getTime() - Date.now()
    : null;
  const expiresLabel =
    expiresInMs == null
      ? "—"
      : expiresInMs <= 0
        ? "истекла"
        : `через ${Math.round(expiresInMs / 60000)} мин`;

  return (
    <div className="rounded-lg border border-border bg-muted/30 text-xs">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">Диагностика</span>
          <Badge ok={sessionOk} label={sessionOk ? "сессия" : "нет сессии"} />
          <Badge ok={isAdmin} label={isAdmin ? "admin" : "не admin"} />
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/60 px-3 py-2">
          <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
            <dt className="text-muted-foreground">email</dt>
            <dd className="break-all">{diagnostics?.email ?? "—"}</dd>
            <dt className="text-muted-foreground">user id</dt>
            <dd className="break-all">{diagnostics?.userId ?? "—"}</dd>
            <dt className="text-muted-foreground">провайдер</dt>
            <dd>{diagnostics?.provider ?? "—"}</dd>
            <dt className="text-muted-foreground">истекает</dt>
            <dd>
              {diagnostics?.expiresAt ?? "—"}
              <span className="ml-1 text-muted-foreground">({expiresLabel})</span>
            </dd>
            <dt className="text-muted-foreground">has_role rpc</dt>
            <dd>
              {diagnostics?.rpcOk ? "ok" : "ошибка"} → {String(diagnostics?.rpcResult ?? "null")}
              {diagnostics?.rpcError && (
                <span className="ml-1 text-destructive">({diagnostics.rpcError})</span>
              )}
            </dd>
            <dt className="text-muted-foreground">проверено</dt>
            <dd>{diagnostics?.checkedAt ?? "—"}</dd>
          </dl>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              <RefreshCw className={"mr-1 h-3.5 w-3.5 " + (refreshing ? "animate-spin" : "")} />
              Обновить
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium " +
        (ok
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-destructive/10 text-destructive")
      }
    >
      <span className={"h-1.5 w-1.5 rounded-full " + (ok ? "bg-emerald-500" : "bg-destructive")} />
      {label}
    </span>
  );
}

