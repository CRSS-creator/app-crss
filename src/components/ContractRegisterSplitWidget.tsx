"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    let frame = 0;

    function scheduleSplit() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(splitContractRegister);
    }

    scheduleSplit();
    const observer = new MutationObserver(scheduleSplit);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return null;
}

function splitContractRegister() {
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
  if (!sourceWrapper || sourceWrapper.dataset.contractRegisterSource === "true") return;

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  if (!rows.length) return;

  card.querySelector<HTMLElement>('[data-contract-register-split="true"]')?.remove();

  const khRows: RegisterRow[] = [];
  const kuRows: RegisterRow[] = [];
  rows.forEach((row) => {
    const cells = Array.from(row.children) as HTMLElement[];
    const type = cells[typeIndex]?.textContent?.trim();
    const detailsButton = row.querySelector<HTMLButtonElement>("button");
    const item: RegisterRow = {
      number: cells[0]?.textContent?.trim() || "Bez numeru",
      client: cells[1]?.textContent?.trim() || "—",
      statusNode: cells[3]?.firstElementChild?.cloneNode(true) || document.createTextNode(cells[3]?.textContent?.trim() || "—"),
      subscription: cells[4]?.textContent?.trim() || "—",
      files: cells[5]?.textContent?.trim() || "—",
      openDetails: () => detailsButton?.click(),
    };

    if (type === "KH") khRows.push(item);
    if (type === "KU") kuRows.push(item);
  });

  const splitRoot = document.createElement("div");
  splitRoot.dataset.contractRegisterSplit = "true";
  splitRoot.style.display = "grid";
  splitRoot.style.gap = "18px";
  splitRoot.appendChild(buildRegisterSection("Rejestr KH", "Pełna księgowość", khRows));
  splitRoot.appendChild(buildRegisterSection("Rejestr KU", "Uproszczona księgowość", kuRows));

  sourceWrapper.dataset.contractRegisterSource = "true";
  sourceWrapper.style.display = "none";
  sourceWrapper.insertAdjacentElement("afterend", splitRoot);
}

function buildRegisterSection(title: string, subtitle: string, rows: RegisterRow[]) {
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

  const textWrap = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = title;
  heading.style.margin = "0";
  heading.style.color = "#102a5c";
  heading.style.fontSize = "21px";
  heading.style.fontWeight = "700";

  const description = document.createElement("p");
  description.textContent = subtitle;
  description.style.margin = "6px 0 0";
  description.style.color = "#4b5d78";
  description.style.fontSize = "14px";
  description.style.fontWeight = "650";

  const count = document.createElement("strong");
  count.textContent = `${rows.length} ${rows.length === 1 ? "umowa" : "umów"}`;
  count.style.borderRadius = "999px";
  count.style.padding = "7px 12px";
  count.style.background = "#eef2f7";
  count.style.color = "#102a5c";
  count.style.fontSize = "13px";
  count.style.whiteSpace = "nowrap";

  textWrap.append(heading, description);
  header.append(textWrap, count);
  section.appendChild(header);

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.textContent = "Brak umów w tym rejestrze.";
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
