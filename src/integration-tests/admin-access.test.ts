/**
 * Integration tests: verify that an anonymous (non-admin) caller cannot
 * read admin-only tables, cannot mutate admin-only tables, and cannot
 * invoke protected RPC functions.
 *
 * These tests hit the LIVE Supabase REST endpoint with the anon key.
 * They are read-mostly and never produce side effects — every write
 * attempt is expected to be rejected by RLS or by GRANT/REVOKE.
 *
 * Run with: bun run test  (or `bunx vitest run admin-access`)
 *
 * Skipped automatically when VITE_SUPABASE_URL is not set (e.g. in CI
 * sandboxes without network).
 */

import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const d = ENABLED ? describe : describe.skip;

// Fresh anon client (no persisted session, no auto-refresh) to guarantee
// requests are made as the `anon` Postgres role, not as some leaked logged-in
// user from an unrelated test.
const anon = ENABLED
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// A throwaway UUID used for "row that does not exist" lookups. Whatever
// matches it would belong to nobody anyway.
const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

d("anon role cannot read admin-only tables", () => {
  // Tables where RLS exposes ZERO rows to anon (no `Anyone can read…` policy).
  const adminOnlyTables = [
    "problem_reports",
    "problem_report_history",
    "feature_override_history",
    "missing_years_suggestions",
    "uezd_corrections",
    "user_roles",
  ] as const;

  for (const table of adminOnlyTables) {
    it(`SELECT on ${table} returns no rows for anon`, async () => {
      const { data, error, count } = await anon!
        .from(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("*", { count: "exact", head: true }) as any;
      // PostgREST returns success with 0 rows (RLS filters them out)
      // rather than an explicit error. Either is acceptable as "denied".
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(count ?? (data?.length ?? 0)).toBe(0);
      }
    });
  }
});

d("anon role cannot write to admin-only tables", () => {
  it("INSERT into feature_overrides is rejected", async () => {
    const { data, error } = await anon!
      .from("feature_overrides")
      .insert({ feature_id: 1, action: "patch", data: {}, published: false })
      .select();
    // RLS WITH CHECK fails → either an explicit error or zero returned rows.
    expect(error || (data ?? []).length === 0).toBeTruthy();
  });

  it("UPDATE on feature_overrides affects zero rows", async () => {
    const { data, error } = await anon!
      .from("feature_overrides")
      .update({ published: true })
      .eq("id", FAKE_UUID)
      .select();
    expect(error || (data ?? []).length === 0).toBeTruthy();
  });

  it("DELETE on feature_overrides affects zero rows", async () => {
    const { data, error } = await anon!
      .from("feature_overrides")
      .delete()
      .eq("id", FAKE_UUID)
      .select();
    expect(error || (data ?? []).length === 0).toBeTruthy();
  });

  it("UPSERT into guide_content is rejected", async () => {
    const { data, error } = await anon!
      .from("guide_content")
      .upsert({ lang: "xx", content: "hacked by anon" }, { onConflict: "lang" })
      .select();
    expect(error || (data ?? []).length === 0).toBeTruthy();
  });

  it("UPDATE on problem_reports (status change) affects zero rows", async () => {
    const { data, error } = await anon!
      .from("problem_reports")
      .update({ status: "resolved", admin_notes: "anon tampered" })
      .eq("id", FAKE_UUID)
      .select();
    expect(error || (data ?? []).length === 0).toBeTruthy();
  });

  it("UPDATE on coord_suggestions (status change) affects zero rows", async () => {
    const { data, error } = await anon!
      .from("coord_suggestions")
      .update({ status: "approved" })
      .eq("id", FAKE_UUID)
      .select();
    expect(error || (data ?? []).length === 0).toBeTruthy();
  });
});

d("anon role cannot invoke protected RPC functions", () => {
  it("rpc('rollback_feature_override') is forbidden for anon", async () => {
    const { error } = await anon!.rpc("rollback_feature_override", {
      _history_id: FAKE_UUID,
    });
    // Either GRANT was revoked (permission denied) or the function ran and
    // raised 'Forbidden' from its internal has_role check. Both are denials.
    expect(error).toBeTruthy();
    expect(error!.message.toLowerCase()).toMatch(
      /forbidden|permission denied|not allowed|denied/,
    );
  });

  it("rpc('has_role') is forbidden for anon", async () => {
    const { error } = await anon!.rpc("has_role", {
      _user_id: FAKE_UUID,
      _role: "admin",
    });
    // EXECUTE was revoked from anon → PostgREST returns permission denied.
    expect(error).toBeTruthy();
    expect(error!.message.toLowerCase()).toMatch(
      /permission denied|not allowed|denied|forbidden/,
    );
  });
});
