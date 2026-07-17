"use client";

import { useState, type CSSProperties } from "react";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import { colors, radius, shadow } from "@/app/design";

type PayrollTab = "kadry" | "a1" | "zus_przedsiebiorcy";

type PayrollTabDefinition = {
  value: PayrollTab;
  label: string;
};

const PAYROLL_TABS: PayrollTabDefinition[] = [
  { value: "kadry", label: "Kadry" },
  { value: "a1", label: "A1" },
  { value: "zus_przedsiebiorcy", label: "ZUS Przedsiębiorcy" },
];

export default function PayrollPage() {
  return (
    <AppLayout activePage="kadry">
      <AccessGuard moduleName="kadry">
        <PayrollContent />
      </AccessGuard>
    </AppLayout>
  );
}

function PayrollContent() {
  const [activeTab, setActiveTab] = useState<PayrollTab>("kadry");

  const tab = PAYROLL_TABS.find((item) => item.value === activeTab) || PAYROLL_TABS[0];

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Kadry i ZUS</p>
          <h1 style={titleStyle}>Kadry i ZUS</h1>
        </div>
      </header>

      <nav style={tabsStyle} aria-label="Kadry i ZUS">
        {PAYROLL_TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setActiveTab(item.value)}
            style={activeTab === item.value ? activeTabStyle : tabStyle}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>{tab.label}</h2>
            <p style={sectionHintStyle}>{tabHint(activeTab)}</p>
          </div>
        </div>

        <div style={emptyStateStyle}>
          <strong>{tab.label}</strong>
          <span>Widok gotowy do uzupełnienia.</span>
        </div>
      </section>
    </div>
  );
}

function tabHint(tab: PayrollTab) {
  if (tab === "kadry") return "Lista spraw kadrowych klientów.";
  if (tab === "a1") return "Obsługa zaświadczeń A1.";
  return "ZUS przedsiębiorcy i powiązane terminy.";
}

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "22px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start" };
const eyebrowStyle: CSSProperties = { margin: "0 0 8px", fontSize: "13px", fontWeight: 850, letterSpacing: "0.08em", color: colors.red, textTransform: "uppercase" };
const titleStyle: CSSProperties = { margin: 0, fontSize: "34px", lineHeight: 1.15, color: colors.navy };
const tabsStyle: CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap" };
const tabStyle: CSSProperties = { minHeight: "42px", padding: "0 18px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.card, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const activeTabStyle: CSSProperties = { ...tabStyle, background: colors.navy, color: colors.white, borderColor: colors.navy };
const cardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, boxShadow: shadow.card, overflow: "hidden" };
const sectionHeaderStyle: CSSProperties = { padding: "22px 24px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: "22px", color: colors.navy };
const sectionHintStyle: CSSProperties = { margin: "6px 0 0", color: colors.muted, fontSize: "14px" };
const emptyStateStyle: CSSProperties = { minHeight: "220px", padding: "28px 24px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "8px", color: colors.muted, fontWeight: 750, textAlign: "center" };
