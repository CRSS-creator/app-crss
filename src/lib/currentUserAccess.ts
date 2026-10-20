"use client";

import { supabase } from "./supabaseClient";
import type { UserRole } from "./permissions";

type AccessState = {
  role: UserRole | null;
  userId: string | null;
  mustChangePassword: boolean;
  loading: boolean;
  error: string | null;
};
const INITIAL: AccessState = { role: null, userId: null, mustChangePassword: false, loading: true, error: null };
const ACCESS_MAX_AGE_MS = 30_000;

// This cache is only UI state. Database RLS and API authorization still validate every request.
export function createCurrentUserAccessStore(client = supabase, now = Date.now) {
  let state = INITIAL;
  let checkedAt: number | null = null;
  let inFlight: Promise<void> | null = null;
  let revision = 0;
  let identity: string | null = null;
  let started = false;
  const listeners = new Set<() => void>();
  function publish(next: AccessState) {
    state = next;
    listeners.forEach(listener => listener());
  }
  function invalidate(loading: boolean) {
    revision++;
    checkedAt = null;
    inFlight = null;
    identity = null;
    publish({ ...INITIAL, loading });
  }
  function refresh(force = false): Promise<void> {
    if (inFlight) return inFlight;
    if (!force && checkedAt !== null && now() - checkedAt < ACCESS_MAX_AGE_MS) return Promise.resolve();
    const version = revision;
    const work = (async () => {
      try {
        const session = await withTimeout(client.auth.getSession());
        if (version !== revision) return;
        if (session.error) throw session.error;
        const id = session.data.session?.user.id;
        if (!id) {
          identity = null;
          checkedAt = now();
          publish({ ...INITIAL, loading: false });
          return;
        }
        identity = id;
        const [userResult, profile] = await Promise.all([
          withTimeout(client.auth.getUser()),
          withTimeout(client.from("profiles").select("role, aktywne").eq("id", id).single()),
        ]);
        if (version !== revision) return;
        if (userResult.error) throw userResult.error;
        if (!userResult.data.user || userResult.data.user.id !== id) throw new Error("Nie udało się potwierdzić sesji użytkownika.");
        if (profile.error) throw profile.error;
        if (profile.data?.aktywne === false) {
          publish({ ...INITIAL, loading: false, error: "Konto użytkownika jest nieaktywne." });
          await client.auth.signOut();
          if (typeof window !== "undefined") window.location.assign("/login");
          return;
        }
        const user = userResult.data.user;
        checkedAt = now();
        publish({ role: profile.data?.role ?? null, userId: id, loading: false, error: null,
          mustChangePassword: Boolean(user.app_metadata?.must_change_password || user.user_metadata?.must_change_password) });
      } catch (error) {
        if (version !== revision) return;
        checkedAt = null;
        publish({ ...INITIAL, loading: false, error: error instanceof Error ? error.message : "Nie udało się sprawdzić dostępu." });
      }
    })();
    inFlight = work.finally(() => { if (version === revision) inFlight = null; });
    return inFlight;
  }
  function start() {
    if (started) return;
    started = true;
    client.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return; // The initial getSession already handles this.
      if (event === "SIGNED_OUT") { invalidate(false); return; }
      const changed = session?.user.id !== identity;
      const force = changed || event === "USER_UPDATED" || event === "TOKEN_REFRESHED" || event === "PASSWORD_RECOVERY";
      if (force) invalidate(true);
      // Do not await Supabase calls inside the auth callback: it runs under the auth lock.
      setTimeout(() => { void refresh(force); }, 0);
    });
    if (typeof window !== "undefined") {
      const revalidate = () => {
        if (listeners.size > 0 && document.visibilityState === "visible") void refresh();
      };
      window.addEventListener("focus", revalidate);
      document.addEventListener("visibilitychange", revalidate);
      window.setInterval(revalidate, ACCESS_MAX_AGE_MS);
    }
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => INITIAL,
    refresh,
    subscribe(listener: () => void) {
      listeners.add(listener);
      start();
      void refresh();
      return () => { listeners.delete(listener); };
    },
  };
}

function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Sprawdzanie dostępu trwa zbyt długo. Odśwież stronę lub zaloguj się ponownie.")), 12_000);
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export const currentUserAccess = createCurrentUserAccessStore();
