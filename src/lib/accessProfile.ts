import { supabase } from "@/lib/supabaseClient";

const pending = new Map<string, ReturnType<typeof readProfile>>();

function readProfile(userId: string) {
  return Promise.resolve(
    supabase.from("profiles").select("role, aktywne").eq("id", userId).single()
  );
}

// Share only an unfinished request. Every later access check reads current permissions.
export function fetchAccessProfile(userId: string) {
  const existing = pending.get(userId);
  if (existing) return existing;

  const request = readProfile(userId).finally(() => {
    if (pending.get(userId) === request) pending.delete(userId);
  });
  pending.set(userId, request);
  return request;
}
