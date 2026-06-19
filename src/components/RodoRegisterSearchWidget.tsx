"use client";

import { useEffect, useState } from "react";

export default function RodoRegisterSearchWidget() {
  const [query, setQuery] = useState("");

  useEffect(() => {
    let frame = 0;

    function scheduleApply() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => applyRodoRegisterSearch(query, setQuery));
    }

    scheduleApply();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [query]);

  return null;
}

function applyRodoRegisterSearch(query: string, setQuery: (value: string) => void) {
  const page = document.querySelector<HTMLElement>('[data-active-page="rodo"]');
  if (!page) return;

  const title = Array.from(page.querySelectorAll<HTMLHeadingElement>("h2"))
    .find((heading) => heading.textContent?.trim() === "Rejestr RODO");
  const card = title?.closest<HTMLElement>("section");
  if (!card) return;

  const header = title?.parentElement;
  if (!header) return;

  const searchInput = ensureSearchInput(card, header, query, setQuery);
  if (document.activeElement !== searchInput && searchInput.value !== query) searchInput.value = query;

  const rows = Array.from(card.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  const normalizedQuery = query.trim().toLowerCase();
  let visibleRows = 0;

  rows.forEach((row) => {
    const cells = Array.from(row.children) as HTMLElement[];
    const searchText = `${cells[0]?.textContent || ""} ${cells[1]?.textContent || ""}`.toLowerCase();
    const visible = !normalizedQuery || searchText.includes(normalizedQuery);
    row.style.display = visible ? "" : "none";
    if (visible) visibleRows += 1;
  });

  const empty = ensureEmptyMessage(card);
  empty.style.display = rows.length > 0 && visibleRows === 0 ? "block" : "none";
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

function ensureEmptyMessage(card: HTMLElement) {
  const existing = card.querySelector<HTMLElement>('[data-rodo-register-search-empty="true"]');
  if (existing) return existing;

  const empty = document.createElement("div");
  empty.dataset.rodoRegisterSearchEmpty = "true";
  empty.textContent = "Brak umów pasujących do wyszukiwania.";
  empty.style.border = "1px dashed #cbd7e6";
  empty.style.borderRadius = "14px";
  empty.style.padding = "18px";
  empty.style.color = "#4b5d78";
  empty.style.fontWeight = "700";
  empty.style.textAlign = "center";
  empty.style.display = "none";

  const tableWrapper = card.querySelector("table")?.closest("div");
  tableWrapper?.insertAdjacentElement("afterend", empty);
  return empty;
}
