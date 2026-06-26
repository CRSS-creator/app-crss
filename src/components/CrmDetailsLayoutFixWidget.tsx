"use client";

import { useEffect } from "react";

const LABEL_REPLACEMENTS: Record<string, string> = {
  "Kontakt / próba kontaktu": "Kontakt",
  "Rozmowa online": "Rozmowa",
  "Data spotkania online": "Data spotkania",
};

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
