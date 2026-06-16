"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

type ClientBillingRow = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  model_fakturowania: string | null;
};

const MODEL_OPTIONS = [
  { value: "z_dolu", label: "Z dołu" },
  { value: "z_gory", label: "Z góry" },
];

export default function ClientBillingModelBridge() {
  const clientsRef = useRef<ClientBillingRow[]>([]);

  useEffect(() => {
    let frame = 0;
    let disposed = false;

    async function loadClients() {
      const { data, error } = await supabase
        .from("klienci")
        .select("id, nazwa, nip, model_fakturowania");
      if (!disposed && !error) clientsRef.current = data || [];
      scheduleEnhance();
    }

    function scheduleEnhance() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => enhanceClientDrawers(clientsRef.current));
    }

    void loadClients();
    scheduleEnhance();
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return null;
}

function enhanceClientDrawers(clients: ClientBillingRow[]) {
  const page = document.querySelector<HTMLElement>('[data-active-page="klienci"]');
  if (!page) return;

  const drawer = Array.from(page.querySelectorAll<HTMLElement>("aside")).find((aside) =>
    aside.textContent?.includes("Szczegóły klienta") || aside.textContent?.includes("Nowy klient"),
  );
  if (!drawer) return;

  const section = findSection(drawer, "Abonament i limity");
  if (!section || section.querySelector('[data-crss-billing-model="1"]')) return;

  const isCreateDrawer = drawer.textContent?.includes("Nowy klient");
  const client = isCreateDrawer ? null : findClientForDrawer(drawer, clients);
  const model = client?.model_fakturowania || "z_dolu";
  const row = buildBillingModelRow(model);
  section.insertBefore(row, section.children[1] || null);

  const select = row.querySelector("select") as HTMLSelectElement | null;
  if (!select) return;

  if (isCreateDrawer) {
    const button = Array.from(drawer.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent?.trim() === "Dodaj klienta");
    button?.addEventListener("click", () => {
      const nip = readInputValue(drawer, "NIP");
      const modelValue = select.value;
      window.setTimeout(() => updateClientByNip(nip, modelValue), 1600);
    });
    return;
  }

  select.addEventListener("change", async () => {
    if (!client?.id) return;
    const { error } = await supabase.from("klienci").update({ model_fakturowania: select.value }).eq("id", client.id);
    if (error) {
      alert("Nie udało się zapisać modelu fakturowania.");
      select.value = client.model_fakturowania || "z_dolu";
      return;
    }
    client.model_fakturowania = select.value;
  });
}

function buildBillingModelRow(value: string) {
  const label = document.createElement("label");
  label.dataset.crssBillingModel = "1";
  label.style.display = "grid";
  label.style.gridTemplateColumns = "180px 1fr";
  label.style.gap = "14px";
  label.style.alignItems = "center";
  label.style.padding = "10px 0";
  label.style.borderBottom = "1px solid #c8d8f0";
  label.style.color = "#4b5d78";
  label.style.fontWeight = "700";

  const caption = document.createElement("span");
  caption.textContent = "Model fakturowania";

  const select = document.createElement("select");
  select.value = value;
  select.style.width = "100%";
  select.style.border = "1px solid #c8d8f0";
  select.style.borderRadius = "14px";
  select.style.padding = "10px 12px";
  select.style.background = "#f8fbff";
  select.style.color = "#173b73";
  select.style.fontWeight = "800";
  select.style.outline = "none";

  MODEL_OPTIONS.forEach((optionConfig) => {
    const option = document.createElement("option");
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    select.appendChild(option);
  });

  label.append(caption, select);
  return label;
}

function findSection(scope: Element, title: string) {
  return Array.from(scope.querySelectorAll<HTMLElement>("section")).find((section) => section.querySelector("h3")?.textContent?.trim() === title);
}

function findClientForDrawer(drawer: HTMLElement, clients: ClientBillingRow[]) {
  const subtitle = Array.from(drawer.querySelectorAll("p")).find((item) => item.textContent?.includes("NIP:"));
  const nip = subtitle?.textContent?.replace("NIP:", "").trim();
  if (!nip || nip === "—") return null;
  return clients.find((client) => client.nip === nip) || null;
}

function readInputValue(scope: Element, label: string) {
  const row = Array.from(scope.querySelectorAll("label")).find((item) => item.querySelector("span")?.textContent?.trim() === label);
  return (row?.querySelector("input") as HTMLInputElement | null)?.value?.trim() || "";
}

async function updateClientByNip(nip: string, model: string) {
  if (!nip) return;
  await supabase.from("klienci").update({ model_fakturowania: model }).eq("nip", nip);
}
