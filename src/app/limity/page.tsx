"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check, Plus, Save, X } from "lucide-react";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients } from "@/lib/clientService";
import {
  addClientToLimit,
  fetchLimitMonthlyRecords,
  fetchLimitRegisters,
  updateLimitRegister,
  upsertMonthlyLimitAmount,
  type LimitMonthlyRecord,
  type LimitRegisterRecord,
  type LimitType,
} from "@/lib/limitService";

type Client = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  telefon: string | null;
  opiekun_id: string | null;
  profiles?: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

type LimitTab = { value: LimitType; label: string };

type LimitRow = {
  register: LimitRegisterRecord;
  client: Client | null;
  monthly: LimitMonthlyRecord[];
};

const LIMIT_TABS: LimitTab[] = [
  { value: "vat", label: "VAT" },
  { value: "wnt", label: "WNT" },
  { value: "kasa_fiskalna", label: "Kasa fiskalna" },
];

const MONTHS = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];

export default function LimitsPage() {
  return (
    <AppLayout activePage="limity">
      <AccessGuard moduleName="limity">
        <LimitsContent />
      </AccessGuard>
    </AppLayout>
  );
}

function LimitsContent() {
  const currentYear = new Date().getFullYear();
  const [activeType, setActiveType] = useState<LimitType>("vat");
  const [year, setYear] = useState(currentYear);
  const [clients, setClients] = useState<Client[]>([]);
  const [registers, setRegisters] = useState<LimitRegisterRecord[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<LimitMonthlyRecord[]>([]);
  const [detailsRegisterId, setDetailsRegisterId] = useState<string | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [clientToAdd, setClientToAdd] = useState("");
  const [clientAddSearch, setClientAddSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadData(year);
  }, [year]);

  async function loadData(selectedYear = year) {
    setLoading(true);
    const [clientsResult, registersResult, monthlyResult] = await Promise.all([
      fetchClients(),
      fetchLimitRegisters(),
      fetchLimitMonthlyRecords(selectedYear),
    ]);

    if (clientsResult.error) console.error("Błąd pobierania klientów do limitów:", clientsResult.error);
    if (registersResult.error) console.error("Błąd pobierania rejestru limitów:", registersResult.error);
    if (monthlyResult.error) console.error("Błąd pobierania miesięcy limitów:", monthlyResult.error);

    setClients(clientsResult.error ? [] : ((clientsResult.data || []) as unknown as Client[]));
    setRegisters(registersResult.error ? [] : ((registersResult.data || []) as LimitRegisterRecord[]));
    setMonthlyRecords(monthlyResult.error ? [] : ((monthlyResult.data || []) as LimitMonthlyRecord[]));
    setLoading(false);
  }

  const rows = useMemo(() => buildRows(activeType, clients, registers, monthlyRecords), [activeType, clients, registers, monthlyRecords]);
  const filteredRows = useMemo(() => filterRows(rows, searchTerm), [rows, searchTerm]);
  const detailsRow = rows.find((row) => row.register.id === detailsRegisterId) || null;
  const availableClients = clients.filter((client) => !registers.some((register) => register.typ === activeType && register.klient_id === client.id));
  const filteredAvailableClients = filterClientsForPicker(availableClients, clientAddSearch);
  const selectedClientToAdd = availableClients.find((client) => client.id === clientToAdd) || null;
  const isAutomaticRegister = activeType === "vat" || activeType === "wnt";
  const showExemptionStatus = activeType !== "wnt";

  async function handleAddClient() {
    if (!clientToAdd) return;
    const result = await addClientToLimit(clientToAdd, activeType);
    if (result.error) {
      alert(result.error.message.includes("duplicate") ? "Ten klient jest już dodany do tego limitu." : result.error.message);
      return;
    }
    setClientToAdd("");
    setClientAddSearch("");
    setShowAddForm(false);
    await loadData();
    setDetailsRegisterId(result.data?.id || null);
  }

  function changeTab(type: LimitType) {
    setActiveType(type);
    setDetailsRegisterId(null);
    setShowAddForm(false);
    setClientToAdd("");
    setClientAddSearch("");
    setSearchTerm("");
  }

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Limity</p>
          <h1 style={titleStyle}>Rejestry limitów klientów</h1>
        </div>
        <div style={headerActionsStyle}>
          <div style={yearBoxStyle}>
            <span style={yearLabelStyle}>Rok</span>
            <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || currentYear)} style={yearInputStyle} />
          </div>
          <button type="button" onClick={() => setShowBulkModal(true)} style={primaryButtonStyle}>
            Wpis zbiorczy
          </button>
        </div>
      </header>

      <nav style={tabsStyle} aria-label="Rejestry limitów">
        {LIMIT_TABS.map((tab) => (
          <button key={tab.value} type="button" onClick={() => changeTab(tab.value)} style={activeType === tab.value ? activeTabStyle : tabStyle}>
            {tab.label}
          </button>
        ))}
      </nav>

      <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>{activeTabLabel(activeType)}</h2>
              <p style={sectionHintStyle}>{registerHint(activeType)}</p>
            </div>
            <div style={sectionActionsStyle}>
              {!isAutomaticRegister && (
                <button type="button" onClick={() => setShowAddForm((value) => !value)} style={primaryButtonStyle}>
                  <Plus size={18} /> Dodaj klienta
                </button>
              )}
            </div>
          </div>

          <div style={searchRowStyle}>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Szukaj klienta, NIP, opiekuna lub statusu"
              style={searchInputStyle}
            />
            {searchTerm && (
              <button type="button" style={clearSearchButtonStyle} onClick={() => setSearchTerm("")}>
                Wyczyść
              </button>
            )}
          </div>

          {showAddForm && !isAutomaticRegister && (
            <div style={addFormStyle}>
              <div style={clientPickerStyle}>
                <input
                  type="search"
                  value={clientAddSearch}
                  onChange={(event) => {
                    setClientAddSearch(event.target.value);
                    setClientToAdd("");
                  }}
                  placeholder="Wpisz nazwę klienta lub NIP"
                  style={clientPickerInputStyle}
                />
                {selectedClientToAdd && (
                  <div style={selectedClientStyle}>
                    Wybrano: <strong>{selectedClientToAdd.nazwa || "Klient bez nazwy"}</strong>
                  </div>
                )}
                <div style={clientPickerListStyle}>
                  {filteredAvailableClients.length === 0 ? (
                    <div style={clientPickerEmptyStyle}>Brak klientów do dodania.</div>
                  ) : (
                    filteredAvailableClients.slice(0, 8).map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setClientToAdd(client.id);
                          setClientAddSearch(`${client.nazwa || "Klient bez nazwy"}${client.nip ? ` (${client.nip})` : ""}`);
                        }}
                        style={clientToAdd === client.id ? activeClientOptionStyle : clientOptionStyle}
                      >
                        <strong>{client.nazwa || "Klient bez nazwy"}</strong>
                        <span>{client.nip || "Brak NIP"} · {caregiverLabel(client)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <button type="button" onClick={() => void handleAddClient()} disabled={!clientToAdd} style={smallPrimaryButtonStyle}>Dodaj</button>
            </div>
          )}

          {loading ? (
            <p style={emptyStyle}>Ładowanie limitów...</p>
          ) : rows.length === 0 ? (
            <p style={emptyStyle}>{emptyRegisterText(activeType)}</p>
          ) : filteredRows.length === 0 ? (
            <p style={emptyStyle}>Brak wyników dla wpisanej frazy.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>Klient</Th>
                    {showExemptionStatus && <Th>Status zwolnienia</Th>}
                    <Th>Wpis za poprzedni miesiąc</Th>
                    <Th>Wykorzystano w roku</Th>
                    <Th>Pozostało</Th>
                    <Th>Szczegóły</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const usage = calculateUsage(row.register, row.monthly);
                    const previousMonthDone = hasMonthlyEntry(row.monthly, year);
                    return (
                      <tr key={row.register.id}>
                        <Td>
                          <strong style={clientNameStyle}>{row.client?.nazwa || "Klient bez nazwy"}</strong>
                          <span style={clientMetaStyle}>{row.client?.nip || "Brak NIP"} · {caregiverLabel(row.client)}</span>
                        </Td>
                        {showExemptionStatus && <Td>{exemptionStatusLabel(row.register.status_zwolnienia)}</Td>}
                        <Td><MonthlyStatus done={previousMonthDone} /></Td>
                        <Td>
                          <strong style={amountStyle}>{formatMoney(usage.used)}</strong>
                          <ProgressBar percent={usage.percent} />
                        </Td>
                        <Td><strong style={amountStyle}>{formatMoney(usage.remaining)}</strong></Td>
                        <Td>
                          <button type="button" onClick={() => setDetailsRegisterId(row.register.id)} style={detailsButtonStyle}>Szczegóły</button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </section>

      {detailsRow && (
        <LimitDetailsModal
          key={`${detailsRow.register.id}-${year}`}
          row={detailsRow}
          year={year}
          onClose={() => setDetailsRegisterId(null)}
          onSaved={() => void loadData()}
        />
      )}

      {showBulkModal && (
        <BulkMonthlyEntryModal
          rows={rows}
          year={year}
          type={activeType}
          onClose={() => setShowBulkModal(false)}
          onSaved={() => void loadData()}
        />
      )}
    </div>
  );
}

function BulkMonthlyEntryModal({ rows, year, type, onClose, onSaved }: { rows: LimitRow[]; year: number; type: LimitType; onClose: () => void; onSaved: () => void }) {
  const caregiverOptions = useMemo(() => buildCaregiverOptions(rows), [rows]);
  const [caregiverKeyValue, setCaregiverKeyValue] = useState(caregiverOptions[0]?.key || "");
  const [month, setMonth] = useState(defaultEntryMonthForYear(year));
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const selectedRows = useMemo(() => rows.filter((row) => caregiverKey(row.client) === caregiverKeyValue), [rows, caregiverKeyValue]);

  async function saveBulkEntries() {
    setSaving(true);

    for (const row of selectedRows) {
      const value = bulkMonthlyValue(row, month, values);
      if (!hasTypedMonthlyValue(value)) continue;

      const result = await upsertMonthlyLimitAmount(row.register.id, year, month, parseAmount(value));
      if (result.error) {
        setSaving(false);
        alert(result.error.message);
        return;
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div style={modalBackdropStyle}>
      <section style={wideModalStyle}>
        <div style={modalHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Wpis zbiorczy</h2>
            <p style={sectionHintStyle}>{activeTabLabel(type)} · {year} · klienci wybranego opiekuna</p>
          </div>
          <div style={modalActionsStyle}>
            <button type="button" onClick={() => void saveBulkEntries()} disabled={saving || selectedRows.length === 0} style={primaryButtonStyle}>
              <Save size={18} /> {saving ? "Zapisywanie..." : "Zapisz wpisy"}
            </button>
            <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="Zamknij">
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={detailsBodyStyle}>
          <div style={bulkControlsStyle}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Opiekun</span>
              <select value={caregiverKeyValue} onChange={(event) => setCaregiverKeyValue(event.target.value)} style={inputStyle}>
                {caregiverOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Miesiąc</span>
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))} style={inputStyle}>
                {MONTHS.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>{monthName}</option>
                ))}
              </select>
            </label>
          </div>

          {selectedRows.length === 0 ? (
            <p style={emptyInlineStyle}>Brak klientów dla wybranego opiekuna.</p>
          ) : (
            <div style={bulkListStyle}>
              {selectedRows.map((row) => (
                <label key={row.register.id} style={bulkRowStyle}>
                  <span>
                    <strong style={clientNameStyle}>{row.client?.nazwa || "Klient bez nazwy"}</strong>
                    <span style={clientMetaStyle}>{row.client?.nip || "Brak NIP"}</span>
                  </span>
                  <input
                    value={bulkMonthlyValue(row, month, values)}
                    onChange={(event) => setValues((current) => ({ ...current, [bulkValueKey(row.register.id, month)]: event.target.value }))}
                    inputMode="decimal"
                    placeholder="Kwota"
                    style={bulkAmountInputStyle}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function LimitDetailsModal({ row, year, onClose, onSaved }: { row: LimitRow; year: number; onClose: () => void; onSaved: () => void }) {
  const [annualLimit, setAnnualLimit] = useState(String(toNumber(row.register.limit_roczny)));
  const [exemptionStatus, setExemptionStatus] = useState(row.register.status_zwolnienia || "podmiotowe");
  const [vatExemptionStatuses, setVatExemptionStatuses] = useState<string[]>(() => exemptionStatusValues(row.register.status_zwolnienia || "podmiotowe"));
  const [notes, setNotes] = useState(row.register.uwagi || "");
  const [monthValues, setMonthValues] = useState<Record<number, string>>(() => monthValueMap(row.monthly));
  const [businessStartDate, setBusinessStartDate] = useState(`${year}-01-01`);
  const [saving, setSaving] = useState(false);
  const proportionalBase = proportionalLimitBase(row.register.typ);
  const proportionalResult = proportionalBase ? calculateProportionalLimit(proportionalBase, businessStartDate, year) : null;
  const firstActiveMonth = activeMonthFromStartDate(businessStartDate, year);

  async function saveDetails() {
    setSaving(true);
    const registerResult = await updateLimitRegister(row.register.id, {
      limit_roczny: parseAmount(annualLimit),
      status_zwolnienia: row.register.typ === "wnt" ? null : row.register.typ === "vat" ? serializeExemptionStatuses(vatExemptionStatuses) : exemptionStatus,
      uwagi: notes.trim() || null,
    });

    if (registerResult.error) {
      setSaving(false);
      alert(registerResult.error.message);
      return;
    }

    for (let month = 1; month <= 12; month += 1) {
      if (month < firstActiveMonth) continue;
      if (!hasTypedMonthlyValue(monthValues[month])) continue;
      const amount = parseAmount(monthValues[month]);
      const result = await upsertMonthlyLimitAmount(row.register.id, year, month, amount);
      if (result.error) {
        setSaving(false);
        alert(result.error.message);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div style={modalBackdropStyle}>
      <section style={modalStyle}>
      <div style={modalHeaderStyle}>
        <div>
          <h2 style={sectionTitleStyle}>{row.client?.nazwa || "Klient bez nazwy"}</h2>
          <p style={sectionHintStyle}>{activeTabLabel(row.register.typ)} · {year} · {row.client?.nip || "Brak NIP"}</p>
        </div>
        <div style={modalActionsStyle}>
          <button type="button" onClick={() => void saveDetails()} disabled={saving} style={primaryButtonStyle}>
            <Save size={18} /> {saving ? "Zapisywanie..." : "Zapisz"}
          </button>
          <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="Zamknij">
            <X size={20} />
          </button>
        </div>
      </div>

      <div style={detailsBodyStyle}>
        <div style={annualGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Limit roczny</span>
            <input value={annualLimit} onChange={(event) => setAnnualLimit(event.target.value)} inputMode="decimal" style={inputStyle} />
          </label>
          {row.register.typ === "vat" ? (
            <div style={fieldStyle}>
              <span style={fieldLabelStyle}>Status zwolnienia</span>
              <div style={checkboxGroupStyle}>
                <CheckboxPill
                  label="Podmiotowe"
                  checked={vatExemptionStatuses.includes("podmiotowe")}
                  onChange={(checked) => setVatExemptionStatuses((current) => toggleExemptionStatus(current, "podmiotowe", checked))}
                />
                <CheckboxPill
                  label="Przedmiotowe"
                  checked={vatExemptionStatuses.includes("przedmiotowe")}
                  onChange={(checked) => setVatExemptionStatuses((current) => toggleExemptionStatus(current, "przedmiotowe", checked))}
                />
              </div>
            </div>
          ) : row.register.typ !== "wnt" && (
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Status zwolnienia</span>
              <select value={exemptionStatus} onChange={(event) => setExemptionStatus(event.target.value)} style={inputStyle}>
                <option value="podmiotowe">Podmiotowe</option>
                <option value="przedmiotowe">Przedmiotowe</option>
              </select>
            </label>
          )}
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Uwagi</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} style={inputStyle} />
          </label>
        </div>

        {proportionalBase && proportionalResult && (
          <div style={proportionalBoxStyle}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Rozpoczęcie działalności w roku</span>
              <input type="date" value={businessStartDate} onChange={(event) => setBusinessStartDate(event.target.value)} style={inputStyle} />
            </label>
            <div style={proportionalInfoStyle}>
              <strong>{formatMoney(proportionalResult.amount)}</strong>
              <span>{proportionalBase.toLocaleString("pl-PL")} zł / 365 × {proportionalResult.days} dni</span>
            </div>
            <button type="button" onClick={() => setAnnualLimit(String(proportionalResult.amount.toFixed(2)))} style={secondaryButtonStyle}>
              Ustaw wyliczony limit
            </button>
          </div>
        )}

        <div style={monthGridStyle}>
          {MONTHS.map((monthName, index) => {
            const month = index + 1;
            const disabled = month < firstActiveMonth;
            return (
              <label key={month} style={disabled ? disabledMonthFieldStyle : monthFieldStyle}>
                <span style={fieldLabelStyle}>{monthName}</span>
                <input
                  value={monthValues[month] || ""}
                  onChange={(event) => {
                    if (disabled) return;
                    setMonthValues((values) => ({ ...values, [month]: event.target.value }));
                  }}
                  inputMode="decimal"
                  disabled={disabled}
                  style={disabled ? disabledInputStyle : inputStyle}
                />
              </label>
            );
          })}
        </div>
      </div>
      </section>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div style={progressTrackStyle}>
      <div style={{ ...progressFillStyle, width: `${width}%`, background: progressColor(percent) }} />
    </div>
  );
}

function MonthlyStatus({ done }: { done: boolean }) {
  return done ? (
    <span style={monthlyDoneStyle}><Check size={15} /> Dodano</span>
  ) : (
    <span style={monthlyMissingStyle}>Brak wpisu</span>
  );
}

function CheckboxPill({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={checked ? activeCheckboxPillStyle : checkboxPillStyle}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={checkboxInputStyle} />
      {label}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={tdStyle}>{children}</td>;
}

function buildRows(type: LimitType, clients: Client[], registers: LimitRegisterRecord[], monthlyRecords: LimitMonthlyRecord[]) {
  return registers
    .filter((register) => register.typ === type)
    .map((register) => {
      const client = clients.find((item) => item.id === register.klient_id) || null;
      return {
        register,
        client,
        monthly: monthlyRecords.filter((month) => month.limit_id === register.id),
      };
    })
    .filter((row) => row.client)
    .sort((first, second) => String(first.client?.nazwa || "").localeCompare(String(second.client?.nazwa || ""), "pl"));
}

function filterRows(rows: LimitRow[], searchTerm: string) {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return rows;

  return rows.filter((row) => {
    const values = [
      row.client?.nazwa,
      row.client?.nip,
      row.client?.email,
      row.client?.telefon,
      caregiverLabel(row.client),
      exemptionStatusLabel(row.register.status_zwolnienia),
    ];

    return values.some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function filterClientsForPicker(clients: Client[], searchTerm: string) {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return clients.slice(0, 8);

  return clients.filter((client) => {
    const values = [
      client.nazwa,
      client.nip,
      client.email,
      client.telefon,
      caregiverLabel(client),
    ];

    return values.some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function buildCaregiverOptions(rows: LimitRow[]) {
  const options = new Map<string, string>();
  rows.forEach((row) => {
    options.set(caregiverKey(row.client), caregiverLabel(row.client));
  });

  return Array.from(options, ([key, label]) => ({ key, label }))
    .sort((first, second) => first.label.localeCompare(second.label, "pl"));
}

function bulkValueKey(registerId: string, month: number) {
  return `${registerId}:${month}`;
}

function bulkMonthlyValue(row: LimitRow, month: number, values: Record<string, string>) {
  const key = bulkValueKey(row.register.id, month);
  if (key in values) return values[key];

  const record = row.monthly.find((item) => item.miesiac === month);
  return record ? String(toNumber(record.kwota)) : "";
}

function calculateUsage(register: LimitRegisterRecord, monthly: LimitMonthlyRecord[]) {
  const limit = toNumber(register.limit_roczny);
  const used = monthly.reduce((sum, item) => sum + toNumber(item.kwota), 0);
  const remaining = Math.max(0, limit - used);
  const percent = limit > 0 ? (used / limit) * 100 : 0;
  return { limit, used, remaining, percent };
}

function hasMonthlyEntry(monthly: LimitMonthlyRecord[], year: number) {
  const targetMonth = defaultEntryMonthForYear(year);
  return monthly.some((record) => record.miesiac === targetMonth);
}

function defaultEntryMonthForYear(year: number) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const reportingYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const reportingMonth = currentMonth === 1 ? 12 : currentMonth - 1;

  if (year === reportingYear) return reportingMonth;
  if (year < reportingYear) return 12;
  return 1;
}

function monthValueMap(monthly: LimitMonthlyRecord[]) {
  return Object.fromEntries(MONTHS.map((_, index) => {
    const month = index + 1;
    const record = monthly.find((item) => item.miesiac === month);
    return [month, record ? String(toNumber(record.kwota)) : ""];
  }));
}

function hasTypedMonthlyValue(value: string | undefined) {
  return value !== undefined && value.trim() !== "";
}

function activeTabLabel(type: LimitType) {
  return LIMIT_TABS.find((tab) => tab.value === type)?.label || type;
}

function exemptionStatusLabel(status: string | null | undefined) {
  const statuses = exemptionStatusValues(status);
  if (statuses.length === 2) return "Podmiotowe + przedmiotowe";
  if (statuses.includes("podmiotowe")) return "Podmiotowe";
  if (statuses.includes("przedmiotowe")) return "Przedmiotowe";
  return "-";
}

function exemptionStatusValues(status: string | null | undefined) {
  const value = String(status || "").toLowerCase();
  const values: string[] = [];
  if (value.includes("podmiotowe")) values.push("podmiotowe");
  if (value.includes("przedmiotowe")) values.push("przedmiotowe");
  return values;
}

function serializeExemptionStatuses(statuses: string[]) {
  const ordered = ["podmiotowe", "przedmiotowe"].filter((status) => statuses.includes(status));
  return ordered.length > 0 ? ordered.join("+") : null;
}

function toggleExemptionStatus(current: string[], status: string, checked: boolean) {
  if (checked) return Array.from(new Set([...current, status]));
  return current.filter((item) => item !== status);
}

function registerHint(type: LimitType) {
  if (type === "vat") return "Klienci zwolnieni z VAT są dodawani automatycznie. Szczegóły służą do uzupełnienia miesięcy.";
  if (type === "wnt") return "Klienci bez VAT i z rejestracją VAT-UE są dodawani automatycznie. Szczegóły służą do uzupełnienia limitu i miesięcy.";
  return "Lista klientów dodanych do tego limitu. Szczegóły służą do uzupełnienia limitu rocznego i miesięcy.";
}

function emptyRegisterText(type: LimitType) {
  if (type === "vat") return "Brak klientów zwolnionych z VAT.";
  if (type === "wnt") return "Brak klientów bez VAT z rejestracją VAT-UE.";
  return "Brak klientów w tym limicie. Dodaj pierwszego klienta przyciskiem powyżej.";
}

function caregiverLabel(client: Client | null) {
  const profile = Array.isArray(client?.profiles) ? client?.profiles[0] : client?.profiles;
  return profile?.full_name || profile?.email || "Brak opiekuna";
}

function caregiverKey(client: Client | null) {
  return client?.opiekun_id || `no-caregiver:${caregiverLabel(client)}`;
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAmount(value: string) {
  return toNumber(value);
}

function activeMonthFromStartDate(startDate: string, year: number) {
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 1;
  if (start.getFullYear() < year) return 1;
  if (start.getFullYear() > year) return 13;
  return start.getMonth() + 1;
}

function proportionalLimitBase(type: LimitType) {
  if (type === "vat") return 240000;
  if (type === "kasa_fiskalna") return 20000;
  return null;
}

function calculateProportionalLimit(base: number, startDate: string, year: number) {
  const start = new Date(`${startDate}T00:00:00`);
  const yearStart = new Date(`${year}-01-01T00:00:00`);
  const yearEnd = new Date(`${year}-12-31T00:00:00`);

  if (Number.isNaN(start.getTime())) return { days: 365, amount: base };

  const effectiveStart = start < yearStart ? yearStart : start > yearEnd ? yearEnd : start;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const days = Math.floor((yearEnd.getTime() - effectiveStart.getTime()) / millisecondsPerDay) + 1;
  const amount = Math.round(((base / 365) * days) * 100) / 100;
  return { days, amount };
}

function formatMoney(value: number) {
  return value.toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
}

function progressColor(percent: number) {
  if (percent >= 100) return colors.danger;
  if (percent >= 80) return colors.warning;
  return colors.success;
}

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "22px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start" };
const headerActionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" };
const eyebrowStyle: CSSProperties = { margin: "0 0 8px", fontSize: "13px", fontWeight: 850, letterSpacing: "0.08em", color: colors.red, textTransform: "uppercase" };
const titleStyle: CSSProperties = { margin: 0, fontSize: "34px", lineHeight: 1.15, color: colors.navy };
const yearBoxStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.card, padding: "10px 12px" };
const yearLabelStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 850, textTransform: "uppercase" };
const yearInputStyle: CSSProperties = { width: "92px", minHeight: "38px", border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "0 10px", color: colors.navy, fontWeight: 850 };
const tabsStyle: CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap" };
const tabStyle: CSSProperties = { minHeight: "42px", padding: "0 18px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.card, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const activeTabStyle: CSSProperties = { ...tabStyle, background: colors.navy, color: colors.white, borderColor: colors.navy };
const cardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, boxShadow: shadow.card, overflow: "hidden" };
const sectionHeaderStyle: CSSProperties = { padding: "22px 24px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: "22px", color: colors.navy };
const sectionHintStyle: CSSProperties = { margin: "6px 0 0", color: colors.muted, fontSize: "14px" };
const sectionActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" };
const searchRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "12px", padding: "0 24px 18px", borderBottom: `1px solid ${colors.border}` };
const searchInputStyle: CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "13px 16px", background: colors.inputBackground, color: colors.text, fontSize: "15px", fontWeight: 650, outline: "none" };
const clearSearchButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "12px 14px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
const primaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 16px", border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" };
const smallPrimaryButtonStyle: CSSProperties = { ...primaryButtonStyle, minHeight: "40px" };
const addFormStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "12px", padding: "16px 24px", borderBottom: `1px solid ${colors.border}`, background: colors.inputBackground, alignItems: "start" };
const clientPickerStyle: CSSProperties = { position: "relative", display: "flex", flexDirection: "column", gap: "8px" };
const clientPickerInputStyle: CSSProperties = { minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "0 14px", color: colors.navy, fontWeight: 750, background: colors.white, outline: "none" };
const selectedClientStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 800 };
const clientPickerListStyle: CSSProperties = { display: "grid", gap: "6px", maxHeight: "310px", overflowY: "auto" };
const clientOptionStyle: CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.text, padding: "10px 12px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", textAlign: "left", cursor: "pointer" };
const activeClientOptionStyle: CSSProperties = { ...clientOptionStyle, borderColor: colors.navy, background: "rgba(23, 59, 115, 0.08)" };
const clientPickerEmptyStyle: CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.button, color: colors.muted, padding: "12px", fontWeight: 750 };
const emptyStyle: CSSProperties = { margin: 0, padding: "28px 24px", color: colors.muted, fontWeight: 750 };
const tableWrapStyle: CSSProperties = { width: "100%", overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", minWidth: "980px", borderCollapse: "collapse" };
const thStyle: CSSProperties = { padding: "14px 18px", textAlign: "left", fontSize: "12px", color: colors.text, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "16px 18px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle", fontSize: "14px" };
const clientNameStyle: CSSProperties = { display: "block", color: colors.navy, fontSize: "15px", lineHeight: 1.35 };
const clientMetaStyle: CSSProperties = { display: "block", marginTop: "4px", color: colors.muted, fontSize: "12px", fontWeight: 750 };
const amountStyle: CSSProperties = { display: "block", marginBottom: "8px", color: colors.navy, fontSize: "14px" };
const monthlyDoneStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "30px", padding: "6px 10px", borderRadius: radius.badge, background: "rgba(22, 163, 74, 0.12)", color: colors.success, fontSize: "12px", fontWeight: 850 };
const monthlyMissingStyle: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: "30px", padding: "6px 10px", borderRadius: radius.badge, background: "rgba(100, 116, 139, 0.12)", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const detailsButtonStyle: CSSProperties = { minHeight: "38px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const progressTrackStyle: CSSProperties = { width: "100%", height: "10px", borderRadius: radius.badge, background: "rgba(100, 116, 139, 0.16)", overflow: "hidden" };
const progressFillStyle: CSSProperties = { height: "100%", borderRadius: radius.badge, transition: "width 0.2s ease" };
const modalBackdropStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(15, 23, 42, 0.38)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "28px", overflowY: "auto" };
const modalStyle: CSSProperties = { width: "min(1040px, calc(100vw - 56px))", borderRadius: radius.card, background: colors.white, boxShadow: "0 32px 90px rgba(15, 23, 42, 0.28)", border: `1px solid ${colors.border}`, overflow: "hidden" };
const wideModalStyle: CSSProperties = { ...modalStyle, width: "min(1180px, calc(100vw - 56px))" };
const modalHeaderStyle: CSSProperties = { padding: "22px 24px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const modalActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center" };
const iconButtonStyle: CSSProperties = { width: "42px", height: "42px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const detailsBodyStyle: CSSProperties = { padding: "22px 24px", display: "flex", flexDirection: "column", gap: "18px" };
const annualGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "220px 1fr", gap: "12px" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const fieldLabelStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 850, textTransform: "uppercase" };
const inputStyle: CSSProperties = { minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.text, padding: "0 12px", fontSize: "14px", fontWeight: 750 };
const checkboxGroupStyle: CSSProperties = { minHeight: "42px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" };
const checkboxPillStyle: CSSProperties = { minHeight: "36px", padding: "0 12px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, fontSize: "13px", fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" };
const activeCheckboxPillStyle: CSSProperties = { ...checkboxPillStyle, borderColor: colors.navy, background: "rgba(23, 59, 115, 0.08)" };
const checkboxInputStyle: CSSProperties = { width: "15px", height: "15px", margin: 0, accentColor: colors.navy };
const disabledInputStyle: CSSProperties = { ...inputStyle, background: "rgba(226, 232, 240, 0.72)", color: colors.muted, cursor: "not-allowed" };
const proportionalBoxStyle: CSSProperties = { display: "grid", gridTemplateColumns: "220px 1fr auto", gap: "12px", alignItems: "end", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, padding: "14px" };
const proportionalInfoStyle: CSSProperties = { minHeight: "42px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", color: colors.muted, fontSize: "12px", fontWeight: 800 };
const secondaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const bulkControlsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 220px", gap: "12px", alignItems: "end" };
const bulkListStyle: CSSProperties = { display: "grid", gap: "10px", maxHeight: "56vh", overflowY: "auto", paddingRight: "4px" };
const bulkRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 180px", gap: "14px", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, padding: "12px 14px" };
const bulkAmountInputStyle: CSSProperties = { ...inputStyle, width: "100%" };
const emptyInlineStyle: CSSProperties = { margin: 0, color: colors.muted, fontWeight: 750 };
const monthGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" };
const monthFieldStyle: CSSProperties = { ...fieldStyle, border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, padding: "12px" };
const disabledMonthFieldStyle: CSSProperties = { ...monthFieldStyle, opacity: 0.58 };
