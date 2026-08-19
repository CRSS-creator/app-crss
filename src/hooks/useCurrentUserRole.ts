"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { UserRole } from "@/lib/permissions";

export function useCurrentUserRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRole() {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (!active) return;

      if (userError || !userData.user?.id) {
        setError(userError?.message ?? null);
        setRole(null);
        setUserId(null);
        setLoading(false);
        return;
      }

      setUserId(userData.user.id);

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("role, aktywne")
        .eq("id", userData.user.id)
        .single();

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
    }

    loadRole();

    return () => {
      active = false;
    };
  }, []);

  return { role, userId, loading, error };
}
