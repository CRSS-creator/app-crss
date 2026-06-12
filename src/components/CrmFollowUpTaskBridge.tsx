"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ensureCrmFollowUpTask } from "@/lib/taskService";

type CrmLeadSummary = {
  id: string;
  nazwa: string | null;
  osoba_kontaktowa: string | null;
  email: string | null;
  data_follow_up: string | null;
};

export default function CrmFollowUpTaskBridge() {
  const lastRequestKey = useRef("");

  useEffect(() => {
    function getFieldValue(drawer: Element, labelText: string) {
      const labels = Array.from(drawer.querySelectorAll("label"));
      const label = labels.find((item) => item.querySelector("span")?.textContent?.trim() === labelText);
      const field = label?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
      return field?.value?.trim() || "";
    }

    async function createFollowUpTaskFromDrawer(drawer: Element) {
      const companyName = getFieldValue(drawer, "Nazwa firmy");
      const followUpDate = getFieldValue(drawer, "Data follow-up");
      const contactName = getFieldValue(drawer, "Osoba kontaktowa") || getFieldValue(drawer, "Email");

      if (!companyName || !followUpDate) return;

      const requestKey = `${companyName}|${followUpDate}`;
      if (lastRequestKey.current === requestKey) return;
      lastRequestKey.current = requestKey;

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const leadResult = await supabase
        .from("crm_szanse_sprzedazy")
        .select("id, nazwa, osoba_kontaktowa, email, data_follow_up")
        .eq("nazwa", companyName)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (leadResult.error) {
        console.error("Błąd szukania szansy CRM dla follow-up:", leadResult.error);
        return;
      }

      const lead = leadResult.data as CrmLeadSummary | null;
      if (!lead?.id) return;

      const taskResult = await ensureCrmFollowUpTask({
        leadId: lead.id,
        leadName: lead.nazwa || companyName,
        contactName: lead.osoba_kontaktowa || contactName || lead.email,
        followUpDate,
        userId,
      });

      if (taskResult.error) {
        console.error("Błąd tworzenia zadania follow-up z CRM:", taskResult.error);
        alert("Szansa została zapisana, ale nie udało się utworzyć zadania follow-up.");
      }
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button || button.textContent?.trim() !== "Zapisz") return;

      const drawer = button.closest("aside");
      if (!drawer) return;

      window.setTimeout(() => void createFollowUpTaskFromDrawer(drawer), 1400);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
