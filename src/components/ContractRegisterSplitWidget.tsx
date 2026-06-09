"use client";

import { useEffect } from "react";

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
  if (!card || card.dataset.contractRegisterSplit === "true") return;

  const table = card.querySelector<HTMLTableElement>("table");
  if (!table) return;

  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
  const typeIndex = headers.findIndex((header) => header.textContent?.trim().toLowerCase() === "typ");
  if (typeIndex < 0) return;

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  if (!rows.length) return;

  const wrapper = table.closest<HTMLElement>("div");
  if (!wrapper) return;

  const khRows = rows.filter((row) => row.children[typeIndex]?.textContent?.trim() === "KH");
  const kuRows = rows.filter((row) => row.children[typeIndex]?.textContent?.trim() === "KU");
  const splitRoot = document.createElement("div");
  splitRoot.style.display = "grid";
  splitRoot.style.gap = "18px";
  splitRoot.appendChild(buildRegisterSection("Rejestr KH", "Pełna księgowość", khRows, typeIndex));
  splitRoot.appendChild(buildRegisterSection("Rejestr KU", "Uproszczona księgowość", kuRows, typeIndex));

  wrapper.replaceWith(splitRoot);
  card.dataset.contractRegisterSplit = "true";
}

function buildRegisterSection(title: string, subtitle: string, rows: HTMLTableRowElement[], typeIndex: number) {
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
  HEADER_LABELS.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.style.textAlign = "left";
    th.style.padding = "14px 16px";
    th.style.color = "#4b5d78";
    th.style.fontSize = "13px";
    th.style.textTransform = "uppercase";
    th.style.letterSpacing = "0.04em";
    th.style.borderBottom = "1px solid #cbd7e6";
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const typeCell = row.children[typeIndex] as HTMLElement | undefined;
    if (typeCell) typeCell.style.display = "none";
    tbody.appendChild(row);
  });

  table.append(thead, tbody);
  tableWrapper.appendChild(table);
  section.appendChild(tableWrapper);
  return section;
}
