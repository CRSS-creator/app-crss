"use client";

import { useEffect } from "react";

const TARGET_LEAD_NAME_KEY = "crss_target_offer_lead_name";

export default function CrmOfferLeadContextBridge() {
  useEffect(() => {
    function rememberLeadFromDrawer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>('a[href="/crm/oferty"]');
      if (!link) return;

      const drawer = link.closest("aside");
      if (!drawer) return;

      const title = drawer.querySelector("h2")?.textContent?.trim();
      if (!title || title === "Dodaj szansę" || title === "Szansa") return;

      window.sessionStorage.setItem(TARGET_LEAD_NAME_KEY, title);
    }

    document.addEventListener("click", rememberLeadFromDrawer, true);
    return () => document.removeEventListener("click", rememberLeadFromDrawer, true);
  }, []);

  useEffect(() => {
    if (window.location.pathname !== "/crm/oferty") return;

    const targetLeadName = window.sessionStorage.getItem(TARGET_LEAD_NAME_KEY);
    if (!targetLeadName) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      const leadButton = buttons.find((button) => {
        const name = button.querySelector("strong")?.textContent?.trim();
        return name === targetLeadName;
      });

      if (leadButton) {
        leadButton.click();
        window.sessionStorage.removeItem(TARGET_LEAD_NAME_KEY);
        window.clearInterval(timer);
      }

      if (attempts >= 40) {
        window.sessionStorage.removeItem(TARGET_LEAD_NAME_KEY);
        window.clearInterval(timer);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, []);

  return null;
}
