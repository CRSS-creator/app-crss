"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ClipboardCheck, Download, Eye, FileSearch, History, Send, ShieldCheck, X } from "lucide-react";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import { colors, radius, shadow } from "@/app/design";
import {
  fetchAmlHistory,
  fetchAmlRegisters,
  fetchAmlVerifications,
  getAmlReportUrl,
  verifyClientAml,
  type AmlHistoryRecord,
  type AmlRegisterRecord,
  type AmlVerificationRecord,
} from "@/lib/amlService";
import { fetchClients } from "@/lib/clientService";
import { fetchOnboardingStages, statusLabel, type OnboardingStageRecord } from "@/lib/onboardingService";
import { supabase } from "@/lib/supabaseClient";

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

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type AmlRow = {
  client: Client;
  stage: OnboardingStageRecord | null;
  register: AmlRegisterRecord | null;
  verifications: AmlVerificationRecord[];
  history: AmlHistoryRecord[];
};

type AmlCheckKey = "verification" | "initial_form" | "risk_assessment" | "identification_statement";

type AmlCheck = {
  key: AmlCheckKey;
  label: string;
};

const AML_CHECKS: AmlCheck[] = [
  { key: "verification", label: "Weryfikacja AML" },
  { key: "initial_form", label: "Formularz wstępny" },
  { key: "risk_assessment", label: "Ocena ryzyka" },
  { key: "identification_statement", label: "Oświadczenie o weryfikacji i identyfikacji klienta" },
];

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
  const [registers, setRegisters] = useState<AmlRegisterRecord[]>([]);
  const [verifications, setVerifications] = useState<AmlVerificationRecord[]>([]);
  const [history, setHistory] = useState<AmlHistoryRecord[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [verifyingClientId, setVerifyingClientId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [clientsResult, stagesResult, registersResult, verificationsResult, historyResult, profilesResult] = await Promise.all([
      fetchClients(),
      fetchOnboardingStages(),
      fetchAmlRegisters(),
      fetchAmlVerifications(),
      fetchAmlHistory(),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    if (clientsResult.error) console.error("Błąd pobierania klientów AML:", clientsResult.error);
    if (stagesResult.error) console.error("Błąd pobierania etapów AML z onboardingu:", stagesResult.error);
    if (registersResult.error) console.error("Błąd pobierania rejestru AML:", registersResult.error);
    if (verificationsResult.error) console.error("Błąd pobierania weryfikacji AML:", verificationsResult.error);
    if (historyResult.error) console.error("Błąd pobierania historii AML:", historyResult.error);
    if (profilesResult.error) console.error("Błąd pobierania użytkowników AML:", profilesResult.error);

    setClients(clientsResult.error ? [] : ((clientsResult.data || []) as unknown as Client[]));
    setStages(stagesResult.error ? [] : ((stagesResult.data || []) as OnboardingStageRecord[]));
    setRegisters(registersResult.error ? [] : ((registersResult.data || []) as AmlRegisterRecord[]));
    setVerifications(verificationsResult.error ? [] : ((verificationsResult.data || []) as AmlVerificationRecord[]));
    setHistory(historyResult.error ? [] : ((historyResult.data || []) as AmlHistoryRecord[]));
    setProfilesById(indexProfiles((profilesResult.data || []) as Profile[]));
    setLoading(false);
  }

  const rows = useMemo(
    () => buildRows(clients, stages, registers, verifications, history),
    [clients, stages, registers, verifications, history]
  );
  const filteredRows = useMemo(() => filterRows(rows, searchTerm), [rows, searchTerm]);
  const selectedRow = rows.find((row) => row.client.id === selectedClientId) || null;
  const waitingCount = rows.filter((row) => !row.register?.ostatnia_weryfikacja_at).length;
  const requiresAnalysisCount = rows.filter((row) => row.register?.status === "wymaga_analizy").length;
  const verifiedCount = rows.filter((row) => row.register?.status === "zweryfikowano_automatycznie").length;

  async function handleVerify(row: AmlRow) {
    setVerifyingClientId(row.client.id);
    const result = await verifyClientAml(row.client.id);
    setVerifyingClientId(null);

    if (result.error) {
      alert(result.error.message);
      return;
    }

    await loadData();
    setSelectedClientId(row.client.id);
  }

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>AML</p>
          <h1 style={titleStyle}>Rejestr klientów AML</h1>
        </div>
      </header>

      <section style={statsGridStyle} aria-label="Podsumowanie AML">
        <StatCard icon={<FileSearch size={22} />} label="Do weryfikacji" value={waitingCount} tone="warning" />
        <StatCard icon={<ShieldCheck size={22} />} label="Wymaga analizy" value={requiresAnalysisCount} tone="info" />
        <StatCard icon={<ClipboardCheck size={22} />} label="Zweryfikowano automatycznie" value={verifiedCount} tone="success" />
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
            <h2 style={sectionTitleStyle}>Wszyscy klienci</h2>
            <p style={sectionHintStyle}>Lista obejmuje wszystkich klientów w aplikacji. Szczegóły otwierają pełną historię AML i zapisane raporty weryfikacji.</p>
          </div>
        </div>

        <div style={searchRowStyle}>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Szukaj po kliencie, NIP, opiekunie lub statusie"
            style={searchInputStyle}
          />
          {searchTerm && (
            <button type="button" style={clearSearchButtonStyle} onClick={() => setSearchTerm("")}>
              Wyczyść
            </button>
          )}
        </div>

        {loading ? (
          <p style={emptyStyle}>Ładowanie rejestru AML...</p>
        ) : rows.length === 0 ? (
          <p style={emptyStyle}>Brak klientów do pokazania w rejestrze AML.</p>
        ) : filteredRows.length === 0 ? (
          <p style={emptyStyle}>Brak wyników dla wpisanej frazy.</p>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>LP</Th>
                  <Th>Klient</Th>
                  <Th>NIP</Th>
                  <Th>Opiekun</Th>
                  <Th>Weryfikacja AML</Th>
                  <Th>Formularz wstępny</Th>
                  <Th>Ocena ryzyka</Th>
                  <WrappedTh>Oświadczenie o weryfikacji i identyfikacji klienta</WrappedTh>
                  <Th>Szczegóły</Th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={row.client.id}>
                    <Td>{index + 1}</Td>
                    <Td>
                      <strong style={clientNameStyle}>{row.client.nazwa || "Klient bez nazwy"}</strong>
                      <span style={clientMetaStyle}>{row.client.email || row.client.telefon || "Brak danych kontaktowych"}</span>
                    </Td>
                    <Td>{row.client.nip || "-"}</Td>
                    <Td>{caregiverLabel(row.client)}</Td>
                    <StatusTd><StatusPill done={amlCheckStatus(row, "verification")} /></StatusTd>
                    <StatusTd><StatusPill done={amlCheckStatus(row, "initial_form")} /></StatusTd>
                    <StatusTd><StatusPill done={amlCheckStatus(row, "risk_assessment")} /></StatusTd>
                    <StatusTd><StatusPill done={amlCheckStatus(row, "identification_statement")} /></StatusTd>
                    <Td>
                      <button type="button" onClick={() => setSelectedClientId(row.client.id)} style={detailsButtonStyle}>
                        Szczegóły
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRow && (
        <AmlDetailsModal
          row={selectedRow}
          profilesById={profilesById}
          verifying={verifyingClientId === selectedRow.client.id}
          onVerify={() => void handleVerify(selectedRow)}
          onClose={() => setSelectedClientId(null)}
        />
      )}
    </div>
  );
}

function AmlDetailsModal({
  row,
  profilesById,
  verifying,
  onVerify,
  onClose,
}: {
  row: AmlRow;
  profilesById: Record<string, Profile>;
  verifying: boolean;
  onVerify: () => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AmlCheckKey>("verification");
  const activeCheck = AML_CHECKS.find((check) => check.key === activeTab) || AML_CHECKS[0];
  const activeCheckDone = amlCheckStatus(row, activeCheck.key);

  return (
    <div style={modalBackdropStyle}>
      <aside style={modalStyle}>
        <div style={modalHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Szczegóły AML</p>
            <h2 style={modalTitleStyle}>{row.client.nazwa || "Klient bez nazwy"}</h2>
            <p style={sectionHintStyle}>NIP: {row.client.nip || "-"} · Opiekun: {caregiverLabel(row.client)}</p>
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="Zamknij">
            <X size={22} />
          </button>
        </div>

        <div style={modalActionsStyle}>
          <button type="button" onClick={onVerify} disabled={verifying} style={primaryButtonStyle}>
            <FileSearch size={18} />
            {verifying ? "Trwa weryfikacja..." : "Zweryfikuj AML"}
          </button>
        </div>

        <div style={modalGridStyle}>
          <InfoBox label="Status rejestru" value={registerStatusLabel(row.register)} />
          <InfoBox label="Ostatnia weryfikacja" value={formatDateTime(row.register?.ostatnia_weryfikacja_at)} />
          <InfoBox label="Wykonał" value={profileLabel(row.register?.ostatnia_weryfikacja_by, profilesById)} />
          <InfoBox label="Następna weryfikacja" value={formatDate(row.register?.nastepna_weryfikacja_at)} />
        </div>

        <section style={tabsSectionStyle} aria-label="Zakładki AML klienta">
          <div style={tabsListStyle}>
            {AML_CHECKS.map((check) => (
              <button
                key={check.key}
                type="button"
                onClick={() => setActiveTab(check.key)}
                style={activeTab === check.key ? activeTabButtonStyle : tabButtonStyle}
              >
                {check.label}
              </button>
            ))}
          </div>
          <div style={tabPanelStyle}>
            <span style={tabPanelLabelStyle}>{activeCheck.label}</span>
            <StatusPill done={activeCheckDone} />
          </div>
        </section>

        <RegistryDetails register={row.register} />

        <section style={detailsSectionStyle}>
          <h3 style={detailsTitleStyle}>Weryfikacje i raporty</h3>
          {row.verifications.length === 0 ? (
            <p style={emptySmallStyle}>Brak wykonanej weryfikacji AML.</p>
          ) : (
            <div style={listStyle}>
              {row.verifications.map((verification) => (
                <VerificationItem key={verification.id} verification={verification} profilesById={profilesById} />
              ))}
            </div>
          )}
        </section>

        <section style={detailsSectionStyle}>
          <h3 style={detailsTitleStyle}>Pełna historia zmian</h3>
          {row.history.length === 0 ? (
            <p style={emptySmallStyle}>Brak historii AML dla tego klienta.</p>
          ) : (
            <div style={historyListStyle}>
              {row.history.map((entry) => (
                <div key={entry.id} style={historyItemStyle}>
                  <div style={historyIconStyle}><History size={16} /></div>
                  <div>
                    <div style={historyMetaStyle}>
                      {formatDateTime(entry.created_at)} · {profileLabel(entry.created_by, profilesById)}
                    </div>
                    <strong style={historyActionStyle}>{historyActionLabel(entry.akcja)}</strong>
                    <p style={historyDescriptionStyle}>{entry.opis}</p>
                    <div style={changesStyle}>{formatChanges(entry.zmiany)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function RegistryDetails({ register }: { register: AmlRegisterRecord | null }) {
  const registry = asRecord(register?.dane_rejestrowe);
  const identifiers = asRecord(registry.identyfikatory);
  const vat = asRecord(registry.bialaListaVat);
  const owners = Array.isArray(register?.beneficjenci_rzeczywisci) ? register.beneficjenci_rzeczywisci : [];
  const pkdCodes = Array.isArray(register?.kody_pkd) ? register.kody_pkd : [];
  const isKrsEntity = Boolean(identifiers.krs || register?.numer_krs);

  return (
    <section style={detailsSectionStyle}>
      <h3 style={detailsTitleStyle}>Dane rejestrowe podmiotu</h3>
      {!register?.dane_rejestrowe || Object.keys(registry).length === 0 ? (
        <p style={emptySmallStyle}>Brak zapisanych danych rejestrowych. Uruchom weryfikację AML, aby je uzupełnić.</p>
      ) : (
        <div style={registryGridStyle}>
          <div style={registryPanelStyle}>
            <h4 style={registryTitleStyle}>Identyfikatory</h4>
            <Definition label="NIP" value={asText(identifiers.nip)} />
            <Definition label="REGON" value={asText(identifiers.regon || register.numer_regon)} />
            <Definition label="KRS" value={asText(identifiers.krs || register.numer_krs)} />
            <Definition label="Rejestr" value={asText(identifiers.rejestr)} />
            <Definition label="VAT" value={vat.statusVat ? `VAT ${String(vat.statusVat).toLowerCase()}` : "-"} />
          </div>
          <div style={registryPanelStyle}>
            <h4 style={registryTitleStyle}>Statusy źródeł</h4>
            <Definition label="KRS" value={sourceStatusLabel(register.krs_status || "")} />
            <Definition label="VAT" value={sourceStatusLabel(asText(asRecord(registry.statusy).vat))} />
            <Definition label="Status CRBR" value={register.crbr_status ? registerStatusText(register.crbr_status) : "Do weryfikacji"} />
            {!isKrsEntity && <Definition label="CEIDG" value={sourceStatusLabel(asText(asRecord(registry.statusy).ceidg))} />}
          </div>
          <div style={beneficialOwnersPanelStyle}>
            <h4 style={registryTitleStyle}>Beneficjenci rzeczywiści z CRBR</h4>
            {owners.length > 0 ? (
              <div style={beneficialOwnersListStyle}>
                {owners.map((owner, index) => (
                  <div key={`${asText(owner.label)}-${index}`} style={beneficialOwnerItemStyle}>
                    <strong style={beneficialOwnerNameStyle}>{asText(owner.label)}</strong>
                    <div style={beneficialOwnerMetaStyle}>
                      <span>Obywatelstwo: {asText(owner.obywatelstwo)}</span>
                      <span>Kraj zamieszkania: {asText(owner.krajZamieszkania)}</span>
                      <span>Status: {registerStatusText(asText(owner.status))}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={emptySmallStyle}>Brak zapisanych beneficjentów z CRBR.</p>
            )}
          </div>
          <div style={registryPanelWideStyle}>
            <h4 style={registryTitleStyle}>Kody PKD do formularza wstępnego</h4>
            {pkdCodes.length > 0 ? (
              <div style={pkdListStyle}>
                {pkdCodes.map((pkd, index) => (
                  <span key={`${asText(pkd.kod)}-${index}`} style={pkdBadgeStyle}>
                    <strong style={pkdCodeStyle}>{asText(pkd.kod)}{pkd.przewazajace ? " · przeważające" : ""}</strong>
                    <span style={pkdNameStyle}>{asText(pkd.nazwa)}</span>
                    {pkd.zrodlo ? <span style={pkdSourceStyle}>{asText(pkd.zrodlo)}</span> : null}
                  </span>
                ))}
              </div>
            ) : (
              <p style={emptySmallStyle}>Brak zapisanych kodów PKD.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function VerificationItem({ verification, profilesById }: { verification: AmlVerificationRecord; profilesById: Record<string, Profile> }) {
  const sources = visibleVerificationSources(verification);
  async function openReport() {
    const result = await getAmlReportUrl(verification.id);
    if (result.error || !result.data?.url) {
      alert(result.error?.message || "Nie udało się otworzyć raportu AML.");
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  async function downloadReport() {
    const result = await getAmlReportUrl(verification.id);
    if (result.error || !result.data?.url) {
      alert(result.error?.message || "Nie udało się pobrać raportu AML.");
      return;
    }
    const link = document.createElement("a");
    link.href = result.data.url;
    link.download = result.data.fileName || verification.pdf_name || "raport_aml.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <article style={verificationItemStyle}>
      <div>
        <strong style={verificationTitleStyle}>{formatDateTime(verification.created_at)} · {verificationResultLabel(verification.wynik)}</strong>
        <p style={verificationMetaStyle}>Wykonał: {profileLabel(verification.wykonana_by, profilesById)}</p>
        <div style={sourceGridStyle}>
          {sources.map((source, index) => (
            <span key={`${verification.id}-${index}`} style={sourceBadgeStyle(String(source.status || ""))}>
              {String(source.source || "Źródło")} · {sourceStatusLabel(String(source.status || ""))}
            </span>
          ))}
        </div>
      </div>
      <div style={reportButtonsStyle}>
        <button type="button" onClick={() => void openReport()} style={smallButtonStyle}><Eye size={16} /> Podgląd</button>
        <button type="button" onClick={() => void downloadReport()} style={smallButtonStyle}><Download size={16} /> Pobierz</button>
      </div>
    </article>
  );
}

function visibleVerificationSources(verification: AmlVerificationRecord) {
  const sources = verification.zrodla || [];
  const hasKrs = sources.some((source) => String(source.source || "").toLowerCase().includes("krs"));
  return hasKrs
    ? sources.filter((source) => !String(source.source || "").toLowerCase().includes("ceidg"))
    : sources;
}

function StatusPill({ done }: { done: boolean }) {
  return <span style={statusPillStyle(done)}>{done ? "TAK" : "NIE"}</span>;
}

function amlCheckStatus(row: AmlRow, check: AmlCheckKey) {
  if (check === "verification") return row.verifications.length > 0 || Boolean(row.register?.ostatnia_weryfikacja_at);
  if (check === "initial_form") return ["formularz_wyslany", "formularz_odebrany", "zatwierdzone"].includes(String(row.register?.status || ""));
  if (check === "risk_assessment") return Boolean(row.register?.poziom_ryzyka);
  return row.register?.status === "zatwierdzone";
}

function buildRows(
  clients: Client[],
  stages: OnboardingStageRecord[],
  registers: AmlRegisterRecord[],
  verifications: AmlVerificationRecord[],
  history: AmlHistoryRecord[]
): AmlRow[] {
  const amlStagesByClient = new Map(stages.filter((stage) => stage.etap === "aml").map((stage) => [stage.klient_id, stage]));
  const registersByClient = new Map(registers.map((register) => [register.klient_id, register]));

  return clients
    .map((client) => ({
      client,
      stage: amlStagesByClient.get(client.id) || null,
      register: registersByClient.get(client.id) || null,
      verifications: verifications.filter((verification) => verification.klient_id === client.id),
      history: history.filter((entry) => entry.klient_id === client.id),
    }))
    .sort((first, second) => {
      const firstDate = first.register?.ostatnia_weryfikacja_at || "";
      const secondDate = second.register?.ostatnia_weryfikacja_at || "";
      if (firstDate !== secondDate) return secondDate.localeCompare(firstDate);
      return String(first.client.nazwa || "").localeCompare(String(second.client.nazwa || ""), "pl");
    });
}

function filterRows(rows: AmlRow[], searchTerm: string) {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return rows;

  return rows.filter((row) => {
    const values = [
      row.client.nazwa,
      row.client.nip,
      row.client.email,
      row.client.telefon,
      caregiverLabel(row.client),
      stageStatusLabel(row.stage),
      registerStatusLabel(row.register),
      formatDateTime(row.register?.ostatnia_weryfikacja_at),
      ...AML_CHECKS.map((check) => amlCheckStatus(row, check.key) ? "tak" : "nie"),
    ];

    return values.some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function indexProfiles(profiles: Profile[]) {
  return Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
}

function caregiverLabel(client: Client) {
  const profile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  return profile?.full_name || profile?.email || "Nie przypisano";
}

function stageStatusLabel(stage: OnboardingStageRecord | null) {
  if (!stage) return "Do weryfikacji";
  return statusLabel(stage.status);
}

function isDoneStage(stage: OnboardingStageRecord | null) {
  return stage?.status === "gotowe" || stage?.status === "papierowo" || stage?.status === "nowy_podmiot";
}

function registerStatusLabel(register: AmlRegisterRecord | null) {
  if (!register) return "Do weryfikacji";
  if (register.status === "zweryfikowano_automatycznie") return "Zweryfikowano automatycznie";
  if (register.status === "wymaga_analizy") return "Wymaga analizy";
  if (register.status === "formularz_wyslany") return "Formularz wysłany";
  if (register.status === "formularz_odebrany") return "Formularz odebrany";
  if (register.status === "zatwierdzone") return "Zatwierdzone";
  return "Do weryfikacji";
}

function verificationResultLabel(result: string) {
  if (result === "pozytywna") return "Weryfikacja pozytywna";
  if (result === "wymaga_analizy") return "Wymaga analizy";
  return result || "Wykonana";
}

function sourceStatusLabel(status: string) {
  if (status === "ok") return "OK";
  if (status === "confirmed") return "Potwierdzono";
  if (status === "warning") return "Uwaga";
  if (status === "error") return "Błąd";
  if (status === "skipped") return "Do dopięcia";
  return status || "-";
}

function historyActionLabel(action: string) {
  if (action === "automatyczna_weryfikacja_aml") return "Automatyczna weryfikacja AML";
  return action.replace(/_/g, " ");
}

function profileLabel(id: string | null | undefined, profilesById: Record<string, Profile>) {
  if (!id) return "-";
  const profile = profilesById[id];
  return profile?.full_name || profile?.email || "Nieustalony użytkownik";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pl-PL");
}

function formatChanges(value: Record<string, unknown>) {
  if (!value || Object.keys(value).length === 0) return <p style={changeLineStyle}>Brak szczegółów zmian.</p>;

  const sources = Array.isArray(value.sources) ? value.sources as Array<Record<string, unknown>> : [];
  const result = value.wynik ? String(value.wynik) : "";
  const status = value.status ? String(value.status) : "";
  const hasPdf = Boolean(value.pdf_path);

  return (
    <div style={changeListStyle}>
      {result && <p style={changeLineStyle}><strong>Wynik:</strong> {verificationResultLabel(result)}</p>}
      {status && <p style={changeLineStyle}><strong>Status wpisu:</strong> {registerStatusText(status)}</p>}
      {sources.length > 0 && (
        <div style={changeSourcesStyle}>
          <strong>Sprawdzone źródła:</strong>
          <ul style={changeSourceListStyle}>
            {sources.map((source, index) => (
              <li key={index}>
                {String(source.source || "Źródło")} - {sourceStatusLabel(String(source.status || ""))}
                {source.label ? `: ${String(source.label)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasPdf && <p style={changeLineStyle}><strong>Raport PDF:</strong> zapisany przy weryfikacji.</p>}
    </div>
  );
}

function registerStatusText(status: string) {
  if (status === "zweryfikowano_automatycznie") return "Zweryfikowano automatycznie";
  if (status === "wymaga_analizy") return "Wymaga analizy";
  if (status === "ok" || status === "pobrano") return "Pobrano";
  if (status === "warning") return "Wymaga uwagi";
  if (status === "error") return "Błąd źródła";
  if (status === "skipped") return "Do weryfikacji";
  return status.replace(/_/g, " ");
}

function stageBadgeStyle(stage: OnboardingStageRecord | null): CSSProperties {
  if (isDoneStage(stage)) return { ...badgeStyle, background: "rgba(22, 163, 74, 0.12)", color: colors.success };
  if (stage?.status === "w_toku") return { ...badgeStyle, background: "rgba(37, 99, 235, 0.12)", color: colors.info };
  if (stage?.status === "zablokowane") return { ...badgeStyle, background: "rgba(220, 38, 38, 0.12)", color: colors.danger };
  return { ...badgeStyle, background: "rgba(245, 158, 11, 0.14)", color: "#9a5b00" };
}

function registerBadgeStyle(register: AmlRegisterRecord | null): CSSProperties {
  if (register?.status === "zweryfikowano_automatycznie" || register?.status === "zatwierdzone") {
    return { ...badgeStyle, background: "rgba(22, 163, 74, 0.12)", color: colors.success };
  }
  if (register?.status === "wymaga_analizy") return { ...badgeStyle, background: "rgba(220, 38, 38, 0.12)", color: colors.danger };
  return { ...badgeStyle, background: "rgba(245, 158, 11, 0.14)", color: "#9a5b00" };
}

function sourceBadgeStyle(status: string): CSSProperties {
  if (status === "ok") return { ...sourceBadgeBaseStyle, background: "rgba(22, 163, 74, 0.12)", color: colors.success };
  if (status === "confirmed") return { ...sourceBadgeBaseStyle, background: "rgba(22, 163, 74, 0.12)", color: colors.success };
  if (status === "warning") return { ...sourceBadgeBaseStyle, background: "rgba(245, 158, 11, 0.14)", color: "#9a5b00" };
  if (status === "error") return { ...sourceBadgeBaseStyle, background: "rgba(220, 38, 38, 0.12)", color: colors.danger };
  return { ...sourceBadgeBaseStyle, background: "rgba(100, 116, 139, 0.12)", color: colors.muted };
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

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoBoxStyle}>
      <span style={infoLabelStyle}>{label}</span>
      <strong style={infoValueStyle}>{value}</strong>
    </div>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div style={definitionStyle}>
      <span style={definitionLabelStyle}>{label}</span>
      <strong style={definitionValueStyle}>{value || "-"}</strong>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function WrappedTh({ children }: { children: React.ReactNode }) {
  return <th style={wrappedThStyle}>{children}</th>;
}

function StatusTd({ children }: { children: React.ReactNode }) {
  return <td style={statusTdStyle}>{children}</td>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={tdStyle}>{children}</td>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatAddress(record: Record<string, unknown>) {
  const street = [record.ulica, record.nrNieruchomosci, record.nrLokalu ? `/${record.nrLokalu}` : ""].filter(Boolean).join(" ");
  const city = [record.kodPocztowy, record.miejscowosc].filter(Boolean).join(" ");
  return [street, city].filter(Boolean).join(", ") || "-";
}

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "22px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start" };
const eyebrowStyle: CSSProperties = { margin: "0 0 8px", fontSize: "13px", fontWeight: 850, letterSpacing: "0.08em", color: colors.red, textTransform: "uppercase" };
const titleStyle: CSSProperties = { margin: 0, fontSize: "34px", lineHeight: 1.15, color: colors.navy };
const searchRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "12px", padding: "18px 24px 18px" };
const searchInputStyle: CSSProperties = { width: "100%", flex: "1 1 auto", minWidth: 0, border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "13px 16px", background: colors.inputBackground, color: colors.text, fontSize: "15px", fontWeight: 650, outline: "none" };
const clearSearchButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "12px 14px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
const statsGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px" };
const statCardStyle: CSSProperties = { minHeight: "92px", border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, boxShadow: shadow.soft, padding: "20px", display: "flex", alignItems: "center", gap: "16px" };
const statIconStyle: CSSProperties = { width: "44px", height: "44px", borderRadius: radius.button, display: "inline-flex", alignItems: "center", justifyContent: "center" };
const statValueStyle: CSSProperties = { fontSize: "28px", lineHeight: 1, fontWeight: 850, color: colors.navy };
const statLabelStyle: CSSProperties = { marginTop: "6px", color: colors.muted, fontWeight: 750, fontSize: "13px" };
const workflowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px" };
const workflowStepStyle: CSSProperties = { minHeight: "58px", display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.card, color: colors.navy, fontWeight: 800, fontSize: "13px" };
const workflowIconStyle: CSSProperties = { width: "34px", height: "34px", borderRadius: radius.button, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(23, 59, 115, 0.08)", color: colors.navy, flex: "0 0 auto" };
const cardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, boxShadow: shadow.card, overflow: "hidden" };
const sectionHeaderStyle: CSSProperties = { padding: "24px 28px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: "22px", color: colors.navy };
const sectionHintStyle: CSSProperties = { margin: "6px 0 0", color: colors.muted, fontSize: "14px" };
const tableWrapStyle: CSSProperties = { width: "100%", overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", minWidth: "1320px", borderCollapse: "collapse" };
const thStyle: CSSProperties = { padding: "16px 18px", textAlign: "left", fontSize: "12px", color: colors.text, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const wrappedThStyle: CSSProperties = { ...thStyle, width: "260px", minWidth: "220px", whiteSpace: "normal", lineHeight: 1.35 };
const tdStyle: CSSProperties = { padding: "18px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle", fontSize: "15px" };
const statusTdStyle: CSSProperties = { ...tdStyle, textAlign: "center" };
const clientNameStyle: CSSProperties = { display: "block", color: colors.navy, fontWeight: 850, lineHeight: 1.35 };
const clientMetaStyle: CSSProperties = { display: "block", marginTop: "5px", color: colors.muted, fontSize: "13px" };
const badgeStyle: CSSProperties = { display: "inline-flex", minHeight: "30px", alignItems: "center", justifyContent: "center", padding: "6px 12px", borderRadius: radius.badge, fontSize: "13px", fontWeight: 850, whiteSpace: "nowrap" };
function statusPillStyle(done: boolean): CSSProperties {
  return {
    ...badgeStyle,
    minWidth: "54px",
    background: done ? "rgba(22, 163, 74, 0.12)" : "rgba(220, 38, 38, 0.12)",
    color: done ? colors.success : colors.danger,
  };
}
const detailsButtonStyle: CSSProperties = { minHeight: "40px", padding: "0 16px", borderRadius: radius.button, border: `1px solid ${colors.border}`, color: colors.navy, fontWeight: 850, background: colors.white, cursor: "pointer" };
const emptyStyle: CSSProperties = { margin: 0, padding: "34px 28px", color: colors.muted, fontWeight: 750 };
const modalBackdropStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(15, 23, 42, 0.38)", display: "flex", justifyContent: "flex-end", padding: "24px" };
const modalStyle: CSSProperties = { width: "min(1180px, calc(100vw - 48px))", maxHeight: "calc(100vh - 48px)", overflowY: "auto", borderRadius: radius.card, background: colors.white, boxShadow: "0 32px 90px rgba(15, 23, 42, 0.28)", border: `1px solid ${colors.border}` };
const modalHeaderStyle: CSSProperties = { position: "sticky", top: 0, zIndex: 2, background: colors.white, display: "flex", justifyContent: "space-between", gap: "20px", padding: "26px 30px", borderBottom: `1px solid ${colors.border}` };
const modalTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "28px" };
const iconButtonStyle: CSSProperties = { width: "44px", height: "44px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const modalActionsStyle: CSSProperties = { padding: "20px 30px", borderBottom: `1px solid ${colors.border}` };
const primaryButtonStyle: CSSProperties = { minHeight: "46px", padding: "0 18px", border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "10px", cursor: "pointer" };
const modalGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", padding: "22px 30px" };
const infoBoxStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "14px", background: colors.inputBackground };
const infoLabelStyle: CSSProperties = { display: "block", color: colors.muted, fontSize: "12px", fontWeight: 800, textTransform: "uppercase" };
const infoValueStyle: CSSProperties = { display: "block", marginTop: "8px", color: colors.navy, fontSize: "14px" };
const detailsSectionStyle: CSSProperties = { padding: "24px 30px", borderTop: `1px solid ${colors.border}` };
const detailsTitleStyle: CSSProperties = { margin: "0 0 16px", color: colors.navy, fontSize: "20px" };
const tabsSectionStyle: CSSProperties = { padding: "20px 30px", borderTop: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", gap: "14px" };
const tabsListStyle: CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap" };
const tabButtonStyle: CSSProperties = { minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "0 14px", fontWeight: 850, cursor: "pointer" };
const activeTabButtonStyle: CSSProperties = { ...tabButtonStyle, background: colors.navy, borderColor: colors.navy, color: colors.white };
const tabPanelStyle: CSSProperties = { minHeight: "54px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 14px" };
const tabPanelLabelStyle: CSSProperties = { color: colors.navy, fontSize: "14px", fontWeight: 850 };
const registryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", alignItems: "stretch" };
const registryPanelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "16px", background: colors.inputBackground };
const registryPanelWideStyle: CSSProperties = { ...registryPanelStyle, gridColumn: "1 / -1" };
const beneficialOwnersPanelStyle: CSSProperties = { ...registryPanelStyle, minHeight: "180px", gridColumn: "1 / -1" };
const beneficialOwnersListStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" };
const beneficialOwnerItemStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, padding: "12px" };
const beneficialOwnerNameStyle: CSSProperties = { display: "block", color: colors.navy, fontSize: "14px", lineHeight: 1.35 };
const beneficialOwnerMetaStyle: CSSProperties = { display: "grid", gap: "5px", marginTop: "8px", color: colors.muted, fontSize: "12px", fontWeight: 750, lineHeight: 1.35 };
const registryTitleStyle: CSSProperties = { margin: "0 0 12px", color: colors.navy, fontSize: "15px" };
const definitionStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(86px, 0.42fr) minmax(0, 1fr)", gap: "10px", padding: "8px 0", borderTop: `1px solid ${colors.border}` };
const definitionLabelStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 850, textTransform: "uppercase" };
const definitionValueStyle: CSSProperties = { color: colors.text, fontSize: "13px", lineHeight: 1.45, overflowWrap: "anywhere" };
const pkdListStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "8px" };
const pkdBadgeStyle: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", minHeight: "66px", padding: "10px 12px", borderRadius: radius.button, background: "rgba(23, 59, 115, 0.08)", color: colors.navy, fontSize: "12px", fontWeight: 850, lineHeight: 1.35 };
const pkdCodeStyle: CSSProperties = { fontSize: "13px", color: colors.navy };
const pkdNameStyle: CSSProperties = { color: colors.text, fontWeight: 800, overflowWrap: "anywhere" };
const pkdSourceStyle: CSSProperties = { color: colors.muted, fontSize: "11px", fontWeight: 850, textTransform: "uppercase" };
const emptySmallStyle: CSSProperties = { margin: 0, color: colors.muted, fontWeight: 750 };
const listStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "12px" };
const verificationItemStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "16px", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const verificationTitleStyle: CSSProperties = { color: colors.navy, fontSize: "15px" };
const verificationMetaStyle: CSSProperties = { margin: "6px 0 12px", color: colors.muted, fontSize: "13px", fontWeight: 700 };
const sourceGridStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "8px" };
const sourceBadgeBaseStyle: CSSProperties = { display: "inline-flex", padding: "6px 10px", borderRadius: radius.badge, fontSize: "12px", fontWeight: 850 };
const reportButtonsStyle: CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" };
const smallButtonStyle: CSSProperties = { minHeight: "36px", padding: "0 12px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" };
const historyListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "14px" };
const historyItemStyle: CSSProperties = { display: "grid", gridTemplateColumns: "34px 1fr", gap: "12px", border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "14px" };
const historyIconStyle: CSSProperties = { width: "34px", height: "34px", borderRadius: radius.button, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(23, 59, 115, 0.08)", color: colors.navy };
const historyMetaStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 800 };
const historyActionStyle: CSSProperties = { display: "block", marginTop: "4px", color: colors.navy };
const historyDescriptionStyle: CSSProperties = { margin: "6px 0 8px", color: colors.text, lineHeight: 1.5 };
const changesStyle: CSSProperties = { margin: 0, padding: "12px", borderRadius: radius.button, background: colors.inputBackground, color: colors.muted, fontSize: "13px" };
const changeListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const changeLineStyle: CSSProperties = { margin: 0, lineHeight: 1.45 };
const changeSourcesStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", lineHeight: 1.45 };
const changeSourceListStyle: CSSProperties = { margin: 0, paddingLeft: "18px" };
