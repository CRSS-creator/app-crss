"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchAccessProfile } from "@/lib/accessProfile";
import type { UserRole } from "@/lib/permissions";

const ACCESS_CHECK_TIMEOUT_MS = 12000;
type AccessState = {
  role: UserRole | null;
  userId: string | null;
  loading: boolean;
  error: string | null;
};
const initialState: AccessState = { role: null, userId: null, loading: true, error: null };
const AccessContext = createContext<AccessState>(initialState);

// Mounted in the root layout: navigation reuses the same checked profile.
export function CurrentUserRoleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessState>(initialState);

  useEffect(() => {
    let active = true;
    let generation = 0;
    let currentUserId: string | null | undefined;
    let authEventReceived = false;
    let scheduled: ReturnType<typeof setTimeout> | undefined;

    async function loadProfile(userId: string | null) {
      if (!active || currentUserId === userId) return;
      currentUserId = userId;
      const version = ++generation;
      if (!userId) {
        setState({ role: null, userId: null, loading: false, error: null });
        return;
      }
      setState({ role: null, userId, loading: true, error: null });
      try {
        const { data, error } = await withAccessCheckTimeout(fetchAccessProfile(userId));
        if (!active || version !== generation) return;
        if (error) throw error;
        if (data?.aktywne === false) {
          setState({ role: null, userId: null, loading: false, error: "Konto użytkownika jest nieaktywne." });
          await supabase.auth.signOut();
          if (active && version === generation) window.location.href = "/login";
          return;
        }
        setState({ role: data?.role ?? null, userId, loading: false, error: null });
      } catch (error) {
        if (active && version === generation) {
          setState({ role: null, userId: null, loading: false,
            error: error instanceof Error ? error.message : (error as { message?: string })?.message || "Nie udało się sprawdzić dostępu." });
        }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      // Invalidate immediately; perform profile requests outside the auth callback.
      const userId = session?.user.id ?? null;
      if (currentUserId !== userId) {
        ++generation;
        currentUserId = undefined;
        setState({ ...initialState, userId });
      }
      clearTimeout(scheduled);
      scheduled = setTimeout(() => { void loadProfile(userId); }, 0);
    });

    void withAccessCheckTimeout(supabase.auth.getSession()).then(({ data, error }) => {
      if (!active || authEventReceived) return;
      if (error) throw error;
      void loadProfile(data.session?.user.id ?? null);
    }).catch(error => {
      if (active && !authEventReceived) setState({ role: null, userId: null, loading: false,
        error: error instanceof Error ? error.message : "Nie udało się sprawdzić sesji." });
    });

    return () => {
      active = false;
      ++generation;
      clearTimeout(scheduled);
      subscription.unsubscribe();
    };
  }, []);

  return createElement(AccessContext.Provider, { value: state }, children);
}

export function useCurrentUserRole() {
  return useContext(AccessContext);
}

function withAccessCheckTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Sprawdzanie dostępu trwa zbyt długo. Odśwież stronę lub zaloguj się ponownie.")), ACCESS_CHECK_TIMEOUT_MS);
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
