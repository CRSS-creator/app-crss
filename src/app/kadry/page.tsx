"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Plus, X } from "lucide-react";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients } from "@/lib/clientService";
import {
  createPayrollContract,
  fetchPayrollContracts,
  type PayrollContract,
  type PayrollContractPayload,
  type PayrollContractType,
} from "@/lib/payrollContractService";

type PayrollTab = "kadry" | "a1" | "zus_przedsiebiorcy";

type PayrollTabDefinition = {
  value: PayrollTab;
  label: string;
};

type PayrollClient = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  telefon: string | null;
  obsluga_kadrowa: boolean | null;
  opiekun_id: string | null;
  profiles?: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

type ContractDraft = {
  imie: string;
  nazwisko: string;
  typ_umowy: PayrollContractType;
  numer_umowy: string;
  data_poczatku: string;
  data_konca: string;
  umowa_na_czas_nieokreslony: boolean;
  badania_lekarskie_wazne_do: string;
  szkolenie_bhp_wazne_do: string;
  legitymacja_studencka_wazna_do: string;
};

const PAYROLL_TABS: PayrollTabDefinition[] = [
  { value: "kadry", label: "Kadry" },
  { value: "a1", label: "A1" },
  { value: "zus_przedsiebiorcy", label: "ZUS Przedsiębiorcy" },
];

const CONTRACT_TYPE_OPTIONS: { value: PayrollContractType; label: string }[] = [
  { value: "umowa_o_prace", label: "Umowa o pracę" },
  { value: "umowa_cywilnoprawna", label: "Umowa cywilnoprawna" },
  { value: "student", label: "Student" },
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
  const [clients, setClients] = useState<PayrollClient[]>([]);
  const [contracts, setContracts] = useState<PayrollContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<PayrollClient | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [clientsResult, contractsResult] = await Promise.all([
        fetchClients(),
        fetchPayrollContracts(),
      ]);

      if (clientsResult.error) {
        console.error("Błąd pobierania klientów kadrowych:", clientsResult.error);
        setClients([]);
      } else {
        setClients((clientsResult.data || []) as unknown as PayrollClient[]);
      }

      if (contractsResult.error) {
        console.error("Błąd pobierania umów kadrowych:", contractsResult.error);
        setContracts([]);
      } else {
        setContracts((contractsResult.data || []) as PayrollContract[]);
      }

      setLoading(false);
    }

    void loadData();
  }, []);

  const payrollClients = useMemo(
    () => clients.filter((client) => client.obsluga_kadrowa),
    [clients]
  );
  const contractsByClient = useMemo(() => groupContractsByClient(contracts), [contracts]);
  const filteredClients = useMemo(
    () => filterClients(payrollClients, searchTerm),
    [payrollClients, searchTerm]
  );
  const selectedContracts = selectedClient ? contractsByClient[selectedClient.id] || [] : [];
  const tab = PAYROLL_TABS.find((item) => item.value === activeTab) || PAYROLL_TABS[0];

  function handleContractCreated(contract: PayrollContract) {
    setContracts((current) => [...current, contract].sort(sortContracts));
  }

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

        {activeTab === "kadry" && (
          <div style={searchRowStyle}>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Szukaj klienta, NIP, opiekuna"
              style={searchInputStyle}
            />
            {searchTerm && (
              <button type="button" style={clearSearchButtonStyle} onClick={() => setSearchTerm("")}>
                Wyczyść
              </button>
            )}
          </div>
        )}

        {activeTab === "kadry" ? (
          <PayrollClientsTable
            clients={filteredClients}
            contractsByClient={contractsByClient}
            loading={loading}
            onDetails={setSelectedClient}
          />
        ) : (
          <div style={emptyStateStyle}>
            <strong>{tab.label}</strong>
            <span>Widok gotowy do uzupełnienia.</span>
          </div>
        )}
      </section>

      {selectedClient && (
        <PayrollDetailsModal
          client={selectedClient}
          contracts={selectedContracts}
          onClose={() => setSelectedClient(null)}
          onContractCreated={handleContractCreated}
        />
      )}
    </div>
  );
}

function PayrollClientsTable({
  clients,
  contractsByClient,
  loading,
  onDetails,
}: {
  clients: PayrollClient[];
  contractsByClient: Record<string, PayrollContract[]>;
  loading: boolean;
  onDetails: (client: PayrollClient) => void;
}) {
  if (loading) return <p style={emptyStyle}>Ładowanie klientów kadrowych...</p>;
  if (clients.length === 0) return <p style={emptyStyle}>Brak klientów z zaznaczoną obsługą kadrową.</p>;

  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Klient</Th>
            <Th>Opiekun</Th>
            <Th align="center">Umowy o pracę</Th>
            <Th align="center">Umowy cywilnoprawne</Th>
            <Th align="center">Studenci</Th>
            <Th align="center">Szczegóły</Th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const clientContracts = contractsByClient[client.id] || [];
            return (
              <tr key={client.id}>
                <Td>
                  <strong style={clientNameStyle}>{client.nazwa || "Klient bez nazwy"}</strong>
                  <span style={clientMetaStyle}>{client.nip || "Brak NIP"}</span>
                </Td>
                <Td>{caregiverLabel(client)}</Td>
                <Td align="center"><YesNoBadge value={hasContractType(clientContracts, "umowa_o_prace")} /></Td>
                <Td align="center"><YesNoBadge value={hasContractType(clientContracts, "umowa_cywilnoprawna")} /></Td>
                <Td align="center"><YesNoBadge value={hasContractType(clientContracts, "student")} /></Td>
                <Td align="center">
                  <button type="button" style={detailsButtonStyle} onClick={() => onDetails(client)}>
                    Szczegóły
                  </button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PayrollDetailsModal({
  client,
  contracts,
  onClose,
  onContractCreated,
}: {
  client: PayrollClient;
  contracts: PayrollContract[];
  onClose: () => void;
  onContractCreated: (contract: PayrollContract) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<ContractDraft>(createEmptyDraft());
  const [saving, setSaving] = useState(false);

  function updateDraft<K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === "umowa_na_czas_nieokreslony" && value === true ? { data_konca: "" } : {}),
    }));
  }

  async function saveContract() {
    if (!draft.imie.trim() || !draft.nazwisko.trim()) {
      alert("Uzupełnij imię i nazwisko.");
      return;
    }

    setSaving(true);
    const payload: PayrollContractPayload = {
      klient_id: client.id,
      imie: draft.imie.trim(),
      nazwisko: draft.nazwisko.trim(),
      typ_umowy: draft.typ_umowy,
      numer_umowy: emptyToNull(draft.numer_umowy),
      data_poczatku: emptyToNull(draft.data_poczatku),
      data_konca: draft.typ_umowy === "umowa_o_prace" && draft.umowa_na_czas_nieokreslony ? null : emptyToNull(draft.data_konca),
      umowa_na_czas_nieokreslony: draft.typ_umowy === "umowa_o_prace" ? draft.umowa_na_czas_nieokreslony : false,
      badania_lekarskie_wazne_do: draft.typ_umowy === "umowa_o_prace" ? emptyToNull(draft.badania_lekarskie_wazne_do) : null,
      szkolenie_bhp_wazne_do: draft.typ_umowy === "umowa_o_prace" ? emptyToNull(draft.szkolenie_bhp_wazne_do) : null,
      legitymacja_studencka_wazna_do: draft.typ_umowy === "student" ? emptyToNull(draft.legitymacja_studencka_wazna_do) : null,
    };

    const result = await createPayrollContract(payload);
    if (result.error) {
      console.error("Błąd dodawania umowy kadrowej:", result.error);
      alert("Nie udało się dodać umowy.");
      setSaving(false);
      return;
    }

    onContractCreated(result.data as PayrollContract);
    setDraft(createEmptyDraft());
    setShowForm(false);
    setSaving(false);
  }

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <section style={wideModalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Szczegóły kadrowe</p>
            <h2 style={modalTitleStyle}>{client.nazwa || "Klient bez nazwy"}</h2>
            <p style={modalSubtitleStyle}>NIP: {client.nip || "Brak"} · {contracts.length} {contracts.length === 1 ? "umowa" : "umów"}</p>
          </div>
          <div style={modalActionsStyle}>
            <button type="button" style={primaryButtonStyle} onClick={() => setShowForm((value) => !value)}>
              <Plus size={18} /> Dodaj umowę
            </button>
            <button type="button" style={iconButtonStyle} onClick={onClose} aria-label="Zamknij">
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={modalBodyStyle}>
          {showForm && (
            <section style={formBoxStyle}>
              <div style={formHeaderStyle}>
                <h3 style={formTitleStyle}>Nowa umowa</h3>
                <button type="button" style={secondaryButtonStyle} onClick={() => setShowForm(false)}>Anuluj</button>
              </div>
              <div style={formGridStyle}>
                <Field label="Imię"><input style={inputStyle} value={draft.imie} onChange={(event) => updateDraft("imie", event.target.value)} /></Field>
                <Field label="Nazwisko"><input style={inputStyle} value={draft.nazwisko} onChange={(event) => updateDraft("nazwisko", event.target.value)} /></Field>
                <Field label="Typ umowy">
                  <AppSelect style={inputStyle} value={draft.typ_umowy} options={CONTRACT_TYPE_OPTIONS} onChange={(value) => updateDraft("typ_umowy", value as PayrollContractType)} />
                </Field>
                <Field label="Numer umowy"><input style={inputStyle} value={draft.numer_umowy} onChange={(event) => updateDraft("numer_umowy", event.target.value)} /></Field>
                <Field label="Data początku"><input type="date" style={inputStyle} value={draft.data_poczatku} onChange={(event) => updateDraft("data_poczatku", event.target.value)} /></Field>
                <Field label="Data końca">
                  <input
                    type="date"
                    style={draft.typ_umowy === "umowa_o_prace" && draft.umowa_na_czas_nieokreslony ? disabledInputStyle : inputStyle}
                    value={draft.data_konca}
                    disabled={draft.typ_umowy === "umowa_o_prace" && draft.umowa_na_czas_nieokreslony}
                    onChange={(event) => updateDraft("data_konca", event.target.value)}
                  />
                </Field>
                {draft.typ_umowy === "umowa_o_prace" && (
                  <>
                    <label style={checkboxFieldStyle}>
                      <input
                        type="checkbox"
                        checked={draft.umowa_na_czas_nieokreslony}
                        onChange={(event) => updateDraft("umowa_na_czas_nieokreslony", event.target.checked)}
                        style={checkboxInputStyle}
                      />
                      Umowa na czas nieokreślony
                    </label>
                    <Field label="Badania lekarskie ważne do"><input type="date" style={inputStyle} value={draft.badania_lekarskie_wazne_do} onChange={(event) => updateDraft("badania_lekarskie_wazne_do", event.target.value)} /></Field>
                    <Field label="Szkolenie BHP ważne do"><input type="date" style={inputStyle} value={draft.szkolenie_bhp_wazne_do} onChange={(event) => updateDraft("szkolenie_bhp_wazne_do", event.target.value)} /></Field>
                  </>
                )}
                {draft.typ_umowy === "student" && (
                  <Field label="Legitymacja studencka ważna do"><input type="date" style={inputStyle} value={draft.legitymacja_studencka_wazna_do} onChange={(event) => updateDraft("legitymacja_studencka_wazna_do", event.target.value)} /></Field>
                )}
              </div>
              <div style={formActionsStyle}>
                <button type="button" style={primaryButtonStyle} onClick={saveContract} disabled={saving}>
                  {saving ? "Zapisywanie..." : "Zapisz umowę"}
                </button>
              </div>
            </section>
          )}

          <section style={contractsSectionStyle}>
            {contracts.length === 0 ? (
              <p style={emptyInlineStyle}>Brak dodanych umów kadrowych.</p>
            ) : (
              <div style={tableWrapStyle}>
                <table style={detailsTableStyle}>
                  <thead>
                    <tr>
                      <Th>Imię</Th>
                      <Th>Nazwisko</Th>
                      <Th>Typ umowy</Th>
                      <Th>Numer umowy</Th>
                      <Th>Data początku</Th>
                      <Th>Data końca</Th>
                      <Th>Badania lekarskie</Th>
                      <Th>Szkolenie BHP</Th>
                      <Th>Legitymacja studencka</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((contract) => (
                      <tr key={contract.id}>
                        <Td>{contract.imie}</Td>
                        <Td>{contract.nazwisko}</Td>
                        <Td>{contractTypeLabel(contract.typ_umowy)}</Td>
                        <Td>{contract.numer_umowy || "-"}</Td>
                        <Td>{formatDate(contract.data_poczatku)}</Td>
                        <Td>{contract.typ_umowy === "umowa_o_prace" && contract.umowa_na_czas_nieokreslony ? "czas nieokreślony" : formatDate(contract.data_konca)}</Td>
                        <Td>{contract.typ_umowy === "umowa_o_prace" ? formatDate(contract.badania_lekarskie_wazne_do) : "-"}</Td>
                        <Td>{contract.typ_umowy === "umowa_o_prace" ? formatDate(contract.szkolenie_bhp_wazne_do) : "-"}</Td>
                        <Td>{contract.typ_umowy === "student" ? formatDate(contract.legitymacja_studencka_wazna_do) : "-"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

function YesNoBadge({ value }: { value: boolean }) {
  return <span style={value ? yesBadgeStyle : noBadgeStyle}>{value ? "tak" : "nie"}</span>;
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "center" }) {
  return <th style={align === "center" ? centeredThStyle : thStyle}>{children}</th>;
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "center" }) {
  return <td style={align === "center" ? centeredTdStyle : tdStyle}>{children}</td>;
}

function createEmptyDraft(): ContractDraft {
  return {
    imie: "",
    nazwisko: "",
    typ_umowy: "umowa_o_prace",
    numer_umowy: "",
    data_poczatku: "",
    data_konca: "",
    umowa_na_czas_nieokreslony: false,
    badania_lekarskie_wazne_do: "",
    szkolenie_bhp_wazne_do: "",
    legitymacja_studencka_wazna_do: "",
  };
}

function groupContractsByClient(contracts: PayrollContract[]) {
  return contracts.reduce<Record<string, PayrollContract[]>>((groups, contract) => {
    groups[contract.klient_id] = [...(groups[contract.klient_id] || []), contract].sort(sortContracts);
    return groups;
  }, {});
}

function sortContracts(first: PayrollContract, second: PayrollContract) {
  const lastNameCompare = first.nazwisko.localeCompare(second.nazwisko, "pl", { sensitivity: "base" });
  if (lastNameCompare !== 0) return lastNameCompare;
  return first.imie.localeCompare(second.imie, "pl", { sensitivity: "base" });
}

function hasContractType(contracts: PayrollContract[], type: PayrollContractType) {
  return contracts.some((contract) => contract.typ_umowy === type);
}

function filterClients(clients: PayrollClient[], searchTerm: string) {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) return clients;

  return clients.filter((client) => [
    client.nazwa,
    client.nip,
    client.email,
    caregiverLabel(client),
  ].some((value) => String(value || "").toLowerCase().includes(normalized)));
}

function caregiverLabel(client: PayrollClient) {
  const profile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  return profile?.full_name || profile?.email || "Brak opiekuna";
}

function contractTypeLabel(type: PayrollContractType) {
  return CONTRACT_TYPE_OPTIONS.find((option) => option.value === type)?.label || type;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pl-PL").format(new Date(`${value}T12:00:00`)) : "-";
}

function emptyToNull(value: string) {
  return value.trim() ? value.trim() : null;
}

function tabHint(tab: PayrollTab) {
  if (tab === "kadry") return "Klienci z zaznaczoną obsługą kadrową.";
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
const searchRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "12px", padding: "0 24px 18px" };
const searchInputStyle: CSSProperties = { width: "100%", flex: "1 1 auto", minWidth: 0, border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "13px 16px", background: colors.inputBackground, color: colors.text, fontSize: "15px", fontWeight: 650, outline: "none" };
const clearSearchButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "12px 14px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
const emptyStateStyle: CSSProperties = { minHeight: "220px", padding: "28px 24px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "8px", color: colors.muted, fontWeight: 750, textAlign: "center" };
const emptyStyle: CSSProperties = { margin: 0, padding: "28px 24px", color: colors.muted, fontWeight: 750 };
const emptyInlineStyle: CSSProperties = { margin: 0, color: colors.muted, fontWeight: 750 };
const tableWrapStyle: CSSProperties = { width: "100%", overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", minWidth: "980px", borderCollapse: "collapse" };
const detailsTableStyle: CSSProperties = { width: "100%", minWidth: "1240px", borderCollapse: "collapse" };
const thStyle: CSSProperties = { padding: "14px 18px", textAlign: "left", fontSize: "12px", color: colors.text, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "16px 18px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle", fontSize: "14px" };
const centeredThStyle: CSSProperties = { ...thStyle, textAlign: "center" };
const centeredTdStyle: CSSProperties = { ...tdStyle, textAlign: "center" };
const clientNameStyle: CSSProperties = { display: "block", color: colors.navy, fontSize: "15px", lineHeight: 1.35 };
const clientMetaStyle: CSSProperties = { display: "block", marginTop: "4px", color: colors.muted, fontSize: "12px", fontWeight: 750 };
const yesBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "28px", minWidth: "48px", padding: "4px 10px", borderRadius: radius.badge, background: "rgba(22, 163, 74, 0.12)", color: colors.success, fontSize: "12px", fontWeight: 900, textTransform: "uppercase" };
const noBadgeStyle: CSSProperties = { ...yesBadgeStyle, background: "rgba(239, 68, 68, 0.12)", color: colors.red };
const detailsButtonStyle: CSSProperties = { minHeight: "38px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const modalOverlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(15, 23, 42, 0.38)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "28px", overflowY: "auto" };
const wideModalStyle: CSSProperties = { width: "min(1380px, calc(100vw - 56px))", maxHeight: "calc(100vh - 56px)", borderRadius: radius.card, background: colors.white, border: `1px solid ${colors.border}`, boxShadow: "0 32px 90px rgba(15, 23, 42, 0.28)", overflow: "hidden", display: "flex", flexDirection: "column" };
const modalHeaderStyle: CSSProperties = { padding: "22px 24px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const modalTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "26px", lineHeight: 1.2 };
const modalSubtitleStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, fontSize: "13px", fontWeight: 750 };
const modalActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center" };
const modalBodyStyle: CSSProperties = { padding: "22px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "18px" };
const iconButtonStyle: CSSProperties = { width: "42px", height: "42px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const primaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 16px", border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const formBoxStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.inputBackground, padding: "18px" };
const formHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "16px" };
const formTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "18px" };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px" };
const formActionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", marginTop: "16px" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const fieldLabelStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 850, textTransform: "uppercase" };
const inputStyle: CSSProperties = { minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.text, padding: "0 12px", fontSize: "14px", fontWeight: 750 };
const disabledInputStyle: CSSProperties = { ...inputStyle, background: "rgba(226, 232, 240, 0.72)", color: colors.muted, cursor: "not-allowed" };
const checkboxFieldStyle: CSSProperties = { minHeight: "42px", display: "flex", alignItems: "center", gap: "8px", color: colors.navy, fontSize: "14px", fontWeight: 850 };
const checkboxInputStyle: CSSProperties = { width: "16px", height: "16px", margin: 0, accentColor: colors.navy };
const contractsSectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "0", overflow: "hidden" };
