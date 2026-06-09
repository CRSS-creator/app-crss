"use client";

import { useEffect } from "react";

const LONG_FIELDS = ["Powód kontaktu", "Powód zmiany biura", "Notatki"];
const RIGHT_FIELDS = ["Data telefonu", "Data spotkania online", "Data wysłania propozycji", "Data follow-up", "Powód przegranej"];

export default function CrmLeadDrawerLayoutWidget() {
  useEffect(() => {
    let frame = 0;

    function scheduleEnhance() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(enhanceDrawerLayout);
    }

    scheduleEnhance();
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return null;
}

function enhanceDrawerLayout() {
  const page = document.querySelector<HTMLElement>('[data-active-page="crm"]');
  if (!page) return;

  const drawer = Array.from(page.querySelectorAll<HTMLElement>("aside"))
    .find((aside) => Array.from(aside.querySelectorAll("h3"))
      .some((heading) => heading.textContent?.trim() === "Terminy i notatki"));
  if (!drawer) return;

  drawer.style.width = "1120px";
  drawer.style.maxWidth = "calc(100vw - 64px)";

  const section = Array.from(drawer.querySelectorAll<HTMLElement>("section"))
    .find((candidate) => candidate.querySelector("h3")?.textContent?.trim() === "Terminy i notatki");
  if (!section || section.dataset.crmLeadNotesEnhanced === "true") return;

  const labels = Array.from(section.querySelectorAll<HTMLLabelElement>("label"));
  const leftColumn = document.createElement("div");
  const rightColumn = document.createElement("div");
  leftColumn.style.display = "flex";
  leftColumn.style.flexDirection = "column";
  leftColumn.style.gap = "14px";
  rightColumn.style.display = "flex";
  rightColumn.style.flexDirection = "column";
  rightColumn.style.gap = "10px";

  labels.forEach((label) => {
    const labelText = label.querySelector("span")?.textContent?.trim() || "";
    if (LONG_FIELDS.includes(labelText)) {
      prepareLargeTextField(label);
      leftColumn.appendChild(label);
      return;
    }

    if (RIGHT_FIELDS.includes(labelText)) {
      if (labelText === "Powód przegranej") prepareMediumTextField(label);
      rightColumn.appendChild(label);
      return;
    }

    rightColumn.appendChild(label);
  });

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "minmax(0, 1.25fr) minmax(360px, 0.75fr)";
  grid.style.gap = "22px";
  grid.style.alignItems = "start";
  grid.append(leftColumn, rightColumn);

  section.appendChild(grid);
  section.dataset.crmLeadNotesEnhanced = "true";
}

function prepareLargeTextField(label: HTMLLabelElement) {
  label.style.display = "flex";
  label.style.flexDirection = "column";
  label.style.gap = "8px";
  label.style.color = "#4b5d78";
  label.style.fontWeight = "700";
  label.style.borderBottom = "none";
  label.style.padding = "0";

  const textarea = label.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) return;
  textarea.style.minHeight = "210px";
  textarea.style.width = "100%";
  textarea.style.lineHeight = "1.65";
}

function prepareMediumTextField(label: HTMLLabelElement) {
  label.style.display = "flex";
  label.style.flexDirection = "column";
  label.style.gap = "8px";
  label.style.borderBottom = "none";

  const textarea = label.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) return;
  textarea.style.minHeight = "150px";
}
