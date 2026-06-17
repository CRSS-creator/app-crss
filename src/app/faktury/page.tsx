"use client";

import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors } from "@/app/design";

export default function InvoicesPage() {
  return (
    <AppLayout activePage="faktury">
      <AccessGuard moduleName="faktury">
        <section style={headerStyle}>
          <p style={eyebrowStyle}>Zarządzanie</p>
          <h1 style={titleStyle}>Faktury</h1>
        </section>
      </AccessGuard>
    </AppLayout>
  );
}

const headerStyle: React.CSSProperties = {
  marginBottom: "30px",
};

const eyebrowStyle: React.CSSProperties = {
  color: colors.red,
  fontWeight: 800,
  margin: "0 0 8px",
};

const titleStyle: React.CSSProperties = {
  fontSize: "42px",
  lineHeight: 1.05,
  margin: 0,
  color: colors.navy,
};
