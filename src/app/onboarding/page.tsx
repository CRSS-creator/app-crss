"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
import { fetchClientCaregivers, fetchClients } from "@/lib/clientService";
import { fetchCrmContracts, type CrmContract } from "@/lib/crmContractService";
import { fetchRodoProcessingContracts, type RodoProcessingContract } from "@/lib/rodoProcessingContractService";
import {
  ensureClientOnboarding,
  fetchOnboardingHistory,
  fetchOnboardingStages,
  stageLabel,
  statusLabel,
  updateOnboardingStageNotes,
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
  obsluga_kadrowa: boolean | null;
  status_klienta: string | null;
  pierwszy_okres_rozliczeniowy: string | null;
  opiekun_id: string | null;
  profiles?: CaregiverProfile | CaregiverProfile[] | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role?: string | null;
  aktywne?: boolean | null;
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
  responsibleLabel: string;
  fullWidth?: boolean;
  actionInfo?: string;
  checklist?: OnboardingChecklistItem[];
};

type OnboardingChecklistItem = {
  id: string;
  label: string;
  group?: string;
  done: boolean;
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
  notesStage: OnboardingStageRecord | null;
  onboardingNotes: string;
  progress: number;
  nextStep: string;
  status: string;
  history: HistoryEntry[];
  caregiverNotificationInfo?: string;
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
  const [caregivers, setCaregivers] = useState<Profile[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStageId, setSavingStageId] = useState<string | null>(null);
  const [savingCaregiver, setSavingCaregiver] = useState(false);
  const [sendingCaregiverNotification, setSendingCaregiverNotification] = useState(false);
  const [sendingPowersInstructions, setSendingPowersInstructions] = useState(false);
  const [sendingWfirmaAccountNotification, setSendingWfirmaAccountNotification] = useState(false);
  const [sendingDocumentsNotification, setSendingDocumentsNotification] = useState(false);
  const [sendingClientCardRequest, setSendingClientCardRequest] = useState(false);
  const [savingChecklistId, setSavingChecklistId] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState("Wszystkie");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedChecklistStages, setExpandedChecklistStages] = useState<Record<string, boolean>>({});
  const historySectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [clientsResult, contractsResult, rodoResult, profilesResult, caregiversResult, userResult] = await Promise.all([
      fetchClients(),
      fetchCrmContracts(),
      fetchRodoProcessingContracts(),
      supabase.from("profiles").select("id, full_name, email, role, aktywne"),
      fetchClientCaregivers(),
      supabase.auth.getUser(),
    ]);

    const nextClients = clientsResult.error ? [] : ((clientsResult.data || []) as unknown as Client[]);
    const nextContracts = contractsResult.error ? [] : ((contractsResult.data || []) as CrmContract[]);
    const nextRodoContracts = rodoResult.error ? [] : ((rodoResult.data || []) as RodoProcessingContract[]);

    if (clientsResult.error) console.error("Błąd pobierania klientów do onboardingu:", clientsResult.error);
    if (contractsResult.error) console.error("Błąd pobierania umów do onboardingu:", contractsResult.error);
    if (rodoResult.error) console.error("Błąd pobierania umów RODO do onboardingu:", rodoResult.error);
    if (profilesResult.error) console.error("Błąd pobierania użytkowników do historii onboardingu:", profilesResult.error);

    if (caregiversResult.error) console.error("Nie udało się pobrać opiekunów do onboardingu:", caregiversResult.error);

    const onboardingClientIds = findOnboardingClientIds(nextClients, nextContracts);
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
    const nextProfilesById = profilesResult.error ? {} : indexProfiles((profilesResult.data || []) as Profile[]);
    setProfilesById(nextProfilesById);
    setCurrentUserRole(nextProfilesById[userResult.data.user?.id || ""]?.role || null);
    setCaregivers(caregiversResult.error ? [] : ((caregiversResult.data || []) as Profile[]));
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
  const currentRole = (currentUserRole || "").toLowerCase();
  const canAssignCaregiver = currentRole === "manager" || currentRole === "owner";

  useEffect(() => {
    setNotesDraft(selectedRow?.onboardingNotes || "");
  }, [selectedRow?.client.id, selectedRow?.onboardingNotes]);

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

  async function handleCaregiverChange(client: Client, caregiverId: string) {
    if (!canAssignCaregiver) {
      alert("Opiekuna księgowego może ustawić tylko owner albo manager.");
      return;
    }

    setSavingCaregiver(true);
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    const response = await fetch("/api/onboarding/caregiver-assignment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ clientId: client.id, caregiverId: caregiverId || null }),
    });
    setSavingCaregiver(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nie udało się zapisać opiekuna księgowego.");
      return;
    }

    await loadData();
  }

  async function handleCaregiverNotification(row: OnboardingRow) {
    if (!canAssignCaregiver) {
      alert("Informację o opiekunie może wysłać tylko owner albo manager.");
      return;
    }

    if (!row.client.opiekun_id) {
      alert("Najpierw wybierz opiekuna księgowego.");
      return;
    }

    if (!row.client.email) {
      alert("Klient nie ma uzupełnionego adresu e-mail.");
      return;
    }

    setSendingCaregiverNotification(true);
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    const response = await fetch("/api/onboarding/caregiver-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ clientId: row.client.id }),
    });
    setSendingCaregiverNotification(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nie udało się wysłać informacji o opiekunie.");
      return;
    }

    await loadData();
  }

  async function handleStageAction(stage: OnboardingStage, row: OnboardingRow) {
    if (!row.client.email) {
      alert("Klient nie ma uzupełnionego adresu e-mail.");
      return;
    }

    if (stage.key === "client_card") {
      setSendingClientCardRequest(true);
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token;
      const response = await fetch("/api/onboarding/client-card-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ clientId: row.client.id }),
      });
      setSendingClientCardRequest(false);

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        alert(data?.error || "Nie udało się wysłać karty klienta.");
        return;
      }

      await loadData();
      return;
    }

    if (stage.key === "wfirma_account") {
      setSendingWfirmaAccountNotification(true);
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token;
      const response = await fetch("/api/onboarding/wfirma-account-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ clientId: row.client.id }),
      });
      setSendingWfirmaAccountNotification(false);

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        alert(data?.error || "Nie udało się wysłać powiadomienia o koncie wFirma.");
        return;
      }

      await loadData();
      return;
    }

    if (stage.key === "documents_takeover") {
      setSendingDocumentsNotification(true);
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token;
      const response = await fetch("/api/onboarding/documents-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ clientId: row.client.id }),
      });
      setSendingDocumentsNotification(false);

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        alert(data?.error || "Nie udało się wysłać listy dokumentów.");
        return;
      }

      await loadData();
      return;
    }

    if (stage.key !== "powers") return;

    setSendingPowersInstructions(true);
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    const response = await fetch("/api/onboarding/powers-instructions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ clientId: row.client.id }),
    });
    setSendingPowersInstructions(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error || "Nie udało się wysłać instrukcji pełnomocnictw.");
      return;
    }

    await loadData();
  }

  async function handleChecklistChange(stage: OnboardingStage, item: OnboardingChecklistItem, checked: boolean) {
    if (!stage.record) return;

    const nextState = {
      ...parseStageNotes(stage.record.uwagi),
      wfirmaChecklist: {
        ...parseStageNotes(stage.record.uwagi).wfirmaChecklist,
        [item.id]: checked,
      },
    };

    setSavingChecklistId(`${stage.record.id}-${item.id}`);
    const result = await updateOnboardingStageNotes(
      stage.record,
      JSON.stringify(nextState),
      `${checked ? "Oznaczono jako wykonane" : "Odznaczono"} zadanie konfiguracji wFirma: ${item.label}.`
    );
    setSavingChecklistId(null);

    if (result.error) {
      alert("Nie udało się zapisać kroku konfiguracji wFirma.");
      return;
    }

    await loadData();
  }

  async function handleOnboardingNotesSave(row: OnboardingRow) {
    if (!row.notesStage || notesDraft === row.onboardingNotes) return;

    const nextState = {
      ...parseStageNotes(row.notesStage.uwagi),
      onboardingNotes: notesDraft.trim(),
    };

    setSavingNotes(true);
    const result = await updateOnboardingStageNotes(
      row.notesStage,
      JSON.stringify(nextState),
      "Zaktualizowano notatki onboardingu."
    );
    setSavingNotes(false);

    if (result.error) {
      alert("Nie udało się zapisać notatek onboardingu.");
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
            <p style={hintStyle}>Lista pokazuje klientów ze statusem onboarding lub z umową, która uruchomiła proces onboardingu.</p>
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
              <Summary label="Pierwszy okres" value={formatMonthLabel(selectedRow.client.pierwszy_okres_rozliczeniowy)} />
            </section>

            <section style={drawerSectionStyle}>
              <div style={caregiverSectionStyle}>
                <div>
                  <h3 style={drawerSectionTitleStyle}>Opiekun księgowy</h3>
                </div>
                <div style={caregiverActionsStyle}>
                  <AppSelect
                    style={caregiverSelectStyle}
                    value={selectedRow.client.opiekun_id || ""}
                    options={[
                      { value: "", label: "Brak opiekuna" },
                      ...caregivers.map((caregiver) => ({
                        value: caregiver.id,
                        label: caregiver.full_name || caregiver.email || "Użytkownik",
                      })),
                    ]}
                    onChange={(value) => handleCaregiverChange(selectedRow.client, value)}
                    disabled={savingCaregiver || !canAssignCaregiver}
                  />
                  {canAssignCaregiver && (
                    <div style={caregiverSendStackStyle}>
                      <button
                        type="button"
                        style={primaryActionButtonStyle}
                        disabled={savingCaregiver || sendingCaregiverNotification || !selectedRow.client.opiekun_id}
                        onClick={() => handleCaregiverNotification(selectedRow)}
                      >
                        {sendingCaregiverNotification ? "Wysyłanie..." : "Wyślij informację"}
                      </button>
                      {selectedRow.caregiverNotificationInfo && <small style={caregiverInfoStyle}>{selectedRow.caregiverNotificationInfo}</small>}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section style={drawerSectionStyle}>
              <div style={sectionHeaderInlineStyle}>
                <h3 style={drawerSectionTitleStyle}>Proces rozpoczęcia współpracy</h3>
                <button style={secondaryButtonStyle} onClick={openHistory}>Historia zmian</button>
              </div>
              <div style={processTableWrapperStyle}>
                <table style={processTableStyle}>
                  <thead>
                    <tr>
                      <th style={processThStyle}>Etap</th>
                      <th style={processThStyle}>Odpowiedzialny</th>
                      <th style={processThStyle}>Status</th>
                      <th style={processThStyle}>Akcja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRow.stages.map((stage) => {
                      const stageSaving =
                        savingStageId === stage.record?.id ||
                        (stage.key === "client_card" && sendingClientCardRequest) ||
                        (stage.key === "powers" && sendingPowersInstructions) ||
                        (stage.key === "wfirma_account" && sendingWfirmaAccountNotification) ||
                        (stage.key === "documents_takeover" && sendingDocumentsNotification);
                      const checklistKey = stage.record?.id || stage.key;

                      return (
                        <StageProcessRow
                          key={stage.key}
                          stage={stage}
                          saving={stageSaving}
                          savingChecklistId={savingChecklistId}
                          checklistExpanded={Boolean(expandedChecklistStages[checklistKey])}
                          onToggleChecklist={() => setExpandedChecklistStages((current) => ({ ...current, [checklistKey]: !current[checklistKey] }))}
                          onStatusChange={(status) => handleStageStatusChange(stage, status)}
                          onAction={() => handleStageAction(stage, selectedRow)}
                          onChecklistChange={(item, checked) => handleChecklistChange(stage, item, checked)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={drawerSectionStyle}>
              <div style={sectionHeaderInlineStyle}>
                <h3 style={drawerSectionTitleStyle}>Notatki onboardingu</h3>
                {savingNotes && <small style={stageActionInfoStyle}>Zapisywanie...</small>}
              </div>
              <textarea
                style={onboardingNotesTextareaStyle}
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                onBlur={() => handleOnboardingNotesSave(selectedRow)}
                placeholder="Dodaj ustalenia, ryzyka lub informacje ważne dla startu współpracy."
              />
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

function findOnboardingClientIds(clients: Client[], contracts: CrmContract[]) {
  return clients
    .filter((client) => {
      const status = normalize(client.status_klienta);
      const hasStartedContractOnboarding = contracts.some((contract) => (
        Boolean(contract.onboarding_uruchomiony_at) && matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta)
      ));
      return status === "onboarding" || hasStartedContractOnboarding;
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
  const onboardingClientIds = new Set(findOnboardingClientIds(clients, contracts));
  const onboardingClients = clients.filter((client) => onboardingClientIds.has(client.id));

  return onboardingClients.map((client) => {
    const accountingContract = contracts.find((contract) => matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta)) || null;
    const rodoContract = rodoContracts.find((contract) => matchesClient(client, contract.klient_id, contract.nip, contract.nazwa_klienta)) || null;
    const clientStages = onboardingStages.filter((stage) => stage.klient_id === client.id);
    const clientHistory = onboardingHistory.filter((entry) => entry.klient_id === client.id);
    const stages = buildStages(client, accountingContract, rodoContract, clientStages, clientHistory, profilesById);
    const notesStage = clientStages.find((stage) => stage.etap === "contract") || clientStages[0] || null;
    const onboardingNotes = parseStageNotes(notesStage?.uwagi).onboardingNotes;
    const done = stages.filter((stage) => stage.state === "done").length;
    const progress = Math.round((done / stages.length) * 100);
    const nextStep = stages.find((stage) => stage.state !== "done")?.title || "Gotowy do obsługi";
    const status = resolveOnboardingStatus(stages, progress);

    return {
      client,
      accountingContract,
      rodoContract,
      stages,
      notesStage,
      onboardingNotes,
      progress,
      nextStep,
      status,
      history: buildHistory(accountingContract, rodoContract, clientHistory, profilesById),
      caregiverNotificationInfo: latestCaregiverNotificationInfo(clientHistory, profilesById),
    };
  }).sort((a, b) => a.progress - b.progress || (a.client.nazwa || "").localeCompare(b.client.nazwa || "", "pl"));
}

function buildStages(
  client: Client,
  accountingContract: CrmContract | null,
  rodoContract: RodoProcessingContract | null,
  records: OnboardingStageRecord[],
  onboardingHistory: OnboardingHistoryRecord[],
  profilesById: Record<string, Profile>
): OnboardingStage[] {
  const recordByKey = records.reduce<Partial<Record<OnboardingStageKey, OnboardingStageRecord>>>((acc, record) => {
    acc[record.etap] = record;
    return acc;
  }, {});
  const ownerResponsible = profileByRoleLabel(profilesById, "owner", "Do przypisania");
  const adminResponsible = profileByRoleLabel(profilesById, "admin", "Do przypisania");
  const caregiverResponsible = caregiverLabel(client);

  const stages: OnboardingStage[] = [
    {
      key: "contract",
      title: "Umowa księgowa",
      description: accountingContract ? contractStatusLabel(accountingContract.status) : "Brak powiązanej umowy księgowej.",
      state: accountingContract?.status === "podpisana" || accountingContract?.podpisany_pdf_path ? "done" : accountingContract ? "progress" : "blocked",
      moduleLabel: "Przejdź do umów",
      href: "/crm/umowy",
      responsibleLabel: ownerResponsible,
      record: recordByKey.contract,
    },
    {
      key: "rodo",
      title: "Umowa powierzenia",
      description: rodoContract ? rodoStatusLabel(rodoContract.status) : "Brak powiązanej umowy powierzenia.",
      state: rodoContract?.status === "podpisana" || rodoContract?.podpisany_pdf_path ? "done" : rodoContract ? "progress" : "blocked",
      moduleLabel: "Przejdź do RODO",
      href: "/rodo",
      responsibleLabel: ownerResponsible,
      record: recordByKey.rodo,
    },
    buildManualStage("aml", "Do obsługi w module AML. Onboarding pokazuje status wykonania etapu.", recordByKey.aml, "/aml", "Przejdź do AML", undefined, undefined, adminResponsible),
  ];

  if (shouldShowClientCard(client, accountingContract)) {
    stages.push(buildManualStage("client_card", "Dane organizacyjne klienta potrzebne do rozpoczęcia obsługi w biurze.", recordByKey.client_card, undefined, undefined, "Wyślij e-mail", undefined, adminResponsible, latestClientCardRequestInfo(onboardingHistory, profilesById)));
  }

  stages.push(
    buildManualStage("powers", "Instrukcje i pełnomocnictwa dotyczące ZUS oraz US.", recordByKey.powers, undefined, undefined, "Wyślij instrukcje e-mailem", undefined, adminResponsible, latestInstructionInfo(onboardingHistory, profilesById)),
    buildManualStage(
      "wfirma_account",
      "Utworzenie konta klienta w systemie wFirma.",
      recordByKey.wfirma_account,
      undefined,
      undefined,
      "Wyślij powiadomienie",
      undefined,
      adminResponsible,
      latestWfirmaAccountNotificationInfo(onboardingHistory, profilesById) || "Wraz z powiadomieniem o utworzeniu konta wysyłana jest instrukcja integracji KSeF z wFirmą. W razie pytań prosimy o kontakt z opiekunem księgowym."
    ),
    {
      ...buildManualStage("wfirma", "Konfiguracja konta klienta i ustawień operacyjnych w systemie wFirma.", recordByKey.wfirma, undefined, undefined, undefined, undefined, caregiverResponsible),
      checklist: buildWfirmaChecklist(client.forma_prawna, recordByKey.wfirma),
    },
    buildManualStage(
      "documents_takeover",
      "Dokumenty i informacje potrzebne do przejęcia obsługi klienta.",
      recordByKey.documents_takeover,
      undefined,
      undefined,
      "Wyślij listę dokumentów",
      undefined,
      caregiverResponsible,
      latestDocumentsNotificationInfo(onboardingHistory, profilesById) || "Dokumenty klient powinien przesłać bezpośrednio do opiekuna księgowego."
    ),
  );

  return stages;
}

function buildManualStage(key: OnboardingStageKey, description: string, record?: OnboardingStageRecord, href?: string, moduleLabel?: string, actionLabel?: string, fullWidth?: boolean, responsibleLabel?: string, actionInfo?: string): OnboardingStage {
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
    responsibleLabel: responsibleLabel || responsibleLabelForStage(key),
    fullWidth,
    actionInfo,
  };
}

function buildWfirmaChecklist(legalForm: string | null | undefined, record?: OnboardingStageRecord): OnboardingChecklistItem[] {
  const saved = parseStageNotes(record?.uwagi).wfirmaChecklist;
  const tasks = isJdg(legalForm)
    ? [...WFIRMA_COMMON_TASKS, ...WFIRMA_JDG_TASKS]
    : [...WFIRMA_COMMON_TASKS, ...WFIRMA_FULL_BOOKS_TASKS];

  return tasks.map((task) => ({
    ...task,
    done: Boolean(saved[task.id]),
  }));
}

function parseStageNotes(value: string | null | undefined): { wfirmaChecklist: Record<string, boolean>; onboardingNotes: string } {
  if (!value) return { wfirmaChecklist: {}, onboardingNotes: "" };

  try {
    const parsed = JSON.parse(value) as { wfirmaChecklist?: Record<string, boolean>; onboardingNotes?: string };
    return {
      wfirmaChecklist: parsed.wfirmaChecklist || {},
      onboardingNotes: parsed.onboardingNotes || "",
    };
  } catch {
    return { wfirmaChecklist: {}, onboardingNotes: value };
  }
}

const WFIRMA_COMMON_TASKS: Omit<OnboardingChecklistItem, "done">[] = [
  { id: "start_date", label: "Ustaw datę rozpoczęcia księgowości w systemie.", group: "Wspólne" },
  { id: "declarant_data", label: "Zmień dane osoby wysyłającej deklaracje: Mateusz Marcinkowski, tel. 600-950-940, e-mail: biuro@crss.com.pl.", group: "Wspólne" },
  { id: "tax_microaccount", label: "Potwierdź mikrorachunek podatkowy oraz rachunek do składek ZUS.", group: "Wspólne" },
  { id: "vat_scheme", label: "Ustaw schemat podatku VAT zgodnie ze statusem klienta.", group: "Wspólne" },
  { id: "tax_office_permissions", label: "Ustaw urząd skarbowy i uprawnienia użytkownika: księgowanie, plik JPK, wydatki.", group: "Wspólne" },
  { id: "bank_account", label: "Dodaj konto przedsiębiorcy i wyłącz możliwość księgowania.", group: "Wspólne" },
];

const WFIRMA_JDG_TASKS: Omit<OnboardingChecklistItem, "done">[] = [
  { id: "zus_owner_scheme", label: "Ustaw schemat składek ZUS przedsiębiorcy.", group: "JDG" },
  { id: "owner_basic_data", label: "Uzupełnij dane właściciela w Dane podstawowe -> Rodzaj firmy i właściciele.", group: "JDG" },
];

const WFIRMA_FULL_BOOKS_TASKS: Omit<OnboardingChecklistItem, "done">[] = [
  { id: "fiscal_year", label: "Dodaj rok obrotowy.", group: "Pełne księgi" },
  { id: "chart_of_accounts", label: "Dodaj plan kont.", group: "Pełne księgi" },
  { id: "opening_balance", label: "Nanieś bilans otwarcia.", group: "Pełne księgi" },
  { id: "advance_tax_schemes", label: "Zmodyfikuj schematy zaliczek na podatek dochodowy.", group: "Pełne księgi" },
  { id: "balance_and_pl_schemes", label: "Zmodyfikuj schemat bilansu oraz RZiS.", group: "Pełne księgi" },
  { id: "accounting_schemes", label: "Utwórz potrzebne schematy księgowe.", group: "Pełne księgi" },
];

function latestInstructionInfo(onboardingHistory: OnboardingHistoryRecord[], profilesById: Record<string, Profile>) {
  const entry = onboardingHistory
    .filter((item) => item.etap === "powers" && item.akcja === "wysylka_instrukcji")
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

  if (!entry) return undefined;

  return `Instrukcje wysłane ${formatDateTime(entry.created_at)} przez ${profileLabel(entry.created_by, profilesById)}.`;
}

function latestClientCardRequestInfo(onboardingHistory: OnboardingHistoryRecord[], profilesById: Record<string, Profile>) {
  const entry = onboardingHistory
    .filter((item) => item.etap === "client_card" && item.akcja === "wysylka_karty_klienta")
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

  if (!entry) return undefined;

  return `Karta klienta wysłana ${formatDateTime(entry.created_at)} przez ${profileLabel(entry.created_by, profilesById)}.`;
}

function latestCaregiverNotificationInfo(onboardingHistory: OnboardingHistoryRecord[], profilesById: Record<string, Profile>) {
  const entry = onboardingHistory
    .filter((item) => item.akcja === "wysylka_informacji_o_opiekunie")
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

  if (!entry) return undefined;

  return `Informacja wysłana ${formatDateTime(entry.created_at)} przez ${profileLabel(entry.created_by, profilesById)}.`;
}

function latestWfirmaAccountNotificationInfo(onboardingHistory: OnboardingHistoryRecord[], profilesById: Record<string, Profile>) {
  const entry = onboardingHistory
    .filter((item) => item.etap === "wfirma_account" && item.akcja === "wysylka_powiadomienia_wfirma")
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

  if (!entry) return undefined;

  return `Powiadomienie wysłane ${formatDateTime(entry.created_at)} przez ${profileLabel(entry.created_by, profilesById)}.`;
}

function latestDocumentsNotificationInfo(onboardingHistory: OnboardingHistoryRecord[], profilesById: Record<string, Profile>) {
  const entry = onboardingHistory
    .filter((item) => item.etap === "documents_takeover" && item.akcja === "wysylka_listy_dokumentow")
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

  if (!entry) return undefined;

  return `Lista dokumentów wysłana ${formatDateTime(entry.created_at)} przez ${profileLabel(entry.created_by, profilesById)}.`;
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

function profileByRoleLabel(profilesById: Record<string, Profile>, role: string, fallback: string) {
  const normalizedRole = role.toLowerCase();
  const profile = Object.values(profilesById).find((item) => (item.role || "").toLowerCase() === normalizedRole && item.aktywne !== false);
  return profile?.full_name || profile?.email || fallback;
}

function caregiverLabel(client: Client) {
  const profile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  return profile?.full_name || profile?.email || "Brak opiekuna";
}

function isJdg(legalForm: string | null | undefined) {
  return (legalForm || "").trim().toLowerCase() === "jdg";
}

function shouldShowClientCard(client: Client, accountingContract: CrmContract | null) {
  return isJdg(client.forma_prawna) || accountingContract?.typ_umowy === "KU";
}

function responsibleLabelForStage(stage: OnboardingStageKey) {
  if (stage === "wfirma" || stage === "documents_takeover") return "Brak opiekuna";
  return "Do przypisania";
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

function formatMonthLabel(value: string | null) {
  if (!value) return "Brak";

  const normalized = value.length === 7 ? `${value}-01` : value;
  const date = new Date(`${normalized}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
  }).format(date);
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

function StageProcessRow({
  stage,
  saving,
  savingChecklistId,
  checklistExpanded,
  onToggleChecklist,
  onStatusChange,
  onAction,
  onChecklistChange,
}: {
  stage: OnboardingStage;
  saving: boolean;
  savingChecklistId: string | null;
  checklistExpanded: boolean;
  onToggleChecklist: () => void;
  onStatusChange: (status: OnboardingStageStatus) => void;
  onAction: () => void;
  onChecklistChange: (item: OnboardingChecklistItem, checked: boolean) => void;
}) {
  const checklistGroups = groupChecklist(stage.checklist || []);
  const hasChecklist = Boolean(stage.checklist?.length);
  const primaryAction = stage.key === "client_card" || stage.key === "powers" || stage.key === "wfirma_account" || stage.key === "documents_takeover";

  return (
    <>
      <tr style={processRowStyle}>
        <td style={processTdStyle}>
          <strong style={processStageTitleStyle}>{stage.title}</strong>
          <span style={processDescriptionStyle}>{stage.description}</span>
        </td>
        <td style={processTdStyle}>
          <span style={responsibleStyle}>{stage.responsibleLabel}</span>
        </td>
        <td style={processTdStyle}>
          <StagePill stage={stage} />
        </td>
        <td style={processActionsTdStyle}>
          <div style={processActionsStyle}>
            {stage.href && <Link href={stage.href} style={secondaryButtonStyle}>{stage.moduleLabel || "Przejdź"}</Link>}
            {hasChecklist && (
              <button type="button" style={secondaryButtonStyle} onClick={onToggleChecklist}>
                {checklistExpanded ? "Ukryj zadania" : "Pokaż zadania"}
              </button>
            )}
            {stage.actionLabel && (
              <button
                type="button"
                style={primaryAction ? primaryActionButtonStyle : secondaryButtonStyle}
                disabled={saving}
                onClick={onAction}
              >
                {saving && primaryAction ? "Wysyłanie..." : stage.actionLabel}
              </button>
            )}
            {stage.editable && stage.record && (
              <>
                <button style={smallButtonStyle} disabled={saving} onClick={() => onStatusChange("w_toku")}>W toku</button>
                <button style={smallButtonStyle} disabled={saving} onClick={() => onStatusChange("gotowe")}>Gotowe</button>
              </>
            )}
          </div>
          {stage.actionInfo && <small style={stageActionInfoStyle}>{stage.actionInfo}</small>}
        </td>
      </tr>
      {hasChecklist && checklistExpanded && (
        <tr>
          <td colSpan={4} style={processChecklistTdStyle}>
            <div style={checklistStyle}>
              {checklistGroups.map((group) => (
                <div key={group.name} style={checklistGroupStyle}>
                  <strong style={checklistGroupTitleStyle}>{group.name}</strong>
                  <div style={checklistItemsStyle}>
                    {group.items.map((item) => {
                      const itemSaving = savingChecklistId === `${stage.record?.id}-${item.id}`;
                      return (
                        <label key={item.id} style={checklistItemStyle}>
                          <input
                            type="checkbox"
                            checked={item.done}
                            disabled={saving || itemSaving || !stage.record}
                            onChange={(event) => onChecklistChange(item, event.target.checked)}
                            style={checklistCheckboxStyle}
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StageCard({
  stage,
  saving,
  savingChecklistId,
  checklistExpanded,
  onToggleChecklist,
  onStatusChange,
  onAction,
  onChecklistChange,
}: {
  stage: OnboardingStage;
  saving: boolean;
  savingChecklistId: string | null;
  checklistExpanded: boolean;
  onToggleChecklist: () => void;
  onStatusChange: (status: OnboardingStageStatus) => void;
  onAction: () => void;
  onChecklistChange: (item: OnboardingChecklistItem, checked: boolean) => void;
}) {
  const checklistGroups = groupChecklist(stage.checklist || []);

  return (
    <div style={{ ...stageCardStyle, ...(stage.fullWidth ? stageFullWidthStyle : {}) }}>
      <div style={stageCardHeaderStyle}>
        <h4 style={stageTitleStyle}>{stage.title}</h4>
        <StagePill stage={stage} />
      </div>
      <span style={responsibleStyle}>Odpowiedzialny: {stage.responsibleLabel}</span>
      <p style={stageDescriptionStyle}>{stage.description}</p>
      {stage.checklist && stage.checklist.length > 0 && (
        <button type="button" style={checklistToggleStyle} onClick={onToggleChecklist}>
          {checklistExpanded ? "Ukryj zadania" : "Pokaż zadania"}
        </button>
      )}
      {stage.checklist && stage.checklist.length > 0 && checklistExpanded && (
        <div style={checklistStyle}>
          {checklistGroups.map((group) => (
            <div key={group.name} style={checklistGroupStyle}>
              <strong style={checklistGroupTitleStyle}>{group.name}</strong>
              <div style={checklistItemsStyle}>
                {group.items.map((item) => {
                  const itemSaving = savingChecklistId === `${stage.record?.id}-${item.id}`;
                  return (
                    <label key={item.id} style={checklistItemStyle}>
                      <input
                        type="checkbox"
                        checked={item.done}
                        disabled={saving || itemSaving || !stage.record}
                        onChange={(event) => onChecklistChange(item, event.target.checked)}
                        style={checklistCheckboxStyle}
                      />
                      <span>{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={stageActionsStyle}>
        {stage.href && <Link href={stage.href} style={secondaryButtonStyle}>{stage.moduleLabel || "Przejdź"}</Link>}
        {stage.actionLabel && (
          <button
            type="button"
            style={stage.key === "client_card" || stage.key === "powers" || stage.key === "wfirma_account" || stage.key === "documents_takeover" ? primaryActionButtonStyle : secondaryButtonStyle}
            disabled={saving}
            onClick={onAction}
          >
            {saving && (stage.key === "client_card" || stage.key === "powers" || stage.key === "wfirma_account" || stage.key === "documents_takeover") ? "Wysyłanie..." : stage.actionLabel}
          </button>
        )}
        {stage.editable && stage.record && (
          <>
            <button style={smallButtonStyle} disabled={saving} onClick={() => onStatusChange("w_toku")}>W toku</button>
            <button style={smallButtonStyle} disabled={saving} onClick={() => onStatusChange("gotowe")}>Gotowe</button>
          </>
        )}
      </div>
      {stage.actionInfo && <small style={stageActionInfoStyle}>{stage.actionInfo}</small>}
    </div>
  );
}

function groupChecklist(items: OnboardingChecklistItem[]) {
  return items.reduce<{ name: string; items: OnboardingChecklistItem[] }[]>((groups, item) => {
    const name = item.group || "Pozostałe";
    const existing = groups.find((group) => group.name === name);
    if (existing) existing.items.push(item);
    else groups.push({ name, items: [item] });
    return groups;
  }, []);
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
const primaryActionButtonStyle: CSSProperties = { ...secondaryButtonStyle, borderColor: colors.red, background: colors.red, color: colors.white };
const overlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(15, 23, 42, 0.32)", display: "flex", justifyContent: "center", alignItems: "stretch", padding: "18px" };
const drawerStyle: CSSProperties = { width: "min(1480px, 100%)", height: "calc(100vh - 36px)", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "30px", overflowY: "auto", boxShadow: shadow.card };
const drawerHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "18px" };
const drawerTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "30px" };
const drawerSubtitleStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, fontWeight: 700 };
const closeButtonStyle: CSSProperties = { width: "46px", height: "46px", borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const drawerSummaryStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "18px" };
const drawerSectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.inputBackground, padding: "18px", marginBottom: "16px" };
const caregiverSectionStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr minmax(260px, 360px)", gap: "18px", alignItems: "center" };
const caregiverSelectStyle: CSSProperties = { width: "100%", background: colors.white, backgroundColor: colors.white };
const caregiverActionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: "10px" };
const caregiverSendStackStyle: CSSProperties = { display: "grid", justifyItems: "end", gap: "6px" };
const caregiverInfoStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 650, textAlign: "right", lineHeight: 1.35 };
const sectionHeaderInlineStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "14px" };
const drawerSectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "22px" };
const onboardingNotesTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: "160px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  background: colors.white,
  color: colors.text,
  padding: "14px 16px",
  fontWeight: 700,
  lineHeight: 1.6,
  resize: "vertical",
  outline: "none",
};
const processTableWrapperStyle: CSSProperties = { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white };
const processTableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: "980px" };
const processThStyle: CSSProperties = { ...thStyle, background: colors.white };
const processRowStyle: CSSProperties = { background: colors.white };
const processTdStyle: CSSProperties = { ...tdStyle, verticalAlign: "top" };
const processActionsTdStyle: CSSProperties = { ...tdStyle, verticalAlign: "top", width: "420px" };
const processStageTitleStyle: CSSProperties = { display: "block", color: colors.navy, fontSize: "16px", marginBottom: "5px" };
const processDescriptionStyle: CSSProperties = { display: "block", color: colors.muted, fontSize: "13px", lineHeight: 1.45, fontWeight: 650 };
const processActionsStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" };
const processChecklistTdStyle: CSSProperties = { padding: "0 14px 14px", borderBottom: `1px solid ${colors.border}`, background: colors.white };
const stageGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" };
const stageCardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "15px", display: "flex", flexDirection: "column", gap: "10px" };
const stageFullWidthStyle: CSSProperties = { gridColumn: "1 / -1" };
const stageCardHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" };
const stageTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "17px" };
const responsibleStyle: CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 800 };
const stageDescriptionStyle: CSSProperties = { margin: 0, color: colors.muted, lineHeight: 1.5, fontWeight: 650 };
const stageActionsStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" };
const stageActionInfoStyle: CSSProperties = { color: colors.muted, fontSize: "12px", lineHeight: 1.45, fontWeight: 650 };
const checklistToggleStyle: CSSProperties = { ...secondaryButtonStyle, alignSelf: "flex-start", padding: "8px 11px" };
const checklistStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "12px", display: "grid", gap: "12px" };
const checklistGroupStyle: CSSProperties = { display: "grid", gap: "8px" };
const checklistGroupTitleStyle: CSSProperties = { color: colors.navy, fontSize: "13px" };
const checklistItemsStyle: CSSProperties = { display: "grid", gap: "8px" };
const checklistItemStyle: CSSProperties = { display: "grid", gridTemplateColumns: "18px 1fr", gap: "9px", alignItems: "start", color: colors.text, fontSize: "13px", lineHeight: 1.45, fontWeight: 700 };
const checklistCheckboxStyle: CSSProperties = { width: "16px", height: "16px", margin: "2px 0 0", accentColor: colors.navy };
const smallButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "8px 10px", fontWeight: 850, cursor: "pointer" };
const dangerSmallButtonStyle: CSSProperties = { ...smallButtonStyle, background: "#fff1f2", color: colors.danger };
const historyListStyle: CSSProperties = { display: "grid", gap: "10px" };
const historyItemStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "12px", display: "grid", gap: "4px", color: colors.text };
