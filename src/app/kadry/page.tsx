"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
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
import {
  addClientToPayrollA1,
  fetchPayrollA1Records,
  fetchPayrollA1MonthlyRevenues,
  updatePayrollA1Record,
  upsertPayrollA1MonthlyRevenue,
  type PayrollA1MonthlyRevenue,
  type PayrollA1Record,
} from "@/lib/payrollA1Service";

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

type A1Draft = {
  data_uzyskania_a1: string;
  data_konca_a1: string;
  uwagi: string;
};

type A1Row = {
  record: PayrollA1Record;
  client: PayrollClient | null;
  monthly: PayrollA1MonthlyRevenue[];
};

type A1Totals = {
  krajowy: number;
  zagraniczny: number;
  razem: number;
  procentZagraniczny: number;
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
  const [a1Records, setA1Records] = useState<PayrollA1Record[]>([]);
  const [a1MonthlyRevenues, setA1MonthlyRevenues] = useState<PayrollA1MonthlyRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [a1AddSearch, setA1AddSearch] = useState("");
  const [a1ClientToAdd, setA1ClientToAdd] = useState("");
  const [showA1AddForm, setShowA1AddForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState<PayrollClient | null>(null);
  const [selectedA1RecordId, setSelectedA1RecordId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [clientsResult, contractsResult, a1Result, a1MonthlyResult] = await Promise.all([
        fetchClients(),
        fetchPayrollContracts(),
        fetchPayrollA1Records(),
        fetchPayrollA1MonthlyRevenues(),
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

      if (a1Result.error) {
        console.error("Błąd pobierania A1:", a1Result.error);
        setA1Records([]);
      } else {
        setA1Records((a1Result.data || []) as PayrollA1Record[]);
      }

      if (a1MonthlyResult.error) {
        console.error("Błąd pobierania przychodów A1:", a1MonthlyResult.error);
        setA1MonthlyRevenues([]);
      } else {
        setA1MonthlyRevenues((a1MonthlyResult.data || []) as PayrollA1MonthlyRevenue[]);
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
  const a1Rows = useMemo(() => buildA1Rows(a1Records, clients, a1MonthlyRevenues), [a1Records, clients, a1MonthlyRevenues]);
  const filteredA1Rows = useMemo(() => filterA1Rows(a1Rows, searchTerm), [a1Rows, searchTerm]);
  const availableA1Clients = useMemo(
    () => clients.filter((client) => !a1Records.some((record) => record.klient_id === client.id)),
    [clients, a1Records]
  );
  const filteredA1Clients = useMemo(() => filterClients(availableA1Clients, a1AddSearch), [availableA1Clients, a1AddSearch]);
  const selectedA1ClientToAdd = availableA1Clients.find((client) => client.id === a1ClientToAdd) || null;
  const selectedA1Row = selectedA1RecordId ? a1Rows.find((row) => row.record.id === selectedA1RecordId) || null : null;
  const selectedContracts = selectedClient ? contractsByClient[selectedClient.id] || [] : [];
  const tab = PAYROLL_TABS.find((item) => item.value === activeTab) || PAYROLL_TABS[0];

  function handleContractCreated(contract: PayrollContract) {
    setContracts((current) => [...current, contract].sort(sortContracts));
  }

  async function handleAddA1Client() {
    if (!a1ClientToAdd) return;

    const result = await addClientToPayrollA1(a1ClientToAdd);
    if (result.error) {
      console.error("Błąd dodawania klienta do A1:", result.error);
      alert("Nie udało się dodać klienta do A1.");
      return;
    }

    setA1Records((current) => [result.data as PayrollA1Record, ...current]);
    setA1ClientToAdd("");
    setA1AddSearch("");
    setShowA1AddForm(false);
  }

  function handleA1Updated(record: PayrollA1Record) {
    setA1Records((current) => current.map((item) => item.id === record.id ? record : item));
  }

  function handleA1MonthlyUpdated(revenue: PayrollA1MonthlyRevenue) {
    setA1MonthlyRevenues((current) => {
      const exists = current.some((item) => item.id === revenue.id || (item.a1_id === revenue.a1_id && item.rok === revenue.rok && item.miesiac === revenue.miesiac));
      if (!exists) return [...current, revenue];
      return current.map((item) => item.id === revenue.id || (item.a1_id === revenue.a1_id && item.rok === revenue.rok && item.miesiac === revenue.miesiac) ? revenue : item);
    });
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
          {activeTab === "a1" && (
            <button type="button" onClick={() => setShowA1AddForm((value) => !value)} style={primaryButtonStyle}>
              <Plus size={18} /> Dodaj klienta
            </button>
          )}
        </div>

        {(activeTab === "kadry" || activeTab === "a1") && (
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

        {activeTab === "a1" && showA1AddForm && (
          <div style={addFormStyle}>
            <div style={clientPickerStyle}>
              <input
                type="search"
                value={a1AddSearch}
                onChange={(event) => {
                  setA1AddSearch(event.target.value);
                  setA1ClientToAdd("");
                }}
                placeholder="Wpisz nazwę klienta lub NIP"
                style={clientPickerInputStyle}
              />
              {selectedA1ClientToAdd && (
                <div style={selectedClientStyle}>
                  Wybrano: <strong>{selectedA1ClientToAdd.nazwa || "Klient bez nazwy"}</strong>
                </div>
              )}
              <div style={clientPickerListStyle}>
                {!a1AddSearch.trim() ? (
                  <div style={clientPickerEmptyStyle}>Wpisz pierwszą literę, żeby wyszukać klienta.</div>
                ) : filteredA1Clients.length === 0 ? (
                  <div style={clientPickerEmptyStyle}>Brak klientów do dodania.</div>
                ) : (
                  filteredA1Clients.slice(0, 8).map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => {
                        setA1ClientToAdd(client.id);
                        setA1AddSearch(`${client.nazwa || "Klient bez nazwy"}${client.nip ? ` (${client.nip})` : ""}`);
                      }}
                      style={a1ClientToAdd === client.id ? activeClientOptionStyle : clientOptionStyle}
                    >
                      <strong>{client.nazwa || "Klient bez nazwy"}</strong>
                      <span>{client.nip || "Brak NIP"} · {caregiverLabel(client)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <button type="button" onClick={() => void handleAddA1Client()} disabled={!a1ClientToAdd} style={smallPrimaryButtonStyle}>Dodaj</button>
          </div>
        )}

        {activeTab === "kadry" ? (
          <PayrollClientsTable
            clients={filteredClients}
            contractsByClient={contractsByClient}
            loading={loading}
            onDetails={setSelectedClient}
          />
        ) : activeTab === "a1" ? (
          <A1Table
            rows={filteredA1Rows}
            loading={loading}
            onDetails={(recordId) => setSelectedA1RecordId(recordId)}
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

      {selectedA1Row && (
        <A1DetailsModal
          row={selectedA1Row}
          onClose={() => setSelectedA1RecordId(null)}
          onUpdated={handleA1Updated}
          onMonthlyUpdated={handleA1MonthlyUpdated}
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

function A1Table({
  rows,
  loading,
  onDetails,
}: {
  rows: A1Row[];
  loading: boolean;
  onDetails: (recordId: string) => void;
}) {
  if (loading) return <p style={emptyStyle}>Ładowanie klientów A1...</p>;
  if (rows.length === 0) return <p style={emptyStyle}>Brak klientów dodanych do A1.</p>;

  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Klient</Th>
            <Th>Opiekun</Th>
            <Th>Data uzyskania A1</Th>
            <Th>Data końca A1</Th>
            <Th align="center">% przychodów zagranicznych</Th>
            <Th align="center">Szczegóły</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.record.id}>
              <Td>
                <strong style={clientNameStyle}>{row.client?.nazwa || "Klient bez nazwy"}</strong>
                <span style={clientMetaStyle}>{row.client?.nip || "Brak NIP"}</span>
              </Td>
              <Td>{caregiverLabel(row.client)}</Td>
              <Td>{formatDate(row.record.data_uzyskania_a1)}</Td>
              <Td>{formatDate(row.record.data_konca_a1)}</Td>
              <Td align="center"><A1PercentBadge value={calculateA1Totals(row.monthly).procentZagraniczny} /></Td>
              <Td align="center">
                <button type="button" style={detailsButtonStyle} onClick={() => onDetails(row.record.id)}>
                  Szczegóły
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function A1DetailsModal({
  row,
  onClose,
  onUpdated,
  onMonthlyUpdated,
}: {
  row: A1Row;
  onClose: () => void;
  onUpdated: (record: PayrollA1Record) => void;
  onMonthlyUpdated: (revenue: PayrollA1MonthlyRevenue) => void;
}) {
  const [draft, setDraft] = useState<A1Draft>(() => createA1Draft(row.record));
  const [monthValues, setMonthValues] = useState<Record<string, { krajowy: string; zagraniczny: string }>>(() => a1MonthValueMap(row.monthly));
  const [saving, setSaving] = useState(false);
  const months = a1MonthsBetween(draft.data_uzyskania_a1, draft.data_konca_a1);
  const totals = calculateA1TotalsFromValues(monthValues);

  function updateDraft<K extends keyof A1Draft>(key: K, value: A1Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveA1() {
    setSaving(true);
    const result = await updatePayrollA1Record(row.record.id, {
      data_uzyskania_a1: emptyToNull(draft.data_uzyskania_a1),
      data_konca_a1: emptyToNull(draft.data_konca_a1),
      procent_przychodow_zagranicznych: totals.procentZagraniczny,
      uwagi: emptyToNull(draft.uwagi),
    });

    if (result.error) {
      console.error("Błąd zapisu A1:", result.error);
      alert("Nie udało się zapisać szczegółów A1.");
      setSaving(false);
      return;
    }

    for (const month of months) {
      const values = monthValues[a1MonthKey(month.year, month.month)] || { krajowy: "", zagraniczny: "" };
      if (!hasTypedMonthlyValue(values.krajowy) && !hasTypedMonthlyValue(values.zagraniczny)) continue;

      const monthlyResult = await upsertPayrollA1MonthlyRevenue({
        a1_id: row.record.id,
        rok: month.year,
        miesiac: month.month,
        przychod_krajowy: parseAmount(values.krajowy),
        przychod_zagraniczny: parseAmount(values.zagraniczny),
      });

      if (monthlyResult.error) {
        console.error("Błąd zapisu przychodów A1:", monthlyResult.error);
        alert("Nie udało się zapisać przychodów miesięcznych A1.");
        setSaving(false);
        return;
      }

      onMonthlyUpdated(monthlyResult.data as PayrollA1MonthlyRevenue);
    }

    setSaving(false);
    onUpdated(result.data as PayrollA1Record);
    onClose();
  }

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <section style={detailsModalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Szczegóły A1</p>
            <h2 style={modalTitleStyle}>{row.client?.nazwa || "Klient bez nazwy"}</h2>
            <p style={modalSubtitleStyle}>NIP: {row.client?.nip || "Brak"} · {caregiverLabel(row.client)}</p>
          </div>
          <button type="button" style={iconButtonStyle} onClick={onClose} aria-label="Zamknij">
            <X size={20} />
          </button>
        </div>

        <div style={a1ModalBodyStyle}>
          <section style={formBoxStyle}>
            <div style={formGridStyle}>
              <DateField label="Data uzyskania A1" value={draft.data_uzyskania_a1} onChange={(value) => updateDraft("data_uzyskania_a1", value)} />
              <DateField label="Data końca A1" value={draft.data_konca_a1} onChange={(value) => updateDraft("data_konca_a1", value)} />
            </div>
            <label style={{ ...fieldStyle, marginTop: "14px" }}>
              <span style={fieldLabelStyle}>Uwagi</span>
              <textarea style={textareaStyle} value={draft.uwagi} onChange={(event) => updateDraft("uwagi", event.target.value)} />
            </label>
          </section>

          <section style={summaryGridStyle}>
            <SummaryTile label="Przychód krajowy" value={formatMoney(totals.krajowy)} />
            <SummaryTile label="Przychód zagraniczny" value={formatMoney(totals.zagraniczny)} />
            <SummaryTile label="Przychód razem" value={formatMoney(totals.razem)} />
            <SummaryTile label="% zagranicznych" value={<A1PercentBadge value={totals.procentZagraniczny} />} />
          </section>

          <section style={contractsSectionStyle}>
            {months.length === 0 ? (
              <p style={emptyStyle}>Uzupełnij datę uzyskania A1 i datę końca A1, aby wygenerować miesiące.</p>
            ) : (
              <div style={tableWrapStyle}>
                <table style={a1MonthlyTableStyle}>
                  <thead>
                    <tr>
                      <Th>Miesiąc</Th>
                      <Th>Przychód krajowy</Th>
                      <Th>Przychód zagraniczny</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((month) => {
                      const key = a1MonthKey(month.year, month.month);
                      const values = monthValues[key] || { krajowy: "", zagraniczny: "" };

                      return (
                        <tr key={key}>
                          <Td><strong>{month.label}</strong></Td>
                          <Td>
                            <input
                              value={values.krajowy}
                              onChange={(event) => setMonthValues((current) => ({ ...current, [key]: { ...values, krajowy: event.target.value } }))}
                              inputMode="decimal"
                              placeholder="0,00"
                              style={inputStyle}
                            />
                          </Td>
                          <Td>
                            <input
                              value={values.zagraniczny}
                              onChange={(event) => setMonthValues((current) => ({ ...current, [key]: { ...values, zagraniczny: event.target.value } }))}
                              inputMode="decimal"
                              placeholder="0,00"
                              style={inputStyle}
                            />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
        <div style={stickyModalFooterStyle}>
          <button type="button" style={primaryButtonStyle} onClick={saveA1} disabled={saving}>
            {saving ? "Zapisywanie..." : "Zapisz szczegóły"}
          </button>
        </div>
      </section>
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

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => dateFromInput(value) || new Date());
  const days = calendarDays(viewDate);

  function changeMonth(delta: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1, 12));
  }

  function selectDate(date: Date) {
    onChange(dateToInputValue(date));
    setViewDate(new Date(date.getFullYear(), date.getMonth(), 1, 12));
    setOpen(false);
  }

  return (
    <div style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <div style={datePickerWrapStyle}>
        <button type="button" style={dateInputButtonStyle} onClick={() => setOpen((current) => !current)}>
          <span style={value ? dateInputValueStyle : dateInputPlaceholderStyle}>{value ? formatDate(value) : "dd.mm.rrrr"}</span>
          <CalendarDays size={18} />
        </button>
        {open && (
          <div style={dateCalendarStyle}>
            <div style={dateCalendarHeaderStyle}>
              <button type="button" style={dateNavButtonStyle} onClick={() => changeMonth(-1)} aria-label="Poprzedni miesiąc">
                <ChevronLeft size={18} />
              </button>
              <strong>{formatCalendarMonth(viewDate)}</strong>
              <button type="button" style={dateNavButtonStyle} onClick={() => changeMonth(1)} aria-label="Następny miesiąc">
                <ChevronRight size={18} />
              </button>
            </div>
            <div style={dateWeekdaysStyle}>
              {["pon", "wt", "śr", "czw", "pt", "sob", "nie"].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div style={dateDaysGridStyle}>
              {days.map((day) => {
                const inputValue = dateToInputValue(day.date);
                const selected = value === inputValue;
                const muted = day.date.getMonth() !== viewDate.getMonth();
                return (
                  <button
                    key={inputValue}
                    type="button"
                    style={selected ? selectedDateDayStyle : muted ? mutedDateDayStyle : dateDayStyle}
                    onClick={() => selectDate(day.date)}
                  >
                    {day.date.getDate()}
                  </button>
                );
              })}
            </div>
            <div style={dateCalendarFooterStyle}>
              <button type="button" style={dateFooterButtonStyle} onClick={() => onChange("")}>Wyczyść</button>
              <button type="button" style={dateFooterButtonStyle} onClick={() => selectDate(new Date())}>Dzisiaj</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function YesNoBadge({ value }: { value: boolean }) {
  return <span style={value ? yesBadgeStyle : noBadgeStyle}>{value ? "tak" : "nie"}</span>;
}

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={summaryTileStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function A1PercentBadge({ value }: { value: number | string }) {
  const percent = Number(String(value || 0).replace(",", "."));
  const safePercent = Number.isFinite(percent) ? percent : 0;
  return <span style={safePercent <= 75 ? a1OkBadgeStyle : a1WarningBadgeStyle}>{formatPercent(safePercent)}</span>;
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

function createA1Draft(record: PayrollA1Record): A1Draft {
  return {
    data_uzyskania_a1: record.data_uzyskania_a1 || "",
    data_konca_a1: record.data_konca_a1 || "",
    uwagi: record.uwagi || "",
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

function buildA1Rows(records: PayrollA1Record[], clients: PayrollClient[], monthly: PayrollA1MonthlyRevenue[]): A1Row[] {
  return records.map((record) => ({
    record,
    client: clients.find((client) => client.id === record.klient_id) || null,
    monthly: monthly.filter((item) => item.a1_id === record.id),
  }));
}

function filterA1Rows(rows: A1Row[], searchTerm: string) {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) return rows;

  return rows.filter((row) => [
    row.client?.nazwa,
    row.client?.nip,
    row.client?.email,
    caregiverLabel(row.client),
  ].some((value) => String(value || "").toLowerCase().includes(normalized)));
}

function caregiverLabel(client: PayrollClient | null | undefined) {
  const profile = Array.isArray(client?.profiles) ? client.profiles[0] : client?.profiles;
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

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(value)}%`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value);
}

function parseAmount(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function hasTypedMonthlyValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function toNumber(value: number | string | null | undefined) {
  const numberValue = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function a1MonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function a1MonthValueMap(monthly: PayrollA1MonthlyRevenue[]) {
  return monthly.reduce<Record<string, { krajowy: string; zagraniczny: string }>>((values, item) => {
    values[a1MonthKey(item.rok, item.miesiac)] = {
      krajowy: toNumber(item.przychod_krajowy) ? String(item.przychod_krajowy) : "",
      zagraniczny: toNumber(item.przychod_zagraniczny) ? String(item.przychod_zagraniczny) : "",
    };
    return values;
  }, {});
}

function a1MonthsBetween(startDate: string, endDate: string) {
  if (!startDate || !endDate) return [];
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const formatter = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });
  const months: { year: number; month: number; label: string }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1, 12);

  while (cursor <= endCursor) {
    months.push({
      year: cursor.getFullYear(),
      month: cursor.getMonth() + 1,
      label: formatter.format(cursor),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function dateFromInput(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateToInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDays(viewDate: Date) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1, 12);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date };
  });
}

function formatCalendarMonth(date: Date) {
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(date);
}

function calculateA1Totals(monthly: PayrollA1MonthlyRevenue[]): A1Totals {
  const krajowy = monthly.reduce((sum, item) => sum + toNumber(item.przychod_krajowy), 0);
  const zagraniczny = monthly.reduce((sum, item) => sum + toNumber(item.przychod_zagraniczny), 0);
  return buildA1Totals(krajowy, zagraniczny);
}

function calculateA1TotalsFromValues(values: Record<string, { krajowy: string; zagraniczny: string }>): A1Totals {
  const entries = Object.values(values);
  const krajowy = entries.reduce((sum, item) => sum + parseAmount(item.krajowy), 0);
  const zagraniczny = entries.reduce((sum, item) => sum + parseAmount(item.zagraniczny), 0);
  return buildA1Totals(krajowy, zagraniczny);
}

function buildA1Totals(krajowy: number, zagraniczny: number): A1Totals {
  const razem = krajowy + zagraniczny;
  return {
    krajowy,
    zagraniczny,
    razem,
    procentZagraniczny: razem > 0 ? (zagraniczny / razem) * 100 : 0,
  };
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
const searchRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "12px", padding: "18px 24px 18px" };
const searchInputStyle: CSSProperties = { width: "100%", flex: "1 1 auto", minWidth: 0, border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "13px 16px", background: colors.inputBackground, color: colors.text, fontSize: "15px", fontWeight: 650, outline: "none" };
const clearSearchButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "12px 14px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
const addFormStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "12px", padding: "0 24px 18px", alignItems: "start" };
const clientPickerStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const clientPickerInputStyle: CSSProperties = { minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "0 14px", color: colors.navy, fontWeight: 750, background: colors.white, outline: "none" };
const selectedClientStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 800 };
const clientPickerListStyle: CSSProperties = { display: "grid", gap: "6px", maxHeight: "310px", overflowY: "auto" };
const clientPickerEmptyStyle: CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.button, color: colors.muted, padding: "12px", fontWeight: 750 };
const clientOptionStyle: CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.text, padding: "10px 12px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", textAlign: "left", cursor: "pointer" };
const activeClientOptionStyle: CSSProperties = { ...clientOptionStyle, borderColor: colors.navy, background: "rgba(23, 59, 115, 0.08)" };
const emptyStateStyle: CSSProperties = { minHeight: "220px", padding: "28px 24px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "8px", color: colors.muted, fontWeight: 750, textAlign: "center" };
const emptyStyle: CSSProperties = { margin: 0, padding: "28px 24px", color: colors.muted, fontWeight: 750 };
const emptyInlineStyle: CSSProperties = { margin: 0, color: colors.muted, fontWeight: 750 };
const tableWrapStyle: CSSProperties = { width: "100%", overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", minWidth: "980px", borderCollapse: "collapse" };
const detailsTableStyle: CSSProperties = { width: "100%", minWidth: "1240px", borderCollapse: "collapse" };
const a1MonthlyTableStyle: CSSProperties = { width: "100%", minWidth: "760px", borderCollapse: "collapse" };
const thStyle: CSSProperties = { padding: "14px 18px", textAlign: "left", fontSize: "12px", color: colors.text, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "16px 18px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle", fontSize: "14px" };
const centeredThStyle: CSSProperties = { ...thStyle, textAlign: "center" };
const centeredTdStyle: CSSProperties = { ...tdStyle, textAlign: "center" };
const clientNameStyle: CSSProperties = { display: "block", color: colors.navy, fontSize: "15px", lineHeight: 1.35 };
const clientMetaStyle: CSSProperties = { display: "block", marginTop: "4px", color: colors.muted, fontSize: "12px", fontWeight: 750 };
const yesBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "28px", minWidth: "48px", padding: "4px 10px", borderRadius: radius.badge, background: "rgba(22, 163, 74, 0.12)", color: colors.success, fontSize: "12px", fontWeight: 900, textTransform: "uppercase" };
const noBadgeStyle: CSSProperties = { ...yesBadgeStyle, background: "rgba(239, 68, 68, 0.12)", color: colors.red };
const a1OkBadgeStyle: CSSProperties = { ...yesBadgeStyle, minWidth: "64px" };
const a1WarningBadgeStyle: CSSProperties = { ...a1OkBadgeStyle, background: "rgba(239, 68, 68, 0.12)", color: colors.red };
const detailsButtonStyle: CSSProperties = { minHeight: "38px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const modalOverlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(15, 23, 42, 0.38)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "28px", overflowY: "auto" };
const wideModalStyle: CSSProperties = { width: "min(1380px, calc(100vw - 56px))", maxHeight: "calc(100vh - 56px)", borderRadius: radius.card, background: colors.white, border: `1px solid ${colors.border}`, boxShadow: "0 32px 90px rgba(15, 23, 42, 0.28)", overflow: "hidden", display: "flex", flexDirection: "column" };
const detailsModalStyle: CSSProperties = { width: "min(980px, calc(100vw - 56px))", maxHeight: "calc(100vh - 56px)", borderRadius: radius.card, background: colors.white, border: `1px solid ${colors.border}`, boxShadow: "0 32px 90px rgba(15, 23, 42, 0.28)", overflow: "hidden", display: "flex", flexDirection: "column" };
const modalHeaderStyle: CSSProperties = { padding: "22px 24px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const modalTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "26px", lineHeight: 1.2 };
const modalSubtitleStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, fontSize: "13px", fontWeight: 750 };
const modalActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center" };
const modalBodyStyle: CSSProperties = { padding: "22px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "18px" };
const a1ModalBodyStyle: CSSProperties = { ...modalBodyStyle, flex: "1 1 auto", minHeight: 0, paddingBottom: "24px" };
const stickyModalFooterStyle: CSSProperties = { flex: "0 0 auto", display: "flex", justifyContent: "flex-end", padding: "16px 24px 22px", borderTop: `1px solid ${colors.border}`, background: colors.white };
const iconButtonStyle: CSSProperties = { width: "42px", height: "42px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const primaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 16px", border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" };
const smallPrimaryButtonStyle: CSSProperties = { ...primaryButtonStyle, minHeight: "44px", alignSelf: "start" };
const secondaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const formBoxStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.inputBackground, padding: "18px" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" };
const summaryTileStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "14px", display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontSize: "12px", fontWeight: 850, textTransform: "uppercase" };
const formHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "16px" };
const formTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "18px" };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px" };
const formActionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", marginTop: "16px" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const fieldLabelStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 850, textTransform: "uppercase" };
const inputStyle: CSSProperties = { minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.text, padding: "0 12px", fontSize: "14px", fontWeight: 750 };
const datePickerWrapStyle: CSSProperties = { position: "relative" };
const dateInputButtonStyle: CSSProperties = { ...inputStyle, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", cursor: "pointer", textAlign: "left" };
const dateInputValueStyle: CSSProperties = { color: colors.text, fontWeight: 800 };
const dateInputPlaceholderStyle: CSSProperties = { color: colors.muted, fontWeight: 800 };
const dateCalendarStyle: CSSProperties = { position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 80, width: "300px", border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.white, boxShadow: shadow.card, padding: "12px" };
const dateCalendarHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "10px", color: colors.navy, textTransform: "capitalize" };
const dateNavButtonStyle: CSSProperties = { width: "34px", height: "34px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, color: colors.navy, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const dateWeekdaysStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "6px", color: colors.muted, fontSize: "11px", fontWeight: 850, textAlign: "center", textTransform: "uppercase" };
const dateDaysGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" };
const dateDayStyle: CSSProperties = { height: "34px", border: "none", borderRadius: radius.button, background: colors.white, color: colors.text, fontWeight: 500, cursor: "pointer" };
const mutedDateDayStyle: CSSProperties = { ...dateDayStyle, color: colors.muted, background: colors.inputBackground };
const selectedDateDayStyle: CSSProperties = { ...dateDayStyle, background: colors.navy, color: colors.white };
const dateCalendarFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "10px", marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${colors.border}` };
const dateFooterButtonStyle: CSSProperties = { border: "none", background: "transparent", color: colors.navy, fontWeight: 850, cursor: "pointer", padding: "6px 0" };
const textareaStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.text, padding: "12px", minHeight: "96px", resize: "vertical", fontSize: "14px", fontWeight: 700, fontFamily: "inherit" };
const disabledInputStyle: CSSProperties = { ...inputStyle, background: "rgba(226, 232, 240, 0.72)", color: colors.muted, cursor: "not-allowed" };
const checkboxFieldStyle: CSSProperties = { minHeight: "42px", display: "flex", alignItems: "center", gap: "8px", color: colors.navy, fontSize: "14px", fontWeight: 850 };
const checkboxInputStyle: CSSProperties = { width: "16px", height: "16px", margin: 0, accentColor: colors.navy };
const contractsSectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "0", overflow: "hidden" };
