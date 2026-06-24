"use client";

import { useEffect } from "react";

const PRINT_STYLE_ID = "rodo-register-print-style";

export default function RodoRegisterPrintWidget() {
  useEffect(() => {
    let frame = 0;

    function scheduleApply() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(applyPrintSetup);
    }

    scheduleApply();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.getElementById(PRINT_STYLE_ID)?.remove();
    };
  }, []);

  return null;
}

function applyPrintSetup() {
  const page = document.querySelector<HTMLElement>('[data-active-page="rodo"]');
  if (!page) return;

  const registerTitle = Array.from(page.querySelectorAll<HTMLHeadingElement>("h2"))
    .find((heading) => heading.textContent?.trim() === "Rejestr umów powierzenia przetwarzania danych osobowych");
  const registerSection = registerTitle?.closest<HTMLElement>("section");
  if (!registerSection) return;

  registerSection.dataset.printableRodoRegister = "true";
  injectPrintStyles();
}

function injectPrintStyles() {
  if (document.getElementById(PRINT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @page {
      size: A4 landscape;
      margin: 8mm;
    }

    @media print {
      body {
        background: #ffffff !important;
      }

      body * {
        visibility: hidden !important;
      }

      [data-printable-rodo-register="true"],
      [data-printable-rodo-register="true"] * {
        visibility: visible !important;
      }

      [data-printable-rodo-register="true"] {
        position: absolute !important;
        inset: 0 auto auto 0 !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        box-shadow: none !important;
        background: #ffffff !important;
      }

      [data-printable-rodo-register="true"] button,
      [data-printable-rodo-register="true"] select,
      [data-printable-rodo-register="true"] input {
        display: none !important;
      }

      [data-printable-rodo-register="true"] h2 {
        margin: 0 0 8mm !important;
        color: #000 !important;
        font-size: 15pt !important;
        line-height: 1.2 !important;
      }

      [data-printable-rodo-register="true"] table {
        width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
        font-size: 8pt !important;
        color: #000 !important;
      }

      [data-printable-rodo-register="true"] th,
      [data-printable-rodo-register="true"] td {
        border: 1px solid #000 !important;
        padding: 4px 5px !important;
        color: #000 !important;
        vertical-align: top !important;
        word-break: break-word !important;
      }

      [data-printable-rodo-register="true"] th {
        font-size: 7pt !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        background: #f2f2f2 !important;
      }

      [data-printable-rodo-register="true"] tr {
        break-inside: avoid !important;
      }

      [data-printable-rodo-register="true"] th:nth-child(1),
      [data-printable-rodo-register="true"] td:nth-child(1) { width: 12% !important; }
      [data-printable-rodo-register="true"] th:nth-child(2),
      [data-printable-rodo-register="true"] td:nth-child(2) { width: 15% !important; }
      [data-printable-rodo-register="true"] th:nth-child(3),
      [data-printable-rodo-register="true"] td:nth-child(3) { width: 9% !important; }
      [data-printable-rodo-register="true"] th:nth-child(4),
      [data-printable-rodo-register="true"] td:nth-child(4) { width: 17% !important; }
      [data-printable-rodo-register="true"] th:nth-child(5),
      [data-printable-rodo-register="true"] td:nth-child(5) { width: 11% !important; }
      [data-printable-rodo-register="true"] th:nth-child(6),
      [data-printable-rodo-register="true"] td:nth-child(6) { width: 22% !important; }
      [data-printable-rodo-register="true"] th:nth-child(7),
      [data-printable-rodo-register="true"] td:nth-child(7) { width: 8% !important; }
      [data-printable-rodo-register="true"] th:nth-child(8),
      [data-printable-rodo-register="true"] td:nth-child(8) { display: none !important; }
    }
  `;

  document.head.appendChild(style);
}
