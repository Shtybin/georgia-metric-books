// Server-side wrappers for SECURITY DEFINER RPCs.
// EXECUTE on these functions is revoked from `authenticated`; they are only
// callable via the service-role client (postgres) used by supabaseAdmin.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const acceptInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(8).max(512) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("accept_invitation", { _token: data.token });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rollbackFeatureOverrideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ historyId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin, error: roleErr } = await supabaseAdmin.rpc("has_role", {
      _user_id: (context as { userId: string }).userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (isAdmin !== true) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.rpc("rollback_feature_override", {
      _history_id: data.historyId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
