"use client";

import { useEffect } from "react";

const LARGE_FIELD_ROWS: Record<string, string> = {
  "Powód kontaktu": "2",
  "Notatki": "3",
};

const DATE_FIELDS = new Set(["Data telefonu", "Data spotkania online", "Data spotkania", "Data wysłania propozycji", "Data follow-up"]);

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
  if (!section) return;

  section.style.display = "grid";
  section.style.gridTemplateColumns = "minmax(0, 1.25fr) minmax(360px, 0.75fr)";
  section.style.gridTemplateRows = "auto auto auto";
  section.style.gap = "12px 22px";
  section.style.alignItems = "start";

  const heading = section.querySelector<HTMLElement>("h3");
  if (heading) {
    heading.style.gridColumn = "1 / -1";
    heading.style.marginBottom = "2px";
  }

  const rightColumn = ensureRightColumn(section);

  Array.from(section.querySelectorAll<HTMLLabelElement>("label")).forEach((label) => {
    const labelText = label.querySelector("span")?.textContent?.trim() || "";
    label.style.minWidth = "0";

    if (labelText === "Powód przegranej") {
      label.style.display = "none";
      return;
    }

    if (LARGE_FIELD_ROWS[labelText]) {
      prepareLargeTextField(label, LARGE_FIELD_ROWS[labelText], labelText === "Notatki");
      return;
    }

    if (DATE_FIELDS.has(labelText)) {
      prepareRightField(label, rightColumn);
    }
  });
}

function prepareLargeTextField(label: HTMLLabelElement, gridRow: string, isNotes = false) {
  label.style.gridColumn = "1";
  label.style.gridRow = gridRow;
  label.style.display = "flex";
  label.style.flexDirection = "column";
  label.style.gap = "8px";
  label.style.color = "#4b5d78";
  label.style.fontWeight = "700";
  label.style.borderBottom = "none";
  label.style.padding = "0";

  const textarea = label.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) return;
  textarea.style.minHeight = isNotes ? "520px" : "190px";
  textarea.style.width = "100%";
  textarea.style.lineHeight = "1.65";
}

function prepareRightField(label: HTMLLabelElement, rightColumn: HTMLElement) {
  rightColumn.appendChild(label);
  label.style.minWidth = "0";
  label.style.display = "grid";
  label.style.gridTemplateColumns = "1fr minmax(170px, 0.95fr)";
  label.style.alignItems = "center";
  label.style.gap = "14px";
  label.style.borderBottom = "1px solid #cbd8ea";
  label.style.padding = "0 0 12px";
}

function ensureRightColumn(section: HTMLElement) {
  let rightColumn = section.querySelector<HTMLElement>("[data-crss-crm-dates-column='1']");
  if (rightColumn) return rightColumn;

  rightColumn = document.createElement("div");
  rightColumn.setAttribute("data-crss-crm-dates-column", "1");
  rightColumn.style.gridColumn = "2";
  rightColumn.style.gridRow = "2 / 4";
  rightColumn.style.display = "flex";
  rightColumn.style.flexDirection = "column";
  rightColumn.style.gap = "16px";
  rightColumn.style.alignSelf = "start";
  section.appendChild(rightColumn);
  return rightColumn;
}
