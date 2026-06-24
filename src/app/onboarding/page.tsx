"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
import { fetchClients } from "@/lib/clientService";
import { fetchCrmContracts, type CrmContract } from "@/lib/crmContractService";
import { fetchRodoProcessingContracts, type RodoProcessingContract } from "@/lib/rodoProcessingContractService";
import { X } from "lucide-react";

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
  forma_prawna: string | null;
  forma_opodatkowania: string | null;
  status_klienta: string | null;
  pierwszy_okres_rozliczeniowy: string | null;
  opiekun_id: string | null;
  profiles?: CaregiverProfile | CaregiverProfile[] | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type StageState = "done" | "progress" | "blocked" | "todo";

type OnboardingStage = {
  key: string;
  title: string;
  description: string;
  state: StageState;
  moduleLabel?: string;
  href?: string;
};

type HistoryEntry = {
  at: string | null;
  user: string;
  source: string;
  description: string;
};

type OnboardingRow = {
  client: Client;
  accountingContract: CrmContract | null;
  rodoContract: RodoProcessingContract | null;
  stages: OnboardingStage[];
  progress: number;
  nextStep: string;
  status: string;
  history: HistoryEntry[];
};

export default function OnboardingPage() {
  return (
    <AppLayout activePage="onboarding">
      <AccessGuard moduleName="onboarding">
        <OnboardingContent />
      </AccessGuard>
    </AppLayout>
  );
}

function OnboardingContent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [contracts, setContracts] = useState<CrmContract[]>([]);
  const [rodoContracts, setRodoContracts] = useState<RodoProcessingContract[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("Wszystkie");
  const [selectedRow, setSelectedRow] = useState<OnboardingRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [clientsResult, contractsResult, rodoResult, profilesResult] = await Promise.all([
      fetchClients(),
      fetchCrmContracts(),
      fetchRodoProcessingContracts(),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    if (clientsResult.error) console.error("Błąd pobierania klientów do onboardingu:", clientsResult.error);
    else setClients((clientsResult.data || []) as unknown as Client[]);

    if (contractsResult.error) console.error("Błąd pobierania umów do onboardingu:", contractsResult.error);
    else setContracts((contractsResult.data || []) as CrmContract[]);

    if (rodoResult.error) console.error("Błąd pobierania umów RODO do onboardingu:", rodoResult.error);
    else setRodoContracts((rodoResult.data || []) as RodoProcessingContract[]);

    if (profilesResult.error) console.error("Błąd pobierania użytkowników do historii onboardingu:", profilesResult.error);
    else setProfilesById(indexProfiles((profilesResult.data || []) as Profile[]));

    setLoading(false);
  }

  const rows = useMemo(
    () => buildRows(clients, contracts, rodoContracts, profilesById),
    [clients, contracts, rodoContracts, profilesById]
  );
  const filteredRows = rows.filter((row) => statusFilter === "Wszystkie" || row.status === statusFilter);
  const blockedCount = rows.filter((row) => row.status === "Czeka na formalności").length;
  const doneCount = rows.filter((row) => row.status === "Zakończony").length;

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł operacyjny</p>
          <h1 style={titleStyle}>Onboarding</h1>
          <p style={subtitleStyle}>Centrum koordynacji startu klienta. Umowy, RODO i AML pozostają osobnymi modułami, a onboarding zbiera statusy i kolejne kroki w jednym miejscu.</p>
        </div>
      </section>

      <section style={summaryGridStyle}>
        <Summary label="W onboardingu" value={rows.length} />
        <Summary label="Zakończone" value={doneCount} />
        <Summary label="Wymaga reakcji" value={blockedCount} />
      </section>

      <section style={cardStyle}>
        <div style={tableHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Klienci w onboardingu</h2>
            <p style={hintStyle}>Lista pokazuje klientów ze statusem onboarding lub z powiązanymi umowami startowymi.</p>
          </div>
          <select style={filterStyle} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="Wszystkie">Wszystkie statusy</option>
            <option value="Do rozpoczęcia">Do rozpoczęcia</option>
            <option value="W trakcie">W trakcie</option>
            <option value="Czeka na formalności">Czeka na formalności</option>
            <option value="Zakończony">Zakończony</option>
          </select>
        </div>

        {loading ? <div style={emptyStyle}>Ładowanie onboardingu...</div> : filteredRows.length === 0 ? <div style={emptyStyle}>Brak klientów dla wybranego filtra.</div> : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Klient</Th>
                  <Th>Opiekun</Th>
                  <Th>Status</Th>
                  <Th>Postęp</Th>
                  <Th>Następny krok</Th>
                  <Th>Umowa</Th>
                  <Th>RODO</Th>
                  <Th>AML</Th>
                  <Th>Szczegóły</Th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.client.id} style={rowStyle}>
                    <Td strong>{row.client.nazwa || "Bez nazwy"}<Small>{row.client.nip || "Brak NIP"}</Small></Td>
                    <Td>{caregiverLabel(row.client)}</Td>
                    <Td><StatusPill status={row.status} /></Td>
                    <Td><Progress value={row.progress} /></Td>
                    <Td>{row.nextStep}</Td>
                    <Td><StagePill stage={row.stages[0]} /></Td>
                    <Td><StagePill stage={row.stages[1]} /></Td>
                    <Td><StagePill stage={row.stages[2]} /></Td>
                    <Td><button style={secondaryButtonStyle} onClick={() => { setSelectedRow(row); setHistoryOpen(false); }}>Szczegóły</button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRow && (
        <aside style={overlayStyle} onClick={() => setSelectedRow(null)}>
          <div style={drawerStyle} onClick={(event) => event.stopPropagation()}>
            <div style={drawerHeaderStyle}>
              <div>
                <p style={eyebrowStyle}>Onboarding klienta</p>
                <h2 style={drawerTitleStyle}>{selectedRow.client.nazwa || "Klient"}</h2>
                <p style={drawerSubtitleStyle}>{selectedRow.client.nip || "Brak NIP"} · {selectedRow.client.forma_prawna || "Brak formy prawnej"} · {selectedRow.client.forma_opodatkowania || "Brak opodatkowania"}</p>
              </div>
              <button style={closeButtonStyle} onClick={() => setSelectedRow(null)}><X size={22} /></button>
            </div>

            <section style={drawerSummaryStyle}>
              <Summary label="Status" value={selectedRow.status} />
              <Summary label="Postęp" value={`${selectedRow.progress}%`} />
              <Summary label="Pierwszy okres" value={selectedRow.client.pierwszy_okres_rozliczeniowy || "Brak"} />
            </section>

            <section style={drawerSectionStyle}>
              <div style={sectionHeaderInlineStyle}>
                <h3 style={drawerSectionTitleStyle}>Etapy startu</h3>
                <button style={secondaryButtonStyle} onClick={() => setHistoryOpen((current) => !current)}>Historia zmian</button>
              </div>
              <div style={stageGridStyle}>
                {selectedRow.stages.map((stage) => <StageCard key={stage.key} stage={stage} />)}
              </div>
            </section>

            <section style={drawerSectionStyle}>
              <h3 style={drawerSectionTitleStyle}>Zadania onboardingowe</h3>
              <div style={taskListStyle}>
                {buildOnboardingTasks(selectedRow).map((task) => <TaskRow key={task.title} {...task} />)}
              </div>
            </section>

            {historyOpen && (
              <section style={drawerSectionStyle}>
                <h3 style={drawerSectionTitleStyle}>Historia modyfikacji</h3>
                {selectedRow.history.length === 0 ? <div style={emptyStyle}>Brak historii dla tego onboardingu.</div> : (
                  <div style={historyListStyle}>
                    {selectedRow.history.map((entry, index) => (
                      <div key={`${entry.at}-${index}`} style={historyItemStyle}>
                        <strong>{formatDateTime(entry.at)}</strong>
                        <span>{entry.user}</span>
                        <p>{entry.description}</p>
                        <small>{entry.source}</small>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

function buildRows(clients: Client[], contracts: CrmContract[], rodoContracts: RodoProcessingContract[], profilesById: Record<string, Profile>): OnboardingRow[] {
  const onboardingClients = clients.filter((client) => {
    const status = normalize(client.status_klienta);
    const hasContract = contracts.some((contract) => matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta));
    const hasRodoContract = rodoContracts.some((contract) => matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta));
    return status === "onboarding" || hasContract || hasRodoContract;
  });

  return onboardingClients.map((client) => {
    const accountingContract = contracts.find((contract) => matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta)) || null;
    const rodoContract = rodoContracts.find((contract) => matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta)) || null;
    const stages = buildStages(accountingContract, rodoContract);
    const done = stages.filter((stage) => stage.state === "done").length;
    const progress = Math.round((done / stages.length) * 100);
    const nextStep = stages.find((stage) => stage.state !== "done")?.title || "Gotowy do obsługi";
    const status = resolveOnboardingStatus(stages, progress);

    return {
      client,
      accountingContract,
      rodoContract,
      stages,
      progress,
      nextStep,
      status,
      history: buildHistory(accountingContract, rodoContract, profilesById),
    };
  }).sort((a, b) => a.progress - b.progress || (a.client.nazwa || "").localeCompare(b.client.nazwa || "", "pl"));
}

function buildStages(accountingContract: CrmContract | null, rodoContract: RodoProcessingContract | null): OnboardingStage[] {
  return [
    {
      key: "contract",
      title: "Umowa księgowa",
      description: accountingContract ? contractStatusLabel(accountingContract.status) : "Brak powiązanej umowy księgowej.",
      state: accountingContract?.status === "podpisana" || accountingContract?.podpisany_pdf_path ? "done" : accountingContract ? "progress" : "blocked",
      moduleLabel: "Przejdź do umów",
      href: "/crm/umowy",
    },
    {
      key: "rodo",
      title: "Umowa powierzenia",
      description: rodoContract ? rodoStatusLabel(rodoContract.status) : "Brak powiązanej umowy powierzenia.",
      state: rodoContract?.status === "podpisana" || rodoContract?.podpisany_pdf_path ? "done" : rodoContract ? "progress" : "blocked",
      moduleLabel: "Przejdź do RODO",
      href: "/rodo",
    },
    {
      key: "aml",
      title: "AML",
      description: "Do obsługi w module AML. Onboarding tylko pokazuje, że etap jest wymagany.",
      state: "todo",
      moduleLabel: "Przejdź do AML",
      href: "/aml",
    },
    {
      key: "powers",
      title: "Pełnomocnictwa ZUS/US",
      description: "Formularze albo instrukcje online. Status będzie oznaczany w onboardingu.",
      state: "todo",
    },
    {
      key: "wfirma",
      title: "Konfiguracja wFirma",
      description: "Konto klienta, opiekun, daty, VAT, US, ZUS oraz ustawienia KH/KU.",
      state: "todo",
    },
    {
      key: "drive",
      title: "Dysk i komunikacja",
      description: "Dysk Google, foldery, kontakt Gmail, newsletter i instrukcja dla klienta.",
      state: "todo",
    },
    {
      key: "recurring",
      title: "Zadania cykliczne",
      description: "Szablony miesięczne i roczne pozostają w ustawieniach oraz rozliczeniach.",
      state: "todo",
      moduleLabel: "Przejdź do ustawień",
      href: "/uzytkownicy",
    },
  ];
}

function buildHistory(contract: CrmContract | null, rodoContract: RodoProcessingContract | null, profilesById: Record<string, Profile>): HistoryEntry[] {
  const history: HistoryEntry[] = [];
  if (contract) {
    history.push({
      at: contract.created_at,
      user: "System CRSS",
      source: "Umowy księgowe",
      description: `Utworzono umowę księgową ${contract.numer_umowy || "bez numeru"}.`,
    });
    if (contract.updated_at && contract.updated_at !== contract.created_at) {
      history.push({
        at: contract.updated_at,
        user: "System CRSS",
        source: "Umowy księgowe",
        description: `Zmieniono status umowy księgowej na „${contractStatusLabel(contract.status)}”.`,
      });
    }
  }
  if (rodoContract) {
    const user = profileLabel(rodoContract.created_by, profilesById);
    history.push({
      at: rodoContract.created_at,
      user,
      source: "RODO",
      description: `Utworzono umowę powierzenia ${rodoContract.numer_umowy || "bez numeru"}.`,
    });
    if (rodoContract.updated_at && rodoContract.updated_at !== rodoContract.created_at) {
      history.push({
        at: rodoContract.updated_at,
        user,
        source: "RODO",
        description: `Zmieniono status umowy powierzenia na „${rodoStatusLabel(rodoContract.status)}”.`,
      });
    }
  }
  return history.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
}

function buildOnboardingTasks(row: OnboardingRow) {
  return [
    { title: "Umowa księgowa podpisana", done: row.stages[0].state === "done", href: "/crm/umowy" },
    { title: "Umowa powierzenia podpisana i wpisana do rejestru", done: row.stages[1].state === "done", href: "/rodo" },
    { title: "AML zweryfikowany w module AML", done: row.stages[2].state === "done", href: "/aml" },
    { title: "Pełnomocnictwa ZUS i US wysłane lub otrzymane", done: false },
    { title: "Konfiguracja wFirma wykonana", done: false },
    { title: "Dysk Google i foldery klienta utworzone", done: false },
    { title: "Zadania cykliczne dobrane do klienta", done: false, href: "/uzytkownicy" },
  ];
}

function resolveOnboardingStatus(stages: OnboardingStage[], progress: number) {
  if (progress === 100) return "Zakończony";
  if (stages.some((stage) => stage.state === "blocked")) return "Czeka na formalności";
  if (progress === 0) return "Do rozpoczęcia";
  return "W trakcie";
}

function indexProfiles(profiles: Profile[]) {
  return profiles.reduce<Record<string, Profile>>((acc, profile) => {
    acc[profile.id] = profile;
    return acc;
  }, {});
}

function profileLabel(userId: string | null | undefined, profilesById: Record<string, Profile>) {
  if (!userId) return "Brak danych o użytkowniku";
  const profile = profilesById[userId];
  return profile?.full_name || profile?.email || "Brak danych o użytkowniku";
}

function caregiverLabel(client: Client) {
  const profile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  return profile?.full_name || profile?.email || "Brak opiekuna";
}

function matchesClient(client: Client, klientId: string | null | undefined, nip: string | null | undefined, name: string | null | undefined) {
  if (klientId && klientId === client.id) return true;
  if (client.nip && nip && normalize(client.nip) === normalize(nip)) return true;
  if (client.nazwa && name && normalize(client.nazwa) === normalize(name)) return true;
  return false;
}

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function contractStatusLabel(status: string | null) {
  if (status === "podpisana") return "Podpisana";
  if (status === "wygenerowana") return "Wygenerowana";
  if (status === "wyslana_do_podpisu") return "Wysłana do podpisu";
  if (status === "anulowana") return "Anulowana";
  return "Szkic";
}

function rodoStatusLabel(status: string | null) {
  return contractStatusLabel(status);
}

function formatDateTime(value: string | null) {
  if (!value) return "Brak daty";
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div style={summaryStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function Th({ children }: { children: ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <td style={{ ...tdStyle, fontWeight: strong ? 850 : 650 }}>{children}</td>;
}

function Small({ children }: { children: ReactNode }) {
  return <small style={smallTextStyle}>{children}</small>;
}

function Progress({ value }: { value: number }) {
  return <div style={progressShellStyle}><div style={{ ...progressBarStyle, width: `${value}%` }} /><span>{value}%</span></div>;
}

function StatusPill({ status }: { status: string }) {
  const style = status === "Zakończony" ? successPillStyle : status.includes("Czeka") ? warningPillStyle : neutralPillStyle;
  return <span style={style}>{status}</span>;
}

function StagePill({ stage }: { stage: OnboardingStage }) {
  const style = stage.state === "done" ? successPillStyle : stage.state === "blocked" ? dangerPillStyle : stage.state === "progress" ? warningPillStyle : neutralPillStyle;
  return <span style={style}>{stage.state === "done" ? "Gotowe" : stage.state === "blocked" ? "Brak" : stage.state === "progress" ? "W toku" : "Do wykonania"}</span>;
}

function StageCard({ stage }: { stage: OnboardingStage }) {
  return (
    <div style={stageCardStyle}>
      <div style={stageCardHeaderStyle}>
        <h4 style={stageTitleStyle}>{stage.title}</h4>
        <StagePill stage={stage} />
      </div>
      <p style={stageDescriptionStyle}>{stage.description}</p>
      {stage.href && <Link href={stage.href} style={secondaryButtonStyle}>{stage.moduleLabel || "Przejdź"}</Link>}
    </div>
  );
}

function TaskRow({ title, done, href }: { title: string; done: boolean; href?: string }) {
  return (
    <div style={taskRowStyle}>
      <span style={done ? taskDoneDotStyle : taskTodoDotStyle} />
      <strong>{title}</strong>
      {href && <Link href={href} style={smallLinkStyle}>Otwórz moduł</Link>}
    </div>
  );
}

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "24px" };
const eyebrowStyle: CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850 };
const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.05 };
const subtitleStyle: CSSProperties = { margin: "12px 0 0", color: colors.muted, fontSize: "17px", lineHeight: 1.65, maxWidth: "900px" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px", marginBottom: "22px" };
const summaryStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "18px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 800 };
const cardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "26px", boxShadow: shadow.soft };
const tableHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "18px" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const hintStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.55 };
const filterStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "11px 13px", minHeight: "44px", minWidth: "220px", fontWeight: 800 };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", padding: "14px 12px", color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "14px 12px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle" };
const rowStyle: CSSProperties = { background: colors.white };
const smallTextStyle: CSSProperties = { display: "block", marginTop: "6px", color: colors.muted, fontSize: "12px", fontWeight: 650 };
const emptyStyle: CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.muted, padding: "18px", fontWeight: 800, textAlign: "center" };
const pillBaseStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: radius.badge, padding: "7px 11px", fontWeight: 850, fontSize: "12px", whiteSpace: "nowrap" };
const successPillStyle: CSSProperties = { ...pillBaseStyle, background: "#dcfce7", color: colors.success };
const warningPillStyle: CSSProperties = { ...pillBaseStyle, background: "#fef3c7", color: "#a16207" };
const dangerPillStyle: CSSProperties = { ...pillBaseStyle, background: "#fee2e2", color: colors.danger };
const neutralPillStyle: CSSProperties = { ...pillBaseStyle, background: "rgba(23, 59, 115, 0.10)", color: colors.navy };
const progressShellStyle: CSSProperties = { position: "relative", width: "110px", height: "30px", borderRadius: radius.badge, background: "#eef2f7", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: colors.navy, fontWeight: 900, fontSize: "12px" };
const progressBarStyle: CSSProperties = { position: "absolute", left: 0, top: 0, bottom: 0, background: "rgba(22, 163, 74, 0.18)" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "10px 13px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const overlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(15, 23, 42, 0.32)", display: "flex", justifyContent: "flex-end" };
const drawerStyle: CSSProperties = { width: "min(1040px, calc(100vw - 270px))", minHeight: "100vh", background: colors.card, borderLeft: `1px solid ${colors.border}`, padding: "30px", overflowY: "auto", boxShadow: "-12px 0 30px rgba(15, 23, 42, 0.12)" };
const drawerHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "18px" };
const drawerTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "30px" };
const drawerSubtitleStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, fontWeight: 700 };
const closeButtonStyle: CSSProperties = { width: "46px", height: "46px", borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const drawerSummaryStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "18px" };
const drawerSectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.inputBackground, padding: "18px", marginBottom: "16px" };
const sectionHeaderInlineStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "14px" };
const drawerSectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "22px" };
const stageGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" };
const stageCardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "15px", display: "flex", flexDirection: "column", gap: "10px" };
const stageCardHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" };
const stageTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "17px" };
const stageDescriptionStyle: CSSProperties = { margin: 0, color: colors.muted, lineHeight: 1.5, fontWeight: 650 };
const taskListStyle: CSSProperties = { display: "grid", gap: "9px" };
const taskRowStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "12px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "10px", alignItems: "center", color: colors.text };
const taskDoneDotStyle: CSSProperties = { width: "11px", height: "11px", borderRadius: "999px", background: colors.success };
const taskTodoDotStyle: CSSProperties = { width: "11px", height: "11px", borderRadius: "999px", background: "#f59e0b" };
const smallLinkStyle: CSSProperties = { color: colors.navy, fontWeight: 850, textDecoration: "none", whiteSpace: "nowrap" };
const historyListStyle: CSSProperties = { display: "grid", gap: "10px" };
const historyItemStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "12px", display: "grid", gap: "4px", color: colors.text };
