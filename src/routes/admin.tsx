import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, X, LogOut, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Админ — модерация координат" }] }),
  component: AdminPage,
});

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

function AdminPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/login" });
        return;
      }
      setEmail(sess.session.user.email ?? null);
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", sess.session.user.id);
      if (!mounted) return;
      const admin = !error && (roles ?? []).some((r: any) => r.role === "admin");
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

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, filter]);

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
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <div>
            <h1 className="font-serif text-lg font-semibold">Модерация координат</h1>
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
        <div className="mx-auto flex max-w-6xl gap-1 px-4 pb-2 text-xs">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
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
          ))}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Записей нет.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={it.id}
                className="rounded-xl border border-border bg-card p-3 shadow-sm"
              >
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
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${it.lat}&mlon=${it.lon}#map=12/${it.lat}/${it.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                      >
                        OSM <ExternalLink className="h-3 w-3" />
                      </a>
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
    </main>
  );
}
