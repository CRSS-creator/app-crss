"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ClipboardCheck, FileSearch, Send, ShieldCheck } from "lucide-react";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients } from "@/lib/clientService";
import { fetchOnboardingStages, statusLabel, type OnboardingStageRecord } from "@/lib/onboardingService";

type CaregiverProfile = {
  full_name: string | null;
  email: string | null;
  role: string | null;
  aktywne?: boolean | null;
};

type Client = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  telefon: string | null;
  status_klienta: string | null;
  opiekun_id: string | null;
  profiles?: CaregiverProfile | CaregiverProfile[] | null;
};

type AmlRow = {
  client: Client;
  stage: OnboardingStageRecord | null;
};

export default function AmlPage() {
  return (
    <AppLayout activePage="aml">
      <AccessGuard moduleName="aml">
        <AmlContent />
      </AccessGuard>
    </AppLayout>
  );
}

function AmlContent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [stages, setStages] = useState<OnboardingStageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [clientsResult, stagesResult] = await Promise.all([
        fetchClients(),
        fetchOnboardingStages(),
      ]);

      if (clientsResult.error) console.error("Błąd pobierania klientów AML:", clientsResult.error);
      if (stagesResult.error) console.error("Błąd pobierania etapów AML z onboardingu:", stagesResult.error);

      setClients(clientsResult.error ? [] : ((clientsResult.data || []) as unknown as Client[]));
      setStages(stagesResult.error ? [] : ((stagesResult.data || []) as OnboardingStageRecord[]));
      setLoading(false);
    }

    void loadData();
  }, []);

  const rows = useMemo(() => buildRows(clients, stages), [clients, stages]);
  const waitingCount = rows.filter((row) => !row.stage || row.stage.status === "do_wykonania").length;
  const inProgressCount = rows.filter((row) => row.stage?.status === "w_toku").length;
  const doneCount = rows.filter((row) => isDoneStage(row.stage)).length;

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>AML</p>
          <h1 style={titleStyle}>Rejestr klientów AML</h1>
          <p style={subtitleStyle}>
            Lista jest zasilana automatycznie klientami, którzy są aktualnie w onboardingu.
          </p>
        </div>
      </header>

      <section style={statsGridStyle} aria-label="Podsumowanie AML">
        <StatCard icon={<FileSearch size={22} />} label="Do weryfikacji AML" value={waitingCount} tone="warning" />
        <StatCard icon={<ShieldCheck size={22} />} label="W trakcie" value={inProgressCount} tone="info" />
        <StatCard icon={<ClipboardCheck size={22} />} label="Oznaczone jako gotowe" value={doneCount} tone="success" />
      </section>

      <section style={workflowStyle} aria-label="Proces AML">
        <WorkflowStep icon={<FileSearch size={18} />} title="1. Weryfikacja AML" />
        <WorkflowStep icon={<Send size={18} />} title="2. Formularz wstępny" />
        <WorkflowStep icon={<ClipboardCheck size={18} />} title="3. Twoja weryfikacja i oświadczenie" />
        <WorkflowStep icon={<ShieldCheck size={18} />} title="4. Następna aktualizacja i przypomnienia" />
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Podmioty z onboardingu</h2>
            <p style={sectionHintStyle}>Na tym etapie pokazujemy klientów ze statusem „Onboarding”.</p>
          </div>
        </div>

        {loading ? (
          <p style={emptyStyle}>Ładowanie rejestru AML...</p>
        ) : rows.length === 0 ? (
          <p style={emptyStyle}>Brak klientów w onboardingu do pokazania w rejestrze AML.</p>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>LP</Th>
                  <Th>Klient</Th>
                  <Th>NIP</Th>
                  <Th>Opiekun</Th>
                  <Th>Etap AML</Th>
                  <Th>Następny krok</Th>
                  <Th>Szczegóły</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.client.id}>
                    <Td>{index + 1}</Td>
                    <Td>
                      <strong style={clientNameStyle}>{row.client.nazwa || "Klient bez nazwy"}</strong>
                      <span style={clientMetaStyle}>{row.client.email || row.client.telefon || "Brak danych kontaktowych"}</span>
                    </Td>
                    <Td>{row.client.nip || "-"}</Td>
                    <Td>{caregiverLabel(row.client)}</Td>
                    <Td>
                      <span style={stageBadgeStyle(row.stage)}>{stageStatusLabel(row.stage)}</span>
                    </Td>
                    <Td>{nextStepLabel(row.stage)}</Td>
                    <Td>
                      <Link href={`/onboarding?client=${row.client.id}`} style={detailsLinkStyle}>
                        Onboarding
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function buildRows(clients: Client[], stages: OnboardingStageRecord[]): AmlRow[] {
  const amlStagesByClient = new Map(
    stages
      .filter((stage) => stage.etap === "aml")
      .map((stage) => [stage.klient_id, stage])
  );

  return clients
    .filter((client) => String(client.status_klienta || "").toLowerCase() === "onboarding")
    .map((client) => ({
      client,
      stage: amlStagesByClient.get(client.id) || null,
    }))
    .sort((first, second) => {
      const firstDone = isDoneStage(first.stage) ? 1 : 0;
      const secondDone = isDoneStage(second.stage) ? 1 : 0;
      if (firstDone !== secondDone) return firstDone - secondDone;
      return String(first.client.nazwa || "").localeCompare(String(second.client.nazwa || ""), "pl");
    });
}

function caregiverLabel(client: Client) {
  const profile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  return profile?.full_name || profile?.email || "Nie przypisano";
}

function stageStatusLabel(stage: OnboardingStageRecord | null) {
  if (!stage) return "Do weryfikacji";
  return statusLabel(stage.status);
}

function nextStepLabel(stage: OnboardingStageRecord | null) {
  if (!stage || stage.status === "do_wykonania") return "Uruchom weryfikację AML";
  if (stage.status === "w_toku") return "Dokończ weryfikację AML";
  if (stage.status === "zablokowane") return "Wyjaśnij blokadę";
  if (isDoneStage(stage)) return "Etap AML zakończony w onboardingu";
  return "Sprawdź etap AML";
}

function isDoneStage(stage: OnboardingStageRecord | null) {
  return stage?.status === "gotowe" || stage?.status === "papierowo" || stage?.status === "nowy_podmiot";
}

function stageBadgeStyle(stage: OnboardingStageRecord | null): CSSProperties {
  if (isDoneStage(stage)) return { ...badgeStyle, background: "rgba(22, 163, 74, 0.12)", color: colors.success };
  if (stage?.status === "w_toku") return { ...badgeStyle, background: "rgba(37, 99, 235, 0.12)", color: colors.info };
  if (stage?.status === "zablokowane") return { ...badgeStyle, background: "rgba(220, 38, 38, 0.12)", color: colors.danger };
  return { ...badgeStyle, background: "rgba(245, 158, 11, 0.14)", color: "#9a5b00" };
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "warning" | "info" | "success" }) {
  const toneColor = tone === "success" ? colors.success : tone === "info" ? colors.info : colors.warning;
  return (
    <div style={statCardStyle}>
      <div style={{ ...statIconStyle, color: toneColor, background: `${toneColor}1f` }}>{icon}</div>
      <div>
        <div style={statValueStyle}>{value}</div>
        <div style={statLabelStyle}>{label}</div>
      </div>
    </div>
  );
}

function WorkflowStep({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={workflowStepStyle}>
      <span style={workflowIconStyle}>{icon}</span>
      <span>{title}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={tdStyle}>{children}</td>;
}

const pageStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "22px",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "24px",
  alignItems: "flex-start",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "13px",
  fontWeight: 850,
  letterSpacing: "0.08em",
  color: colors.red,
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "34px",
  lineHeight: 1.15,
  color: colors.navy,
};

const subtitleStyle: CSSProperties = {
  margin: "10px 0 0",
  maxWidth: "720px",
  color: colors.muted,
  fontSize: "16px",
  lineHeight: 1.55,
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "14px",
};

const statCardStyle: CSSProperties = {
  minHeight: "92px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  background: colors.card,
  boxShadow: shadow.soft,
  padding: "20px",
  display: "flex",
  alignItems: "center",
  gap: "16px",
};

const statIconStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: radius.button,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const statValueStyle: CSSProperties = {
  fontSize: "28px",
  lineHeight: 1,
  fontWeight: 850,
  color: colors.navy,
};

const statLabelStyle: CSSProperties = {
  marginTop: "6px",
  color: colors.muted,
  fontWeight: 750,
  fontSize: "13px",
};

const workflowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "10px",
};

const workflowStepStyle: CSSProperties = {
  minHeight: "58px",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "12px 14px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  background: colors.card,
  color: colors.navy,
  fontWeight: 800,
  fontSize: "13px",
};

const workflowIconStyle: CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: radius.button,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(23, 59, 115, 0.08)",
  color: colors.navy,
  flex: "0 0 auto",
};

const cardStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  background: colors.card,
  boxShadow: shadow.card,
  overflow: "hidden",
};

const sectionHeaderStyle: CSSProperties = {
  padding: "24px 28px",
  borderBottom: `1px solid ${colors.border}`,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "22px",
  color: colors.navy,
};

const sectionHintStyle: CSSProperties = {
  margin: "6px 0 0",
  color: colors.muted,
  fontSize: "14px",
};

const tableWrapStyle: CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: "980px",
  borderCollapse: "collapse",
};

const thStyle: CSSProperties = {
  padding: "16px 18px",
  textAlign: "left",
  fontSize: "12px",
  color: colors.text,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderBottom: `1px solid ${colors.border}`,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "18px",
  borderBottom: `1px solid ${colors.border}`,
  color: colors.text,
  verticalAlign: "middle",
  fontSize: "15px",
};

const clientNameStyle: CSSProperties = {
  display: "block",
  color: colors.navy,
  fontWeight: 850,
  lineHeight: 1.35,
};

const clientMetaStyle: CSSProperties = {
  display: "block",
  marginTop: "5px",
  color: colors.muted,
  fontSize: "13px",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  minHeight: "30px",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 12px",
  borderRadius: radius.badge,
  fontSize: "13px",
  fontWeight: 850,
  whiteSpace: "nowrap",
};

const detailsLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  padding: "0 16px",
  borderRadius: radius.button,
  border: `1px solid ${colors.border}`,
  color: colors.navy,
  textDecoration: "none",
  fontWeight: 850,
  background: colors.white,
};

const emptyStyle: CSSProperties = {
  margin: 0,
  padding: "34px 28px",
  color: colors.muted,
  fontWeight: 750,
};
