import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listUsers,
  inviteUser,
  updateUserRole,
  deleteUser,
  revokeInvitation,
  changeOwnPassword,
} from "@/lib/adminUsers.functions";
import { Button } from "@/components/ui/button";
import { Trash2, Copy, Check, KeyRound, UserPlus } from "lucide-react";

type AppRole = "admin" | "editor" | "contributor";

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin — полный доступ",
  editor: "Editor — редактирование карты",
  contributor: "Contributor — добавление данных",
};

const ROLE_SHORT: Record<AppRole, string> = {
  admin: "admin",
  editor: "editor",
  contributor: "contributor",
};

interface UserRow {
  id: string;
  email: string | null;
  created_at: string;
  roles: AppRole[];
}
interface Invitation {
  id: string;
  email: string;
  role: AppRole;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export function UsersAdminPanel({ currentUserId }: { currentUserId: string }) {
  const list = useServerFn(listUsers);
  const invite = useServerFn(inviteUser);
  const setRole = useServerFn(updateUserRole);
  const remove = useServerFn(deleteUser);
  const revoke = useServerFn(revokeInvitation);
  const changePw = useServerFn(changeOwnPassword);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("editor");
  const [busy, setBusy] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      const res = await list();
      setUsers(res.users as UserRow[]);
      setInvitations(res.invitations as Invitation[]);
    } catch (e: any) {
      setErr(e?.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleInvite() {
    if (!newEmail.trim()) return;
    setBusy(true);
    setErr(null);
    setLastInviteUrl(null);
    setCopied(false);
    try {
      const res = await invite({
        data: {
          email: newEmail.trim(),
          role: newRole,
          appBaseUrl: window.location.origin,
        },
      });
      setLastInviteUrl(res.inviteUrl);
      setNewEmail("");
      await reload();
    } catch (e: any) {
      setErr(e?.message ?? "Не удалось создать приглашение");
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(userId: string, role: AppRole) {
    try {
      await setRole({ data: { userId, role } });
      await reload();
    } catch (e: any) {
      setErr(e?.message ?? "Не удалось изменить роль");
    }
  }

  async function handleDelete(userId: string, email: string | null) {
    if (!confirm(`Удалить пользователя ${email ?? userId}? Это действие необратимо.`)) return;
    try {
      await remove({ data: { userId } });
      await reload();
    } catch (e: any) {
      setErr(e?.message ?? "Не удалось удалить");
    }
  }

  async function handleRevoke(invitationId: string) {
    if (!confirm("Отозвать приглашение?")) return;
    try {
      await revoke({ data: { invitationId } });
      await reload();
    } catch (e: any) {
      setErr(e?.message ?? "Не удалось отозвать");
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) {
      setPwMsg("Пароль должен быть не короче 8 символов");
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    try {
      await changePw({ data: { newPassword: newPw } });
      setNewPw("");
      setPwMsg("Пароль обновлён ✓");
    } catch (e: any) {
      setPwMsg(e?.message ?? "Ошибка");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Смена своего пароля */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 font-serif text-base font-semibold">
          <KeyRound className="h-4 w-4" /> Мой пароль
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Если ваш пароль был передан вам в открытом виде — смените его сразу.
        </p>
        <form onSubmit={handleChangePassword} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="Новый пароль (мин. 8 символов)"
            minLength={8}
            className="w-72 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={pwBusy}>
            {pwBusy ? "…" : "Обновить пароль"}
          </Button>
          {pwMsg && <span className="text-xs text-muted-foreground">{pwMsg}</span>}
        </form>
      </section>

      {/* Пригласить */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 font-serif text-base font-semibold">
          <UserPlus className="h-4 w-4" /> Пригласить пользователя
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Создаёт ссылку-приглашение на 7 дней. Отправьте её получателю — он задаст свой пароль
          и получит выбранную роль автоматически.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Email</span>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-72 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Роль</span>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AppRole)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="admin">{ROLE_LABEL.admin}</option>
              <option value="editor">{ROLE_LABEL.editor}</option>
              <option value="contributor">{ROLE_LABEL.contributor}</option>
            </select>
          </label>
          <Button onClick={handleInvite} disabled={busy || !newEmail.trim()}>
            {busy ? "…" : "Создать приглашение"}
          </Button>
        </div>
        {lastInviteUrl && (
          <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-medium text-foreground">Ссылка приглашения готова:</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={lastInviteUrl}
                className="flex-1 rounded border border-input bg-background px-2 py-1 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button size="sm" variant="outline" onClick={() => handleCopy(lastInviteUrl)}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="ml-1">{copied ? "Скопировано" : "Копировать"}</span>
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Отправьте эту ссылку получателю любым удобным способом (email, мессенджер).
              Ссылка действует 7 дней.
            </p>
          </div>
        )}
      </section>

      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {/* Список пользователей */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="font-serif text-base font-semibold">Пользователи ({users.length})</h3>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Роль</th>
                  <th className="py-2 pr-3">Добавлен</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const currentRole: AppRole =
                    (u.roles.includes("admin")
                      ? "admin"
                      : u.roles.includes("editor")
                        ? "editor"
                        : u.roles.includes("contributor")
                          ? "contributor"
                          : "contributor") as AppRole;
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className="border-t border-border">
                      <td className="py-2 pr-3 font-mono text-xs">
                        {u.email ?? "(нет email)"}
                        {isSelf && (
                          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            это вы
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={currentRole}
                          onChange={(e) =>
                            handleRoleChange(u.id, e.target.value as AppRole)
                          }
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          <option value="admin">{ROLE_SHORT.admin}</option>
                          <option value="editor">{ROLE_SHORT.editor}</option>
                          <option value="contributor">{ROLE_SHORT.contributor}</option>
                        </select>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="py-2 pr-3">
                        {!isSelf && (
                          <button
                            onClick={() => handleDelete(u.id, u.email)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3 w-3" /> Удалить
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Приглашения */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="font-serif text-base font-semibold">
          Приглашения ({invitations.length})
        </h3>
        {invitations.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Приглашений пока нет.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Роль</th>
                  <th className="py-2 pr-3">Создано</th>
                  <th className="py-2 pr-3">Истекает</th>
                  <th className="py-2 pr-3">Статус</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => {
                  const expired = new Date(inv.expires_at) < new Date();
                  const status = inv.accepted_at
                    ? "принято"
                    : expired
                      ? "истекло"
                      : "ожидает";
                  return (
                    <tr key={inv.id} className="border-t border-border">
                      <td className="py-2 pr-3 font-mono text-xs">{inv.email}</td>
                      <td className="py-2 pr-3 text-xs">{ROLE_SHORT[inv.role]}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {new Date(inv.created_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {new Date(inv.expires_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="py-2 pr-3 text-xs">{status}</td>
                      <td className="py-2 pr-3">
                        {!inv.accepted_at && (
                          <button
                            onClick={() => handleRevoke(inv.id)}
                            className="text-xs text-destructive hover:underline"
                          >
                            Отозвать
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
