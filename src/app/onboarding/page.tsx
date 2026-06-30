"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
import { fetchClients } from "@/lib/clientService";
import { fetchCrmContracts, type CrmContract } from "@/lib/crmContractService";
import { fetchRodoProcessingContracts, type RodoProcessingContract } from "@/lib/rodoProcessingContractService";
import {
  ensureClientOnboarding,
  fetchOnboardingHistory,
  fetchOnboardingStages,
  stageLabel,
  statusLabel,
  updateOnboardingStageStatus,
  type OnboardingHistoryRecord,
  type OnboardingStageKey,
  type OnboardingStageRecord,
  type OnboardingStageStatus,
} from "@/lib/onboardingService";
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
const STATUS_FILTER_OPTIONS = [
  { value: "Wszystkie", label: "Wszystkie statusy" },
  { value: "Do rozpoczęcia", label: "Do rozpoczęcia" },
  { value: "W trakcie", label: "W trakcie" },
  { value: "Czeka na formalności", label: "Czeka na formalności" },
  { value: "Zakończony", label: "Zakończony" },
];

type OnboardingStage = {
  key: OnboardingStageKey;
  title: string;
  description: string;
  state: StageState;
  editable?: boolean;
  record?: OnboardingStageRecord;
  moduleLabel?: string;
  href?: string;
  actionLabel?: string;
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
  const [onboardingStages, setOnboardingStages] = useState<OnboardingStageRecord[]>([]);
  const [onboardingHistory, setOnboardingHistory] = useState<OnboardingHistoryRecord[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [savingStageId, setSavingStageId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("Wszystkie");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historySectionRef = useRef<HTMLElement | null>(null);

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

    const nextClients = clientsResult.error ? [] : ((clientsResult.data || []) as unknown as Client[]);
    const nextContracts = contractsResult.error ? [] : ((contractsResult.data || []) as CrmContract[]);
    const nextRodoContracts = rodoResult.error ? [] : ((rodoResult.data || []) as RodoProcessingContract[]);

    if (clientsResult.error) console.error("Błąd pobierania klientów do onboardingu:", clientsResult.error);
    if (contractsResult.error) console.error("Błąd pobierania umów do onboardingu:", contractsResult.error);
    if (rodoResult.error) console.error("Błąd pobierania umów RODO do onboardingu:", rodoResult.error);
    if (profilesResult.error) console.error("Błąd pobierania użytkowników do historii onboardingu:", profilesResult.error);

    const onboardingClientIds = findOnboardingClientIds(nextClients, nextContracts, nextRodoContracts);
    if (onboardingClientIds.length > 0) {
      await Promise.all(onboardingClientIds.map((clientId) => ensureClientOnboarding(clientId)));
    }

    const [stagesResult, historyResult] = await Promise.all([
      fetchOnboardingStages(),
      fetchOnboardingHistory(),
    ]);

    if (stagesResult.error) console.error("Błąd pobierania etapów onboardingu:", stagesResult.error);
    if (historyResult.error) console.error("Błąd pobierania historii onboardingu:", historyResult.error);

    setClients(nextClients);
    setContracts(nextContracts);
    setRodoContracts(nextRodoContracts);
    setProfilesById(profilesResult.error ? {} : indexProfiles((profilesResult.data || []) as Profile[]));
    setOnboardingStages(stagesResult.error ? [] : ((stagesResult.data || []) as OnboardingStageRecord[]));
    setOnboardingHistory(historyResult.error ? [] : ((historyResult.data || []) as OnboardingHistoryRecord[]));
    setLoading(false);
  }

  const rows = useMemo(
    () => buildRows(clients, contracts, rodoContracts, onboardingStages, onboardingHistory, profilesById),
    [clients, contracts, rodoContracts, onboardingStages, onboardingHistory, profilesById]
  );
  const selectedRow = rows.find((row) => row.client.id === selectedClientId) || null;
  const filteredRows = rows.filter((row) => statusFilter === "Wszystkie" || row.status === statusFilter);
  const blockedCount = rows.filter((row) => row.status === "Czeka na formalności").length;
  const doneCount = rows.filter((row) => row.status === "Zakończony").length;

  async function handleStageStatusChange(stage: OnboardingStage, status: OnboardingStageStatus) {
    if (!stage.record) return;
    setSavingStageId(stage.record.id);
    const result = await updateOnboardingStageStatus(stage.record, status);
    setSavingStageId(null);

    if (result.error) {
      alert("Nie udało się zapisać etapu onboardingu.");
      return;
    }

    await loadData();
  }

  function openHistory() {
    setHistoryOpen(true);
    window.setTimeout(() => {
      historySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

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
          <AppSelect style={filterStyle} value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} />
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
                    <Td><button style={secondaryButtonStyle} onClick={() => { setSelectedClientId(row.client.id); setHistoryOpen(false); }}>Szczegóły</button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRow && (
        <aside style={overlayStyle} onClick={() => setSelectedClientId(null)}>
          <div style={drawerStyle} onClick={(event) => event.stopPropagation()}>
            <div style={drawerHeaderStyle}>
              <div>
                <p style={eyebrowStyle}>Onboarding klienta</p>
                <h2 style={drawerTitleStyle}>{selectedRow.client.nazwa || "Klient"}</h2>
                <p style={drawerSubtitleStyle}>{selectedRow.client.nip || "Brak NIP"} · {selectedRow.client.forma_prawna || "Brak formy prawnej"} · {selectedRow.client.forma_opodatkowania || "Brak opodatkowania"}</p>
              </div>
              <button style={closeButtonStyle} onClick={() => setSelectedClientId(null)}><X size={22} /></button>
            </div>

            <section style={drawerSummaryStyle}>
              <Summary label="Status" value={selectedRow.status} />
              <Summary label="Postęp" value={`${selectedRow.progress}%`} />
              <Summary label="Pierwszy okres" value={selectedRow.client.pierwszy_okres_rozliczeniowy || "Brak"} />
            </section>

            <section style={drawerSectionStyle}>
              <div style={sectionHeaderInlineStyle}>
                <h3 style={drawerSectionTitleStyle}>Proces rozpoczęcia współpracy</h3>
                <button style={secondaryButtonStyle} onClick={openHistory}>Historia zmian</button>
              </div>
              <div style={stageGridStyle}>
                {selectedRow.stages.map((stage) => (
                  <StageCard
                    key={stage.key}
                    stage={stage}
                    saving={savingStageId === stage.record?.id}
                    onStatusChange={(status) => handleStageStatusChange(stage, status)}
                  />
                ))}
              </div>
            </section>

            {historyOpen && (
              <section ref={historySectionRef} style={drawerSectionStyle}>
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

function findOnboardingClientIds(clients: Client[], contracts: CrmContract[], rodoContracts: RodoProcessingContract[]) {
  return clients
    .filter((client) => {
      const status = normalize(client.status_klienta);
      const hasContract = contracts.some((contract) => matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta));
      const hasRodoContract = rodoContracts.some((contract) => matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta));
      return status === "onboarding" || hasContract || hasRodoContract;
    })
    .map((client) => client.id);
}

function buildRows(
  clients: Client[],
  contracts: CrmContract[],
  rodoContracts: RodoProcessingContract[],
  onboardingStages: OnboardingStageRecord[],
  onboardingHistory: OnboardingHistoryRecord[],
  profilesById: Record<string, Profile>
): OnboardingRow[] {
  const onboardingClientIds = new Set(findOnboardingClientIds(clients, contracts, rodoContracts));
  const onboardingClients = clients.filter((client) => onboardingClientIds.has(client.id));

  return onboardingClients.map((client) => {
    const accountingContract = contracts.find((contract) => matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta)) || null;
    const rodoContract = rodoContracts.find((contract) => matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta)) || null;
    const clientStages = onboardingStages.filter((stage) => stage.klient_id === client.id);
    const clientHistory = onboardingHistory.filter((entry) => entry.klient_id === client.id);
    const stages = buildStages(accountingContract, rodoContract, clientStages);
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
      history: buildHistory(accountingContract, rodoContract, clientHistory, profilesById),
    };
  }).sort((a, b) => a.progress - b.progress || (a.client.nazwa || "").localeCompare(b.client.nazwa || "", "pl"));
}

function buildStages(accountingContract: CrmContract | null, rodoContract: RodoProcessingContract | null, records: OnboardingStageRecord[]): OnboardingStage[] {
  const recordByKey = records.reduce<Partial<Record<OnboardingStageKey, OnboardingStageRecord>>>((acc, record) => {
    acc[record.etap] = record;
    return acc;
  }, {});

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
    buildManualStage("aml", "Do obsługi w module AML. Onboarding pokazuje status wykonania etapu.", recordByKey.aml, "/aml", "Przejdź do AML"),
    buildManualStage("client_card", "Dane organizacyjne klienta potrzebne do rozpoczęcia obsługi w biurze.", recordByKey.client_card, undefined, undefined, "Wyślij e-mail"),
    buildManualStage("powers", "Instrukcje i pełnomocnictwa dotyczące ZUS oraz US.", recordByKey.powers, undefined, undefined, "Wyślij instrukcję e-mailem"),
    buildManualStage("wfirma", "Konfiguracja konta klienta i ustawień operacyjnych w systemie wFirma.", recordByKey.wfirma, undefined, undefined, "Szczegóły"),
  ];
}

function buildManualStage(key: OnboardingStageKey, description: string, record?: OnboardingStageRecord, href?: string, moduleLabel?: string, actionLabel?: string): OnboardingStage {
  return {
    key,
    title: stageLabel(key),
    description: record ? statusLabel(record.status) : description,
    state: stageStateFromStatus(record?.status),
    editable: true,
    record,
    href,
    moduleLabel,
    actionLabel,
  };
}

function buildHistory(
  contract: CrmContract | null,
  rodoContract: RodoProcessingContract | null,
  onboardingHistory: OnboardingHistoryRecord[],
  profilesById: Record<string, Profile>
): HistoryEntry[] {
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

  onboardingHistory.forEach((entry) => {
    history.push({
      at: entry.created_at,
      user: profileLabel(entry.created_by, profilesById),
      source: "Onboarding",
      description: entry.opis,
    });
  });

  return history.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
}

function resolveOnboardingStatus(stages: OnboardingStage[], progress: number) {
  if (progress === 100) return "Zakończony";
  if (stages.some((stage) => stage.state === "blocked")) return "Czeka na formalności";
  if (progress === 0) return "Do rozpoczęcia";
  return "W trakcie";
}

function stageStateFromStatus(status: OnboardingStageStatus | null | undefined): StageState {
  if (status === "gotowe") return "done";
  if (status === "w_toku") return "progress";
  if (status === "zablokowane") return "blocked";
  return "todo";
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

function StageCard({
  stage,
  saving,
  onStatusChange,
}: {
  stage: OnboardingStage;
  saving: boolean;
  onStatusChange: (status: OnboardingStageStatus) => void;
}) {
  return (
    <div style={stageCardStyle}>
      <div style={stageCardHeaderStyle}>
        <h4 style={stageTitleStyle}>{stage.title}</h4>
        <StagePill stage={stage} />
      </div>
      <p style={stageDescriptionStyle}>{stage.description}</p>
      <div style={stageActionsStyle}>
        {stage.href && <Link href={stage.href} style={secondaryButtonStyle}>{stage.moduleLabel || "Przejdź"}</Link>}
        {stage.actionLabel && <button type="button" style={secondaryButtonStyle}>{stage.actionLabel}</button>}
        {stage.editable && stage.record && (
          <>
            <button style={smallButtonStyle} disabled={saving} onClick={() => onStatusChange("w_toku")}>W toku</button>
            <button style={smallButtonStyle} disabled={saving} onClick={() => onStatusChange("gotowe")}>Gotowe</button>
          </>
        )}
      </div>
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
const filterStyle: CSSProperties = { width: "220px", flex: "0 0 220px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "11px 13px", minHeight: "44px", fontWeight: 800 };
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
const overlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(15, 23, 42, 0.32)", display: "flex", justifyContent: "center", alignItems: "stretch", padding: "18px" };
const drawerStyle: CSSProperties = { width: "min(1480px, 100%)", height: "calc(100vh - 36px)", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "30px", overflowY: "auto", boxShadow: shadow.card };
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
const stageActionsStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" };
const smallButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "8px 10px", fontWeight: 850, cursor: "pointer" };
const dangerSmallButtonStyle: CSSProperties = { ...smallButtonStyle, background: "#fff1f2", color: colors.danger };
const historyListStyle: CSSProperties = { display: "grid", gap: "10px" };
const historyItemStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "12px", display: "grid", gap: "4px", color: colors.text };
