"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Save, Send, X } from "lucide-react";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients, updateClient } from "@/lib/clientService";
import {
  createPayrollContract,
  fetchPayrollContracts,
  type PayrollContract,
  type PayrollContractPayload,
  type PayrollContractType,
} from "@/lib/payrollContractService";
import {
  addClientToPayrollA1,
  fetchPayrollA1NotificationHistory,
  fetchPayrollA1Records,
  fetchPayrollA1MonthlyRevenues,
  sendPayrollA1ClientNotification,
  updatePayrollA1Record,
  upsertPayrollA1MonthlyRevenue,
  type PayrollA1NotificationHistory,
  type PayrollA1MonthlyRevenue,
  type PayrollA1Record,
} from "@/lib/payrollA1Service";
import { fetchPayrollNotificationsForClient, type AppNotification } from "@/lib/notificationService";
import {
  fetchZusContributionRateHistory,
  fetchZusPreferenceNotificationHistory,
  fetchZusContributionRates,
  sendZusPreferenceClientNotifications,
  upsertZusContributionRate,
  type ZusContributionRateHistory,
  type ZusPreferenceNotificationHistory,
  type ZusContributionRate,
} from "@/lib/zusContributionRatesService";

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
  forma_prawna: string | null;
  schemat_zus: string | null;
  zus_preferencja_start: string | null;
  zus_preferencja_koniec: string | null;
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

type ZusPreferenceDateField = "zus_preferencja_start" | "zus_preferencja_koniec";
type ZusContributionDraft = { amount: string; notes: string };

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

const ZUS_CONTRIBUTION_BASE_SCHEMES = ["Preferencyjny ZUS"];

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
  const [zusPreferenceNotificationHistory, setZusPreferenceNotificationHistory] = useState<ZusPreferenceNotificationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [a1AddSearch, setA1AddSearch] = useState("");
  const [a1ClientToAdd, setA1ClientToAdd] = useState("");
  const [selectedZusClientIds, setSelectedZusClientIds] = useState<string[]>([]);
  const [showA1AddForm, setShowA1AddForm] = useState(false);
  const [showZusContributionsModal, setShowZusContributionsModal] = useState(false);
  const [sendingZusNotifications, setSendingZusNotifications] = useState(false);
  const [selectedClient, setSelectedClient] = useState<PayrollClient | null>(null);
  const [selectedA1RecordId, setSelectedA1RecordId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [clientsResult, contractsResult, a1Result, a1MonthlyResult, zusNotificationHistoryResult] = await Promise.all([
        fetchClients(),
        fetchPayrollContracts(),
        fetchPayrollA1Records(),
        fetchPayrollA1MonthlyRevenues(),
        fetchZusPreferenceNotificationHistory(),
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

      if (zusNotificationHistoryResult.error) {
        console.error("Błąd pobierania historii powiadomień ZUS:", zusNotificationHistoryResult.error);
        setZusPreferenceNotificationHistory([]);
      } else {
        setZusPreferenceNotificationHistory((zusNotificationHistoryResult.data || []) as ZusPreferenceNotificationHistory[]);
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
  const zusEntrepreneurClients = useMemo(() => clients.filter(isZusPreferenceJdgClient), [clients]);
  const zusContributionSchemes = useMemo(() => zusContributionSchemeOptions(), []);
  const filteredZusEntrepreneurClients = useMemo(() => filterClients(zusEntrepreneurClients, searchTerm), [zusEntrepreneurClients, searchTerm]);
  const latestZusNotificationByClient = useMemo(
    () => latestZusPreferenceNotificationByClient(zusPreferenceNotificationHistory),
    [zusPreferenceNotificationHistory]
  );
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

  async function handleZusPreferenceDateChange(clientId: string, field: ZusPreferenceDateField, value: string) {
    const previousClient = clients.find((client) => client.id === clientId) || null;
    setClients((current) => current.map((client) => client.id === clientId ? { ...client, [field]: value || null } : client));

    const result = await updateClient(clientId, { [field]: value || null });
    if (result.error) {
      if (previousClient) {
        setClients((current) => current.map((client) => client.id === clientId ? previousClient : client));
      }
      console.error("Błąd zapisu daty preferencji ZUS:", result.error);
      alert("Nie udało się zapisać daty preferencji ZUS.");
      return;
    }

    if (result.data) {
      setClients((current) => current.map((client) => client.id === clientId ? { ...client, ...(result.data as PayrollClient) } : client));
    }
  }

  function toggleZusClientSelection(clientId: string, checked: boolean) {
    setSelectedZusClientIds((current) => checked
      ? Array.from(new Set([...current, clientId]))
      : current.filter((id) => id !== clientId)
    );
  }

  function toggleAllVisibleZusClients(checked: boolean) {
    const visibleIds = filteredZusEntrepreneurClients.map((client) => client.id);
    setSelectedZusClientIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIds]));
      return current.filter((id) => !visibleIds.includes(id));
    });
  }

  async function handleSendZusPreferenceNotifications() {
    const visibleIdSet = new Set(filteredZusEntrepreneurClients.map((client) => client.id));
    const selectedVisibleIds = selectedZusClientIds.filter((id) => visibleIdSet.has(id));
    if (selectedVisibleIds.length === 0) {
      alert("Zaznacz przynajmniej jednego klienta.");
      return;
    }

    setSendingZusNotifications(true);
    const result = await sendZusPreferenceClientNotifications(selectedVisibleIds);
    setSendingZusNotifications(false);

    if (result.error) {
      alert(result.error.message);
      return;
    }

    const historyRows = (result.data?.history || []) as ZusPreferenceNotificationHistory[];
    setZusPreferenceNotificationHistory((current) => [...historyRows, ...current]);
    setSelectedZusClientIds((current) => current.filter((id) => !visibleIdSet.has(id)));
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
          {activeTab === "zus_przedsiebiorcy" && (
            <div style={headerActionsStyle}>
              <button type="button" onClick={() => void handleSendZusPreferenceNotifications()} disabled={sendingZusNotifications || selectedZusClientIds.length === 0} style={primaryButtonStyle}>
                <Send size={18} /> {sendingZusNotifications ? "Wysyłanie..." : "Wyślij powiadomienie"}
              </button>
              <button type="button" onClick={() => setShowZusContributionsModal(true)} style={secondaryButtonStyle}>
                <CalendarDays size={18} /> Wysokość składek
              </button>
            </div>
          )}
        </div>

        {(activeTab === "kadry" || activeTab === "a1" || activeTab === "zus_przedsiebiorcy") && (
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
          <ZusEntrepreneursTable
            clients={filteredZusEntrepreneurClients}
            loading={loading}
            latestNotificationByClient={latestZusNotificationByClient}
            selectedClientIds={selectedZusClientIds}
            onDateChange={handleZusPreferenceDateChange}
            onToggleClient={toggleZusClientSelection}
            onToggleAllVisible={toggleAllVisibleZusClients}
          />
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

      {showZusContributionsModal && (
        <ZusContributionsModal schemes={zusContributionSchemes} onClose={() => setShowZusContributionsModal(false)} />
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
      <table style={a1RegisterTableStyle}>
        <thead>
          <tr>
            <Th>Klient</Th>
            <Th>Opiekun</Th>
            <Th>Data uzyskania A1</Th>
            <Th>Data końca A1</Th>
            <Th align="center">Wpis za poprzedni miesiąc</Th>
            <Th align="center">% przychodów zagranicznych</Th>
            <Th align="center">Szczegóły</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const previousMonthDone = hasA1MonthlyEntry(row.monthly);
            return (
              <tr key={row.record.id}>
                <Td>
                  <strong style={clientNameStyle}>{row.client?.nazwa || "Klient bez nazwy"}</strong>
                  <span style={clientMetaStyle}>{row.client?.nip || "Brak NIP"}</span>
                </Td>
                <Td>{caregiverLabel(row.client)}</Td>
                <Td>{formatDate(row.record.data_uzyskania_a1)}</Td>
                <Td>{formatDate(row.record.data_konca_a1)}</Td>
                <Td align="center"><MonthlyStatus done={previousMonthDone} /></Td>
                <Td align="center"><A1PercentBadge value={calculateA1Totals(row.monthly).procentZagraniczny} /></Td>
                <Td align="center">
                  <button type="button" style={detailsButtonStyle} onClick={() => onDetails(row.record.id)}>
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

function ZusEntrepreneursTable({
  clients,
  loading,
  latestNotificationByClient,
  selectedClientIds,
  onDateChange,
  onToggleClient,
  onToggleAllVisible,
}: {
  clients: PayrollClient[];
  loading: boolean;
  latestNotificationByClient: Record<string, ZusPreferenceNotificationHistory>;
  selectedClientIds: string[];
  onDateChange: (clientId: string, field: ZusPreferenceDateField, value: string) => void;
  onToggleClient: (clientId: string, checked: boolean) => void;
  onToggleAllVisible: (checked: boolean) => void;
}) {
  if (loading) return <p style={emptyStyle}>Ładowanie przedsiębiorców ZUS...</p>;
  if (clients.length === 0) return <p style={emptyStyle}>Brak JDG ze schematem ZUS innym niż pełny ZUS.</p>;

  const selectedSet = new Set(selectedClientIds);
  const allVisibleSelected = clients.length > 0 && clients.every((client) => selectedSet.has(client.id));

  return (
    <div style={tableWrapStyle}>
      <table style={zusEntrepreneursTableStyle}>
        <thead>
          <tr>
            <Th align="center">
              <input
                aria-label="Zaznacz wszystkich widocznych klientów ZUS"
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => onToggleAllVisible(event.target.checked)}
                style={checkboxStyle}
              />
            </Th>
            <Th>Klient</Th>
            <Th align="center">Opiekun</Th>
            <Th align="center">Rodzaj preferencji</Th>
            <Th align="center">Data rozpoczęcia</Th>
            <Th align="center">Data końca</Th>
            <Th align="center">Powiadomienie</Th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const latestNotification = latestNotificationByClient[client.id];
            return (
              <tr key={client.id}>
                <Td align="center">
                  <input
                    aria-label={`Zaznacz klienta ${client.nazwa || "bez nazwy"}`}
                    type="checkbox"
                    checked={selectedSet.has(client.id)}
                    onChange={(event) => onToggleClient(client.id, event.target.checked)}
                    style={checkboxStyle}
                  />
                </Td>
                <Td>
                  <strong style={clientNameStyle}>{client.nazwa || "Klient bez nazwy"}</strong>
                  <span style={clientMetaStyle}>{client.nip || "Brak NIP"}</span>
                </Td>
                <Td align="center">{caregiverLabel(client)}</Td>
                <Td align="center"><strong>{client.schemat_zus || "-"}</strong></Td>
                <Td align="center">
                  <InlineDateInput
                    ariaLabel={`Data rozpoczęcia preferencji ZUS dla ${client.nazwa || "klienta"}`}
                    value={client.zus_preferencja_start || ""}
                    onChange={(value) => onDateChange(client.id, "zus_preferencja_start", value)}
                  />
                </Td>
                <Td align="center">
                  <InlineDateInput
                    ariaLabel={`Data końca preferencji ZUS dla ${client.nazwa || "klienta"}`}
                    value={client.zus_preferencja_koniec || ""}
                    onChange={(value) => onDateChange(client.id, "zus_preferencja_koniec", value)}
                  />
                </Td>
                <Td align="center">
                  <ZusPreferenceNotificationStatus history={latestNotification} />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ZusPreferenceNotificationStatus({ history }: { history: ZusPreferenceNotificationHistory | undefined }) {
  if (!history) return <span style={monthlyMissingStyle}>Nie wysłano</span>;

  return (
    <span style={zusNotificationStatusStyle}>
      Wysłano {formatDateTime(history.created_at)}
      <span style={zusNotificationMetaStyle}>przez {history.sent_by_name || history.sent_by_email || "nieustalonego użytkownika"}</span>
    </span>
  );
}

function InlineDateInput({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const [textValue, setTextValue] = useState(() => formatDateInputText(value));
  const [viewDate, setViewDate] = useState(() => dateFromInput(value) || new Date());
  const days = calendarDays(viewDate);

  useEffect(() => {
    setTextValue(formatDateInputText(value));
    if (value) setViewDate(dateFromInput(value) || new Date());
  }, [value]);

  function changeMonth(delta: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1, 12));
  }

  function selectDate(date: Date) {
    onChange(dateToInputValue(date));
    setTextValue(formatDateInputText(dateToInputValue(date)));
    setViewDate(new Date(date.getFullYear(), date.getMonth(), 1, 12));
    setOpen(false);
  }

  function handleTextChange(nextValue: string) {
    const masked = maskPolishDateText(nextValue);
    setTextValue(masked);
    const parsed = parsePolishDateText(masked);
    if (parsed !== null) {
      onChange(parsed);
      setViewDate(dateFromInput(parsed) || new Date());
    }
  }

  function handleBlur() {
    if (!textValue.trim()) {
      onChange("");
      return;
    }

    const parsed = parsePolishDateText(textValue);
    if (parsed === null) setTextValue(formatDateInputText(value));
  }

  return (
    <div style={inlineDateWrapStyle}>
      <input
        aria-label={ariaLabel}
        type="text"
        value={textValue}
        onChange={(event) => handleTextChange(event.target.value)}
        onBlur={handleBlur}
        inputMode="numeric"
        placeholder="dd.mm.rrrr"
        style={inlineDateInputStyle}
      />
      <button type="button" style={inlineDateIconButtonStyle} onClick={() => setOpen((current) => !current)} aria-label={`Otwórz kalendarz: ${ariaLabel}`}>
        <CalendarDays size={16} />
      </button>
      {open && (
        <div style={inlineDateCalendarStyle}>
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
            <button type="button" style={dateFooterButtonStyle} onClick={() => { onChange(""); setTextValue(""); setOpen(false); }}>Wyczyść</button>
            <button type="button" style={dateFooterButtonStyle} onClick={() => selectDate(new Date())}>Dzisiaj</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ZusContributionsModal({ schemes, onClose }: { schemes: string[]; onClose: () => void }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [values, setValues] = useState<Record<string, ZusContributionDraft>>(() => emptyZusContributionDrafts(schemes));
  const [history, setHistory] = useState<ZusContributionRateHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues((current) => ({ ...emptyZusContributionDrafts(schemes), ...current }));
  }, [schemes]);

  useEffect(() => {
    let cancelled = false;

    async function loadRates() {
      setLoading(true);
      const [result, historyResult] = await Promise.all([
        fetchZusContributionRates(year),
        fetchZusContributionRateHistory(year),
      ]);
      if (cancelled) return;

      if (result.error) {
        console.error("Błąd pobierania wysokości składek ZUS:", result.error);
        setValues(emptyZusContributionDrafts(schemes));
        setLoading(false);
        return;
      }

      setValues(zusContributionDraftsFromRates(schemes, (result.data || []) as ZusContributionRate[]));
      if (historyResult.error) {
        console.error("Błąd pobierania historii wysokości składek ZUS:", historyResult.error);
        setHistory([]);
      } else {
        setHistory((historyResult.data || []) as ZusContributionRateHistory[]);
      }
      setLoading(false);
    }

    void loadRates();
    return () => {
      cancelled = true;
    };
  }, [schemes, year]);

  async function saveRates() {
    setSaving(true);

    for (const scheme of schemes) {
      const draft = values[scheme] || { amount: "", notes: "" };
      const result = await upsertZusContributionRate(year, scheme, parseAmount(draft.amount), draft.notes);
      if (result.error) {
        setSaving(false);
        console.error("Błąd zapisu wysokości składek ZUS:", result.error);
        alert("Nie udało się zapisać wysokości składek ZUS.");
        return;
      }
    }

    setSaving(false);
    const historyResult = await fetchZusContributionRateHistory(year);
    if (!historyResult.error) setHistory((historyResult.data || []) as ZusContributionRateHistory[]);
  }

  function updateDraft(scheme: string, patch: Partial<ZusContributionDraft>) {
    setValues((current) => ({
      ...current,
      [scheme]: { ...(current[scheme] || { amount: "", notes: "" }), ...patch },
    }));
  }

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <section style={zusContributionsModalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div>
            <h2 style={modalTitleStyle}>Wysokość składki ZUS</h2>
            <p style={modalSubtitleStyle}>Stawka miesięczna dla Preferencyjnego ZUS.</p>
          </div>
          <div style={modalActionsStyle}>
            <button type="button" style={primaryButtonStyle} onClick={() => void saveRates()} disabled={saving || loading}>
              <Save size={18} /> {saving ? "Zapisywanie..." : "Zapisz"}
            </button>
            <button type="button" style={iconButtonStyle} onClick={onClose} aria-label="Zamknij">
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={modalBodyStyle}>
          <label style={zusContributionYearStyle}>
            <span style={fieldLabelStyle}>Rok</span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(Number(event.target.value) || currentYear)}
              style={yearInputStyle}
            />
          </label>

          <div style={tableWrapStyle}>
            <table style={zusContributionsTableStyle}>
              <thead>
                <tr>
                  <Th>Rodzaj preferencji</Th>
                  <Th align="center">Wysokość składki miesięcznie</Th>
                  <Th>Uwagi</Th>
                </tr>
              </thead>
              <tbody>
                {schemes.map((scheme) => {
                  const draft = values[scheme] || { amount: "", notes: "" };
                  return (
                    <tr key={scheme}>
                      <Td><strong>{scheme}</strong></Td>
                      <Td align="center">
                        <input
                          value={draft.amount}
                          onChange={(event) => updateDraft(scheme, { amount: event.target.value })}
                          inputMode="decimal"
                          placeholder="0,00"
                          style={zusContributionAmountInputStyle}
                        />
                      </Td>
                      <Td>
                        <input
                          value={draft.notes}
                          onChange={(event) => updateDraft(scheme, { notes: event.target.value })}
                          placeholder="Opcjonalnie"
                          style={zusContributionNotesInputStyle}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h3 style={historyTitleStyle}>Historia wpisów</h3>
            {history.length === 0 ? (
              <p style={emptyInlineStyle}>Brak historycznych wpisów dla tego roku.</p>
            ) : (
              <div style={tableWrapStyle}>
                <table style={zusContributionHistoryTableStyle}>
                  <thead>
                    <tr>
                      <Th>Data</Th>
                      <Th>Operacja</Th>
                      <Th align="center">Składka</Th>
                      <Th>Poprzednio</Th>
                      <Th>Użytkownik</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id}>
                        <Td>{formatDateTime(entry.created_at)}</Td>
                        <Td>{zusContributionHistoryOperationLabel(entry.operacja)}</Td>
                        <Td align="center"><strong>{formatMoney(toNumber(entry.skladka_miesieczna))}</strong></Td>
                        <Td>{entry.poprzednia_skladka_miesieczna === null ? "-" : formatMoney(toNumber(entry.poprzednia_skladka_miesieczna))}</Td>
                        <Td>{entry.changed_by_name || "-"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
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
  const [sendingClientNotification, setSendingClientNotification] = useState(false);
  const [showA1History, setShowA1History] = useState(false);
  const [a1History, setA1History] = useState<PayrollA1NotificationHistory[]>([]);
  const [a1HistoryLoading, setA1HistoryLoading] = useState(false);
  const months = a1MonthsBetween(draft.data_uzyskania_a1, draft.data_konca_a1);
  const visibleMonths = [...months].reverse();
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

  async function sendA1ClientNotification() {
    if (!row.client?.email) {
      alert("Klient nie ma uzupełnionego adresu e-mail.");
      return;
    }

    setSendingClientNotification(true);
    const result = await sendPayrollA1ClientNotification(row.record.id);
    setSendingClientNotification(false);

    if (result.error) {
      alert(result.error.message);
      return;
    }

    const history = Array.isArray(result.data?.history) ? result.data.history as PayrollA1NotificationHistory[] : [];
    if (history.length > 0) {
      setA1History((current) => [...history, ...current]);
    }
    alert("Powiadomienie A1 zostało przekazane do wysyłki.");
  }

  async function toggleA1History() {
    const nextValue = !showA1History;
    setShowA1History(nextValue);
    if (!nextValue || a1History.length > 0) return;

    setA1HistoryLoading(true);
    const result = await fetchPayrollA1NotificationHistory(row.record.id);
    if (result.error) {
      console.error("Błąd pobierania historii powiadomień A1:", result.error);
      alert("Nie udało się pobrać historii powiadomień A1.");
      setA1HistoryLoading(false);
      return;
    }

    setA1History((result.data || []) as PayrollA1NotificationHistory[]);
    setA1HistoryLoading(false);
  }

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <section style={a1DetailsModalStyle} onClick={(event) => event.stopPropagation()}>
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
          {showA1History && (
            <A1NotificationHistoryPanel history={a1History} loading={a1HistoryLoading} />
          )}

          <section style={formBoxStyle}>
            <div style={formGridStyle}>
              <DateField label="Data uzyskania A1" value={draft.data_uzyskania_a1} onChange={(value) => updateDraft("data_uzyskania_a1", value)} />
              <DateField label="Data końca A1" value={draft.data_konca_a1} onChange={(value) => updateDraft("data_konca_a1", value)} />
            </div>
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
              <div style={a1MonthlyScrollStyle}>
                <table style={a1MonthlyTableStyle}>
                  <thead>
                    <tr>
                      <Th sticky>Miesiąc</Th>
                      <Th sticky>Przychód krajowy</Th>
                      <Th sticky>Przychód zagraniczny</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMonths.map((month) => {
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
          <button type="button" style={secondaryButtonStyle} onClick={() => void toggleA1History()}>
            Historia powiadomień
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={() => void sendA1ClientNotification()} disabled={sendingClientNotification}>
            {sendingClientNotification ? "Wysyłanie..." : "Wyślij powiadomienie do klienta"}
          </button>
          <button type="button" style={primaryButtonStyle} onClick={saveA1} disabled={saving}>
            {saving ? "Zapisywanie..." : "Zapisz szczegóły"}
          </button>
        </div>
      </section>
    </div>
  );
}

function A1NotificationHistoryPanel({ history, loading }: { history: PayrollA1NotificationHistory[]; loading: boolean }) {
  return (
    <section style={historyPanelStyle}>
      <div style={formHeaderStyle}>
        <h3 style={formTitleStyle}>Historia powiadomień A1</h3>
      </div>
      {loading ? (
        <p style={emptyInlineStyle}>Ładowanie historii powiadomień...</p>
      ) : history.length === 0 ? (
        <p style={emptyInlineStyle}>Brak powiadomień A1 wysłanych do klienta.</p>
      ) : (
        <div style={tableWrapStyle}>
          <table style={historyTableStyle}>
            <thead>
              <tr>
                <Th>Data wysyłki</Th>
                <Th>Odbiorca</Th>
                <Th>Temat</Th>
                <Th>Wysłał</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <Td>{formatDateTime(entry.created_at)}</Td>
                  <Td>{entry.recipient_email}</Td>
                  <Td>{entry.subject}</Td>
                  <Td>{entry.sent_by_name || entry.sent_by_email || "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PayrollNotificationHistoryPanel({ notifications, loading }: { notifications: AppNotification[]; loading: boolean }) {
  return (
    <section style={historyPanelStyle}>
      <div style={formHeaderStyle}>
        <h3 style={formTitleStyle}>Historia powiadomień</h3>
      </div>
      {loading ? (
        <p style={emptyInlineStyle}>Ładowanie historii powiadomień...</p>
      ) : notifications.length === 0 ? (
        <p style={emptyInlineStyle}>Brak powiadomień kadrowych dla tego klienta.</p>
      ) : (
        <div style={tableWrapStyle}>
          <table style={historyTableStyle}>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Czego dotyczy</Th>
                <Th>Pracownik / zleceniobiorca</Th>
                <Th>Termin</Th>
                <Th>Status</Th>
                <Th>Mail do klienta</Th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((notification) => (
                <tr key={notification.id}>
                  <Td>{formatDateTime(notification.created_at)}</Td>
                  <Td>{payrollDateKindLabel(stringMeta(notification.metadata?.date_kind))}</Td>
                  <Td>{stringMeta(notification.metadata?.employee_name) || "-"}</Td>
                  <Td>{formatDate(stringMeta(notification.metadata?.due_date))}</Td>
                  <Td>{notification.status === "read" ? "Przeczytane" : "Nieprzeczytane"}</Td>
                  <Td>{stringMeta(notification.metadata?.client_email_sent_at) ? `Wysłano ${formatDateTime(stringMeta(notification.metadata?.client_email_sent_at) || "")}` : "Nie wysłano"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
  const [showNotificationHistory, setShowNotificationHistory] = useState(false);
  const [notificationHistory, setNotificationHistory] = useState<AppNotification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
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

  async function toggleNotificationHistory() {
    const nextValue = !showNotificationHistory;
    setShowNotificationHistory(nextValue);
    if (!nextValue || notificationHistory.length > 0) return;

    setHistoryLoading(true);
    const result = await fetchPayrollNotificationsForClient(client.id);
    if (result.error) {
      console.error("Błąd pobierania historii powiadomień kadrowych:", result.error);
      alert("Nie udało się pobrać historii powiadomień.");
      setHistoryLoading(false);
      return;
    }

    setNotificationHistory((result.data || []) as AppNotification[]);
    setHistoryLoading(false);
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
            <button type="button" style={secondaryButtonStyle} onClick={() => void toggleNotificationHistory()}>
              Historia powiadomień
            </button>
            <button type="button" style={primaryButtonStyle} onClick={() => setShowForm((value) => !value)}>
              <Plus size={18} /> Dodaj umowę
            </button>
            <button type="button" style={iconButtonStyle} onClick={onClose} aria-label="Zamknij">
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={modalBodyStyle}>
          {showNotificationHistory && (
            <PayrollNotificationHistoryPanel notifications={notificationHistory} loading={historyLoading} />
          )}

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

function MonthlyStatus({ done }: { done: boolean }) {
  return done ? (
    <span style={monthlyDoneStyle}><Check size={15} /> Dodano</span>
  ) : (
    <span style={monthlyMissingStyle}>Brak wpisu</span>
  );
}

function Th({ children, align = "left", sticky = false }: { children: React.ReactNode; align?: "left" | "center"; sticky?: boolean }) {
  const style = align === "center" ? centeredThStyle : thStyle;
  return <th style={sticky ? { ...style, position: "sticky", top: 0, zIndex: 1, background: colors.white } : style}>{children}</th>;
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

function isZusPreferenceJdgClient(client: PayrollClient) {
  return isJdgLegalForm(client.forma_prawna) && Boolean(client.schemat_zus?.trim()) && !isFullZusScheme(client.schemat_zus);
}

function isJdgLegalForm(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  return normalized.includes("jdg") || normalized.includes("jednoosob");
}

function isFullZusScheme(value: string | null | undefined) {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized.includes("duzy zus") || normalized.includes("pelny zus") || normalized.includes("pelen zus");
}

function zusContributionSchemeOptions() {
  return ZUS_CONTRIBUTION_BASE_SCHEMES;
}

function emptyZusContributionDrafts(schemes: string[]) {
  return Object.fromEntries(schemes.map((scheme) => [scheme, { amount: "", notes: "" }])) as Record<string, ZusContributionDraft>;
}

function zusContributionDraftsFromRates(schemes: string[], rates: ZusContributionRate[]) {
  const drafts = emptyZusContributionDrafts(schemes);
  rates.forEach((rate) => {
    drafts[rate.schemat_zus] = {
      amount: toNumber(rate.skladka_miesieczna) ? String(rate.skladka_miesieczna).replace(".", ",") : "",
      notes: rate.uwagi || "",
    };
  });
  return drafts;
}

function latestZusPreferenceNotificationByClient(history: ZusPreferenceNotificationHistory[]) {
  return history.reduce<Record<string, ZusPreferenceNotificationHistory>>((acc, entry) => {
    const current = acc[entry.klient_id];
    if (!current || new Date(entry.created_at).getTime() > new Date(current.created_at).getTime()) {
      acc[entry.klient_id] = entry;
    }
    return acc;
  }, {});
}

function zusContributionHistoryOperationLabel(operation: ZusContributionRateHistory["operacja"]) {
  if (operation === "insert") return "Dodano";
  if (operation === "update") return "Zmieniono";
  return "Stan początkowy";
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

function formatDateTime(value: string) {
  return value ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "-";
}

function stringMeta(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function payrollDateKindLabel(value: string | null) {
  if (value === "contract_end") return "Koniec umowy";
  if (value === "student_card_expiry") return "Koniec ważności legitymacji studenckiej";
  if (value === "medical_exam_expiry") return "Koniec ważności badań lekarskich";
  if (value === "bhp_training_expiry") return "Koniec ważności szkolenia BHP";
  return value || "-";
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

function hasA1MonthlyEntry(monthly: PayrollA1MonthlyRevenue[]) {
  const { year, month } = previousReportingMonth();
  return monthly.some((record) => record.rok === year && record.miesiac === month);
}

function previousReportingMonth() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return currentMonth === 1
    ? { year: currentYear - 1, month: 12 }
    : { year: currentYear, month: currentMonth - 1 };
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

function formatDateInputText(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : "";
}

function maskPolishDateText(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function parsePolishDateText(value: string) {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return dateToInputValue(date);
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
  return "JDG ze schematem ZUS innym niż pełny ZUS.";
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
const headerActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" };
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
const a1RegisterTableStyle: CSSProperties = { ...tableStyle, minWidth: "1120px" };
const zusEntrepreneursTableStyle: CSSProperties = { ...tableStyle, minWidth: "1220px" };
const detailsTableStyle: CSSProperties = { width: "100%", minWidth: "1240px", borderCollapse: "collapse" };
const a1MonthlyTableStyle: CSSProperties = { width: "100%", minWidth: "760px", borderCollapse: "collapse" };
const a1MonthlyScrollStyle: CSSProperties = { width: "100%", maxHeight: "min(48vh, 520px)", overflow: "auto" };
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
const monthlyDoneStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "30px", padding: "6px 10px", borderRadius: radius.badge, background: "rgba(22, 163, 74, 0.12)", color: colors.success, fontSize: "12px", fontWeight: 850 };
const monthlyMissingStyle: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: "30px", padding: "6px 10px", borderRadius: radius.badge, background: "rgba(100, 116, 139, 0.12)", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const zusNotificationStatusStyle: CSSProperties = { display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "2px", minHeight: "34px", padding: "6px 10px", borderRadius: radius.badge, background: "rgba(22, 163, 74, 0.12)", color: colors.success, fontSize: "12px", fontWeight: 850, lineHeight: 1.25 };
const zusNotificationMetaStyle: CSSProperties = { color: colors.muted, fontSize: "11px", fontWeight: 750 };
const checkboxStyle: CSSProperties = { width: "18px", height: "18px", accentColor: colors.navy, cursor: "pointer" };
const detailsButtonStyle: CSSProperties = { minHeight: "38px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const modalOverlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(15, 23, 42, 0.38)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "28px", overflowY: "auto" };
const wideModalStyle: CSSProperties = { width: "min(1380px, calc(100vw - 56px))", maxHeight: "calc(100vh - 56px)", borderRadius: radius.card, background: colors.white, border: `1px solid ${colors.border}`, boxShadow: "0 32px 90px rgba(15, 23, 42, 0.28)", overflow: "hidden", display: "flex", flexDirection: "column" };
const detailsModalStyle: CSSProperties = { width: "min(980px, calc(100vw - 56px))", maxHeight: "calc(100vh - 56px)", borderRadius: radius.card, background: colors.white, border: `1px solid ${colors.border}`, boxShadow: "0 32px 90px rgba(15, 23, 42, 0.28)", overflow: "hidden", display: "flex", flexDirection: "column" };
const a1DetailsModalStyle: CSSProperties = { ...detailsModalStyle, height: "calc(100vh - 56px)" };
const zusContributionsModalStyle: CSSProperties = { ...detailsModalStyle, width: "min(920px, calc(100vw - 56px))" };
const modalHeaderStyle: CSSProperties = { padding: "22px 24px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const modalTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "26px", lineHeight: 1.2 };
const modalSubtitleStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, fontSize: "13px", fontWeight: 750 };
const modalActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center" };
const modalBodyStyle: CSSProperties = { padding: "22px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "18px" };
const a1ModalBodyStyle: CSSProperties = { ...modalBodyStyle, flex: "1 1 auto", minHeight: 0, paddingBottom: "24px" };
const stickyModalFooterStyle: CSSProperties = { flex: "0 0 auto", display: "flex", justifyContent: "flex-end", gap: "10px", padding: "16px 24px 22px", borderTop: `1px solid ${colors.border}`, background: colors.white, flexWrap: "wrap" };
const iconButtonStyle: CSSProperties = { width: "42px", height: "42px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const primaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 16px", border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" };
const smallPrimaryButtonStyle: CSSProperties = { ...primaryButtonStyle, minHeight: "44px", alignSelf: "start" };
const secondaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" };
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
const zusContributionYearStyle: CSSProperties = { ...fieldStyle, maxWidth: "180px" };
const yearInputStyle: CSSProperties = { ...inputStyle, width: "100%" };
const zusContributionsTableStyle: CSSProperties = { width: "100%", minWidth: "760px", borderCollapse: "collapse" };
const zusContributionHistoryTableStyle: CSSProperties = { width: "100%", minWidth: "760px", borderCollapse: "collapse" };
const zusContributionAmountInputStyle: CSSProperties = { ...inputStyle, width: "180px", maxWidth: "100%", textAlign: "center" };
const zusContributionNotesInputStyle: CSSProperties = { ...inputStyle, width: "100%" };
const historyTitleStyle: CSSProperties = { margin: "6px 0 12px", color: colors.navy, fontSize: "16px", fontWeight: 900 };
const inlineDateWrapStyle: CSSProperties = { position: "relative", display: "inline-flex", alignItems: "center", width: "156px", maxWidth: "100%" };
const inlineDateInputStyle: CSSProperties = { ...inputStyle, width: "100%", minHeight: "38px", padding: "0 38px 0 10px", fontSize: "13px", fontWeight: 800, colorScheme: "light" };
const inlineDateIconButtonStyle: CSSProperties = { position: "absolute", right: "4px", width: "30px", height: "30px", border: "none", borderRadius: radius.button, background: "transparent", color: colors.navy, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const inlineDateCalendarStyle: CSSProperties = { position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 80, width: "300px", border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.white, boxShadow: shadow.card, padding: "12px", textAlign: "left" };
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
const disabledInputStyle: CSSProperties = { ...inputStyle, background: "rgba(226, 232, 240, 0.72)", color: colors.muted, cursor: "not-allowed" };
const checkboxFieldStyle: CSSProperties = { minHeight: "42px", display: "flex", alignItems: "center", gap: "8px", color: colors.navy, fontSize: "14px", fontWeight: 850 };
const checkboxInputStyle: CSSProperties = { width: "16px", height: "16px", margin: 0, accentColor: colors.navy };
const contractsSectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "0", overflow: "hidden" };
const historyPanelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.inputBackground, padding: "18px" };
const historyTableStyle: CSSProperties = { width: "100%", minWidth: "980px", borderCollapse: "collapse", background: colors.white };
