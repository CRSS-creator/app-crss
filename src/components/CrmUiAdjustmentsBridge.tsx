"use client";

import { useEffect } from "react";

const LEGAL_FORMS = ["JDG", "spółka z o.o.", "prosta spółka akcyjna", "organizacja"];

export default function CrmUiAdjustmentsBridge() {
  useEffect(() => {
    const applyAdjustments = () => {
      renamePipelineStage();
      adjustLeadDrawer();
    };

    applyAdjustments();
    const observer = new MutationObserver(applyAdjustments);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}

function renamePipelineStage() {
  document.querySelectorAll("h3, td, option, span").forEach((element) => {
    if (element.textContent?.trim() === "Kontakt / próba kontaktu") {
      element.textContent = "Kontakt";
    }
  });
}

function adjustLeadDrawer() {
  const drawer = Array.from(document.querySelectorAll("aside")).find((element) =>
    element.textContent?.includes("Szczegóły szansy") || element.textContent?.includes("Nowa szansa sprzedaży"),
  );
  if (!drawer) return;

  replaceLegalFormInput(drawer);
  renameField(drawer, "Data spotkania online", "Data spotkania");
  mergeAndHideOfficeChangeReason(drawer);
  enlargeNotes(drawer);
}

function replaceLegalFormInput(scope: Element) {
  const row = findFieldRow(scope, "Forma prawna");
  if (!row || row.getAttribute("data-crss-legal-form-ready") === "1") return;

  const input = row.querySelector("input") as HTMLInputElement | null;
  if (!input) return;

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Forma prawna");
  select.style.cssText = input.style.cssText;
  select.style.minHeight = "48px";
  select.style.cursor = "pointer";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Wybierz formę prawną";
  select.appendChild(emptyOption);

  LEGAL_FORMS.forEach((legalForm) => {
    const option = document.createElement("option");
    option.value = legalForm;
    option.textContent = legalForm;
    select.appendChild(option);
  });

  const normalizedValue = normalizeLegalForm(input.value);
  if (normalizedValue !== input.value) setNativeInputValue(input, normalizedValue);
  select.value = normalizedValue;

  select.addEventListener("change", () => setNativeInputValue(input, select.value));
  input.addEventListener("input", () => {
    select.value = normalizeLegalForm(input.value);
  });

  input.style.display = "none";
  input.insertAdjacentElement("afterend", select);
  row.setAttribute("data-crss-legal-form-ready", "1");
}

function renameField(scope: Element, currentLabel: string, nextLabel: string) {
  const row = findFieldRow(scope, currentLabel);
  const label = row?.querySelector("span");
  if (label && label.textContent?.trim() === currentLabel) label.textContent = nextLabel;
}

function mergeAndHideOfficeChangeReason(scope: Element) {
  const contactRow = findFieldRow(scope, "Powód kontaktu");
  const officeRow = findFieldRow(scope, "Powód zmiany biura");
  const contactTextarea = contactRow?.querySelector("textarea") as HTMLTextAreaElement | null;
  const officeTextarea = officeRow?.querySelector("textarea") as HTMLTextAreaElement | null;

  if (contactTextarea && officeTextarea && officeTextarea.value.trim()) {
    const merged = mergeText(contactTextarea.value, officeTextarea.value);
    if (merged !== contactTextarea.value) setNativeTextareaValue(contactTextarea, merged);
    setNativeTextareaValue(officeTextarea, "");
  }

  if (officeRow) (officeRow as HTMLElement).style.display = "none";
}

function enlargeNotes(scope: Element) {
  const notesRow = findFieldRow(scope, "Notatki");
  const textarea = notesRow?.querySelector("textarea") as HTMLTextAreaElement | null;
  if (!textarea) return;
  textarea.rows = 9;
  textarea.style.minHeight = "220px";
}

function findFieldRow(scope: Element, label: string) {
  return Array.from(scope.querySelectorAll("label")).find((element) => {
    const text = element.querySelector("span")?.textContent?.trim();
    return text === label;
  }) as HTMLLabelElement | undefined;
}

function normalizeLegalForm(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("jdg")) return "JDG";
  if (normalized.includes("prosta") || normalized.includes("psa")) return "prosta spółka akcyjna";
  if (normalized.includes("organiz")) return "organizacja";
  if (normalized.includes("sp") || normalized.includes("z o.o")) return "spółka z o.o.";
  return LEGAL_FORMS.includes(value.trim()) ? value.trim() : "";
}

function mergeText(first: string, second: string) {
  const firstTrimmed = first.trim();
  const secondTrimmed = second.trim();
  if (!firstTrimmed) return secondTrimmed;
  if (!secondTrimmed || firstTrimmed.includes(secondTrimmed)) return firstTrimmed;
  return `${firstTrimmed}\n\n${secondTrimmed}`;
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
}
