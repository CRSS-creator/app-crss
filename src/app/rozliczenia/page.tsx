"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Play, Square } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
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
  fetchActiveRecurringTaskTimers,
  fetchRecurringTasks,
  recurringScopeLabel,
  recurringTaskMatchesClient,
  startRecurringTaskTimer,
  stopRecurringTaskTimer,
  type RecurringTask,
} from "@/lib/recurringTasksService";
import type { TaskPriority, TimeEntry } from "@/lib/taskService";

const EMPTY_FILTER = "Wszystkie";
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
  const [period, setPeriod] = useState(currentMonthInput());
  const [settlements, setSettlements] = useState<MonthlySettlement[]>([]);
  const [progressRows, setProgressRows] = useState<SettlementProgress[]>([]);
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [activeTimers, setActiveTimers] = useState<TimeEntry[]>([]);
  const [selected, setSelected] = useState<MonthlySettlement | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(EMPTY_FILTER);
  const [searchQuery, setSearchQuery] = useState("");

  const progressBySettlement = useMemo(
    () => Object.fromEntries(progressRows.map((row) => [row.rozliczenie_id, row])),
    [progressRows]
  );

  const visibleSettlements = settlements.filter((settlement) => {
    const client = getClient(settlement.klienci);
    const query = searchQuery.trim().toLowerCase();
    const haystack = [client?.nazwa, client?.nip, getCaregiverName(client), settlement.uwagi].filter(Boolean).join(" ").toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const matchesStatus = statusFilter === EMPTY_FILTER || settlement.status_ksiegowosci === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
    const userResult = await supabase.auth.getUser();
    const userId = userResult.data.user?.id || null;
    setCurrentUserId(userId);

    const [settlementsResult, progressResult, recurringResult, timersResult] = await Promise.all([
      fetchMonthlySettlements(normalizedPeriod),
      fetchSettlementTaskProgress(normalizedPeriod),
      fetchRecurringTasks(),
      userId ? fetchActiveRecurringTaskTimers(userId) : Promise.resolve({ data: [], error: null }),
    ]);

    if (settlementsResult.error) console.error("Błąd pobierania rozliczeń:", settlementsResult.error);
    if (progressResult.error) console.error("Błąd pobierania postępu zadań:", progressResult.error);
    if (recurringResult.error) console.error("Błąd pobierania zadań cyklicznych:", recurringResult.error);
    if (timersResult.error) console.error("Błąd pobierania aktywnych liczników:", timersResult.error);

    setSettlements((settlementsResult.data || []) as MonthlySettlement[]);
    setProgressRows((progressResult.data || []) as SettlementProgress[]);
    setRecurringTasks((recurringResult.data || []) as RecurringTask[]);
    setActiveTimers((timersResult.data || []) as TimeEntry[]);
    setLoading(false);
  }

  async function patchSettlement(settlement: MonthlySettlement, payload: Partial<MonthlySettlement>) {
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
    setSelected((current) => current?.id === updated.id ? updated : current);
  }

  async function toggleRecurringTimer(settlement: MonthlySettlement, task: RecurringTask) {
    if (!currentUserId) {
      alert("Nie udało się rozpoznać użytkownika. Zaloguj się ponownie.");
      return;
    }
    const client = getClient(settlement.klienci);
    const activeTimer = activeTimers.find((entry) =>
      entry.zadanie_cykliczne_id === task.id &&
      entry.klient_id === client?.id &&
      entry.miesiac_rozliczeniowy === settlement.okres
    );
    const result = activeTimer
      ? await stopRecurringTaskTimer(activeTimer.id)
      : await startRecurringTaskTimer({ taskId: task.id, clientId: client?.id || null, userId: currentUserId, settlementMonth: settlement.okres });
    if (result.error) {
      console.error("Błąd liczenia czasu pracy:", result.error);
      alert("Nie udało się zapisać czasu pracy.");
      return;
    }
    setActiveTimers((current) => activeTimer ? current.filter((entry) => entry.id !== activeTimer.id) : [result.data as TimeEntry, ...current]);
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Operacyjne</p>
          <h1 style={titleStyle}>Rozliczenia miesięczne</h1>
          <p style={subtitleStyle}>Statusy księgowości, dokumenty, kadry, zadania cykliczne i czas pracy przypisany do klienta.</p>
        </div>
        <input style={monthInputStyle} type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
      </section>

      <section style={summaryGridStyle}>
        <SummaryCard label="Rozliczenia" value={settlements.length} />
        <SummaryCard label="Postęp zadań" value={`${avgProgress}%`} />
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
        </div>

        {loading ? <div style={emptyStateStyle}>Ładowanie rozliczeń...</div> : visibleSettlements.length === 0 ? <div style={emptyStateStyle}>Brak rozliczeń do wyświetlenia.</div> : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead><tr><Th width="230px">Klient</Th><Th width="250px">Status</Th><Th width="140px">L. dokumentów</Th><Th width="150px">L. pracowników</Th><Th width="170px">L. zleceniobiorców</Th><Th width="170px">Zadania cykliczne</Th><Th width="120px">Akcje</Th></tr></thead>
              <tbody>
                {visibleSettlements.map((settlement) => {
                  const client = getClient(settlement.klienci);
                  const progress = progressBySettlement[settlement.id] || { progress: 0, total_tasks: 0, done_tasks: 0 };
                  return (
                    <tr key={settlement.id} style={rowStyle}>
                      <Td strong><div style={clientCellStyle}><span>{client?.nazwa || "Klient"}</span><small>{client?.nip || "Brak NIP"} · {getCaregiverName(client)}</small></div></Td>
                      <Td><select style={{ ...statusInputStyle, ...statusSelectStyle(settlement.status_ksiegowosci) }} value={settlement.status_ksiegowosci} disabled={savingId === settlement.id} onChange={(event) => patchSettlement(settlement, { status_ksiegowosci: event.target.value as SettlementStatus })}>{STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></Td>
                      <Td><NumberInput value={settlement.liczba_dokumentow} disabled={false} onChange={(value) => patchSettlement(settlement, { liczba_dokumentow: value })} /></Td>
                      <Td><NumberInput value={settlement.liczba_pracownikow} disabled={false} onChange={(value) => patchSettlement(settlement, { liczba_pracownikow: value })} /></Td>
                      <Td><NumberInput value={settlement.liczba_zleceniobiorcow} disabled={false} onChange={(value) => patchSettlement(settlement, { liczba_zleceniobiorcow: value })} /></Td>
                      <Td><ProgressBadge progress={progress.progress} done={progress.done_tasks} total={progress.total_tasks} /></Td>
                      <Td><button style={detailsButtonStyle} onClick={() => setSelected(settlement)}>Szczegóły</button></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <SettlementDrawer
          settlement={selected}
          progress={progressBySettlement[selected.id] || { progress: 0, total_tasks: 0, done_tasks: 0, rozliczenie_id: selected.id }}
          recurringTasks={getMatchingRecurringTasks(recurringTasks, getClient(selected.klienci))}
          activeTimers={activeTimers}
          onClose={() => setSelected(null)}
          onSave={patchSettlement}
          onToggleRecurringTimer={toggleRecurringTimer}
          saving={savingId === selected.id}
        />
      )}
    </>
  );
}

function SettlementDrawer({ settlement, progress, recurringTasks, activeTimers, onClose, onSave, onToggleRecurringTimer, saving }: {
  settlement: MonthlySettlement;
  progress: SettlementProgress;
  recurringTasks: RecurringTask[];
  activeTimers: TimeEntry[];
  onClose: () => void;
  onSave: (settlement: MonthlySettlement, payload: Partial<MonthlySettlement>) => void;
  onToggleRecurringTimer: (settlement: MonthlySettlement, task: RecurringTask) => void;
  saving: boolean;
}) {
  const client = getClient(settlement.klienci);

  return (
    <div style={drawerOverlayStyle}>
      <aside style={drawerStyle}>
        <header style={drawerHeaderStyle}>
          <div><p style={eyebrowStyle}>Szczegóły rozliczenia</p><h2 style={drawerTitleStyle}>{client?.nazwa || "Klient"}</h2><p style={drawerMetaStyle}>{formatMonth(settlement.okres.slice(0, 7))} · {client?.nip || "Brak NIP"}</p></div>
          <button style={closeButtonStyle} onClick={onClose}>Zamknij</button>
        </header>
        <div style={drawerContentStyle}>
          <section style={drawerSectionStyle}>
            <h3 style={drawerSectionTitleStyle}>Status miesiąca</h3>
            <Field label="Status księgowości"><select style={{ ...inputStyle, ...statusSelectStyle(settlement.status_ksiegowosci) }} value={settlement.status_ksiegowosci} disabled={saving} onChange={(event) => onSave(settlement, { status_ksiegowosci: event.target.value as SettlementStatus })}>{STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></Field>
            <div style={threeColumnsStyle}><Field label="L. dokumentów"><NumberInput value={settlement.liczba_dokumentow} disabled={false} onChange={(value) => onSave(settlement, { liczba_dokumentow: value })} /></Field><Field label="L. pracowników"><NumberInput value={settlement.liczba_pracownikow} disabled={false} onChange={(value) => onSave(settlement, { liczba_pracownikow: value })} /></Field><Field label="L. zleceniobiorców"><NumberInput value={settlement.liczba_zleceniobiorcow} disabled={false} onChange={(value) => onSave(settlement, { liczba_zleceniobiorcow: value })} /></Field></div>
            <Field label="Uwagi"><textarea style={textareaStyle} value={settlement.uwagi || ""} disabled={false} onChange={(event) => onSave(settlement, { uwagi: event.target.value })} /></Field>
          </section>

          <section style={drawerSectionStyle}>
            <h3 style={drawerSectionTitleStyle}>Zadania cykliczne</h3>
            <ProgressBadge progress={progress.progress} done={progress.done_tasks} total={progress.total_tasks} large />
            <div style={clientContextStyle}><span>Forma prawna: <strong>{client?.forma_prawna || "Brak"}</strong></span><span>Opodatkowanie: <strong>{client?.forma_opodatkowania || "Brak"}</strong></span><span>VAT: <strong>{client?.czynny_vat ? "czynny" : "nie"}</strong></span></div>
            <div style={recurringListStyle}>
              {recurringTasks.length === 0 ? <div style={emptyStateStyle}>Brak zadań cyklicznych dla tego klienta.</div> : recurringTasks.map((task) => {
                const activeTimer = activeTimers.find((entry) => entry.zadanie_cykliczne_id === task.id && entry.klient_id === client?.id && entry.miesiac_rozliczeniowy === settlement.okres);
                return <article key={task.id} style={recurringItemStyle}><div><strong>{task.tytul}</strong><p style={recurringMetaStyle}>{recurringScopeLabel(task)} · dzień {task.dzien_miesiaca} · {priorityLabel(task.priorytet)}</p></div><div style={recurringActionsStyle}><button style={activeTimer ? timerActiveButtonStyle : timerButtonStyle} onClick={() => onToggleRecurringTimer(settlement, task)} title={activeTimer ? "Zatrzymaj liczenie czasu" : "Rozpocznij liczenie czasu"}>{activeTimer ? <Square size={16} /> : <Play size={16} />}{activeTimer ? "Stop" : "Start"}</button></div></article>;
              })}
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

function ProgressBadge({ progress, done, total, large }: { progress: number; done: number; total: number; large?: boolean }) { return <div style={large ? progressLargeStyle : progressStyle}><strong>{progress}%</strong><span>{done}/{total} zadań</span></div>; }
function SummaryCard({ label, value }: { label: string; value: string | number }) { return <div style={summaryCardStyle}><span>{label}</span><strong>{value}</strong></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={fieldStyle}><span style={labelStyle}>{label}</span>{children}</label>; }
function Th({ children, width }: { children: ReactNode; width?: string }) { return <th style={{ ...thStyle, width }}>{children}</th>; }
function Td({ children, strong }: { children: ReactNode; strong?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>; }

function getClient(value: MonthlySettlement["klienci"]) { return Array.isArray(value) ? value[0] : value; }
function getCaregiverName(client: ReturnType<typeof getClient>) { return client?.profiles?.[0]?.full_name || client?.profiles?.[0]?.email || "Brak opiekuna"; }
function currentMonthInput() { 
  const today = new Date();
  const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const month = today.getMonth() === 0 ? 12 : today.getMonth();
  return `${year}-${String(month).padStart(2, "0")}`;
}
function formatMonth(value: string) { return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(`${value}-01T12:00:00`)); }
function priorityLabel(priority: TaskPriority) { return PRIORITY_OPTIONS.find((item) => item.value === priority)?.label || priority; }
function getMatchingRecurringTasks(tasks: RecurringTask[], client: ReturnType<typeof getClient>) { return tasks.filter((task) => recurringTaskMatchesClient(task, client)); }
function statusSelectStyle(status: SettlementStatus): CSSProperties { if (status === "czeka_na_dokumenty") return { background: "#ffd8d8", color: "#991b1b" }; if (status === "dokumenty_kompletne_biuro") return { background: "#ffe7b8", color: "#92400e" }; if (status === "w_trakcie_ksiegowania") return { background: "#ffe3c4", color: "#9a3412" }; if (status === "do_sprawdzenia") return { background: "#efd4f5", color: "#7e22ce" }; if (status === "sprawdzone_zatwierdzone") return { background: "#cbe7f5", color: "#075985" }; return { background: "#c9f2d2", color: "#166534" }; }

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "30px" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 800, margin: "0 0 8px" };
const titleStyle: CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const subtitleStyle: CSSProperties = { maxWidth: "760px", fontSize: "17px", lineHeight: 1.7, color: colors.muted, marginTop: "14px" };
const monthInputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.card, color: colors.navy, padding: "13px 16px", fontWeight: 800 };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" };
const summaryCardStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px", color: colors.muted, fontWeight: 800 };
const cardStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "28px", boxShadow: shadow.soft };
const tableHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "18px", marginBottom: "18px" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px", fontWeight: 500 };
const counterStyle: CSSProperties = { color: colors.muted, fontWeight: 800 };
const searchInputStyle: CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "13px 18px", fontSize: "14px", fontWeight: 600, marginBottom: "16px" };
const filtersRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "24px" };
const filtersLabelStyle: CSSProperties = { color: colors.muted, fontWeight: 800, fontSize: "14px" };
const filterStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "10px 38px 10px 14px", minWidth: "190px", fontSize: "14px", fontWeight: 500 };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", minWidth: "1120px", borderCollapse: "collapse", tableLayout: "fixed" };
const thStyle: CSSProperties = { textAlign: "left", padding: "13px 10px", color: colors.muted, fontSize: "12px", borderBottom: `1px solid ${colors.border}`, lineHeight: 1.25, fontWeight: 800, whiteSpace: "nowrap" };
const rowStyle: CSSProperties = { borderBottom: `1px solid ${colors.border}` };
const tdStyle: CSSProperties = { padding: "15px 10px", color: colors.text, verticalAlign: "middle", fontSize: "15px" };
const inputStyle: CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, color: colors.text, padding: "10px 12px", fontWeight: 500, fontSize: "14px" };
const statusInputStyle: CSSProperties = { ...inputStyle, minWidth: 0, maxWidth: "100%", height: "42px", padding: "8px 28px 8px 10px", fontSize: "12px", lineHeight: 1.1, whiteSpace: "normal", fontWeight: 800 };
const smallInputStyle: CSSProperties = { ...inputStyle, width: "100%", maxWidth: "94px", background: colors.inputBackground, textAlign: "center", fontWeight: 800 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: "96px", resize: "vertical", background: colors.inputBackground };
const clientCellStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "5px", minWidth: 0, fontWeight: 800 };
const progressStyle: CSSProperties = { display: "inline-flex", flexDirection: "column", gap: "4px", borderRadius: radius.input, background: "#e8eef8", color: colors.navy, padding: "8px 10px", fontWeight: 800, minWidth: "86px", fontSize: "14px" };
const progressLargeStyle: CSSProperties = { ...progressStyle, width: "100%", padding: "18px", fontSize: "20px" };
const detailsButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "9px 12px", background: colors.card, color: colors.navy, fontWeight: 800, cursor: "pointer" };
const timerButtonStyle: CSSProperties = { ...detailsButtonStyle, display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 11px", background: "#eef5ff", borderColor: "#c8d8f0" };
const timerActiveButtonStyle: CSSProperties = { ...timerButtonStyle, background: colors.success, borderColor: colors.success, color: colors.white };
const emptyStateStyle: CSSProperties = { padding: "18px", borderRadius: radius.input, background: colors.inputBackground, border: `1px dashed ${colors.border}`, color: colors.muted, textAlign: "center", fontWeight: 800 };
const drawerOverlayStyle: CSSProperties = { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.32)", display: "flex", justifyContent: "flex-end", zIndex: 50 };
const drawerStyle: CSSProperties = { width: "min(760px, 100%)", height: "100vh", background: colors.card, borderLeft: `1px solid ${colors.border}`, boxShadow: shadow.card, display: "flex", flexDirection: "column" };
const drawerHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", padding: "28px", borderBottom: `1px solid ${colors.border}` };
const drawerTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "26px" };
const drawerMetaStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, fontWeight: 800 };
const closeButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, color: colors.text, cursor: "pointer", padding: "10px 14px", height: "42px", fontWeight: 800 };
const drawerContentStyle: CSSProperties = { padding: "24px 28px 34px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "18px" };
const drawerSectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", background: colors.card };
const drawerSectionTitleStyle: CSSProperties = { margin: "0 0 14px", color: colors.navy, fontSize: "20px" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" };
const labelStyle: CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 800 };
const threeColumnsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px" };
const clientContextStyle: CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", margin: "12px 0", color: colors.muted, fontSize: "13px" };
const recurringListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" };
const recurringItemStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "12px", background: colors.inputBackground };
const recurringMetaStyle: CSSProperties = { margin: "5px 0 0", color: colors.muted, fontWeight: 700, fontSize: "13px" };
const recurringActionsStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" };
