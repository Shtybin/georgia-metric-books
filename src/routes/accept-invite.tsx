import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/accept-invite")({
  head: () => ({
    meta: [
      { title: "Принять приглашение — Georgia Metric Books Atlas" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    token: (s.token as string) || "",
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [hasUser, setHasUser] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setHasUser(!!data.user);
      if (data.user?.email) setEmail(data.user.email);
    });
  }, []);

  async function acceptNow() {
    setBusy(true);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
      if (error) throw error;
      setMsg("Готово! Роль назначена. Открываем админ-панель…");
      setTimeout(() => navigate({ to: "/admin" }), 800);
      void data;
    } catch (e: any) {
      setErr(e?.message ?? "Не удалось принять приглашение");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setErr("Ссылка недействительна (нет токена)");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/accept-invite?token=${token}` },
        });
        if (error) throw error;
        // If email confirmation is required user must verify; otherwise session exists.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await acceptNow();
        } else {
          setMsg("Подтвердите email и вернитесь по этой же ссылке.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        await acceptNow();
      }
    } catch (e: any) {
      setErr(e?.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="font-serif text-xl">Ссылка недействительна</h1>
          <p className="mt-2 text-sm text-muted-foreground">Не указан токен приглашения.</p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
            На главную
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg">
        <h1 className="font-serif text-2xl font-semibold">Приглашение в команду</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Создайте аккаунт или войдите, чтобы принять приглашение. Email должен совпадать
          с тем, на который выслана ссылка.
        </p>

        {hasUser ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm">
              Вы вошли как <span className="font-mono">{email}</span>.
            </p>
            <Button onClick={acceptNow} disabled={busy} className="w-full">
              {busy ? "…" : "Принять приглашение"}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Пароль</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "…" : mode === "signup" ? "Создать аккаунт и принять" : "Войти и принять"}
            </Button>
            <button
              type="button"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="w-full text-xs text-muted-foreground hover:text-foreground"
            >
              {mode === "signup" ? "У меня уже есть аккаунт" : "Создать новый аккаунт"}
            </button>
          </form>
        )}

        {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}
        {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
      </div>
    </main>
  );
}
