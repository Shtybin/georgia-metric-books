/**
 * Static guard test for the /admin route file.
 *
 * Rendering admin.tsx in jsdom would require mocking Leaflet, MapLibre, the
 * router, and a dozen child components — flaky and high-maintenance. The
 * actual security boundary is the database (covered by admin-access.test.ts),
 * but we still want a regression net for the client-side gate so a careless
 * edit cannot silently delete the redirect.
 *
 * This asserts the source of src/routes/admin.tsx contains:
 *   1. a server-validated user check via supabase.auth.getUser()
 *   2. a navigate({ to: "/login" }) redirect when no user is present
 *   3. a has_role RPC call to determine admin status
 *   4. NO use of getSession() for auth gating (only for telemetry)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../routes/admin.tsx"),
  "utf8",
);

describe("/admin route gate (static)", () => {
  it("uses server-validated supabase.auth.getUser()", () => {
    expect(source).toMatch(/supabase\.auth\.getUser\s*\(\s*\)/);
  });

  it("redirects to /login when no authenticated user", () => {
    // Regex tolerates whitespace / quoting variations.
    expect(source).toMatch(/navigate\s*\(\s*\{\s*to:\s*["']\/login["']/);
  });

  it("checks admin role via has_role RPC", () => {
    expect(source).toMatch(/\.rpc\s*\(\s*["']has_role["']/);
    expect(source).toMatch(/_role:\s*["']admin["']/);
  });

  it("does not gate auth with getSession()", () => {
    // getSession is allowed for telemetry-only fields (expires_at, provider)
    // AFTER getUser has confirmed the session, but it must never be used as
    // the primary auth check. We assert no gating pattern like
    // `if (!session) navigate(...)` exists.
    const badPatterns = [
      /if\s*\(\s*!?\s*session\s*\)\s*[^]*?navigate/,
      /getSession\s*\([^)]*\)\s*\.then\s*\([^]*?navigate\s*\(/,
    ];
    for (const re of badPatterns) {
      expect(source).not.toMatch(re);
    }
  });
});
