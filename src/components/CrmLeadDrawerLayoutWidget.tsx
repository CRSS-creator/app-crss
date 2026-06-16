"use client";

import { useEffect } from "react";

const LARGE_FIELD_ROWS: Record<string, string> = {
  "Powód kontaktu": "2 / span 3",
  "Notatki": "5 / span 4",
};

const RIGHT_FIELD_ROWS: Record<string, string> = {
  "Data telefonu": "2",
  "Data spotkania online": "3",
  "Data wysłania propozycji": "4",
  "Data follow-up": "5",
  "Powód przegranej": "6 / span 3",
};

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
  section.style.gridAutoRows = "minmax(42px, auto)";
  section.style.gap = "12px 22px";
  section.style.alignItems = "start";

  const heading = section.querySelector<HTMLElement>("h3");
  if (heading) {
    heading.style.gridColumn = "1 / -1";
    heading.style.marginBottom = "2px";
  }

  Array.from(section.querySelectorAll<HTMLLabelElement>("label")).forEach((label) => {
    const labelText = label.querySelector("span")?.textContent?.trim() || "";
    label.style.minWidth = "0";

    if (LARGE_FIELD_ROWS[labelText]) {
      prepareLargeTextField(label, LARGE_FIELD_ROWS[labelText]);
      return;
    }

    if (RIGHT_FIELD_ROWS[labelText]) {
      prepareRightField(label, RIGHT_FIELD_ROWS[labelText], labelText === "Powód przegranej");
    }
  });
}

function prepareLargeTextField(label: HTMLLabelElement, gridRow: string) {
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
  textarea.style.minHeight = "190px";
  textarea.style.width = "100%";
  textarea.style.lineHeight = "1.65";
}

function prepareRightField(label: HTMLLabelElement, gridRow: string, isTextarea = false) {
  label.style.gridColumn = "2";
  label.style.gridRow = gridRow;
  label.style.minWidth = "0";

  if (!isTextarea) return;

  label.style.display = "flex";
  label.style.flexDirection = "column";
  label.style.gap = "8px";
  label.style.borderBottom = "none";

  const textarea = label.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) return;
  textarea.style.minHeight = "150px";
}
