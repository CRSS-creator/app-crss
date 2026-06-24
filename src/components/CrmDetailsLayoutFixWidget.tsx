"use client";

import { useEffect } from "react";

const LABEL_REPLACEMENTS: Record<string, string> = {
  "Kontakt / próba kontaktu": "Kontakt",
  "Rozmowa online": "Rozmowa",
  "Data spotkania online": "Data spotkania",
};

const HIDDEN_FIELDS = new Set(["Powód zmiany biura", "Powód przegranej"]);

export default function CrmDetailsLayoutFixWidget() {
  useEffect(() => {
    let frame = 0;

    function scheduleApply() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(applyCrmFixes);
    }

    scheduleApply();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return null;
}

function applyCrmFixes() {
  const page = document.querySelector<HTMLElement>('[data-active-page="crm"]');
  if (!page) return;

  replaceVisibleLabels(page);
  widenLeadDrawer(page);
  fixNotesSection(page);
}

function replaceVisibleLabels(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue) nodes.push(node);
  }

  nodes.forEach((node) => {
    const value = node.nodeValue?.trim();
    if (!value) return;
    const replacement = LABEL_REPLACEMENTS[value];
    if (replacement) node.nodeValue = node.nodeValue?.replace(value, replacement) || replacement;
  });
}

function widenLeadDrawer(root: HTMLElement) {
  const drawer = Array.from(root.querySelectorAll<HTMLElement>("aside"))
    .find((element) => element.textContent?.includes("Dane szansy") || element.textContent?.includes("Terminy i notatki"));
  if (!drawer) return;

  drawer.style.width = "min(1120px, calc(100vw - 270px))";
  drawer.style.maxWidth = "100%";

  const drawerSections = Array.from(drawer.querySelectorAll<HTMLElement>("section"));
  drawerSections.forEach((section) => {
    section.style.maxWidth = "100%";
  });
}

function fixNotesSection(root: HTMLElement) {
  const notesSection = Array.from(root.querySelectorAll<HTMLElement>("section"))
    .find((section) => section.querySelector("h3")?.textContent?.trim() === "Terminy i notatki");
  if (!notesSection) return;

  notesSection.style.display = "grid";
  notesSection.style.gridTemplateColumns = "minmax(0, 1.35fr) minmax(300px, 0.8fr)";
  notesSection.style.gap = "14px 22px";
  notesSection.style.alignItems = "start";

  const heading = notesSection.querySelector<HTMLElement>("h3");
  if (heading) heading.style.gridColumn = "1 / -1";

  const labels = Array.from(notesSection.querySelectorAll<HTMLLabelElement>("label"));
  labels.forEach((label) => {
    const caption = label.querySelector<HTMLElement>("span")?.textContent?.trim();
    if (!caption) return;

    if (HIDDEN_FIELDS.has(caption)) {
      label.style.display = "none";
      return;
    }

    const textarea = label.querySelector<HTMLTextAreaElement>("textarea");
    const input = label.querySelector<HTMLInputElement>("input");

    if (textarea) {
      label.style.gridColumn = "1 / 2";
      textarea.style.minHeight = caption === "Notatki" ? "360px" : "190px";
      textarea.style.resize = "vertical";
    }

    if (input) {
      label.style.gridColumn = "2 / 3";
    }
  });
}
