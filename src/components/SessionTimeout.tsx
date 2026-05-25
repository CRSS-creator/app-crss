"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const INACTIVITY_TIME = 60 * 60 * 1000; // 60 minut
const WARNING_TIME = 60 * 1000; // 1 minuta przed wylogowaniem

export default function SessionTimeout() {
  const router = useRouter();  
  const pathname = usePathname();

  if (pathname === "/login") {
    return null;
  }
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const logoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const resetTimer = () => {
    setShowWarning(false);

    if (warningRef.current) clearTimeout(warningRef.current);
    if (logoutRef.current) clearTimeout(logoutRef.current);

    warningRef.current = setTimeout(() => {
      setShowWarning(true);
    }, INACTIVITY_TIME - WARNING_TIME);

    logoutRef.current = setTimeout(() => {
      logout();
    }, INACTIVITY_TIME);
  };

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];

    events.forEach((event) => window.addEventListener(event, resetTimer));

    resetTimer();

  const handleBeforeUnload = () => {
    Object.keys(window.sessionStorage).forEach((key) => {
      if (key.startsWith("sb-")) {
        window.sessionStorage.removeItem(key);
      }
    });

    Object.keys(window.localStorage).forEach((key) => {
      if (key.startsWith("sb-")) {
        window.localStorage.removeItem(key);
      }
    });
  };

  window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      window.removeEventListener("beforeunload", handleBeforeUnload);
      
      if (warningRef.current) clearTimeout(warningRef.current);
      if (logoutRef.current) clearTimeout(logoutRef.current);
    };
  }, []);

  if (!showWarning) return null;

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
