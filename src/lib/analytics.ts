// Lightweight anonymous event tracking backed by public.analytics_events.
// Fire-and-forget: never throws, never blocks UI.
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "analytics_session_v1";

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let sid = window.localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid =
        (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
        "-" +
        Date.now().toString(36);
      window.localStorage.setItem(SESSION_KEY, sid);
    }
    return sid.slice(0, 64);
  } catch {
    return "anon";
  }
}

export type TrackPayload = Record<string, unknown>;

export function trackEvent(event: string, payload: TrackPayload = {}, lang?: string): void {
  if (typeof window === "undefined") return;
  try {
    void (supabase.from("analytics_events" as never) as never as {
      insert: (row: Record<string, unknown>) => Promise<unknown>;
    }).insert({
      event: event.slice(0, 64),
      path: window.location.pathname.slice(0, 256),
      lang: lang?.slice(0, 8) ?? null,
      session_id: getSessionId(),
      payload,
      user_agent: navigator.userAgent?.slice(0, 512) ?? null,
    });
  } catch {
    /* never throw */
  }
}
