"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { UserRole } from "@/lib/permissions";

const ACCESS_CHECK_TIMEOUT_MS = 12000;

export function useCurrentUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRole() {
      try {
        const sessionResult = await withAccessCheckTimeout(supabase.auth.getSession());
        const sessionUserId = sessionResult.data.session?.user?.id || null;
        const { data: userData, error: userError } = sessionUserId
          ? { data: { user: sessionResult.data.session?.user }, error: null }
          : await withAccessCheckTimeout(supabase.auth.getUser());

        if (!active) return;

        const currentUserId = sessionUserId || userData.user?.id || null;
        if (sessionResult.error || userError || !currentUserId) {
          setError(sessionResult.error?.message || userError?.message || null);
          setRole(null);
          setUserId(null);
          setLoading(false);
          return;
        }

        setUserId(currentUserId);

        const { data, error: profileError } = await withAccessCheckTimeout(
          supabase
            .from("profiles")
            .select("role, aktywne")
            .eq("id", currentUserId)
            .single()
        );

        if (!active) return;

        if (data?.aktywne === false) {
          await supabase.auth.signOut();
          if (active) {
            setError("Konto użytkownika jest nieaktywne.");
            setRole(null);
            setUserId(null);
            setLoading(false);
            window.location.href = "/login";
          }
          return;
        }

        setError(profileError?.message ?? null);
        setRole(data?.role ?? null);
        setLoading(false);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Nie udało się sprawdzić dostępu.");
          setRole(null);
          setUserId(null);
          setLoading(false);
        }
      }
    }

    loadRole();

    return () => {
      active = false;
    };
  }, []);

  return { role, userId, loading, error };
}

function withAccessCheckTimeout<T>(promise: PromiseLike<T>) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("Sprawdzanie dostępu trwa zbyt długo. Odśwież stronę lub zaloguj się ponownie.")), ACCESS_CHECK_TIMEOUT_MS);
    }),
  ]);
}
