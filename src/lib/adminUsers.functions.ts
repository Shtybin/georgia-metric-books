import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { randomBytes, createHash } from "crypto";

type AppRole = "admin" | "editor" | "contributor";
const ROLE_VALUES = ["admin", "editor", "contributor"] as const;

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // Pull all users (paginate up to a sane cap)
    const all: Array<{ id: string; email: string | null; created_at: string }> = [];
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      for (const u of data.users) {
        all.push({ id: u.id, email: u.email ?? null, created_at: u.created_at });
      }
      if (data.users.length < 200) break;
    }

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);

    const rolesByUser = new Map<string, AppRole[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesByUser.set(r.user_id, arr);
    }

    // Only return users who have at least one app role (filters out random sign-ups)
    const users = all
      .filter((u) => rolesByUser.has(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        roles: rolesByUser.get(u.id) ?? [],
      }));

    const { data: invites, error: invErr } = await supabaseAdmin
      .from("user_invitations")
      .select("id, email, role, created_at, expires_at, accepted_at")
      .order("created_at", { ascending: false });
    if (invErr) throw new Error(invErr.message);

    return { users, invitations: invites ?? [] };
  });

const InviteSchema = z.object({
  email: z.string().trim().email().max(255),
  role: z.enum(ROLE_VALUES),
  appBaseUrl: z.string().url().max(500),
});

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const email = data.email.toLowerCase();

    // Generate token + hash
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { error } = await supabaseAdmin.from("user_invitations").insert({
      email,
      role: data.role,
      token_hash: tokenHash,
      invited_by: context.userId,
    });
    if (error) throw new Error(error.message);

    const inviteUrl = `${data.appBaseUrl.replace(/\/$/, "")}/accept-invite?token=${token}`;
    return { ok: true, inviteUrl, email, role: data.role };
  });

const UpdateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLE_VALUES),
});

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateRoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Prevent removing the last admin
    if (data.userId === context.userId && data.role !== "admin") {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        throw new Error("Нельзя оставить систему без администратора");
      }
    }

    // Replace all roles for this user with the chosen one
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (insErr) throw new Error(insErr.message);

    return { ok: true };
  });

const DeleteUserSchema = z.object({ userId: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (data.userId === context.userId) {
      throw new Error("Нельзя удалить самого себя");
    }

    // Don't allow deleting the last admin
    const { data: target } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const isAdminTarget = (target ?? []).some((r) => r.role === "admin");
    if (isAdminTarget) {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        throw new Error("Нельзя удалить последнего администратора");
      }
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    // user_roles cascade is via FK to auth.users? Not in our schema — clean manually.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);

    return { ok: true };
  });

const RevokeSchema = z.object({ invitationId: z.string().uuid() });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RevokeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("user_invitations")
      .delete()
      .eq("id", data.invitationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ChangePwSchema = z.object({
  newPassword: z.string().min(8).max(72),
});

export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ChangePwSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Returns the highest role of the current user. */
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role as AppRole);
    const best: AppRole | null = roles.includes("admin")
      ? "admin"
      : roles.includes("editor")
        ? "editor"
        : roles.includes("contributor")
          ? "contributor"
          : null;
    return { role: best };
  });
