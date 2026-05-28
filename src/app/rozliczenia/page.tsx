"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import {
  ensureCurrentMonthSettlements,
  fetchMonthlySettlements,
  fetchSettlementTaskProgress,
  updateMonthlySettlement,
  type MonthlySettlement,
  type SettlementProgress,
  type SettlementStatus,
} from "@/lib/monthlySettlementsService";
import {
  createRecurringTask,
  deleteRecurringTask,
  fetchRecurringTasks,
  type RecurringTask,
} from "@/lib/recurringTasksService";
import type { TaskPriority } from "@/lib/taskService";

const STATUS_OPTIONS: { value: SettlementStatus; label: string }[] = [
  { value: "czeka_na_dokumenty", label: "Czeka na dokumenty" },
  { value: "dokumenty_kompletne_biuro", label: "Dokumenty kompletne" },
  { value: "w_trakcie_ksiegowania", label: "W trakcie księgowania" },
  { value: "do_sprawdzenia", label: "Do sprawdzenia" },
  { value: "sprawdzone_zatwierdzone", label: "Zatwierdzone" },
  { value: "podatki_wyslane", label: "Podatki wysłane" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "niski", label: "Niski" },
  { value: "normalny", label: "Normalny" },
  { value: "wysoki", label: "Wysoki" },
  { value: "pilne", label: "Pilne" },
];

const EMPTY_FILTER = "Wszystkie";

export default function SettlementsPage() {
  return (
    <AppLayout activePage="rozliczenia">
      <AccessGuard moduleName="rozliczenia">
        <SettlementsContent />
      </AccessGuard>
    </AppLayout>
  );
}

function SettlementsContent() {
  const [period, setPeriod] = useState(() => currentMonthInput());
  const [settlements, setSettlements] = useState<MonthlySettlement[]>([]);
  const [progressRows, setProgressRows] = useState<SettlementProgress[]>([]);
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<MonthlySettlement | null>(null);
  const [statusFilter, setStatusFilter] = useState(EMPTY_FILTER);
  const [invoiceFilter, setInvoiceFilter] = useState(EMPTY_FILTER);
  const [searchQuery, setSearchQuery] = useState("");

  const progressBySettlement = useMemo(() => Object.fromEntries(progressRows.map((row) => [row.rozliczenie_id, row])), [progressRows]);
  const visibleSettlements = settlements.filter((settlement) => {
    const client = getClient(settlement.klienci);
    const haystack = [client?.nazwa, client?.nip, getCaregiverName(client), settlement.uwagi].filter(Boolean).join(" ").toLowerCase();
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const matchesStatus = statusFilter === EMPTY_FILTER || settlement.status_ksiegowosci === statusFilter;
    const matchesInvoice = invoiceFilter === EMPTY_FILTER || (invoiceFilter === "wystawiona" ? settlement.faktura_wystawiona : !settlement.faktura_wystawiona);
    return matchesSearch && matchesStatus && matchesInvoice;
  });

  const lockedCount = settlements.filter((settlement) => settlement.faktura_wystawiona).length;
  const avgProgress = settlements.length
    ? Math.round(settlements.reduce((sum, settlement) => sum + (progressBySettlement[settlement.id]?.progress || 0), 0) / settlements.length)
    : 0;

  useEffect(() => {
    loadSettlements();
  }, [period]);

  async function loadSettlements() {
    setLoading(true);
    const normalizedPeriod = `${period}-01`;
    await ensureCurrentMonthSettlements(normalizedPeriod);
    const [settlementsResult, progressResult, recurringResult] = await Promise.all([
      fetchMonthlySettlements(normalizedPeriod),
      fetchSettlementTaskProgress(normalizedPeriod),
      fetchRecurringTasks(),
    ]);

    if (settlementsResult.error) console.error("Błąd pobierania rozliczeń:", settlementsResult.error);
    if (progressResult.error) console.error("Błąd pobierania postępu zadań:", progressResult.error);
    if (recurringResult.error) console.error("Błąd pobierania zadań cyklicznych:", recurringResult.error);

    setSettlements((settlementsResult.data || []) as MonthlySettlement[]);
    setProgressRows((progressResult.data || []) as SettlementProgress[]);
    setRecurringTasks((recurringResult.data || []) as RecurringTask[]);
    setLoading(false);
  }

  async function patchSettlement(settlement: MonthlySettlement, payload: Partial<MonthlySettlement>) {
    if (settlement.faktura_wystawiona) return;
    setSavingId(settlement.id);
    const result = await updateMonthlySettlement(settlement.id, payload);
    setSavingId(null);

    if (result.error) {
      console.error("Błąd zapisu rozliczenia:", result.error);
      alert("Nie udało się zapisać rozliczenia.");
      return;
    }

    const updated = result.data as MonthlySettlement;
    setSettlements((current) => current.map((item) => item.id === updated.id ? updated : item));
    setSelectedSettlement((current) => current?.id === updated.id ? updated : current);
  }

  async function markInvoiceIssued(settlement: MonthlySettlement) {
    if (!confirm("Po oznaczeniu faktury jako wystawionej rozliczenie zostanie zablokowane do edycji. Kontynuować?")) return;
    setSavingId(settlement.id);
    const result = await updateMonthlySettlement(settlement.id, { faktura_wystawiona: true });
    setSavingId(null);

    if (result.error) {
      console.error("Błąd blokady rozliczenia:", result.error);
      alert("Nie udało się oznaczyć faktury jako wystawionej.");
      return;
    }

    const updated = result.data as MonthlySettlement;
    setSettlements((current) => current.map((item) => item.id === updated.id ? updated : item));
    setSelectedSettlement((current) => current?.id === updated.id ? updated : current);
  }

  async function addRecurringTask(settlement: MonthlySettlement, draft: RecurringTaskDraft) {
    const client = getClient(settlement.klienci);
    if (!client?.id) return;
    if (!draft.tytul.trim()) return alert("Wpisz nazwę zadania cyklicznego.");

    const result = await createRecurringTask({
      klient_id: client.id,
      tytul: draft.tytul.trim(),
      opis: draft.opis.trim() || null,
      dzien_miesiaca: Number(draft.dzien_miesiaca || 10),
      priorytet: draft.priorytet,
      osoba_id: client.opiekun_id || null,
      forma_prawna: null,
      forma_opodatkowania: null,
      aktywne: true,
    });

    if (result.error) {
      console.error("Błąd dodawania zadania cyklicznego:", result.error);
      alert("Nie udało się dodać zadania cyklicznego.");
      return;
    }

    setRecurringTasks((current) => [result.data as RecurringTask, ...current]);
  }

  async function removeRecurringTask(task: RecurringTask) {
    if (!confirm("Usunąć zadanie cykliczne?")) return;
    const result = await deleteRecurringTask(task.id);
    if (result.error) {
      console.error("Błąd usuwania zadania cyklicznego:", result.error);
      alert("Nie udało się usunąć zadania cyklicznego.");
      return;
    }
    setRecurringTasks((current) => current.filter((item) => item.id !== task.id));
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Operacyjne</p>
          <h1 style={titleStyle}>Rozliczenia miesięczne</h1>
          <p style={subtitleStyle}>Statusy księgowości, dokumenty, kadry, postęp zadań cyklicznych i blokada miesiąca po wystawieniu faktury.</p>
        </div>
        <input style={monthInputStyle} type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
      </section>

      <section style={summaryGridStyle}>
        <SummaryCard label="Rozliczenia" value={settlements.length} />
        <SummaryCard label="Postęp zadań" value={`${avgProgress}%`} />
        <SummaryCard label="Faktury wystawione" value={lockedCount} />
      </section>

      <section style={cardStyle}>
        <div style={tableHeaderStyle}>
          <h2 style={sectionTitleStyle}>Miesiąc {formatMonth(period)}</h2>
          <span style={counterStyle}>{loading ? "Ładowanie..." : `${visibleSettlements.length} pozycji`}</span>
        </div>

        <input style={searchInputStyle} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Szukaj po kliencie, NIP, opiekunie lub uwagach" />

        <div style={filtersRowStyle}>
          <span style={filtersLabelStyle}>Filtry:</span>
          <select style={filterStyle} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value={EMPTY_FILTER}>Status</option>
            {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <select style={filterStyle} value={invoiceFilter} onChange={(event) => setInvoiceFilter(event.target.value)}>
            <option value={EMPTY_FILTER}>Faktura</option>
            <option value="niewystawiona">Nie wystawiona</option>
            <option value="wystawiona">Wystawiona</option>
          </select>
        </div>

        {loading ? (
          <div style={emptyStateStyle}>Ładowanie rozliczeń...</div>
        ) : visibleSettlements.length === 0 ? (
          <div style={emptyStateStyle}>Brak rozliczeń do wyświetlenia.</div>
        ) : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th width="21%">Klient</Th>
                  <Th width="17%">Status</Th>
                  <Th width="10%">L. dokumentów</Th>
                  <Th width="10%">L. pracowników</Th>
                  <Th width="12%">L. zleceniobiorców</Th>
                  <Th width="12%">Zadania cykliczne</Th>
                  <Th width="10%">Faktura</Th>
                  <Th width="8%">Akcje</Th>
                </tr>
              </thead>
              <tbody>
                {visibleSettlements.map((settlement) => {
                  const client = getClient(settlement.klienci);
                  const locked = settlement.faktura_wystawiona;
                  const progress = progressBySettlement[settlement.id] || { progress: 0, total_tasks: 0, done_tasks: 0 };
                  return (
                    <tr key={settlement.id} style={rowStyle}>
                      <Td strong>
                        <div style={clientCellStyle}>
                          <span>{client?.nazwa || "Klient"}</span>
                          <small>{client?.nip || "Brak NIP"} · {getCaregiverName(client)}</small>
                        </div>
                      </Td>
                      <Td>
                        <select
                          style={{ ...statusInputStyle, ...statusSelectStyle(settlement.status_ksiegowosci) }}
                          value={settlement.status_ksiegowosci}
                          disabled={locked || savingId === settlement.id}
                          onChange={(event) => patchSettlement(settlement, { status_ksiegowosci: event.target.value as SettlementStatus })}
                          title={statusLabel(settlement.status_ksiegowosci)}
                        >
                          {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                        </select>
                      </Td>
                      <Td><NumberInput value={settlement.liczba_dokumentow} disabled={locked} onChange={(value) => patchSettlement(settlement, { liczba_dokumentow: value })} /></Td>
                      <Td><NumberInput value={settlement.liczba_pracownikow} disabled={locked} onChange={(value) => patchSettlement(settlement, { liczba_pracownikow: value })} /></Td>
                      <Td><NumberInput value={settlement.liczba_zleceniobiorcow} disabled={locked} onChange={(value) => patchSettlement(settlement, { liczba_zleceniobiorcow: value })} /></Td>
                      <Td><ProgressBadge progress={progress.progress} done={progress.done_tasks} total={progress.total_tasks} /></Td>
                      <Td><span style={locked ? invoiceIssuedStyle : invoiceOpenStyle}>{locked ? "Wystawiona" : "Nie wystawiona"}</span></Td>
                      <Td><button style={detailsButtonStyle} onClick={() => setSelectedSettlement(settlement)}>Szczegóły</button></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedSettlement && (
        <SettlementDrawer
          settlement={selectedSettlement}
          progress={progressBySettlement[selectedSettlement.id] || { progress: 0, total_tasks: 0, done_tasks: 0, rozliczenie_id: selectedSettlement.id }}
          recurringTasks={getMatchingRecurringTasks(recurringTasks, getClient(selectedSettlement.klienci))}
          onClose={() => setSelectedSettlement(null)}
          onSave={patchSettlement}
          onInvoice={markInvoiceIssued}
          onAddRecurring={addRecurringTask}
          onDeleteRecurring={removeRecurringTask}
          saving={savingId === selectedSettlement.id}
        />
      )}
    </>
  );
}

type RecurringTaskDraft = {
  tytul: string;
  opis: string;
  dzien_miesiaca: string;
  priorytet: TaskPriority;
};

function SettlementDrawer({ settlement, progress, recurringTasks, onClose, onSave, onInvoice, onAddRecurring, onDeleteRecurring, saving }: {
  settlement: MonthlySettlement;
  progress: SettlementProgress;
  recurringTasks: RecurringTask[];
  onClose: () => void;
  onSave: (settlement: MonthlySettlement, payload: Partial<MonthlySettlement>) => void;
  onInvoice: (settlement: MonthlySettlement) => void;
  onAddRecurring: (settlement: MonthlySettlement, draft: RecurringTaskDraft) => Promise<void>;
  onDeleteRecurring: (task: RecurringTask) => void;
  saving: boolean;
}) {
  const client = getClient(settlement.klienci);
  const locked = settlement.faktura_wystawiona;
  const [draft, setDraft] = useState<RecurringTaskDraft>({ tytul: "", opis: "", dzien_miesiaca: "10", priorytet: "normalny" });

  async function submitRecurringTask() {
    await onAddRecurring(settlement, draft);
    setDraft({ tytul: "", opis: "", dzien_miesiaca: "10", priorytet: "normalny" });
  }

  return (
    <div style={drawerOverlayStyle}>
      <aside style={drawerStyle}>
        <header style={drawerHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Szczegóły rozliczenia</p>
            <h2 style={drawerTitleStyle}>{client?.nazwa || "Klient"}</h2>
            <p style={drawerMetaStyle}>{formatMonth(settlement.okres.slice(0, 7))} · {client?.nip || "Brak NIP"}</p>
          </div>
          <button style={closeButtonStyle} onClick={onClose}>Zamknij</button>
        </header>

        <div style={drawerContentStyle}>
          {locked && <div style={lockedNoticeStyle}>Rozliczenie jest zablokowane, ponieważ faktura została wystawiona.</div>}

          <section style={drawerSectionStyle}>
            <h3 style={drawerSectionTitleStyle}>Status miesiąca</h3>
            <Field label="Status księgowości">
              <select style={{ ...inputStyle, ...statusSelectStyle(settlement.status_ksiegowosci) }} value={settlement.status_ksiegowosci} disabled={locked || saving} onChange={(event) => onSave(settlement, { status_ksiegowosci: event.target.value as SettlementStatus })}>
                {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </Field>
            <div style={threeColumnsStyle}>
              <Field label="L. dokumentów"><NumberInput value={settlement.liczba_dokumentow} disabled={locked} onChange={(value) => onSave(settlement, { liczba_dokumentow: value })} /></Field>
              <Field label="L. pracowników"><NumberInput value={settlement.liczba_pracownikow} disabled={locked} onChange={(value) => onSave(settlement, { liczba_pracownikow: value })} /></Field>
              <Field label="L. zleceniobiorców"><NumberInput value={settlement.liczba_zleceniobiorcow} disabled={locked} onChange={(value) => onSave(settlement, { liczba_zleceniobiorcow: value })} /></Field>
            </div>
            <Field label="Uwagi">
              <textarea style={textareaStyle} value={settlement.uwagi || ""} disabled={locked} onChange={(event) => onSave(settlement, { uwagi: event.target.value })} />
            </Field>
          </section>

          <section style={drawerSectionStyle}>
            <h3 style={drawerSectionTitleStyle}>Zadania cykliczne</h3>
            <ProgressBadge progress={progress.progress} done={progress.done_tasks} total={progress.total_tasks} large />
            <div style={clientContextStyle}>
              <span>Forma prawna: <strong>{client?.forma_prawna || "Brak"}</strong></span>
              <span>Opodatkowanie: <strong>{client?.forma_opodatkowania || "Brak"}</strong></span>
            </div>

            <div style={recurringListStyle}>
              {recurringTasks.length === 0 ? (
                <div style={emptyStateStyle}>Brak zadań cyklicznych dla tego klienta.</div>
              ) : recurringTasks.map((task) => (
                <article key={task.id} style={recurringItemStyle}>
                  <div>
                    <strong>{task.tytul}</strong>
                    <p style={recurringMetaStyle}>{recurringScopeLabel(task)} · dzień {task.dzien_miesiaca} · {priorityLabel(task.priorytet)}</p>
                  </div>
                  {task.klient_id && <button style={deleteButtonStyle} onClick={() => onDeleteRecurring(task)}>Usuń</button>}
                </article>
              ))}
            </div>

            {!locked && (
              <div style={recurringFormStyle}>
                <Field label="Nowe zadanie cykliczne"><input style={inputStyle} value={draft.tytul} onChange={(event) => setDraft((current) => ({ ...current, tytul: event.target.value }))} placeholder="np. Księgowanie dokumentów" /></Field>
                <div style={twoColumnsStyle}>
                  <Field label="Dzień miesiąca"><input style={inputStyle} type="number" min={1} max={31} value={draft.dzien_miesiaca} onChange={(event) => setDraft((current) => ({ ...current, dzien_miesiaca: event.target.value }))} /></Field>
                  <Field label="Priorytet">
                    <select style={inputStyle} value={draft.priorytet} onChange={(event) => setDraft((current) => ({ ...current, priorytet: event.target.value as TaskPriority }))}>
                      {PRIORITY_OPTIONS.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Opis"><textarea style={textareaStyle} value={draft.opis} onChange={(event) => setDraft((current) => ({ ...current, opis: event.target.value }))} /></Field>
                <button style={lockButtonStyle} onClick={submitRecurringTask}>Dodaj zadanie cykliczne</button>
              </div>
            )}
          </section>

          <section style={drawerSectionStyle}>
            <h3 style={drawerSectionTitleStyle}>Faktura</h3>
            <div style={invoiceRowStyle}>
              <span style={locked ? invoiceIssuedStyle : invoiceOpenStyle}>{locked ? "Wystawiona" : "Nie wystawiona"}</span>
              {!locked && <button style={lockButtonStyle} onClick={() => onInvoice(settlement)} disabled={saving}>Oznacz jako wystawioną</button>}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function NumberInput({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  const [localValue, setLocalValue] = useState(String(value ?? 0));
  useEffect(() => setLocalValue(String(value ?? 0)), [value]);

  return <input style={smallInputStyle} type="number" min={0} value={localValue} disabled={disabled} onChange={(event) => setLocalValue(event.target.value)} onBlur={() => onChange(Math.max(0, Number(localValue || 0)))} />;
}

function ProgressBadge({ progress, done, total, large }: { progress: number; done: number; total: number; large?: boolean }) {
  return <div style={large ? progressLargeStyle : progressStyle}><strong>{progress}%</strong><span>{done}/{total} zadań</span></div>;
}
function SummaryCard({ label, value }: { label: string; value: string | number }) { return <div style={summaryCardStyle}><span>{label}</span><strong>{value}</strong></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={fieldStyle}><span style={labelStyle}>{label}</span>{children}</label>; }
function Th({ children, width }: { children: React.ReactNode; width?: string }) { return <th style={{ ...thStyle, width }}>{children}</th>; }
function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>; }

function getClient(value: MonthlySettlement["klienci"]) { return Array.isArray(value) ? value[0] : value; }
function getCaregiverName(client: ReturnType<typeof getClient>) { return client?.profiles?.[0]?.full_name || client?.profiles?.[0]?.email || "Brak opiekuna"; }
function currentMonthInput() { return new Date().toISOString().slice(0, 7); }
function formatMonth(value: string) { return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(`${value}-01T12:00:00`)); }
function statusLabel(status: SettlementStatus) { return STATUS_OPTIONS.find((item) => item.value === status)?.label || status; }
function priorityLabel(priority: TaskPriority) { return PRIORITY_OPTIONS.find((item) => item.value === priority)?.label || priority; }
function recurringScopeLabel(task: RecurringTask) {
  if (task.klient_id) return "Zadanie klienta";
  return [task.forma_prawna, task.forma_opodatkowania].filter(Boolean).join(" · ") || "Szablon globalny";
}
function getMatchingRecurringTasks(tasks: RecurringTask[], client: ReturnType<typeof getClient>) {
  return tasks.filter((task) => {
    if (task.klient_id) return task.klient_id === client?.id;
    const matchesLegal = !task.forma_prawna || task.forma_prawna === client?.forma_prawna;
    const matchesTax = !task.forma_opodatkowania || task.forma_opodatkowania === client?.forma_opodatkowania;
    return matchesLegal && matchesTax;
  });
}
function statusSelectStyle(status: SettlementStatus): React.CSSProperties {
  if (status === "czeka_na_dokumenty") return { background: "#ffd8d8", color: "#991b1b" };
  if (status === "dokumenty_kompletne_biuro") return { background: "#ffe7b8", color: "#92400e" };
  if (status === "w_trakcie_ksiegowania") return { background: "#ffe3c4", color: "#9a3412" };
  if (status === "do_sprawdzenia") return { background: "#efd4f5", color: "#7e22ce" };
  if (status === "sprawdzone_zatwierdzone") return { background: "#cbe7f5", color: "#075985" };
  return { background: "#c9f2d2", color: "#166534" };
}

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "30px" };
const eyebrowStyle: React.CSSProperties = { color: colors.red, fontWeight: 800, margin: "0 0 8px" };
const titleStyle: React.CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const subtitleStyle: React.CSSProperties = { maxWidth: "760px", fontSize: "17px", lineHeight: 1.7, color: colors.muted, marginTop: "14px" };
const monthInputStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.card, color: colors.navy, padding: "13px 16px", fontWeight: 800 };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" };
const summaryCardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px", color: colors.muted, fontWeight: 800 };
const cardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "28px", boxShadow: shadow.soft };
const tableHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "18px", marginBottom: "18px" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px", fontWeight: 500 };
const counterStyle: React.CSSProperties = { color: colors.muted, fontWeight: 800 };
const searchInputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "13px 18px", fontSize: "14px", fontWeight: 600, marginBottom: "16px" };
const filtersRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "24px" };
const filtersLabelStyle: React.CSSProperties = { color: colors.muted, fontWeight: 800, fontSize: "14px" };
const filterStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "10px 38px 10px 14px", minWidth: "190px", fontSize: "14px", fontWeight: 500 };
const tableWrapperStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "13px 10px", color: colors.muted, fontSize: "13px", borderBottom: `1px solid ${colors.border}`, lineHeight: 1.25, fontWeight: 800 };
const rowStyle: React.CSSProperties = { borderBottom: `1px solid ${colors.border}` };
const tdStyle: React.CSSProperties = { padding: "15px 10px", color: colors.text, verticalAlign: "middle", fontSize: "15px" };
const inputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, color: colors.text, padding: "10px 12px", fontWeight: 500, fontSize: "14px" };
const statusInputStyle: React.CSSProperties = { ...inputStyle, minWidth: 0, maxWidth: "100%", height: "42px", padding: "8px 28px 8px 10px", fontSize: "12px", lineHeight: 1.1, whiteSpace: "normal", fontWeight: 800 };
const smallInputStyle: React.CSSProperties = { ...inputStyle, width: "100%", maxWidth: "94px", background: colors.inputBackground, textAlign: "center", fontWeight: 800 };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: "96px", resize: "vertical", background: colors.inputBackground };
const clientCellStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "5px", minWidth: 0, fontWeight: 800 };
const progressStyle: React.CSSProperties = { display: "inline-flex", flexDirection: "column", gap: "4px", borderRadius: radius.input, background: "#e8eef8", color: colors.navy, padding: "8px 10px", fontWeight: 800, minWidth: "86px", fontSize: "14px" };
const progressLargeStyle: React.CSSProperties = { ...progressStyle, width: "100%", padding: "18px", fontSize: "20px" };
const invoiceIssuedStyle: React.CSSProperties = { display: "inline-flex", borderRadius: radius.badge, background: "#d8f5df", color: colors.success, padding: "7px 10px", fontWeight: 850, fontSize: "14px" };
const invoiceOpenStyle: React.CSSProperties = { display: "inline-flex", borderRadius: radius.badge, background: "#f1f5f9", color: colors.muted, padding: "7px 10px", fontWeight: 850, fontSize: "14px" };
const detailsButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "9px 12px", background: colors.card, color: colors.navy, fontWeight: 800, cursor: "pointer" };
const lockButtonStyle: React.CSSProperties = { ...detailsButtonStyle, background: colors.red, color: colors.white, borderColor: colors.red };
const deleteButtonStyle: React.CSSProperties = { ...detailsButtonStyle, color: colors.danger };
const emptyStateStyle: React.CSSProperties = { padding: "18px", borderRadius: radius.input, background: colors.inputBackground, border: `1px dashed ${colors.border}`, color: colors.muted, textAlign: "center", fontWeight: 800 };
const drawerOverlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.32)", display: "flex", justifyContent: "flex-end", zIndex: 50 };
const drawerStyle: React.CSSProperties = { width: "min(760px, 100%)", height: "100vh", background: colors.card, borderLeft: `1px solid ${colors.border}`, boxShadow: shadow.card, display: "flex", flexDirection: "column" };
const drawerHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", padding: "28px", borderBottom: `1px solid ${colors.border}` };
const drawerTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "26px" };
const drawerMetaStyle: React.CSSProperties = { margin: "8px 0 0", color: colors.muted, fontWeight: 800 };
const closeButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, color: colors.text, cursor: "pointer", padding: "10px 14px", height: "42px", fontWeight: 800 };
const drawerContentStyle: React.CSSProperties = { padding: "24px 28px 34px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "18px" };
const drawerSectionStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", background: colors.card };
const drawerSectionTitleStyle: React.CSSProperties = { margin: "0 0 14px", color: colors.navy, fontSize: "20px" };
const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" };
const labelStyle: React.CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 800 };
const threeColumnsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px" };
const twoColumnsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" };
const lockedNoticeStyle: React.CSSProperties = { borderRadius: radius.input, background: "#fff3df", color: "#92400e", padding: "14px", fontWeight: 850 };
const invoiceRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center" };
const clientContextStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", margin: "12px 0", color: colors.muted, fontSize: "13px" };
const recurringListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" };
const recurringItemStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "12px", background: colors.inputBackground };
const recurringMetaStyle: React.CSSProperties = { margin: "5px 0 0", color: colors.muted, fontWeight: 700, fontSize: "13px" };
const recurringFormStyle: React.CSSProperties = { borderTop: `1px solid ${colors.border}`, marginTop: "18px", paddingTop: "18px" };
