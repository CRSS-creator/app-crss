import { supabase } from "@/lib/supabaseClient";

export type ContributionHolidayRecord = {
  klient_id: string;
  rok: number;
  skorzystal: boolean | null;
  moze_skorzystac: boolean | null;
};

export type ContributionHolidayClient = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  forma_prawna: string | null;
  schemat_zus: string | null;
};

export function isContributionHolidayClient(client: ContributionHolidayClient) {
  const legalForm = (client.forma_prawna || "").trim().toLowerCase();
  const scheme = (client.schemat_zus || "").trim().toLowerCase().replace(/\s+/g, " ");
  return (legalForm === "jdg" || legalForm.includes("jednoosob"))
    && scheme !== "ulga na start" && scheme !== "brak zus";
}

export async function fetchContributionHolidays(year: number) {
  return supabase.from("kadry_wakacje_skladkowe").select("*").eq("rok", year);
}

export async function saveContributionHoliday(record: ContributionHolidayRecord) {
  return supabase.from("kadry_wakacje_skladkowe")
    .upsert(record, { onConflict: "klient_id,rok" })
    .select("*").single<ContributionHolidayRecord>();
}

export type ContributionHolidayNotification = {
  id: string;
  klient_id: string;
  rok: number;
  sent_at: string;
  sent_by: string | null;
  sent_by_name: string;
};

export async function fetchContributionHolidayNotifications(year: number) {
  return supabase.from("kadry_wakacje_skladkowe_powiadomienia")
    .select("*").eq("rok", year).order("sent_at", { ascending: false });
}
