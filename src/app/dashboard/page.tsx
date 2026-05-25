"use client";

import { supabase } from "@/lib/supabaseClient";
import { colors, radius, shadow } from "../design";
import AppLayout from "@/components/AppLayout";

export default function DashboardPage() {
  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <AppLayout activePage="dashboard">
      <section style={contentStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Panel właściciela</p>
            <h1 style={titleStyle}>Dashboard CRSS</h1>
            <p style={subtitleStyle}>
              Centrum zarządzania biurem: klienci, rozliczenia, finanse,
              rentowność i praca zespołu.
            </p>
          </div>
        </header>

        <section style={cardsGridStyle}>
          <EmptyCard title="Klienci" description="Dane zostaną pobrane z bazy." />
          <EmptyCard title="Rozliczenia" description="Statusy miesięczne klientów." />
          <EmptyCard title="Finanse" description="Przychody, koszty i cashflow." />
          <EmptyCard title="Zespół" description="Praca i obciążenie opiekunów." />
        </section>

        <section style={mainGridStyle}>
          <Panel
            title="Najważniejsze informacje"
            description="Tutaj pojawią się alerty, priorytety i decyzje wymagające Twojej uwagi."
          />

          <Panel
            title="CFO — podgląd zarządczy"
            description="Tutaj pojawi się rentowność, płynność, runway oraz prognozy finansowe."
          />

          <Panel
            title="Status pracy biura"
            description="Tutaj zobaczysz, które obszary są zakończone, w toku albo wymagają reakcji."
          />

          <Panel
            title="Zadania strategiczne"
            description="Miejsce na kluczowe działania właściciela, nie na bieżączkę operacyjną."
          />
        </section>
      </section>
    </AppLayout>
  );
}

function EmptyCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div style={cardStyle}>
      <p style={cardLabelStyle}>{title}</p>
      <p style={emptyValueStyle}>—</p>
      <p style={cardDescriptionStyle}>{description}</p>
    </div>
  );
}

function Panel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div style={panelStyle}>
      <h2 style={panelTitleStyle}>{title}</h2>
      <p style={panelDescriptionStyle}>{description}</p>
      <div style={emptyStateStyle}>Brak danych do wyświetlenia</div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  background: colors.background,
  color: colors.text,
};

const sidebarStyle: React.CSSProperties = {
  width: "280px",
  minHeight: "100vh",
  padding: "28px",
  background: colors.card,
  borderRight: `1px solid ${colors.border}`,
  boxShadow: shadow.soft,
  display: "flex",
  flexDirection: "column",
};

const logoBoxStyle: React.CSSProperties = {
  width: "120px",
  height: "78px",
  borderRadius: radius.card,
  background: colors.card,
  border: `1px solid ${colors.border}`,
  boxShadow: shadow.soft,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: "36px",
};

const logoStyle: React.CSSProperties = {
  width: "88px",
  height: "auto",
};

const navStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const navItem: React.CSSProperties = {
  padding: "15px 18px",
  borderRadius: radius.button,
  color: colors.text,
  fontWeight: 600,
  cursor: "pointer",
};

const activeNavItem: React.CSSProperties = {
  ...navItem,
  background: colors.navy,
  color: colors.white,
};

const logoutButtonStyle: React.CSSProperties = {
  marginTop: "auto",
  border: "none",
  borderRadius: radius.button,
  padding: "16px 18px",
  background: colors.red,
  color: colors.white,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: shadow.button,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  padding: "42px",
};

const headerStyle: React.CSSProperties = {
  marginBottom: "32px",
};

const eyebrowStyle: React.CSSProperties = {
  color: colors.red,
  fontWeight: 800,
  marginBottom: "8px",
};

const titleStyle: React.CSSProperties = {
  fontSize: "42px",
  lineHeight: 1.05,
  margin: 0,
  color: colors.navy,
};

const subtitleStyle: React.CSSProperties = {
  maxWidth: "760px",
  fontSize: "17px",
  lineHeight: 1.7,
  color: colors.muted,
  marginTop: "14px",
};

const cardsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "22px",
  marginBottom: "28px",
};

const cardStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "28px",
  boxShadow: shadow.soft,
};

const cardLabelStyle: React.CSSProperties = {
  color: colors.muted,
  fontWeight: 700,
  margin: 0,
};

const emptyValueStyle: React.CSSProperties = {
  fontSize: "34px",
  fontWeight: 800,
  color: colors.navy,
  margin: "12px 0 4px",
};

const cardDescriptionStyle: React.CSSProperties = {
  color: colors.muted,
  margin: 0,
};

const mainGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "24px",
};

const panelStyle: React.CSSProperties = {
  minHeight: "230px",
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "30px",
  boxShadow: shadow.soft,
};

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: colors.navy,
  fontSize: "24px",
};

const panelDescriptionStyle: React.CSSProperties = {
  color: colors.muted,
  lineHeight: 1.7,
};

const emptyStateStyle: React.CSSProperties = {
  marginTop: "28px",
  padding: "18px",
  borderRadius: radius.input,
  background: colors.inputBackground,
  border: `1px dashed ${colors.border}`,
  color: colors.muted,
  textAlign: "center",
};
