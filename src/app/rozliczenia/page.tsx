"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { FileText, Landmark, Play, Square } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { AppDateInput, AppMonthInput } from "@/components/AppDateInputs";
import SettlementAdditionalFeesPanel from "@/components/SettlementAdditionalFeesPanel";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
import {
  ensureCurrentMonthSettlements,
  fetchSettlementInvoiceMarkers,
  fetchSettlementTaxObligationMarkers,
  fetchMonthlySettlements,
  fetchSettlementTaskProgress,
  sendDocumentsReminder,
  updateMonthlySettlement,
  type MonthlySettlement,
  type SettlementInvoiceMarker,
  type SettlementTaxObligationMarker,
  type SettlementProgress,
  type SettlementStatus,
} from "@/lib/monthlySettlementsService";
import {
  fetchActiveRecurringTaskTimers,
  fetchRecurringTaskRealizations,
  fetchRecurringTaskTimeEntries,
  setRecurringTaskManualTime,
  startRecurringTaskTimer,
  stopRecurringTaskTimer,
  updateRecurringTaskRealizationStatus,
  type RecurringTaskRealization,
} from "@/lib/recurringTasksService";
import {
  deleteTaxObligation,
  fetchTaxObligations,
  sendTaxObligations,
  updateTaxObligation,
  type TaxObligation,
  type TaxSendStatus,
} from "@/lib/taxObligationService";
import type { TimeEntry } from "@/lib/taskService";

const EMPTY_FILTER = "Wszystkie";
const STATUS_OPTIONS: { value: SettlementStatus; label: string }[] = [
  { value: "czeka_na_dokumenty", label: "Czeka na dokumenty" },
  { value: "dokumenty_kompletne_biuro", label: "Dokumenty kompletne" },
  { value: "w_trakcie_ksiegowania", label: "W trakcie księgowania" },
  { value: "do_sprawdzenia", label: "Do sprawdzenia" },
  { value: "sprawdzone_zatwierdzone", label: "Zatwierdzone" },
  { value: "podatki_wyslane", label: "Podatki wysłane" },
];
const STATUS_FILTER_OPTIONS = [{ value: EMPTY_FILTER, label: "Status" }, ...STATUS_OPTIONS];

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
  const [invoiceMarkers, setInvoiceMarkers] = useState<SettlementInvoiceMarker[]>([]);
  const [taxObligationMarkers, setTaxObligationMarkers] = useState<SettlementTaxObligationMarker[]>([]);
  const [recurringRealizations, setRecurringRealizations] = useState<RecurringTaskRealization[]>([]);
  const [recurringTimeEntries, setRecurringTimeEntries] = useState<TimeEntry[]>([]);
  const [taxObligations, setTaxObligations] = useState<TaxObligation[]>([]);
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
  const invoiceMarkerByClientId = useMemo(
    () => Object.fromEntries(invoiceMarkers.map((marker) => [marker.klient_id, marker])),
    [invoiceMarkers]
  );
  const taxObligationMarkerBySettlementId = useMemo(
    () => Object.fromEntries(taxObligationMarkers.map((marker) => [marker.rozliczenie_id, marker])),
    [taxObligationMarkers]
  );

  const visibleSettlements = [...settlements].filter((settlement) => {
    const client = getClient(settlement.klienci);
    const query = searchQuery.trim().toLowerCase();
    const haystack = [client?.nazwa, client?.nip, getCaregiverName(client), settlement.uwagi].filter(Boolean).join(" ").toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const matchesStatus = statusFilter === EMPTY_FILTER || settlement.status_ksiegowosci === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort(sortSettlementsByClientName);

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

    const [settlementsResult, progressResult, invoiceMarkersResult, taxMarkersResult, recurringResult, recurringTimeResult, taxResult, timersResult] = await Promise.all([
      fetchMonthlySettlements(normalizedPeriod),
      fetchSettlementTaskProgress(normalizedPeriod),
      fetchSettlementInvoiceMarkers(normalizedPeriod),
      fetchSettlementTaxObligationMarkers(normalizedPeriod),
      fetchRecurringTaskRealizations(normalizedPeriod),
      fetchRecurringTaskTimeEntries(normalizedPeriod),
      fetchTaxObligations(normalizedPeriod),
      userId ? fetchActiveRecurringTaskTimers(userId) : Promise.resolve({ data: [], error: null }),
    ]);

    if (settlementsResult.error) console.error("Błąd pobierania rozliczeń:", settlementsResult.error);
    if (progressResult.error) console.error("Błąd pobierania postępu zadań:", progressResult.error);
    if (invoiceMarkersResult.error) console.error("Błąd pobierania oznaczeń faktur:", invoiceMarkersResult.error);
    if (taxMarkersResult.error) console.error("Błąd pobierania oznaczeń zobowiązań:", taxMarkersResult.error);
    if (recurringResult.error) console.error("Błąd pobierania zadań cyklicznych:", recurringResult.error);
    if (taxResult.error) console.error("Błąd pobierania zobowiązań podatkowych:", taxResult.error);
    if (timersResult.error) console.error("Błąd pobierania aktywnych liczników:", timersResult.error);

    setSettlements((settlementsResult.data || []) as MonthlySettlement[]);
    setProgressRows((progressResult.data || []) as SettlementProgress[]);
    setInvoiceMarkers((invoiceMarkersResult.data || []) as SettlementInvoiceMarker[]);
    setTaxObligationMarkers((taxMarkersResult.data || []) as SettlementTaxObligationMarker[]);
    setRecurringRealizations((recurringResult.data || []) as RecurringTaskRealization[]);
    setRecurringTimeEntries((recurringTimeResult.data || []) as TimeEntry[]);
    setTaxObligations((taxResult.data || []) as TaxObligation[]);
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

  function markDocumentsReminderSent(settlementId: string, reminder: { sentAt: string; sentById: string; sentByName: string }) {
    const patch = {
      przypomnienie_dokumenty_wyslane_at: reminder.sentAt,
      przypomnienie_dokumenty_wyslane_przez: reminder.sentById,
      przypomnienie_dokumenty_wyslane_przez_nazwa: reminder.sentByName,
    };
    setSettlements((current) => current.map((item) => item.id === settlementId ? { ...item, ...patch } : item));
    setSelected((current) => current?.id === settlementId ? { ...current, ...patch } : current);
  }

  async function patchTaxObligation(id: string, payload: Partial<Pick<TaxObligation, "kwota" | "termin_platnosci">>) {
    const existing = taxObligations.find((obligation) => obligation.id === id);
    const previousAmount = existing?.kwota ?? null;
    const nextAmount = payload.kwota ?? null;
    const amountChanged =
      Object.prototype.hasOwnProperty.call(payload, "kwota") &&
      previousAmount !== nextAmount;
    const updatePayload = amountChanged
      ? {
          ...payload,
          status_email: "niewyslane" as TaxSendStatus,
          status_sms: "niewyslane" as TaxSendStatus,
          email_sent_at: null,
          email_sent_by: null,
          sms_sent_at: null,
          sms_sent_by: null,
        }
      : payload;
    const result = await updateTaxObligation(id, updatePayload);
    if (result.error) {
      console.error("Błąd zapisu zobowiązania:", result.error);
      alert("Nie udało się zapisać zobowiązania.");
      return;
    }
    const updated = result.data as TaxObligation;
    setTaxObligations((current) => current.map((obligation) => obligation.id === updated.id ? updated : obligation).sort(sortTaxObligations));
  }

  async function removeTaxObligation(id: string) {
    const result = await deleteTaxObligation(id);
    if (result.error) {
      console.error("Błąd usuwania zobowiązania:", result.error);
      alert("Nie udało się usunąć zobowiązania.");
      return;
    }
    setTaxObligations((current) => current.filter((obligation) => obligation.id !== id));
  }

  function markTaxObligationsSent(updatedObligations: TaxObligation[]) {
    if (updatedObligations.length === 0) return;
    const updatedById = Object.fromEntries(updatedObligations.map((obligation) => [obligation.id, obligation]));
    setTaxObligations((current) => current.map((obligation) => updatedById[obligation.id] || obligation));
  }

  async function toggleRecurringTimer(settlement: MonthlySettlement, task: RecurringTaskRealization) {
    if (!currentUserId) {
      alert("Nie udało się rozpoznać użytkownika. Zaloguj się ponownie.");
      return;
    }
    const client = getClient(settlement.klienci);
    const activeTimer = activeTimers.find((entry) =>
      entry.zadanie_cykliczne_id === task.zadanie_cykliczne_id &&
      entry.klient_id === client?.id &&
      entry.miesiac_rozliczeniowy === settlement.okres
    );
    const result = activeTimer
      ? await stopRecurringTaskTimer(activeTimer.id)
      : await startRecurringTaskTimer({ taskId: task.zadanie_cykliczne_id, clientId: client?.id || null, userId: currentUserId, settlementMonth: settlement.okres });
    if (result.error) {
      console.error("Błąd liczenia czasu pracy:", result.error);
      alert("Nie udało się zapisać czasu pracy.");
      return;
    }
    setActiveTimers((current) => activeTimer ? current.filter((entry) => entry.id !== activeTimer.id) : [result.data as TimeEntry, ...current]);
    if (activeTimer) {
      const entriesResult = await fetchRecurringTaskTimeEntries(settlement.okres);
      if (!entriesResult.error) setRecurringTimeEntries((entriesResult.data || []) as TimeEntry[]);
    }
  }

  async function saveRecurringManualTime(settlement: MonthlySettlement, task: RecurringTaskRealization, totalSeconds: number) {
    if (!currentUserId) {
      alert("Nie udało się rozpoznać użytkownika. Zaloguj się ponownie.");
      return;
    }
    const client = getClient(settlement.klienci);
    const activeTimer = activeTimers.find((entry) =>
      entry.zadanie_cykliczne_id === task.zadanie_cykliczne_id &&
      entry.klient_id === client?.id &&
      entry.miesiac_rozliczeniowy === settlement.okres
    );
    if (activeTimer) {
      alert("Najpierw zatrzymaj aktywne liczenie czasu dla tego zadania.");
      return;
    }
    const result = await setRecurringTaskManualTime({
      taskId: task.zadanie_cykliczne_id,
      clientId: client?.id || null,
      userId: currentUserId,
      settlementMonth: settlement.okres,
      totalSeconds,
    });
    if (result.error) {
      console.error("Błąd ręcznej edycji czasu zadania cyklicznego:", result.error);
      alert("Nie udało się zapisać czasu pracy.");
      return;
    }
    const entriesResult = await fetchRecurringTaskTimeEntries(settlement.okres);
    if (!entriesResult.error) setRecurringTimeEntries((entriesResult.data || []) as TimeEntry[]);
  }

  async function toggleRecurringDone(task: RecurringTaskRealization) {
    const nextStatus = task.status === "zrobione" ? "do_zrobienia" : "zrobione";
    const result = await updateRecurringTaskRealizationStatus(task.id, nextStatus);
    if (result.error) {
      console.error("Błąd zapisu statusu zadania cyklicznego:", result.error);
      alert("Nie udało się zapisać statusu zadania.");
      return;
    }
    const updated = result.data as RecurringTaskRealization;
    setRecurringRealizations((current) => {
      const next = current.map((item) => item.id === updated.id ? updated : item);
      const rows = next.filter((item) => item.rozliczenie_id === updated.rozliczenie_id);
      const total = rows.length;
      const done = rows.filter((item) => item.status === "zrobione").length;
      const progress = total === 0 ? 0 : Math.round((done / total) * 100);
      setProgressRows((progressRows) => progressRows.map((row) => row.rozliczenie_id === updated.rozliczenie_id ? { ...row, total_tasks: total, done_tasks: done, progress } : row));
      return next;
    });
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Operacyjne</p>
          <h1 style={titleStyle}>Rozliczenia miesięczne</h1>
        </div>
        <AppMonthInput style={monthInputStyle} value={period} onChange={setPeriod} />
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
          <AppSelect style={filterStyle} value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} />
        </div>

        {loading ? <div style={emptyStateStyle}>Ładowanie rozliczeń...</div> : visibleSettlements.length === 0 ? <div style={emptyStateStyle}>Brak rozliczeń do wyświetlenia.</div> : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead><tr><Th width="310px">Klient</Th><Th width="250px">Status</Th><Th width="160px">Liczba dokumentów</Th><Th width="160px">Liczba pracowników</Th><Th width="190px">Liczba zleceniobiorców</Th><Th width="170px">Zadania cykliczne</Th><Th width="120px">Akcje</Th></tr></thead>
              <tbody>
                {visibleSettlements.map((settlement) => {
                  const client = getClient(settlement.klienci);
                  const progress = progressBySettlement[settlement.id] || { progress: 0, total_tasks: 0, done_tasks: 0 };
                  const invoiceMarker = client?.id ? invoiceMarkerByClientId[client.id] : null;
                  const taxObligationMarker = taxObligationMarkerBySettlementId[settlement.id];
                  return (
                    <tr key={settlement.id} style={rowStyle}>
                      <Td><div style={clientCellStyle}><span style={clientNameRowStyle}><span style={clientNameStyle}>{client?.nazwa || "Klient"}</span>{invoiceMarker ? <InvoiceMarker number={invoiceMarker.numer} /> : null}{taxObligationMarker ? <TaxObligationMarker types={taxObligationMarker.typy} /> : null}</span><small>{client?.nip || "Brak NIP"} · {getCaregiverName(client)}</small></div></Td>
                      <Td><AppSelect style={{ ...statusInputStyle, ...statusSelectStyle(settlement.status_ksiegowosci) }} value={settlement.status_ksiegowosci} disabled={savingId === settlement.id} options={STATUS_OPTIONS} onChange={(value) => patchSettlement(settlement, { status_ksiegowosci: value as SettlementStatus })} /></Td>
                      <Td><NumberInput value={settlement.liczba_dokumentow} disabled={false} onChange={(value) => patchSettlement(settlement, { liczba_dokumentow: value })} /></Td>
                      <Td>{client?.obsluga_kadrowa ? <NumberInput value={settlement.liczba_pracownikow} disabled={false} onChange={(value) => patchSettlement(settlement, { liczba_pracownikow: value })} /> : <span style={emptyCellStyle}>-</span>}</Td>
                      <Td>{client?.obsluga_kadrowa ? <NumberInput value={settlement.liczba_zleceniobiorcow} disabled={false} onChange={(value) => patchSettlement(settlement, { liczba_zleceniobiorcow: value })} /> : <span style={emptyCellStyle}>-</span>}</Td>
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
          recurringTasks={recurringRealizations.filter((task) => task.rozliczenie_id === selected.id).sort(sortRecurringRealizations)}
          recurringTimeEntries={recurringTimeEntries}
          taxObligations={taxObligations.filter((obligation) => obligation.rozliczenie_id === selected.id)}
          activeTimers={activeTimers}
          onClose={() => setSelected(null)}
          onSave={patchSettlement}
          onToggleRecurringTimer={toggleRecurringTimer}
          onToggleRecurringDone={toggleRecurringDone}
          onSaveRecurringManualTime={saveRecurringManualTime}
          onReminderSent={markDocumentsReminderSent}
          onTaxObligationUpdate={patchTaxObligation}
          onTaxObligationDelete={removeTaxObligation}
          onTaxObligationsSent={markTaxObligationsSent}
          saving={savingId === selected.id}
        />
      )}
    </>
  );
}

function SettlementDrawer({ settlement, progress, recurringTasks, recurringTimeEntries, taxObligations, activeTimers, onClose, onSave, onToggleRecurringTimer, onToggleRecurringDone, onSaveRecurringManualTime, onReminderSent, onTaxObligationUpdate, onTaxObligationDelete, onTaxObligationsSent, saving }: {
  settlement: MonthlySettlement;
  progress: SettlementProgress;
  recurringTasks: RecurringTaskRealization[];
  recurringTimeEntries: TimeEntry[];
  taxObligations: TaxObligation[];
  activeTimers: TimeEntry[];
  onClose: () => void;
  onSave: (settlement: MonthlySettlement, payload: Partial<MonthlySettlement>) => void;
  onToggleRecurringTimer: (settlement: MonthlySettlement, task: RecurringTaskRealization) => void;
  onToggleRecurringDone: (task: RecurringTaskRealization) => void;
  onSaveRecurringManualTime: (settlement: MonthlySettlement, task: RecurringTaskRealization, totalSeconds: number) => void;
  onReminderSent: (settlementId: string, reminder: { sentAt: string; sentById: string; sentByName: string }) => void;
  onTaxObligationUpdate: (id: string, payload: Partial<Pick<TaxObligation, "kwota" | "termin_platnosci">>) => void;
  onTaxObligationDelete: (id: string) => void;
  onTaxObligationsSent: (obligations: TaxObligation[]) => void;
  saving: boolean;
}) {
  const client = getClient(settlement.klienci);
  const hasPayroll = Boolean(client?.obsluga_kadrowa);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [sendingTaxObligations, setSendingTaxObligations] = useState(false);
  const [selectedTaxObligationIds, setSelectedTaxObligationIds] = useState<string[]>([]);
  const [editingRecurringTimeId, setEditingRecurringTimeId] = useState<string | null>(null);

  const recurringTimeByTask = useMemo(() => {
    return recurringTimeEntries.reduce<Record<string, number>>((totals, entry) => {
      if (!entry.zadanie_cykliczne_id || entry.klient_id !== client?.id || entry.miesiac_rozliczeniowy !== settlement.okres || !entry.ended_at) {
        return totals;
      }
      totals[entry.zadanie_cykliczne_id] = (totals[entry.zadanie_cykliczne_id] || 0) + getTimeEntrySeconds(entry);
      return totals;
    }, {});
  }, [client?.id, recurringTimeEntries, settlement.okres]);

  useEffect(() => {
    setSelectedTaxObligationIds((current) =>
      current.filter((id) => taxObligations.some((obligation) => obligation.id === id))
    );
  }, [taxObligations]);

  async function requestDocumentsReminder() {
    setSendingReminder(true);
    const response = await sendDocumentsReminder(settlement.id);
    setSendingReminder(false);

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(result.error || "Nie udało się wysłać przypomnienia.");
      return;
    }

    if (result.reminder?.sentAt && result.reminder?.sentByName) {
      onReminderSent(settlement.id, result.reminder);
    }
  }

  function toggleTaxObligationSelection(id: string) {
    setSelectedTaxObligationIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
  }

  async function requestTaxObligationSend() {
    if (selectedTaxObligationIds.length === 0) return;

    const selectedObligations = taxObligations.filter((obligation) => selectedTaxObligationIds.includes(obligation.id));
    const channels: Array<"email" | "sms"> = [];
    if (!selectedObligations.every((obligation) => obligation.status_email === "wyslane")) channels.push("email");
    if (!selectedObligations.every((obligation) => obligation.status_sms === "wyslane")) channels.push("sms");

    if (channels.length === 0) {
      alert("Zaznaczone zobowiązania zostały już wysłane e-mailem i SMS-em.");
      return;
    }

    setSendingTaxObligations(true);
    const updatedObligations: TaxObligation[] = [];
    const errors: string[] = [];

    for (const channel of channels) {
      const response = await sendTaxObligations(settlement.id, channel, selectedTaxObligationIds);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        errors.push(result.error || (channel === "email" ? "Nie udało się wysłać e-maila." : "Nie udało się wysłać SMS-a."));
        continue;
      }
      if (Array.isArray(result.obligations)) {
        updatedObligations.push(...(result.obligations as TaxObligation[]));
      }
    }

    setSendingTaxObligations(false);
    if (updatedObligations.length > 0) {
      onTaxObligationsSent(updatedObligations);
      setSelectedTaxObligationIds([]);
    }
    if (errors.length > 0) {
      alert(Array.from(new Set(errors)).join("\n"));
    }
  }

  return (
    <div style={drawerOverlayStyle}>
      <aside style={drawerStyle}>
        <header style={drawerHeaderStyle}>
          <div><p style={eyebrowStyle}>Szczegóły rozliczenia</p><h2 style={drawerTitleStyle}>{client?.nazwa || "Klient"}</h2><p style={drawerMetaStyle}>{formatMonth(settlement.okres.slice(0, 7))} · {client?.nip || "Brak NIP"} · Opiekun: {getCaregiverName(client)}</p></div>
          <button style={closeButtonStyle} onClick={onClose}>Zamknij</button>
        </header>
        <div style={drawerContentStyle}>
          <div style={drawerColumnStyle}>
            <section style={drawerSectionStyle}>
              <h3 style={drawerSectionTitleStyle}>Status miesiąca</h3>
              <Field label="Status księgowości"><AppSelect style={{ ...inputStyle, ...statusSelectStyle(settlement.status_ksiegowosci) }} value={settlement.status_ksiegowosci} disabled={saving} options={STATUS_OPTIONS} onChange={(value) => onSave(settlement, { status_ksiegowosci: value as SettlementStatus })} /></Field>
              <Field label="Data dostarczenia dokumentów"><PolishDateInput value={settlement.data_dostarczenia_dokumentow} disabled={saving} onChange={(value) => onSave(settlement, { data_dostarczenia_dokumentow: value })} /></Field>
              <button type="button" style={sendingReminder || Boolean(settlement.data_dostarczenia_dokumentow) ? disabledReminderButtonStyle : reminderButtonStyle} disabled={sendingReminder || Boolean(settlement.data_dostarczenia_dokumentow)} onClick={requestDocumentsReminder}>
                {sendingReminder ? "Wysyłanie..." : "Przypomnij o dokumentach"}
              </button>
              {settlement.przypomnienie_dokumenty_wyslane_at && (
                <p style={reminderMetaStyle}>
                  Przypomnienie wysłane {formatReminderTimestamp(settlement.przypomnienie_dokumenty_wyslane_at)} przez {settlement.przypomnienie_dokumenty_wyslane_przez_nazwa || "nieustalonego użytkownika"}.
                </p>
              )}
              <div style={hasPayroll ? countFieldsGridStyle : oneColumnStyle}>
                <Field label="Liczba dokumentów"><NumberInput value={settlement.liczba_dokumentow} disabled={false} onChange={(value) => onSave(settlement, { liczba_dokumentow: value })} /></Field>
                {hasPayroll && <Field label="Liczba pracowników"><NumberInput value={settlement.liczba_pracownikow} disabled={false} onChange={(value) => onSave(settlement, { liczba_pracownikow: value })} /></Field>}
                {hasPayroll && <Field label="Liczba zleceniobiorców"><NumberInput value={settlement.liczba_zleceniobiorcow} disabled={false} onChange={(value) => onSave(settlement, { liczba_zleceniobiorcow: value })} /></Field>}
              </div>
              <Field label="Uwagi"><textarea style={textareaStyle} value={settlement.uwagi || ""} disabled={false} onChange={(event) => onSave(settlement, { uwagi: event.target.value })} /></Field>
            </section>

            <section style={drawerSectionStyle}>
              <div style={sectionHeaderRowStyle}>
                <h3 style={drawerSectionTitleStyle}>Zobowiązania publicznoprawne</h3>
                <span style={mutedBadgeStyle}>Ręczne uzupełnianie</span>
              </div>
              {taxObligations.length === 0 ? (
                <div style={emptyStateStyle}>Brak zobowiązań dla tego miesiąca.</div>
              ) : (
                <div style={taxObligationListStyle}>
                  {taxObligations.map((obligation) => (
                    <article key={obligation.id} style={taxObligationItemStyle}>
                      <div style={taxObligationMainStyle}>
                        <label style={taxObligationSelectStyle}>
                          <input
                            type="checkbox"
                            checked={selectedTaxObligationIds.includes(obligation.id)}
                            onChange={() => toggleTaxObligationSelection(obligation.id)}
                            style={checkboxStyle}
                          />
                          <strong>{obligation.nazwa}</strong>
                        </label>
                        <span>{formatCurrency(obligation.kwota)}</span>
                      </div>
                      <div style={taxObligationFieldsStyle}>
                        <Field label="Kwota">
                          <AmountInput value={obligation.kwota} onChange={(value) => onTaxObligationUpdate(obligation.id, { kwota: value })} />
                        </Field>
                        <Field label="Termin">
                          <AppDateInput
                            style={taxFieldInputStyle}
                            value={formatDateForInput(obligation.termin_platnosci)}
                            onChange={(value) => onTaxObligationUpdate(obligation.id, { termin_platnosci: value || null })}
                          />
                        </Field>
                      </div>
                      <div style={taxStatusGridStyle}>
                        <div>
                          <span style={sendStatusStyle(obligation.status_email)}>E-mail: {sendStatusLabel(obligation.status_email)}</span>
                          {sendStatusDetails(obligation.email_sent_at, obligation.email_sent_by_name) ? <p style={taxSentInfoStyle}>{sendStatusDetails(obligation.email_sent_at, obligation.email_sent_by_name)}</p> : null}
                        </div>
                        <div>
                          <span style={sendStatusStyle(obligation.status_sms)}>SMS: {sendStatusLabel(obligation.status_sms)}</span>
                          {sendStatusDetails(obligation.sms_sent_at, obligation.sms_sent_by_name) ? <p style={taxSentInfoStyle}>{sendStatusDetails(obligation.sms_sent_at, obligation.sms_sent_by_name)}</p> : null}
                        </div>
                        <button type="button" style={deleteTaxButtonStyle} onClick={() => onTaxObligationDelete(obligation.id)}>Usuń</button>
                      </div>
                    </article>
                  ))}
                  <div style={taxBulkActionsStyle}>
                    <span style={taxBulkHintStyle}>
                      Zaznacz zobowiązania, które mają trafić do klienta e-mailem i SMS-em.
                    </span>
                    <button
                      type="button"
                      style={selectedTaxObligationIds.length === 0 || sendingTaxObligations ? disabledSendTaxInfoButtonStyle : sendTaxInfoButtonStyle}
                      disabled={selectedTaxObligationIds.length === 0 || sendingTaxObligations}
                      onClick={requestTaxObligationSend}
                    >
                      {sendingTaxObligations ? "Wysyłanie..." : `Wyślij informacje (${selectedTaxObligationIds.length})`}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <SettlementAdditionalFeesPanel settlement={settlement} />
          </div>

          <div style={drawerColumnStyle}>
            <section style={drawerSectionStyle}>
              <h3 style={drawerSectionTitleStyle}>Zadania cykliczne</h3>
              <ProgressBadge progress={progress.progress} done={progress.done_tasks} total={progress.total_tasks} large />
              <div style={clientContextStyle}><span>Forma prawna: <strong>{client?.forma_prawna || "Brak"}</strong></span><span>Opodatkowanie: <strong>{client?.forma_opodatkowania || "Brak"}</strong></span><span>VAT: <strong>{client?.czynny_vat ? "czynny" : "nie"}</strong></span>{client?.czynny_vat && <span>Okres VAT: <strong>{vatSettlementPeriodLabel(client.vat_okres_rozliczeniowy)}</strong></span>}<span>VAT-UE: <strong>{client?.vat_ue ? "tak" : "nie"}</strong></span><span>Kadry: <strong>{client?.obsluga_kadrowa ? "tak" : "nie"}</strong></span></div>
              <div style={recurringListStyle}>
                {recurringTasks.length === 0 ? <div style={emptyStateStyle}>Brak zadań cyklicznych dla tego klienta.</div> : recurringTasks.map((task) => {
                  const activeTimer = activeTimers.find((entry) => entry.zadanie_cykliczne_id === task.zadanie_cykliczne_id && entry.klient_id === client?.id && entry.miesiac_rozliczeniowy === settlement.okres);
                  const done = task.status === "zrobione";
                  const totalSeconds = recurringTimeByTask[task.zadanie_cykliczne_id] || 0;
                  const isEditingTime = editingRecurringTimeId === task.id;

                  return (
                    <article key={task.id} style={done ? recurringDoneItemStyle : recurringItemStyle}>
                      <div style={recurringTitleRowStyle}>
                        <input type="checkbox" checked={done} onChange={() => onToggleRecurringDone(task)} style={checkboxStyle} />
                        <div style={recurringTextStyle}>
                          <strong>{task.tytul}</strong>
                          <p style={recurringMetaStyle}>{requiredDayLabel(task.termin)}</p>
                          <p style={recurringTimeSummaryStyle}>Czas pracy: {formatDuration(totalSeconds)}</p>
                          {isEditingTime ? (
                            <RecurringTimeEditor
                              totalSeconds={totalSeconds}
                              onCancel={() => setEditingRecurringTimeId(null)}
                              onSave={(seconds) => {
                                onSaveRecurringManualTime(settlement, task, seconds);
                                setEditingRecurringTimeId(null);
                              }}
                            />
                          ) : null}
                        </div>
                      </div>
                      <div style={recurringActionsStyle}>
                        <button type="button" style={secondarySmallButtonStyle} onClick={() => setEditingRecurringTimeId(isEditingTime ? null : task.id)}>
                          {isEditingTime ? "Ukryj edycję" : "Edytuj czas"}
                        </button>
                        <button style={activeTimer ? timerActiveButtonStyle : timerButtonStyle} onClick={() => onToggleRecurringTimer(settlement, task)} title={activeTimer ? "Zatrzymaj liczenie czasu" : "Rozpocznij liczenie czasu"}>
                          {activeTimer ? <Square size={16} /> : <Play size={16} />}{activeTimer ? "Stop" : "Start"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
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

function PolishDateInput({ value, disabled, onChange }: { value: string | null; disabled: boolean; onChange: (value: string | null) => void }) {
  const [localValue, setLocalValue] = useState(formatDateForDisplayInput(value));
  useEffect(() => setLocalValue(formatDateForDisplayInput(value)), [value]);

  const save = () => {
    const parsedValue = parsePolishDateInput(localValue);
    if (localValue.trim() === "") {
      onChange(null);
      return;
    }
    if (parsedValue) {
      onChange(parsedValue);
      return;
    }
    setLocalValue(formatDateForDisplayInput(value));
  };

  return (
    <input
      style={inputStyle}
      type="text"
      inputMode="numeric"
      placeholder="dd.mm.rrrr"
      value={localValue}
      disabled={disabled}
      onChange={(event) => setLocalValue(maskPolishDateInput(event.target.value))}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function AmountInput({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const [localValue, setLocalValue] = useState(value === null || value === undefined ? "" : String(value));
  useEffect(() => setLocalValue(value === null || value === undefined ? "" : String(value)), [value]);
  return <input style={taxFieldInputStyle} type="number" min={0} step="0.01" value={localValue} onChange={(event) => setLocalValue(event.target.value)} onBlur={() => onChange(parseOptionalAmount(localValue))} />;
}

function RecurringTimeEditor({ totalSeconds, onCancel, onSave }: { totalSeconds: number; onCancel: () => void; onSave: (seconds: number) => void }) {
  const initialHours = Math.floor(totalSeconds / 3600);
  const initialMinutes = Math.floor((totalSeconds % 3600) / 60);
  const [hours, setHours] = useState(String(initialHours));
  const [minutes, setMinutes] = useState(String(initialMinutes));

  useEffect(() => {
    setHours(String(initialHours));
    setMinutes(String(initialMinutes));
  }, [initialHours, initialMinutes]);

  const save = () => {
    const parsedHours = Math.max(0, Math.floor(Number(hours || 0)));
    const parsedMinutes = Math.max(0, Math.min(59, Math.floor(Number(minutes || 0))));
    onSave(parsedHours * 3600 + parsedMinutes * 60);
  };

  return (
    <div style={recurringTimeEditorStyle}>
      <label style={recurringTimeFieldStyle}>
        <span>Godz.</span>
        <input style={recurringTimeInputStyle} type="number" min={0} value={hours} onChange={(event) => setHours(event.target.value)} />
      </label>
      <label style={recurringTimeFieldStyle}>
        <span>Min.</span>
        <input style={recurringTimeInputStyle} type="number" min={0} max={59} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
      </label>
      <button type="button" style={secondarySmallButtonStyle} onClick={save}>Zapisz</button>
      <button type="button" style={secondarySmallButtonStyle} onClick={onCancel}>Anuluj</button>
    </div>
  );
}

function ProgressBadge({ progress, done, total, large }: { progress: number; done: number; total: number; large?: boolean }) {
  const isComplete = total > 0 && done === total;
  return <div style={{ ...(large ? progressLargeStyle : progressStyle), ...(isComplete ? progressCompleteStyle : {}) }}><span>{progress}%</span><span>{done}/{total} zadań</span></div>;
}
function InvoiceMarker({ number }: { number: string | null }) {
  return (
    <span style={invoiceMarkerStyle} title={number ? `Faktura wystawiona: ${number}` : "Faktura wystawiona"}>
      <FileText size={13} />
      FV
    </span>
  );
}
function TaxObligationMarker({ types }: { types: string[] }) {
  return (
    <span style={taxObligationMarkerStyle} title={`Zobowiązania wysłane: ${types.join(", ")}`}>
      <Landmark size={13} />
      ZOB
    </span>
  );
}
function SummaryCard({ label, value }: { label: string; value: string | number }) { return <div style={summaryCardStyle}><span>{label}</span><strong>{value}</strong></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={fieldStyle}><span style={labelStyle}>{label}</span>{children}</label>; }
function Th({ children, width }: { children: ReactNode; width?: string }) { return <th style={{ ...thStyle, width }}>{children}</th>; }
function Td({ children, strong }: { children: ReactNode; strong?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>; }

function getClient(value: MonthlySettlement["klienci"]) { return Array.isArray(value) ? value[0] : value; }
function getCaregiverName(client: ReturnType<typeof getClient>) {
  const profile = Array.isArray(client?.profiles) ? client?.profiles[0] : client?.profiles;
  return profile?.full_name || profile?.email || "Brak opiekuna";
}
function sortSettlementsByClientName(first: MonthlySettlement, second: MonthlySettlement) {
  const firstClient = getClient(first.klienci);
  const secondClient = getClient(second.klienci);

  return (firstClient?.nazwa || "").localeCompare(secondClient?.nazwa || "", "pl", {
    sensitivity: "base",
    numeric: true,
  });
}
function currentMonthInput() { 
  const today = new Date();
  const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const month = today.getMonth() === 0 ? 12 : today.getMonth();
  return `${year}-${String(month).padStart(2, "0")}`;
}
function vatSettlementPeriodLabel(value: string | null | undefined) { return value === "kwartalny" ? "kwartalny" : "miesięczny"; }
function formatMonth(value: string) { return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(`${value}-01T12:00:00`)); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("pl-PL").format(new Date(`${value}T12:00:00`)) : "Do ustalenia"; }
function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
function getTimeEntrySeconds(entry: TimeEntry) {
  if (entry.duration_seconds !== null && entry.duration_seconds !== undefined) return Math.max(0, entry.duration_seconds);
  if (!entry.ended_at) return 0;
  return Math.max(0, Math.round((new Date(entry.ended_at).getTime() - new Date(entry.started_at).getTime()) / 1000));
}
function formatReminderTimestamp(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function formatDateForInput(value: string | null) { return value ? value.slice(0, 10) : ""; }
function formatDateForDisplayInput(value: string | null) {
  const normalized = formatDateForInput(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  return `${day}.${month}.${year}`;
}
function maskPolishDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}
function parsePolishDateInput(value: string) {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function formatCurrency(value: number | null) { return value === null || value === undefined ? "Do uzupełnienia" : new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value); }
function sendStatusLabel(status: TaxSendStatus) { if (status === "wyslane") return "wysłane"; if (status === "blad") return "błąd"; return "niewysłane"; }
function sendStatusStyle(status: TaxSendStatus): CSSProperties {
  if (status === "wyslane") return { ...taxSendBadgeStyle, background: "#dcfce7", color: "#15803d" };
  if (status === "blad") return { ...taxSendBadgeStyle, background: "#fee2e2", color: "#b91c1c" };
  return taxSendBadgeStyle;
}
function sendStatusDetails(sentAt: string | null, sentByName?: string | null) {
  if (!sentAt) return null;
  return `Wysłane ${formatReminderTimestamp(sentAt)}${sentByName ? ` przez ${sentByName}` : ""}.`;
}
function parseOptionalAmount(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (normalized === "") return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, amount) : null;
}
function requiredDayLabel(value: string | null) { return value ? `Wymagany dzień: ${new Date(`${value}T12:00:00`).getDate()}` : "Wymagany dzień: do ustalenia"; }
function sortTaxObligations(a: TaxObligation, b: TaxObligation) { return (a.termin_platnosci || "").localeCompare(b.termin_platnosci || "") || a.typ.localeCompare(b.typ, "pl"); }
function sortRecurringRealizations(a: RecurringTaskRealization, b: RecurringTaskRealization) {
  if (a.status === "zrobione" && b.status !== "zrobione") return 1;
  if (a.status !== "zrobione" && b.status === "zrobione") return -1;
  return (a.termin || "").localeCompare(b.termin || "") || a.tytul.localeCompare(b.tytul, "pl");
}
function statusSelectStyle(status: SettlementStatus): CSSProperties { if (status === "czeka_na_dokumenty") return { background: "#ffd8d8", color: "#991b1b" }; if (status === "dokumenty_kompletne_biuro") return { background: "#ffe7b8", color: "#92400e" }; if (status === "w_trakcie_ksiegowania") return { background: "#ffe3c4", color: "#9a3412" }; if (status === "do_sprawdzenia") return { background: "#efd4f5", color: "#7e22ce" }; if (status === "sprawdzone_zatwierdzone") return { background: "#cbe7f5", color: "#075985" }; return { background: "#c9f2d2", color: "#166534" }; }

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "30px" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 800, margin: "0 0 8px" };
const titleStyle: CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const subtitleStyle: CSSProperties = { maxWidth: "760px", fontSize: "17px", lineHeight: 1.7, color: colors.muted, marginTop: "14px" };
const monthInputStyle: CSSProperties = { width: "220px", maxWidth: "100%", flex: "0 0 220px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.card, color: colors.navy, padding: "13px 16px", fontWeight: 800 };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" };
const summaryCardStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px", color: colors.muted, fontWeight: 800 };
const cardStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "28px", boxShadow: shadow.soft };
const tableHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "18px", marginBottom: "18px" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px", fontWeight: 500 };
const counterStyle: CSSProperties = { color: colors.muted, fontWeight: 800 };
const searchInputStyle: CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "13px 18px", fontSize: "14px", fontWeight: 600, marginBottom: "16px" };
const filtersRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "24px" };
const filtersLabelStyle: CSSProperties = { color: colors.muted, fontWeight: 800, fontSize: "14px" };
const filterStyle: CSSProperties = { width: "190px", flex: "0 0 190px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "10px 38px 10px 14px", fontSize: "14px", fontWeight: 500 };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", minWidth: "1200px", borderCollapse: "collapse", tableLayout: "fixed" };
const thStyle: CSSProperties = { textAlign: "left", padding: "13px 10px", color: colors.muted, fontSize: "12px", borderBottom: `1px solid ${colors.border}`, lineHeight: 1.25, fontWeight: 600, whiteSpace: "nowrap" };
const rowStyle: CSSProperties = { borderBottom: `1px solid ${colors.border}` };
const tdStyle: CSSProperties = { padding: "15px 10px", color: colors.text, verticalAlign: "middle", fontSize: "15px" };
const emptyCellStyle: CSSProperties = { color: colors.muted, fontWeight: 800 };
const inputStyle: CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, color: colors.text, padding: "10px 12px", fontWeight: 500, fontSize: "14px" };
const statusInputStyle: CSSProperties = { ...inputStyle, minWidth: 0, maxWidth: "100%", height: "42px", padding: "8px 28px 8px 10px", fontSize: "12px", lineHeight: 1.1, whiteSpace: "normal", fontWeight: 500 };
const smallInputStyle: CSSProperties = { ...inputStyle, width: "100%", maxWidth: "150px", minWidth: "94px", background: colors.inputBackground, textAlign: "center", fontWeight: 500 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: "96px", resize: "vertical", background: colors.inputBackground };
const clientCellStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "5px", minWidth: 0, fontWeight: 400 };
const clientNameRowStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "8px", minWidth: 0, flexWrap: "wrap" };
const clientNameStyle: CSSProperties = { fontWeight: 800 };
const invoiceMarkerStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "4px", borderRadius: "999px", background: "#dcfce7", color: "#15803d", padding: "3px 7px", fontSize: "11px", lineHeight: 1, fontWeight: 800 };
const taxObligationMarkerStyle: CSSProperties = { ...invoiceMarkerStyle };
const progressStyle: CSSProperties = { display: "inline-flex", flexDirection: "column", gap: "4px", borderRadius: radius.input, background: "#e8eef8", color: colors.navy, padding: "8px 10px", fontWeight: 500, minWidth: "86px", fontSize: "14px" };
const progressLargeStyle: CSSProperties = { ...progressStyle, width: "100%", padding: "18px", fontSize: "20px" };
const progressCompleteStyle: CSSProperties = { background: "#dcfce7", color: "#166534" };
const detailsButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "9px 12px", background: colors.card, color: colors.navy, fontWeight: 800, cursor: "pointer" };
const secondarySmallButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "8px 10px", fontSize: "12px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const reminderButtonStyle: CSSProperties = { border: "none", borderRadius: radius.button, padding: "12px 16px", background: colors.red, color: colors.white, fontWeight: 850, cursor: "pointer", margin: "0 14px 16px 0", minHeight: "44px" };
const disabledReminderButtonStyle: CSSProperties = { ...reminderButtonStyle, background: "#e8eef8", color: colors.muted, cursor: "not-allowed" };
const reminderMetaStyle: CSSProperties = { display: "inline-block", maxWidth: "360px", margin: "0 0 16px", color: colors.muted, fontSize: "12px", lineHeight: 1.45, fontWeight: 700, verticalAlign: "middle" };
const timerButtonStyle: CSSProperties = { ...detailsButtonStyle, display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 11px", background: "#eef5ff", borderColor: "#c8d8f0" };
const timerActiveButtonStyle: CSSProperties = { ...timerButtonStyle, background: colors.success, borderColor: colors.success, color: colors.white };
const emptyStateStyle: CSSProperties = { padding: "18px", borderRadius: radius.input, background: colors.inputBackground, border: `1px dashed ${colors.border}`, color: colors.muted, textAlign: "center", fontWeight: 800 };
const drawerOverlayStyle: CSSProperties = { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.32)", display: "flex", justifyContent: "center", alignItems: "stretch", padding: "18px", zIndex: 50 };
const drawerStyle: CSSProperties = { width: "min(1480px, 100%)", height: "calc(100vh - 36px)", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.card, display: "flex", flexDirection: "column", overflow: "hidden" };
const drawerHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", padding: "28px", borderBottom: `1px solid ${colors.border}` };
const drawerTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "26px" };
const drawerMetaStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, fontWeight: 800 };
const closeButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, color: colors.text, cursor: "pointer", padding: "10px 14px", height: "42px", fontWeight: 800 };
const drawerContentStyle: CSSProperties = { padding: "24px 28px 34px", overflowY: "auto", display: "grid", gridTemplateColumns: "minmax(720px, 1.18fr) minmax(0, 0.82fr)", alignItems: "start", gap: "18px" };
const drawerColumnStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "18px", minWidth: 0 };
const drawerSectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", background: colors.card };
const drawerSectionTitleStyle: CSSProperties = { margin: "0 0 14px", color: colors.navy, fontSize: "20px" };
const sectionHeaderRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px" };
const mutedBadgeStyle: CSSProperties = { borderRadius: radius.badge, background: "#eef2f7", color: colors.muted, padding: "7px 10px", fontSize: "12px", fontWeight: 850 };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" };
const labelStyle: CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 800 };
const countFieldsGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(190px, 1fr))", gap: "14px", alignItems: "start" };
const oneColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "14px" };
const clientContextStyle: CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", margin: "12px 0", color: colors.muted, fontSize: "13px" };
const recurringListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" };
const recurringItemStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "12px", background: colors.inputBackground };
const recurringDoneItemStyle: CSSProperties = { ...recurringItemStyle, background: "#f8fafc", opacity: 0.72 };
const recurringTitleRowStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0 };
const recurringTextStyle: CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0 };
const checkboxStyle: CSSProperties = { width: "18px", minWidth: "18px", height: "18px", flex: "0 0 18px", marginTop: "2px", accentColor: colors.navy };
const recurringMetaStyle: CSSProperties = { margin: "5px 0 0", color: colors.muted, fontWeight: 700, fontSize: "13px" };
const recurringTimeSummaryStyle: CSSProperties = { margin: "3px 0 0", color: colors.navy, fontSize: "13px", fontWeight: 750 };
const recurringTimeEditorStyle: CSSProperties = { display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap", marginTop: "8px" };
const recurringTimeFieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", color: colors.muted, fontSize: "11px", fontWeight: 800 };
const recurringTimeInputStyle: CSSProperties = { width: "72px", border: `1px solid ${colors.border}`, borderRadius: "12px", background: colors.white, color: colors.navy, padding: "8px 10px", fontWeight: 800 };
const recurringActionsStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" };
const taxObligationListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
const taxObligationItemStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "13px", display: "flex", flexDirection: "column", gap: "9px" };
const taxObligationMainStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", color: colors.navy, fontSize: "15px", fontWeight: 850 };
const taxObligationSelectStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "9px", minWidth: 0 };
const taxObligationFieldsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "130px 160px", gap: "10px", alignItems: "start" };
const taxFieldInputStyle: CSSProperties = { ...inputStyle, background: colors.white, boxShadow: "0 1px 0 rgba(15, 23, 42, 0.03)" };
const taxStatusGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr)) auto", gap: "7px", alignItems: "center" };
const taxSendBadgeStyle: CSSProperties = { borderRadius: radius.badge, background: "#eef2f7", color: colors.muted, padding: "7px 8px", fontSize: "12px", fontWeight: 850, textAlign: "center" };
const taxSentInfoStyle: CSSProperties = { margin: "5px 0 0", color: colors.muted, fontSize: "11px", lineHeight: 1.35, fontWeight: 650 };
const sendTaxInfoButtonStyle: CSSProperties = { border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, padding: "11px 14px", minHeight: "41px", fontSize: "13px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const disabledSendTaxInfoButtonStyle: CSSProperties = { ...sendTaxInfoButtonStyle, background: "#e8eef8", color: colors.muted, cursor: "not-allowed" };
const deleteTaxButtonStyle: CSSProperties = { alignSelf: "flex-end", border: `1px solid #fecaca`, borderRadius: radius.button, background: "#fff1f2", color: "#b91c1c", padding: "8px 12px", fontWeight: 850, cursor: "pointer" };
const taxBulkActionsStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "12px 2px 0", flexWrap: "wrap" };
const taxBulkHintStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 750 };

