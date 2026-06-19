"use client";

import { useEffect, useState } from "react";
import ContractDocxGenerationWidget from "@/components/ContractDocxGenerationWidget";

type ContractType = "KH" | "KU";

type RegisterRow = {
  number: string;
  client: string;
  statusNode: Node | null;
  subscription: string;
  files: string;
  openDetails: () => void;
};

const HEADER_LABELS = ["Numer", "Klient", "Status", "Abonament", "Pliki", "Akcje"];

export default function ContractRegisterSplitWidget() {
  const [activeTab, setActiveTab] = useState<ContractType>("KH");
  const [searchQueries, setSearchQueries] = useState<Record<ContractType, string>>({ KH: "", KU: "" });

  useEffect(() => {
    let frame = 0;

    function scheduleSplit() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        splitContractRegister(activeTab, searchQueries, setActiveTab, setSearchQueries);
      });
    }

    scheduleSplit();
    const observer = new MutationObserver(scheduleSplit);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [activeTab, searchQueries]);

  return <ContractDocxGenerationWidget />;
}

function splitContractRegister(
  activeTab: ContractType,
  searchQueries: Record<ContractType, string>,
  setActiveTab: (tab: ContractType) => void,
  setSearchQueries: (queries: Record<ContractType, string>) => void,
) {
  const page = document.querySelector<HTMLElement>('[data-active-page="umowy"]');
  if (!page) return;

  const title = Array.from(page.querySelectorAll<HTMLHeadingElement>("h2"))
    .find((heading) => heading.textContent?.trim() === "Rejestr umów");
  const card = title?.closest<HTMLElement>("section");
  if (!card) return;

  const table = card.querySelector<HTMLTableElement>("table");
  if (!table) return;

  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  const typeIndex = headers.findIndex((header) => header.textContent?.trim().toLowerCase() === "typ");
  if (typeIndex < 0) return;

  const sourceWrapper = table.closest<HTMLElement>("div");
  if (!sourceWrapper) return;

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  if (!rows.length) return;

  const signature = `${activeTab}:${searchQueries.KH}:${searchQueries.KU}:${rows.map((row) => row.textContent?.trim()).join("|")}`;
  const existingSplit = card.querySelector<HTMLElement>('[data-contract-register-split="true"]');
  if (sourceWrapper.dataset.contractRegisterSignature === signature && existingSplit) return;
  existingSplit?.remove();

  const groupedRows: Record<ContractType, RegisterRow[]> = { KH: [], KU: [] };
  rows.forEach((row) => {
    const cells = Array.from(row.children) as HTMLElement[];
    const type = cells[typeIndex]?.textContent?.trim() as ContractType;
    if (type !== "KH" && type !== "KU") return;

    const detailsButton = row.querySelector<HTMLButtonElement>("button");
    groupedRows[type].push({
      number: cells[0]?.textContent?.trim() || "Bez numeru",
      client: cells[1]?.textContent?.trim() || "—",
      statusNode: cells[3]?.firstElementChild?.cloneNode(true) || document.createTextNode(cells[3]?.textContent?.trim() || "—"),
      subscription: cells[4]?.textContent?.trim() || "—",
      files: cells[5]?.textContent?.trim() || "—",
      openDetails: () => detailsButton?.click(),
    });
  });

  const query = searchQueries[activeTab];
  const visibleRows = groupedRows[activeTab].filter((row) => matchesRegisterSearch(row, query));

  const splitRoot = document.createElement("div");
  splitRoot.dataset.contractRegisterSplit = "true";
  splitRoot.appendChild(buildTabs(activeTab, groupedRows, setActiveTab));
  splitRoot.appendChild(buildRegisterSection(
    activeTab === "KH" ? "Pełna księgowość" : "Uproszczona księgowość",
    visibleRows,
    groupedRows[activeTab].length,
    query,
    (value) => setSearchQueries({ ...searchQueries, [activeTab]: value }),
  ));

  sourceWrapper.dataset.contractRegisterSource = "true";
  sourceWrapper.dataset.contractRegisterSignature = signature;
  sourceWrapper.style.display = "none";
  sourceWrapper.insertAdjacentElement("afterend", splitRoot);
}

function buildTabs(activeTab: ContractType, rows: Record<ContractType, RegisterRow[]>, setActiveTab: (tab: ContractType) => void) {
  const tabs = document.createElement("div");
  tabs.style.display = "flex";
  tabs.style.gap = "10px";
  tabs.style.flexWrap = "wrap";
  tabs.style.margin = "0 0 18px";

  (["KH", "KU"] as ContractType[]).forEach((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Rejestr ${tab} (${rows[tab].length})`;
    button.style.border = "1px solid #cbd7e6";
    button.style.borderRadius = "14px";
    button.style.padding = "11px 16px";
    button.style.minHeight = "44px";
    button.style.background = activeTab === tab ? "#173b73" : "#fff";
    button.style.color = activeTab === tab ? "#fff" : "#102a5c";
    button.style.fontWeight = "850";
    button.style.cursor = "pointer";
    button.addEventListener("click", () => setActiveTab(tab));
    tabs.appendChild(button);
  });

  return tabs;
}

function buildRegisterSection(subtitle: string, rows: RegisterRow[], totalRows: number, query: string, onSearch: (value: string) => void) {
  const section = document.createElement("section");
  section.style.border = "1px solid #cbd7e6";
  section.style.borderRadius = "16px";
  section.style.padding = "18px";
  section.style.background = "#fff";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "flex-start";
  header.style.gap = "16px";
  header.style.marginBottom = "12px";

  const description = document.createElement("p");
  description.textContent = subtitle;
  description.style.margin = "0";
  description.style.color = "#4b5d78";
  description.style.fontSize = "14px";
  description.style.fontWeight = "700";

  const count = document.createElement("strong");
  count.textContent = `${totalRows} ${totalRows === 1 ? "umowa" : "umów"}`;
  count.style.borderRadius = "999px";
  count.style.padding = "7px 12px";
  count.style.background = "#eef2f7";
  count.style.color = "#102a5c";
  count.style.fontSize = "13px";
  count.style.whiteSpace = "nowrap";

  header.append(description, count);
  section.appendChild(header);
  section.appendChild(buildSearchInput(query, onSearch));

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.textContent = totalRows === 0 ? "Brak umów w tym rejestrze." : "Brak umów pasujących do wyszukiwania.";
    empty.style.border = "1px dashed #cbd7e6";
    empty.style.borderRadius = "14px";
    empty.style.padding = "18px";
    empty.style.color = "#4b5d78";
    empty.style.fontWeight = "700";
    empty.style.textAlign = "center";
    section.appendChild(empty);
    return section;
  }

  const tableWrapper = document.createElement("div");
  tableWrapper.style.overflowX = "auto";
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  HEADER_LABELS.forEach((label) => headRow.appendChild(buildHeaderCell(label)));
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => tbody.appendChild(buildTableRow(row)));

  table.append(thead, tbody);
  tableWrapper.appendChild(table);
  section.appendChild(tableWrapper);
  return section;
}

function buildSearchInput(value: string, onSearch: (value: string) => void) {
  const input = document.createElement("input");
  input.type = "search";
  input.value = value;
  input.placeholder = "Szukaj po numerze umowy lub nazwie klienta";
  input.style.width = "100%";
  input.style.border = "1px solid #cbd7e6";
  input.style.borderRadius = "14px";
  input.style.padding = "12px 14px";
  input.style.margin = "0 0 16px";
  input.style.background = "#f8fafc";
  input.style.color = "#0f2147";
  input.style.fontWeight = "700";
  input.style.outline = "none";
  input.addEventListener("input", () => onSearch(input.value));
  if (value) {
    window.setTimeout(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  }
  return input;
}

function matchesRegisterSearch(row: RegisterRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return `${row.number} ${row.client}`.toLowerCase().includes(normalizedQuery);
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
  return th;
}

function buildTableRow(row: RegisterRow) {
  const tr = document.createElement("tr");
  tr.style.borderBottom = "1px solid #cbd7e6";
  tr.appendChild(buildTextCell(row.number, true));
  tr.appendChild(buildTextCell(row.client));

  const statusCell = buildBaseCell();
  if (row.statusNode) statusCell.appendChild(row.statusNode);
  tr.appendChild(statusCell);

  tr.appendChild(buildTextCell(row.subscription));
  tr.appendChild(buildTextCell(row.files));

  const actionCell = buildBaseCell();
  const button = document.createElement("button");
  button.textContent = "Szczegóły";
  button.type = "button";
  button.style.border = "1px solid #cbd7e6";
  button.style.borderRadius = "14px";
  button.style.padding = "10px 14px";
  button.style.minHeight = "42px";
  button.style.background = "#fff";
  button.style.color = "#102a5c";
  button.style.fontWeight = "800";
  button.style.cursor = "pointer";
  button.addEventListener("click", row.openDetails);
  actionCell.appendChild(button);
  tr.appendChild(actionCell);
  return tr;
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
