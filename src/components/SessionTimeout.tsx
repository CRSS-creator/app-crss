"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const INACTIVITY_TIME = 60 * 60 * 1000; // 60 minut
const WARNING_TIME = 60 * 1000; // 1 minuta przed wylogowaniem

export default function SessionTimeout() {
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const [showWarning, setShowWarning] = useState(false);
  const activityHandler = useRef<(() => void) | null>(null);
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    try { window.sessionStorage.removeItem("crss-last-activity"); } catch { /* Storage may be unavailable. */ }
    router.replace("/login");
  }, [router]);
  const resetTimer = () => activityHandler.current?.();

  useEffect(() => {
    if (isLogin) {
      try { window.sessionStorage.removeItem("crss-last-activity"); } catch { /* Storage may be unavailable. */ }
      return;
    }
    let lastActivity = Date.now();
    try {
      const stored = Number(window.sessionStorage.getItem("crss-last-activity"));
      if (stored > 0 && stored <= lastActivity) lastActivity = stored;
    } catch { /* Keep the in-memory inactivity timer if storage is unavailable. */ }
    let warningTimer: ReturnType<typeof setTimeout> | undefined;
    let logoutTimer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    const clearTimers = () => { clearTimeout(warningTimer); clearTimeout(logoutTimer); };
    const expire = () => {
      if (expired) return;
      expired = true;
      clearTimers();
      void logout();
    };
    const armTimers = () => {
      clearTimers();
      const remaining = INACTIVITY_TIME - (Date.now() - lastActivity);
      if (remaining <= 0) { expire(); return; }
      setShowWarning(remaining <= WARNING_TIME);
      if (remaining > WARNING_TIME) warningTimer = setTimeout(() => setShowWarning(true), remaining - WARNING_TIME);
      logoutTimer = setTimeout(expire, remaining);
    };
    const recordActivity = () => {
      if (expired) return;
      const now = Date.now();
      if (now - lastActivity >= INACTIVITY_TIME) { expire(); return; }
      // Mouse movement and scroll can fire hundreds of times per second.
      if (now - lastActivity < 1000) return;
      lastActivity = now;
      try { window.sessionStorage.setItem("crss-last-activity", String(now)); } catch { /* In-memory fallback. */ }
      armTimers();
    };
    const checkWhenVisible = () => { if (document.visibilityState === "visible") armTimers(); };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    activityHandler.current = recordActivity;
    events.forEach(event => window.addEventListener(event, recordActivity, { passive: true }));
    document.addEventListener("visibilitychange", checkWhenVisible);
    try { window.sessionStorage.setItem("crss-last-activity", String(lastActivity)); } catch { /* In-memory fallback. */ }
    armTimers();
    return () => {
      activityHandler.current = null;
      clearTimers();
      events.forEach(event => window.removeEventListener(event, recordActivity));
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [isLogin, logout]);

  if (isLogin || !showWarning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          !
        </div>

        <h2 className="text-xl font-semibold text-slate-900">
          Sesja zaraz wygaśnie
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Ze względów bezpieczeństwa za chwilę nastąpi automatyczne
          wylogowanie. Kliknij przycisk poniżej, jeżeli nadal pracujesz w
          systemie.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={logout}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Wyloguj teraz
          </button>

          <button
            onClick={resetTimer}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Zostań zalogowany
          </button>
        </div>
      </div>
    </div>
  );
}
