"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { supabase } from "@/lib/supabaseClient";

type ClientBillingRow = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  model_fakturowania: string | null;
};

const MODEL_LABELS: Record<string, string> = {
  z_gory: "Z góry",
  z_dolu: "Z dołu",
};

export default function SettlementBillingModelBridge() {
  const clientsRef = useRef<ClientBillingRow[]>([]);
  const filterRef = useRef("Wszystkie");

  useEffect(() => {
    let frame = 0;
    let disposed = false;

    function scheduleEnhance() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const page = document.querySelector<HTMLElement>('[data-active-page="rozliczenia"]');
        if (!page) return;
        addFilter(page, clientsRef, filterRef);
        addBillingColumn(page, clientsRef.current, filterRef.current);
        hideRecurringTaskEditing(page);
      });
    }

    async function loadClients() {
      const { data, error } = await supabase.from("klienci").select("id, nazwa, nip, model_fakturowania");
      if (!disposed && !error) clientsRef.current = data || [];
      scheduleEnhance();
    }

    void loadClients();
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

function addFilter(page: HTMLElement, clientsRef: MutableRefObject<ClientBillingRow[]>, filterRef: MutableRefObject<string>) {
  const filtersRow = Array.from(page.querySelectorAll<HTMLElement>("div")).find((element) => element.textContent?.trim().startsWith("Filtry:"));
  if (!filtersRow || filtersRow.querySelector('[data-crss-billing-filter="1"]')) return;

  const select = document.createElement("select");
  select.dataset.crssBillingFilter = "1";
  select.style.border = "1px solid #c8d8f0";
  select.style.borderRadius = "14px";
  select.style.background = "#f8fbff";
  select.style.color = "#0b2254";
  select.style.padding = "10px 38px 10px 14px";
  select.style.minWidth = "150px";
  select.style.fontSize = "14px";
  select.style.fontWeight = "500";

  [
    { value: "Wszystkie", label: "Model FV" },
    { value: "z_gory", label: "Z góry" },
    { value: "z_dolu", label: "Z dołu" },
  ].forEach((config) => {
    const option = document.createElement("option");
    option.value = config.value;
    option.textContent = config.label;
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    filterRef.current = select.value;
    addBillingColumn(page, clientsRef.current, filterRef.current);
  });

  filtersRow.appendChild(select);
}

function addBillingColumn(page: HTMLElement, clients: ClientBillingRow[], activeFilter: string) {
  const table = page.querySelector("table");
  if (!table) return;

  const headerRow = table.querySelector("thead tr");
  if (headerRow && !headerRow.querySelector('[data-crss-billing-header="1"]')) {
    const th = document.createElement("th");
    th.dataset.crssBillingHeader = "1";
    th.textContent = "Model FV";
    th.style.textAlign = "left";
    th.style.padding = "13px 8px";
    th.style.color = "#4b5d78";
    th.style.fontSize = "12px";
    th.style.borderBottom = "1px solid #c8d8f0";
    th.style.lineHeight = "1.15";
    th.style.fontWeight = "800";
    th.style.whiteSpace = "nowrap";
    headerRow.insertBefore(th, headerRow.children[6] || null);
  }

  table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
    const client = findClientForRow(row, clients);
    const model = client?.model_fakturowania || "z_dolu";
    row.dataset.crssBillingModel = model;

    if (!row.querySelector('[data-crss-billing-cell="1"]')) {
      const td = document.createElement("td");
      td.dataset.crssBillingCell = "1";
      td.style.padding = "15px 8px";
      td.style.verticalAlign = "middle";
      td.appendChild(buildBadge(model));
      row.insertBefore(td, row.children[6] || null);
    } else {
      const cell = row.querySelector('[data-crss-billing-cell="1"]') as HTMLTableCellElement;
      cell.replaceChildren(buildBadge(model));
    }

    row.style.display = activeFilter === "Wszystkie" || activeFilter === model ? "" : "none";
  });
}

function hideRecurringTaskEditing(page: HTMLElement) {
  Array.from(page.querySelectorAll<HTMLButtonElement>("button")).forEach((button) => {
    const label = button.textContent?.trim();
    if (label === "Usuń" || label === "Dodaj zadanie cykliczne") button.style.display = "none";
  });

  Array.from(page.querySelectorAll<HTMLElement>("label")).forEach((label) => {
    if (!label.textContent?.includes("Nowe zadanie cykliczne")) return;
    let parent: HTMLElement | null = label.parentElement;
    while (parent && parent !== page) {
      if (parent.textContent?.includes("Dodaj zadanie cykliczne")) {
        parent.style.display = "none";
        return;
      }
      parent = parent.parentElement;
    }
  });
}

function buildBadge(model: string) {
  const badge = document.createElement("span");
  badge.textContent = MODEL_LABELS[model] || "Z dołu";
  badge.style.display = "inline-flex";
  badge.style.borderRadius = "999px";
  badge.style.padding = "7px 9px";
  badge.style.background = model === "z_gory" ? "#e8eef8" : "#f1f5f9";
  badge.style.color = model === "z_gory" ? "#173b73" : "#4b5d78";
  badge.style.fontWeight = "850";
  badge.style.fontSize = "12px";
  badge.style.whiteSpace = "nowrap";
  return badge;
}

function findClientForRow(row: HTMLTableRowElement, clients: ClientBillingRow[]) {
  const text = row.children[0]?.textContent || "";
  return clients.find((client) => client.nip && text.includes(client.nip)) || null;
}
