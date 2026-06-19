"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchRodoProcessingContracts, type RodoProcessingContract, type RodoProcessingContractStatus } from "@/lib/rodoProcessingContractService";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

const REGISTER_TITLE = "Rejestr umów powierzenia przetwarzania danych osobowych";
const DEFAULT_SCOPE = "zgodnie z zawartą umową główną";
const LEGACY_SCOPE = "Przetwarzanie danych osobowych w zakresie niezbędnym do świadczenia usług księgowych, podatkowych oraz kadrowo-płacowych.";

const STATUS_LABELS: Record<RodoProcessingContractStatus, string> = {
  szkic: "Szkic",
  wygenerowana: "Wygenerowana",
  wyslana_do_podpisu: "Wysłana do podpisu",
  podpisana: "Podpisana",
  anulowana: "Anulowana",
};

export default function RodoRegisterSearchWidget() {
  const [query, setQuery] = useState("");
  const [contracts, setContracts] = useState<RodoProcessingContract[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    let frame = 0;

    function scheduleApply() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => applyRodoRegisterView(query, setQuery, contracts, profiles));
    }

    scheduleApply();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [query, contracts, profiles]);

  async function loadData() {
    const [contractsResult, profilesResult] = await Promise.all([
      fetchRodoProcessingContracts(),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    if (!contractsResult.error) setContracts((contractsResult.data || []) as RodoProcessingContract[]);
    if (!profilesResult.error) setProfiles((profilesResult.data || []) as Profile[]);
  }

  return null;
}

function applyRodoRegisterView(
  query: string,
  setQuery: (value: string) => void,
  contracts: RodoProcessingContract[],
  profiles: Profile[],
) {
  const page = document.querySelector<HTMLElement>('[data-active-page="rodo"]');
  if (!page) return;

  const title = Array.from(page.querySelectorAll<HTMLHeadingElement>("h2"))
    .find((heading) => {
      const text = heading.textContent?.trim();
      return text === "Rejestr RODO" || text === REGISTER_TITLE;
    });
  const card = title?.closest<HTMLElement>("section");
  if (!card) return;

  title.textContent = REGISTER_TITLE;

  const header = title?.parentElement;
  const originalWrapper = findOriginalRegisterWrapper(card);
  const originalTable = originalWrapper?.querySelector<HTMLTableElement>("table");
  if (!header || !originalTable || !originalWrapper) return;

  originalWrapper.dataset.rodoOriginalRegister = "true";
  originalWrapper.style.display = "none";
  const searchInput = ensureSearchInput(card, header, query, setQuery);
  if (document.activeElement !== searchInput && searchInput.value !== query) searchInput.value = query;

  const statusFilter = card.querySelector<HTMLSelectElement>("select")?.value || "Wszystkie";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredContracts = contracts
    .filter((contract) => {
      const matchesStatus = statusFilter === "Wszystkie" || contract.status === statusFilter;
      const matchesSearch = !normalizedQuery || `${contract.numer_umowy || ""} ${contract.nazwa_klienta || ""}`.toLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesSearch;
    })
    .sort(compareContractsByNewest);

  ensurePrintButton(header, filteredContracts);
  const enhanced = ensureEnhancedWrapper(card, originalWrapper);
  enhanced.replaceChildren(buildEnhancedTable(filteredContracts, originalTable));
  applyDrawerScopeDefault(page);
  applyDrawerAudit(page, contracts, profiles);
}

function findOriginalRegisterWrapper(card: HTMLElement) {
  const marked = card.querySelector<HTMLElement>('[data-rodo-original-register="true"]');
  if (marked) return marked;

  return Array.from(card.querySelectorAll<HTMLElement>("div")).find((wrapper) => {
    if (wrapper.dataset.rodoRegisterEnhanced) return false;
    return Boolean(wrapper.querySelector("table"));
  });
}

function ensureSearchInput(card: HTMLElement, header: HTMLElement, query: string, setQuery: (value: string) => void) {
  const existing = card.querySelector<HTMLInputElement>('[data-rodo-register-search="true"]');
  if (existing) return existing;

  const input = document.createElement("input");
  input.type = "search";
  input.value = query;
  input.placeholder = "Szukaj po numerze umowy lub nazwie klienta";
  input.dataset.rodoRegisterSearch = "true";
  input.style.width = "100%";
  input.style.border = "1px solid #cbd7e6";
  input.style.borderRadius = "14px";
  input.style.padding = "12px 14px";
  input.style.margin = "0 0 16px";
  input.style.background = "#f8fafc";
  input.style.color = "#0f2147";
  input.style.fontWeight = "700";
  input.style.outline = "none";
  input.addEventListener("input", () => setQuery(input.value));
  header.insertAdjacentElement("afterend", input);
  return input;
}

function ensurePrintButton(header: HTMLElement, contracts: RodoProcessingContract[]) {
  let button = header.querySelector<HTMLButtonElement>('[data-rodo-register-print="true"]');
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.textContent = "Drukuj rejestr";
    button.dataset.rodoRegisterPrint = "true";
    button.style.border = "1px solid #cbd7e6";
    button.style.borderRadius = "14px";
    button.style.padding = "10px 16px";
    button.style.minHeight = "42px";
    button.style.background = "#fff";
    button.style.color = "#102a5c";
    button.style.fontWeight = "800";
    button.style.cursor = "pointer";
    button.style.marginLeft = "auto";

    const select = header.querySelector("select");
    if (select) select.insertAdjacentElement("beforebegin", button);
    else header.appendChild(button);
  }

  button.onclick = () => printRegister(contracts);
}

function ensureEnhancedWrapper(card: HTMLElement, originalWrapper: HTMLElement) {
  const existing = card.querySelector<HTMLElement>('[data-rodo-register-enhanced="true"]');
  if (existing) return existing;

  const wrapper = document.createElement("div");
  wrapper.dataset.rodoRegisterEnhanced = "true";
  wrapper.style.overflowX = "auto";
  originalWrapper.insertAdjacentElement("afterend", wrapper);
  return wrapper;
}

function buildEnhancedTable(contracts: RodoProcessingContract[], originalTable: HTMLTableElement) {
  if (!contracts.length) {
    const empty = document.createElement("div");
    empty.textContent = "Brak umów powierzenia do wyświetlenia.";
    empty.style.border = "1px dashed #cbd7e6";
    empty.style.borderRadius = "14px";
    empty.style.padding = "18px";
    empty.style.color = "#4b5d78";
    empty.style.fontWeight = "700";
    empty.style.textAlign = "center";
    return empty;
  }

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Numer", "Klient", "NIP", "Siedziba klienta", "Umowa główna", "Zakres", "Status umowy", "Szczegóły"].forEach((label) => headRow.appendChild(buildHeaderCell(label)));
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  contracts.forEach((contract) => {
    const row = document.createElement("tr");
    row.style.borderBottom = "1px solid #cbd7e6";
    row.appendChild(buildTextCell(contract.numer_umowy || "Bez numeru", true));
    row.appendChild(buildTextCell(contract.nazwa_klienta || "-"));
    row.appendChild(buildTextCell(contract.nip || "-"));
    row.appendChild(buildTextCell(contract.siedziba || "-"));
    row.appendChild(buildTextCell(contract.crm_umowy?.numer_umowy || "Brak powiązania"));
    row.appendChild(buildTextCell(normalizeScope(contract.zakres_powierzenia)));

    const statusCell = buildBaseCell();
    statusCell.appendChild(buildStatusBadge(contract.status));
    row.appendChild(statusCell);

    const actionCell = buildBaseCell();
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Szczegóły";
    button.style.border = "1px solid #cbd7e6";
    button.style.borderRadius = "14px";
    button.style.padding = "10px 14px";
    button.style.minHeight = "42px";
    button.style.background = "#fff";
    button.style.color = "#102a5c";
    button.style.fontWeight = "800";
    button.style.cursor = "pointer";
    button.addEventListener("click", () => openOriginalDetails(originalTable, contract));
    actionCell.appendChild(button);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  });

  table.append(thead, tbody);
  return table;
}

function openOriginalDetails(originalTable: HTMLTableElement, contract: RodoProcessingContract) {
  const expectedNumber = contract.numer_umowy || "Bez numeru";
  const expectedClient = contract.nazwa_klienta || "";
  const rows = Array.from(originalTable.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  const sourceRow = rows.find((row) => {
    const cells = Array.from(row.children) as HTMLElement[];
    const number = cells[0]?.textContent?.trim();
    const client = cells[1]?.textContent?.trim();
    return number === expectedNumber || (!!expectedClient && client === expectedClient);
  });
  const button = sourceRow?.querySelector<HTMLButtonElement>("button");
  if (!button) return;
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
}

function printRegister(contracts: RodoProcessingContract[]) {
  const printWindow = window.open("", "_blank", "width=1200,height=800");
  if (!printWindow) return;

  const rows = contracts.map((contract) => `
    <tr>
      <td>${escapeHtml(contract.numer_umowy || "Bez numeru")}</td>
      <td>${escapeHtml(contract.nazwa_klienta || "-")}</td>
      <td>${escapeHtml(contract.nip || "-")}</td>
      <td>${escapeHtml(contract.siedziba || "-")}</td>
      <td>${escapeHtml(contract.crm_umowy?.numer_umowy || "Brak powiązania")}</td>
      <td>${escapeHtml(normalizeScope(contract.zakres_powierzenia))}</td>
      <td>${escapeHtml(STATUS_LABELS[contract.status] || contract.status)}</td>
    </tr>
  `).join("");

  printWindow.document.write(`<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>${REGISTER_TITLE}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f2147; margin: 28px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { margin: 0 0 18px; color: #4b5d78; }
    table { border-collapse: collapse; width: 100%; font-size: 11px; }
    th, td { border: 1px solid #cbd7e6; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #eef2f7; text-transform: uppercase; font-size: 10px; }
    @page { size: A4 landscape; margin: 12mm; }
  </style>
</head>
<body>
  <h1>${REGISTER_TITLE}</h1>
  <p>Wygenerowano: ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>
  <table>
    <thead>
      <tr>
        <th>Numer</th>
        <th>Klient</th>
        <th>NIP</th>
        <th>Siedziba klienta</th>
        <th>Umowa główna</th>
        <th>Zakres</th>
        <th>Status umowy</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="7">Brak umów powierzenia do wydruku.</td></tr>`}</tbody>
  </table>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

function applyDrawerScopeDefault(page: HTMLElement) {
  const drawer = page.querySelector<HTMLElement>("aside");
  if (!drawer) return;

  const labels = Array.from(drawer.querySelectorAll<HTMLLabelElement>("label"));
  const scopeLabel = labels.find((label) => label.querySelector("span")?.textContent?.trim() === "Zakres");
  const textarea = scopeLabel?.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) return;

  const currentValue = textarea.value.trim();
  if (currentValue && currentValue !== LEGACY_SCOPE) return;

  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, DEFAULT_SCOPE);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function applyDrawerAudit(page: HTMLElement, contracts: RodoProcessingContract[], profiles: Profile[]) {
  const drawer = page.querySelector<HTMLElement>("aside");
  if (!drawer) return;
  const title = drawer.querySelector<HTMLHeadingElement>("h2")?.textContent?.trim();
  if (!title) return;
  const contract = contracts.find((item) => item.numer_umowy === title || item.nazwa_klienta === title);
  if (!contract) return;

  const existing = drawer.querySelector<HTMLElement>('[data-rodo-audit-section="true"]');
  const text = buildAuditText(contract, profiles);
  if (existing) {
    const paragraph = existing.querySelector("p");
    if (paragraph) paragraph.textContent = text;
    return;
  }

  const section = document.createElement("section");
  section.dataset.rodoAuditSection = "true";
  section.style.border = "1px solid #cbd7e6";
  section.style.borderRadius = "18px";
  section.style.padding = "20px";
  section.style.background = "#fff";

  const heading = document.createElement("h3");
  heading.textContent = "Historia";
  heading.style.margin = "0 0 12px";
  heading.style.color = "#173b73";
  heading.style.fontSize = "18px";
  heading.style.fontWeight = "500";

  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  paragraph.style.margin = "0";
  paragraph.style.color = "#0f2147";
  paragraph.style.fontWeight = "700";
  paragraph.style.lineHeight = "1.6";

  section.append(heading, paragraph);
  drawer.querySelector<HTMLElement>("section")?.insertAdjacentElement("beforebegin", section);
}

function buildAuditText(contract: RodoProcessingContract, profiles: Profile[]) {
  const author = profiles.find((profile) => profile.id === contract.created_by);
  const authorName = author?.full_name || author?.email || "Brak informacji o osobie dodającej";
  const createdAt = formatDateTime(contract.created_at);
  return `${authorName} dodał umowę w dniu ${createdAt}.`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeScope(value: string | null | undefined) {
  const scope = value?.trim();
  if (!scope || scope === LEGACY_SCOPE) return DEFAULT_SCOPE;
  return scope;
}

function compareContractsByNewest(a: RodoProcessingContract, b: RodoProcessingContract) {
  const numberDiff = contractNumberWeight(b.numer_umowy || "") - contractNumberWeight(a.numer_umowy || "");
  if (numberDiff !== 0) return numberDiff;
  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
}

function contractNumberWeight(value: string) {
  const match = value.match(/(\d+)\s*\/\s*RODO\s*\/\s*(\d+)\s*\/\s*(\d{4})/i);
  if (!match) return 0;
  const sequence = Number(match[1] || 0);
  const month = Number(match[2] || 0);
  const year = Number(match[3] || 0);
  return year * 1000000 + month * 10000 + sequence;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildStatusBadge(status: RodoProcessingContractStatus) {
  const badge = document.createElement("span");
  badge.textContent = STATUS_LABELS[status] || status;
  badge.style.display = "inline-flex";
  badge.style.borderRadius = "999px";
  badge.style.padding = "7px 12px";
  badge.style.fontWeight = "850";
  badge.style.fontSize = "13px";
  const palette = statusPalette(status);
  badge.style.background = palette.background;
  badge.style.color = palette.color;
  return badge;
}

function statusPalette(status: RodoProcessingContractStatus) {
  if (status === "podpisana") return { background: "#dcfce7", color: "#15803d" };
  if (status === "wygenerowana") return { background: "#dbeafe", color: "#1d4ed8" };
  if (status === "wyslana_do_podpisu") return { background: "#fef3c7", color: "#92400e" };
  if (status === "anulowana") return { background: "#fee2e2", color: "#b91c1c" };
  return { background: "#eef2f7", color: "#173b73" };
}

function buildHeaderCell(label: string) {
  const th = document.createElement("th");
  th.textContent = label;
  th.style.textAlign = "left";
  th.style.padding = "14px 16px";
  th.style.color = "#4b5d78";
  th.style.fontSize = "13px";
  th.style.textTransform = "uppercase";
  th.style.letterSpacing = "0.04em";
  th.style.borderBottom = "1px solid #cbd7e6";
  th.style.whiteSpace = "nowrap";
  return th;
}

function buildTextCell(text: string, strong = false) {
  const td = buildBaseCell();
  td.textContent = text;
  td.style.fontWeight = strong ? "800" : "500";
  return td;
}

function buildBaseCell() {
  const td = document.createElement("td");
  td.style.padding = "16px";
  td.style.color = "#0f2147";
  td.style.verticalAlign = "middle";
  return td;
}
