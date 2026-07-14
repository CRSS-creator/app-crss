"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CalendarClock, DownloadCloud, FileText, Mail, RotateCw, Send, TriangleAlert } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { AppMonthInput } from "@/components/AppDateInputs";
import { colors, radius, shadow } from "@/app/design";
import {
  ensureSubscriptionInvoices,
  fetchInvoices,
  getInvoicePdfUrl,
  importWfirmaInvoices,
  sendInvoiceMail,
  sendInvoiceMails,
  sendOverdueInvoiceReminders,
  sendInvoicesToWfirma,
  syncWfirmaPayments,
  updateInvoice,
  type Invoice,
  type InvoiceCategory,
  type InvoiceEmailHistory,
  type InvoiceLine,
  type InvoiceSyncStatus,
} from "@/lib/invoiceService";

const EMPTY_FILTER = "Wszystkie";
const SOURCE_OPTIONS = [
  { value: "aplikacja", label: "Aplikacja" },
  { value: "wfirma", label: "wFirma" },
  { value: "import", label: "Import" },
] as const;
const SYNC_OPTIONS = [
  { value: "nie_wyslano", label: "Nie wysłano" },
  { value: "w_kolejce", label: "W kolejce" },
  { value: "wyslano", label: "Wysłano" },
  { value: "blad", label: "Błąd" },
  { value: "zaimportowano", label: "Zaimportowano" },
] as const;
const CATEGORY_OPTIONS = [
  { value: "standardowa", label: "Standardowa" },
  { value: "dodatkowa", label: "Dodatkowa" },
] as const;

export default function InvoicesPage() {
  return (
    <AppLayout activePage="faktury">
      <AccessGuard moduleName="faktury">
        <InvoicesContent />
      </AccessGuard>
    </AppLayout>
  );
}

function InvoicesContent() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [importingWfirma, setImportingWfirma] = useState(false);
  const [syncingPayments, setSyncingPayments] = useState(false);
  const [syncingSelectedMonth, setSyncingSelectedMonth] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [sendingBulkMail, setSendingBulkMail] = useState(false);
  const [sourceFilter, setSourceFilter] = useState(EMPTY_FILTER);
  const [overdueModalOpen, setOverdueModalOpen] = useState(false);
  const [overdueQuery, setOverdueQuery] = useState("");
  const [selectedOverdueInvoiceIds, setSelectedOverdueInvoiceIds] = useState<string[]>([]);
  const [sendingOverdueReminder, setSendingOverdueReminder] = useState(false);
  const [query, setQuery] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState(() => currentMonthInput());
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [detailsInvoice, setDetailsInvoice] = useState<Invoice | null>(null);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [savingPeriodId, setSavingPeriodId] = useState<string | null>(null);
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null);
  const [sendingMailId, setSendingMailId] = useState<string | null>(null);

  useEffect(() => {
    void loadData({ generateCurrentMonth: true });
  }, []);

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return invoices
      .filter((invoice) => {
        const matchesSource = sourceFilter === EMPTY_FILTER || invoice.zrodlo === sourceFilter;
        const matchesIssueMonth = invoiceListMonth(invoice) === invoiceMonth;
        const haystack = [
          invoice.numer,
          invoice.kontrahent_nazwa,
          invoice.kontrahent_nip,
          invoice.klienci?.nazwa,
          invoice.wfirma_id,
          invoice.data_wystawienia,
          invoice.okres,
          paymentStatusLabel(invoice),
          categoryLabel(invoice.kategoria),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return matchesSource && matchesIssueMonth && (!normalizedQuery || haystack.includes(normalizedQuery));
      })
      .sort(compareInvoicesByNumber);
  }, [invoices, invoiceMonth, query, sourceFilter]);

  const overdueInvoices = useMemo(
    () => invoices
      .filter((invoice) => invoice.status === "przeterminowana")
      .sort(compareOverdueInvoices),
    [invoices]
  );
  const visibleOverdueInvoices = useMemo(() => {
    const normalizedQuery = overdueQuery.trim().toLowerCase();
    if (!normalizedQuery) return overdueInvoices;
    return overdueInvoices.filter((invoice) => {
      const haystack = [
        invoice.numer,
        invoice.kontrahent_nazwa,
        invoice.kontrahent_nip,
        invoice.klienci?.nazwa,
        invoice.wfirma_id,
        invoice.data_wystawienia,
        invoice.termin_platnosci,
        formatMoney(invoice.kwota_netto),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [overdueInvoices, overdueQuery]);
  const selectableOverdueInvoices = useMemo(
    () => visibleOverdueInvoices.filter((invoice) => canSendOverdueReminder(invoice)),
    [visibleOverdueInvoices]
  );
  const overdueCount = overdueInvoices.length;
  const selectedOverdueReminderIds = useMemo(
    () => selectedOverdueInvoiceIds.filter((invoiceId) => invoices.some((invoice) => invoice.id === invoiceId && canSendOverdueReminder(invoice))),
    [invoices, selectedOverdueInvoiceIds]
  );

  const totals = useMemo(() => {
    const activeInvoices = filteredInvoices.filter((invoice) => invoice.status !== "anulowana");
    return {
      count: filteredInvoices.length,
      sentToWfirma: filteredInvoices.filter((invoice) => invoice.wfirma_sync_status === "wyslano").length,
      net: activeInvoices.reduce((sum, invoice) => sum + Number(invoice.kwota_netto || 0), 0),
    };
  }, [filteredInvoices]);

  const selectableInvoices = useMemo(
    () => filteredInvoices.filter((invoice) => canSelectInvoice(invoice)),
    [filteredInvoices]
  );
  const selectedWfirmaIds = useMemo(
    () => selectedInvoiceIds.filter((invoiceId) => invoices.some((invoice) => invoice.id === invoiceId && canQueueForWfirma(invoice))),
    [invoices, selectedInvoiceIds]
  );
  const selectedMailIds = useMemo(
    () => selectedInvoiceIds.filter((invoiceId) => invoices.some((invoice) => invoice.id === invoiceId && canSendInvoiceMail(invoice))),
    [invoices, selectedInvoiceIds]
  );

  const allSelectableChecked =
    selectableInvoices.length > 0 && selectableInvoices.every((invoice) => selectedInvoiceIds.includes(invoice.id));
  const allOverdueSelectableChecked =
    selectableOverdueInvoices.length > 0 && selectableOverdueInvoices.every((invoice) => selectedOverdueInvoiceIds.includes(invoice.id));

  async function loadData(options?: { generateCurrentMonth?: boolean }) {
    setLoading(true);
    if (options?.generateCurrentMonth) {
      await generateInvoices(monthToDate(currentMonthInput()), { silent: true });
    }
    const result = await fetchInvoices();
    if (result.error) console.error("Błąd pobierania faktur:", result.error);
    setInvoices((result.data || []) as Invoice[]);
    setSelectedInvoiceIds((current) =>
      current.filter((invoiceId) => (result.data || []).some((invoice) => invoice.id === invoiceId && canSelectInvoice(invoice as Invoice)))
    );
    setSelectedOverdueInvoiceIds((current) =>
      current.filter((invoiceId) => (result.data || []).some((invoice) => invoice.id === invoiceId && canSendOverdueReminder(invoice as Invoice)))
    );
    setLoading(false);
  }

  async function refreshInvoices() {
    setSyncingPayments(true);
    const syncResult = await syncWfirmaPayments();
    setSyncingPayments(false);

    if (syncResult.error) {
      console.error("Błąd sprawdzania płatności w wFirmie:", syncResult.error);
      alert(`Nie udało się sprawdzić płatności w wFirmie.\n\n${syncResult.error.message}`);
    }

    await loadData();
  }

  async function refreshSelectedMonthInvoices() {
    setSyncingSelectedMonth(true);
    const syncResult = await syncWfirmaPayments(invoiceMonth);
    setSyncingSelectedMonth(false);

    if (syncResult.error) {
      console.error("Błąd sprawdzania płatności w wFirmie dla miesiąca:", syncResult.error);
      alert(`Nie udało się odświeżyć płatności za wybrany miesiąc.\n\n${syncResult.error.message}`);
    }

    await loadData();
  }

  async function generateInvoices(monthDate = monthToDate(invoiceMonth), options?: { silent?: boolean }) {
    setGenerating(true);
    const result = await ensureSubscriptionInvoices(monthDate);
    setGenerating(false);

    if (result.error) {
      console.error("Błąd generowania faktur abonamentowych:", result.error);
      if (!options?.silent) alert("Nie udało się wygenerować faktur abonamentowych.");
      return;
    }

    if (!options?.silent) await loadData();
  }

  function toggleInvoiceSelection(invoiceId: string, checked: boolean) {
    setSelectedInvoiceIds((current) =>
      checked ? Array.from(new Set([...current, invoiceId])) : current.filter((id) => id !== invoiceId)
    );
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedInvoiceIds((current) => {
      const visibleIds = selectableInvoices.map((invoice) => invoice.id);
      if (!checked) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function toggleOverdueSelection(invoiceId: string, checked: boolean) {
    setSelectedOverdueInvoiceIds((current) =>
      checked ? Array.from(new Set([...current, invoiceId])) : current.filter((id) => id !== invoiceId)
    );
  }

  function toggleAllVisibleOverdue(checked: boolean) {
    setSelectedOverdueInvoiceIds((current) => {
      const visibleIds = selectableOverdueInvoices.map((invoice) => invoice.id);
      if (!checked) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  async function queueSelectedForWfirma() {
    if (selectedWfirmaIds.length === 0) return;

    setQueueing(true);
    const result = await sendInvoicesToWfirma(selectedWfirmaIds);
    setQueueing(false);

    if (result.error) {
      console.error("Błąd przekazania faktur do wFirmy:", result.error);
      alert(`Nie udało się przekazać zaznaczonych faktur do wFirmy.\n\n${result.error.message}`);
      return;
    }

    setSelectedInvoiceIds([]);
    await loadData();
    if (result.data?.failed.length) {
      alert(`Wysłano: ${result.data.sent}. Błędy: ${result.data.failed.length}. Szczegóły są w statusach faktur.`);
    }
  }

  async function sendSelectedByMail() {
    if (selectedMailIds.length === 0) return;

    setSendingBulkMail(true);
    const result = await sendInvoiceMails(selectedMailIds);
    setSendingBulkMail(false);

    if (result.error) {
      console.error("Błąd zbiorczej wysyłki faktur e-mailem:", result.error);
      alert(`Nie udało się wysłać zaznaczonych faktur e-mailem.\n\n${result.error.message}`);
      return;
    }

    setSelectedInvoiceIds([]);
    await loadData();
    if (result.data?.failed.length) {
      alert(`Wysłano mailem: ${result.data.sent}. Błędy: ${result.data.failed.length}. Szczegóły są w historii faktur.`);
    }
  }

  async function sendSelectedOverdueReminders() {
    if (selectedOverdueReminderIds.length === 0) return;

    setSendingOverdueReminder(true);
    const result = await sendOverdueInvoiceReminders(selectedOverdueReminderIds);
    setSendingOverdueReminder(false);

    if (result.error) {
      console.error("Błąd wysyłki powiadomień o przeterminowanych fakturach:", result.error);
      alert(`Nie udało się wysłać powiadomień.\n\n${result.error.message}`);
      return;
    }

    setSelectedOverdueInvoiceIds([]);
    await loadData();
    const sent = result.data?.sent || 0;
    const failed = result.data?.failed.length || 0;
    alert(`Wysłano powiadomienia: ${sent}. Błędy: ${failed}.`);
  }

  async function importInvoicesFromWfirma() {
    setImportingWfirma(true);
    const result = await importWfirmaInvoices(invoiceMonth);
    setImportingWfirma(false);

    if (result.error) {
      console.error("Błąd importu faktur z wFirmy:", result.error);
      alert(`Nie udało się zaimportować faktur z wFirmy.\n\n${result.error.message}`);
      return;
    }

    await loadData();
    alert(`Zaimportowano lub zaktualizowano faktury za ${formatMonth(monthToDate(invoiceMonth))}: ${result.data?.imported || 0}.`);
  }

  async function changeInvoiceCategory(invoice: Invoice, category: InvoiceCategory) {
    if (invoice.kategoria === category) return;

    setSavingCategoryId(invoice.id);
    const result = await updateInvoice(invoice.id, { kategoria: category });
    setSavingCategoryId(null);

    if (result.error) {
      console.error("Błąd zapisu kategorii faktury:", result.error);
      alert("Nie udało się zapisać kategorii faktury.");
      return;
    }

    const updatedInvoice = (result.data || { ...invoice, kategoria: category }) as Invoice;
    setInvoices((current) => current.map((item) => (item.id === invoice.id ? updatedInvoice : item)));
    setDetailsInvoice((current) => (current?.id === invoice.id ? updatedInvoice : current));
  }

  async function changeInvoicePeriod(invoice: Invoice, periodMonth: string) {
    const okres = monthToDate(periodMonth);
    if (invoice.okres === okres) return;

    setSavingPeriodId(invoice.id);
    const result = await updateInvoice(invoice.id, { okres });
    setSavingPeriodId(null);

    if (result.error) {
      console.error("Błąd zapisu okresu faktury:", result.error);
      alert("Nie udało się zapisać okresu faktury.");
      return;
    }

    const updatedInvoice = (result.data || { ...invoice, okres }) as Invoice;
    setInvoices((current) => current.map((item) => (item.id === invoice.id ? updatedInvoice : item)));
    setDetailsInvoice((current) => (current?.id === invoice.id ? updatedInvoice : current));
  }

  async function openInvoicePdf(invoice: Invoice) {
    if (!invoice.wfirma_pdf_path) {
      alert("Ta faktura nie ma jeszcze pobranego PDF.");
      return;
    }

    setOpeningPdfId(invoice.id);
    const result = await getInvoicePdfUrl(invoice.id);
    setOpeningPdfId(null);

    if (result.error || !result.data?.url) {
      console.error("Błąd otwierania PDF faktury:", result.error);
      alert(`Nie udało się otworzyć PDF faktury.\n\n${result.error?.message || ""}`);
      return;
    }

    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  async function sendInvoiceByMail(invoice: Invoice) {
    if (!invoice.wfirma_pdf_path) {
      alert("Ta faktura nie ma jeszcze PDF do wysyłki.");
      return;
    }

    setSendingMailId(invoice.id);
    const result = await sendInvoiceMail(invoice.id);
    setSendingMailId(null);

    if (result.error) {
      console.error("Błąd wysyłki faktury e-mailem:", result.error);
      alert(`Nie udało się wysłać faktury e-mailem.\n\n${result.error.message}`);
      return;
    }

    const recipientEmail = result.data?.recipients[0]?.recipientEmail || "klienta";
    alert(`Faktura została przekazana do wysyłki na adres: ${recipientEmail}.`);
    await loadData();
  }

  const detailsReadinessIssues = detailsInvoice ? wfirmaReadinessIssues(detailsInvoice) : [];

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Automatyzacja</p>
          <h1 style={titleStyle}>Faktury</h1>
        </div>
        <div style={headerActionsStyle}>
          <button type="button" style={secondaryButtonStyle} onClick={refreshInvoices} disabled={loading || generating || syncingPayments}>
            <RotateCw size={18} />
            {loading || syncingPayments ? "Odświeżanie..." : "Odśwież"}
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={() => {
            setSelectedInvoiceIds([]);
            setSelectedOverdueInvoiceIds([]);
            setOverdueQuery("");
            setOverdueModalOpen(true);
          }}>
            <TriangleAlert size={18} />
            Przeterminowane ({overdueCount})
          </button>
        </div>
      </section>

      <section style={summaryGridStyle}>
        <Summary label="Faktury" value={totals.count} />
        <Summary label="Wysłane do wFirmy" value={totals.sentToWfirma} />
        <Summary label="Netto" value={formatMoney(totals.net)} />
      </section>

      <section style={automationPanelStyle}>
        <div style={automationControlsStyle}>
          <label style={fieldStyle}>
            <span>Miesiąc wystawienia</span>
            <AppMonthInput
              style={inputStyle}
              value={invoiceMonth}
              onChange={setInvoiceMonth}
            />
          </label>
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={generating}
            onClick={() => generateInvoices()}
          >
            <CalendarClock size={18} />
            {generating ? "Generowanie..." : "Wygeneruj miesiąc"}
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            disabled={importingWfirma}
            onClick={importInvoicesFromWfirma}
          >
            <DownloadCloud size={18} />
            {importingWfirma ? "Importowanie..." : "Importuj z wFirmy"}
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            disabled={loading || syncingSelectedMonth || generating || importingWfirma}
            onClick={refreshSelectedMonthInvoices}
            title="Odświeża płatności tylko dla wybranego miesiąca"
          >
            <RotateCw size={18} />
            {syncingSelectedMonth ? "Odświeżanie..." : "Odśwież"}
          </button>
        </div>
      </section>

      <section style={listPanelStyle}>
        <div style={bulkActionsStyle}>
          <div>
            <h2 style={listTitleStyle}>Lista faktur</h2>
            <p style={bulkHelpStyle}>
              Zaznacz faktury, które nie były jeszcze wysłane do wFirmy, a potem wyślij je zbiorczo.
            </p>
          </div>
          <div style={bulkButtonGroupStyle}>
            <button
              type="button"
              style={primaryButtonStyle}
              disabled={selectedWfirmaIds.length === 0 || queueing}
              onClick={queueSelectedForWfirma}
            >
              {queueing ? "Przekazywanie..." : `Wyślij do wFirmy (${selectedWfirmaIds.length})`}
            </button>
            <button
              type="button"
              style={secondaryButtonStyle}
              disabled={selectedMailIds.length === 0 || sendingBulkMail}
              onClick={sendSelectedByMail}
            >
              <Mail size={18} />
              {sendingBulkMail ? "Wysyłanie..." : `Wyślij mailem (${selectedMailIds.length})`}
            </button>
          </div>
        </div>
        <div style={filtersStyle}>
          <input
            style={searchStyle}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj po numerze z wFirmy, kontrahencie, NIP albo ID wFirma"
          />
          <AppSelect
            style={filterSelectStyle}
            value={sourceFilter}
            options={[{ value: EMPTY_FILTER, label: "Źródło" }, ...SOURCE_OPTIONS]}
            onChange={setSourceFilter}
          />
        </div>

        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>
                  <input
                    type="checkbox"
                    checked={allSelectableChecked}
                    disabled={selectableInvoices.length === 0}
                    onChange={(event) => toggleAllVisible(event.target.checked)}
                    aria-label="Zaznacz widoczne faktury do wFirmy"
                  />
                </Th>
                <Th>Numer</Th>
                <Th>Kontrahent</Th>
                <Th>Data wystawienia</Th>
                <Th>Okres</Th>
                <Th>Status</Th>
                <Th>Kategoria</Th>
                <Th>Kwota</Th>
                <Th>wFirma</Th>
                <Th>Szczegóły</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <Td colSpan={10}>Ładowanie faktur...</Td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <Td colSpan={10}>Brak faktur dla wybranych filtrów.</Td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} style={invoice.numer ? rowStyle : pendingInvoiceRowStyle}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.includes(invoice.id)}
                        disabled={!canSelectInvoice(invoice)}
                        onChange={(event) => toggleInvoiceSelection(invoice.id, event.target.checked)}
                        aria-label={`Zaznacz fakturę ${invoice.numer || invoice.kontrahent_nazwa}`}
                      />
                    </Td>
                    <Td strong style={invoiceNumberCellStyle}>
                      <span style={invoiceNumberRowStyle}>
                        {invoiceNumberLabel(invoice)}
                        {invoiceMailSent(invoice) ? (
                          <span style={mailSentIconStyle} title="Faktura wysłana mailem">
                            <Mail size={13} />
                          </span>
                        ) : null}
                      </span>
                      <Small>{invoice.numer ? "Numer z wFirmy" : "Po wysłaniu do wFirmy"}</Small>
                    </Td>
                    <Td>
                      {invoice.kontrahent_nazwa}
                      <Small>{invoice.kontrahent_nip || invoice.klienci?.nazwa || "Brak NIP"}</Small>
                    </Td>
                    <Td>{invoice.data_wystawienia ? formatDate(invoice.data_wystawienia) : "Po wysłaniu"}</Td>
                    <Td>
                      <AppMonthInput
                        style={periodInputStyle}
                        value={toMonthInput(invoice.okres || invoice.data_wystawienia)}
                        disabled={savingPeriodId === invoice.id}
                        onChange={(value) => changeInvoicePeriod(invoice, value)}
                        ariaLabel={`Zmień okres faktury ${invoice.numer || invoice.kontrahent_nazwa}`}
                      />
                    </Td>
                    <Td>
                      <Badge tone={paymentStatusTone(invoice)}>{paymentStatusLabel(invoice)}</Badge>
                    </Td>
                    <Td>
                      <AppSelect
                        style={categorySelectStyle}
                        value={invoice.kategoria || "standardowa"}
                        options={CATEGORY_OPTIONS}
                        onChange={(value) => changeInvoiceCategory(invoice, value as InvoiceCategory)}
                        disabled={savingCategoryId === invoice.id}
                      />
                    </Td>
                    <Td strong style={amountCellStyle}>{formatMoney(invoice.kwota_netto)}</Td>
                    <Td>
                      <Badge
                        tone={
                          invoice.wfirma_sync_status === "blad"
                            ? "danger"
                            : invoice.wfirma_sync_status === "wyslano" ||
                                invoice.wfirma_sync_status === "zaimportowano"
                              ? "success"
                              : "neutral"
                        }
                      >
                        {syncLabel(invoice.wfirma_sync_status)}
                      </Badge>
                    </Td>
                    <Td>
                      <button type="button" style={smallButtonStyle} onClick={() => setDetailsInvoice(invoice)}>
                        Szczegóły
                      </button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {overdueModalOpen && (
        <div style={overdueOverlayStyle} onClick={() => setOverdueModalOpen(false)}>
          <aside style={overdueModalStyle} onClick={(event) => event.stopPropagation()}>
            <header style={overdueModalHeaderStyle}>
              <div>
                <p style={eyebrowStyle}>Faktury</p>
                <h2 style={overdueModalTitleStyle}>Przeterminowane</h2>
                <p style={overdueModalMetaStyle}>Wszystkie okresy - {overdueCount} pozycji</p>
              </div>
              <button type="button" style={secondaryButtonStyle} onClick={() => setOverdueModalOpen(false)}>Zamknij</button>
            </header>

            {overdueInvoices.length === 0 ? (
              <div style={emptyOverdueStyle}>Brak przeterminowanych faktur.</div>
            ) : (
              <div style={overdueModalBodyStyle}>
                <div style={overdueToolbarStyle}>
                  <input
                    value={overdueQuery}
                    onChange={(event) => setOverdueQuery(event.target.value)}
                    placeholder="Szukaj po numerze, kontrahencie, NIP albo ID wFirma"
                    style={overdueSearchStyle}
                  />
                  <button
                    type="button"
                    style={primaryButtonStyle}
                    disabled={selectedOverdueReminderIds.length === 0 || sendingOverdueReminder}
                    onClick={sendSelectedOverdueReminders}
                  >
                    <Mail size={18} />
                    {sendingOverdueReminder ? "Wysyłanie..." : `Wyślij powiadomienie (${selectedOverdueReminderIds.length})`}
                  </button>
                </div>

                {visibleOverdueInvoices.length === 0 ? (
                  <div style={emptyOverdueStyle}>Brak faktur pasujących do wyszukiwania.</div>
                ) : (
                  <div style={overdueTableWrapperStyle}>
                    <table style={overdueTableStyle}>
                      <thead>
                        <tr>
                          <Th>
                            <input
                              type="checkbox"
                              checked={allOverdueSelectableChecked}
                              disabled={selectableOverdueInvoices.length === 0}
                              onChange={(event) => toggleAllVisibleOverdue(event.target.checked)}
                              aria-label="Zaznacz widoczne przeterminowane faktury"
                            />
                          </Th>
                          <Th>Numer</Th>
                          <Th>Kontrahent</Th>
                          <Th>Data wystawienia</Th>
                          <Th>Termin płatności</Th>
                          <Th>Po terminie</Th>
                          <Th>Status</Th>
                          <Th>Kwota</Th>
                          <Th>wFirma</Th>
                          <Th>Szczegóły</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleOverdueInvoices.map((invoice) => (
                          <tr key={invoice.id} style={rowStyle}>
                            <Td>
                              <input
                                type="checkbox"
                                checked={selectedOverdueInvoiceIds.includes(invoice.id)}
                                disabled={!canSendOverdueReminder(invoice)}
                                onChange={(event) => toggleOverdueSelection(invoice.id, event.target.checked)}
                                title={canSendOverdueReminder(invoice) ? "Zaznacz do powiadomienia" : "Brak adresu e-mail albo telefonu klienta"}
                                aria-label={`Zaznacz powiadomienie dla ${invoice.numer || invoice.kontrahent_nazwa}`}
                              />
                            </Td>
                            <Td strong style={invoiceNumberCellStyle}>{invoiceNumberLabel(invoice)}<Small>{invoice.numer ? "Numer z wFirmy" : "Po wysłaniu do wFirmy"}</Small></Td>
                            <Td>{invoice.kontrahent_nazwa}<Small>{invoice.kontrahent_nip || invoice.klienci?.nazwa || "Brak NIP"}</Small></Td>
                            <Td>{invoice.data_wystawienia ? formatDate(invoice.data_wystawienia) : "Po wysłaniu"}</Td>
                            <Td>{invoice.termin_platnosci ? formatDate(invoice.termin_platnosci) : "Brak"}</Td>
                            <Td strong>{overdueDays(invoice.termin_platnosci)} dni</Td>
                            <Td><Badge tone="danger">Przeterminowana</Badge></Td>
                            <Td strong style={amountCellStyle}>{formatMoney(invoice.kwota_netto)}</Td>
                            <Td><Badge tone={invoice.wfirma_sync_status === "blad" ? "danger" : ["wyslano", "zaimportowano"].includes(invoice.wfirma_sync_status) ? "success" : "neutral"}>{syncLabel(invoice.wfirma_sync_status)}</Badge></Td>
                            <Td>
                              <button type="button" style={smallButtonStyle} onClick={() => {
                                setOverdueModalOpen(false);
                                setDetailsInvoice(invoice);
                              }}>
                                Szczegóły
                              </button>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {detailsInvoice && (
        <div style={overlayStyle} onClick={() => setDetailsInvoice(null)}>
          <aside style={detailsPanelStyle} onClick={(event) => event.stopPropagation()}>
            <div style={detailsHeaderStyle}>
              <div>
                <p style={eyebrowStyle}>Szczegóły FV</p>
                <h2 style={detailsTitleStyle}>{invoiceNumberLabel(detailsInvoice)}</h2>
              </div>
              <button type="button" style={secondaryButtonStyle} onClick={() => setDetailsInvoice(null)}>
                Zamknij
              </button>
            </div>

            <div style={detailsSummaryGridStyle}>
              <DetailStat label="Kontrahent" value={detailsInvoice.kontrahent_nazwa} />
              <DetailStat label="NIP" value={detailsInvoice.kontrahent_nip || "Brak NIP"} />
              <DetailStat label="Okres" value={formatMonth(detailsInvoice.okres || detailsInvoice.data_wystawienia)} />
              <DetailStat label="Data wystawienia" value={detailsInvoice.data_wystawienia ? formatDate(detailsInvoice.data_wystawienia) : "Po wysłaniu"} />
              <DetailStat label="Termin płatności" value={formatDate(paymentDueDate(detailsInvoice))} />
              <DetailStat label="Status" value={<Badge tone={paymentStatusTone(detailsInvoice)}>{paymentStatusLabel(detailsInvoice)}</Badge>} />
              <DetailStat label="Netto" value={formatMoney(detailsInvoice.kwota_netto)} />
              <DetailStat label="Brutto" value={formatMoney(detailsInvoice.kwota_brutto)} />
            </div>

            <section style={invoicePdfStyle}>
              <div>
                <h3 style={descriptionTitleStyle}>PDF faktury</h3>
                <p style={pdfMetaStyle}>
                  {detailsInvoice.wfirma_pdf_path
                    ? detailsInvoice.wfirma_pdf_name || "PDF pobrany z wFirmy"
                    : "PDF pojawi się tutaj po wysłaniu faktury do wFirmy i pobraniu pliku."}
                </p>
              </div>
              {detailsInvoice.wfirma_pdf_path ? (
                <div style={pdfActionsStyle}>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    disabled={openingPdfId === detailsInvoice.id}
                    onClick={() => openInvoicePdf(detailsInvoice)}
                  >
                    <FileText size={18} />
                    {openingPdfId === detailsInvoice.id ? "Otwieranie..." : "Otwórz PDF"}
                  </button>
                  <button
                    type="button"
                    style={primaryButtonStyle}
                    disabled={sendingMailId === detailsInvoice.id}
                    onClick={() => sendInvoiceByMail(detailsInvoice)}
                  >
                    <Send size={18} />
                    {sendingMailId === detailsInvoice.id ? "Wysyłanie..." : "Wyślij e-mail"}
                  </button>
                </div>
              ) : (
                <Badge tone="neutral">Brak PDF</Badge>
              )}
            </section>

            <section style={wfirmaReadinessStyle}>
              <div style={sectionTitleRowStyle}>
                <h3 style={descriptionTitleStyle}>Dane do wFirmy</h3>
                <Badge tone={detailsReadinessIssues.length === 0 ? "success" : "danger"}>
                  {detailsReadinessIssues.length === 0 ? "Gotowe do wysłania" : "Do uzupełnienia"}
                </Badge>
              </div>
              <div style={readinessGridStyle}>
                <ReadinessItem ok={Boolean(detailsInvoice.kontrahent_nazwa?.trim())} label="Kontrahent" value={detailsInvoice.kontrahent_nazwa || "Brak"} />
                <ReadinessItem ok={Boolean(detailsInvoice.kontrahent_nip?.trim())} label="NIP" value={detailsInvoice.kontrahent_nip || "Brak"} />
                <ReadinessItem ok={invoiceLines(detailsInvoice).length > 0} label="Pozycje" value={`${invoiceLines(detailsInvoice).length} pozycji`} />
                <ReadinessItem ok={invoiceLines(detailsInvoice).every(lineReadyForWfirma)} label="Ceny i VAT" value={invoiceLines(detailsInvoice).every(lineReadyForWfirma) ? "Kompletne" : "Sprawdź pozycje"} />
                <ReadinessItem ok label="Data wystawienia" value={detailsInvoice.data_wystawienia ? formatDate(detailsInvoice.data_wystawienia) : "Ustawiana przy wysyłce"} />
                <ReadinessItem ok label="Termin płatności" value={detailsInvoice.data_wystawienia ? formatDate(paymentDueDate(detailsInvoice)) : "Data wystawienia + 7 dni"} />
              </div>
            </section>

            <div style={lineTableWrapperStyle}>
              <table style={lineTableStyle}>
                <thead>
                  <tr>
                    <Th>Nazwa</Th>
                    <Th>Ilość</Th>
                    <Th>Jedn</Th>
                    <Th>Cena netto</Th>
                    <Th>VAT</Th>
                    <Th>Netto</Th>
                    <Th>Brutto</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceLines(detailsInvoice).length === 0 ? (
                    <tr>
                      <Td colSpan={7}>Brak pozycji faktury.</Td>
                    </tr>
                  ) : (
                    invoiceLines(detailsInvoice).map((line) => (
                      <tr key={line.id}>
                        <Td strong>{line.nazwa}</Td>
                        <Td>{formatQuantity(line.ilosc)}</Td>
                        <Td>{line.jednostka}</Td>
                        <Td>{formatMoney(line.cena_netto)}</Td>
                        <Td>{line.stawka_vat}</Td>
                        <Td>{formatMoney(line.kwota_netto)}</Td>
                        <Td strong>{formatMoney(lineGross(line))}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <section style={invoiceDescriptionStyle}>
              <h3 style={descriptionTitleStyle}>Opis faktury</h3>
              <p style={descriptionTextStyle}>{detailsInvoice.opis || "Brak opisu."}</p>
            </section>

            <section style={invoiceDescriptionStyle}>
              <h3 style={descriptionTitleStyle}>Historia wysyłki i powiadomień</h3>
              {invoiceMailHistory(detailsInvoice).length === 0 ? (
                <p style={descriptionTextStyle}>Brak wysyłek i powiadomień tej faktury.</p>
              ) : (
                <div style={mailHistoryListStyle}>
                  {invoiceMailHistory(detailsInvoice).map((entry) => (
                    <div key={entry.id} style={mailHistoryItemStyle}>
                      <div>
                        <strong>{invoiceHistoryTitle(entry)}</strong>
                        <p style={pdfMetaStyle}>
                          {formatDateTime(entry.created_at)} · {entry.recipient_email}
                          {entry.recipient_phone ? ` · SMS: ${entry.recipient_phone}` : ""}
                          {entry.sent_by_name ? ` · ${entry.sent_by_name}` : ""}
                        </p>
                        <p style={pdfMetaStyle}>{entry.subject}</p>
                        {entry.error ? <p style={mailErrorTextStyle}>{entry.error}</p> : null}
                      </div>
                      <Badge tone={entry.status === "wyslane" ? "success" : "danger"}>
                        {entry.status === "wyslane" ? "OK" : "Błąd"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={summaryStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={detailStatStyle}>
      <span>{label}</span>
      <strong style={detailStatValueStyle}>{value}</strong>
    </div>
  );
}

function ReadinessItem({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div style={readinessItemStyle}>
      <span style={ok ? readinessDotOkStyle : readinessDotErrorStyle} />
      <div style={readinessTextStyle}>
        <span style={readinessLabelStyle}>{label}</span>
        <span style={readinessValueStyle}>{value}</span>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children, strong, colSpan, style }: { children: React.ReactNode; strong?: boolean; colSpan?: number; style?: CSSProperties }) {
  return <td colSpan={colSpan} style={{ ...tdStyle, fontWeight: strong ? 720 : 500, ...style }}>{children}</td>;
}

function Small({ children }: { children: React.ReactNode }) {
  return <small style={smallStyle}>{children}</small>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "success" | "danger" | "neutral" }) {
  const style = tone === "success" ? successBadgeStyle : tone === "danger" ? dangerBadgeStyle : neutralBadgeStyle;
  return <span style={style}>{children}</span>;
}

function categoryLabel(category: InvoiceCategory | null | undefined) {
  return CATEGORY_OPTIONS.find((item) => item.value === (category || "standardowa"))?.label || "Standardowa";
}

function currentMonthInput() {
  return new Date().toISOString().slice(0, 7);
}

function monthToDate(value: string) {
  return `${value || currentMonthInput()}-01`;
}

function toMonthInput(value: string | null | undefined) {
  return value ? value.slice(0, 7) : currentMonthInput();
}

function formatMoney(value: number | string | null | undefined) {
  return `${Number(value || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function formatMonth(value: string | null) {
  if (!value) return "Brak";
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDate(value: string | null) {
  if (!value) return "Brak";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string | null) {
  if (!value) return "Brak daty";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function paymentDueDate(invoice: Invoice) {
  if (invoice.data_wystawienia) return addDays(invoice.data_wystawienia, 7);
  return invoice.termin_platnosci;
}

function paymentStatusLabel(invoice: Invoice) {
  if (invoice.status === "oplacona") return "Zapłacona";
  if (invoice.status === "anulowana") return "Anulowana";
  if (invoice.status === "przeterminowana" || isInvoiceOverdue(invoice)) return "Przeterminowana";
  return "Niezapłacona";
}

function paymentStatusTone(invoice: Invoice): "success" | "danger" | "neutral" {
  if (invoice.status === "oplacona") return "success";
  if (invoice.status === "anulowana" || invoice.status === "przeterminowana" || isInvoiceOverdue(invoice)) return "danger";
  return "neutral";
}

function isInvoiceOverdue(invoice: Invoice) {
  if (!invoice.termin_platnosci || ["oplacona", "anulowana"].includes(invoice.status)) return false;
  return invoice.termin_platnosci < new Date().toISOString().slice(0, 10);
}

function formatQuantity(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

function wfirmaReadinessIssues(invoice: Invoice) {
  const issues: string[] = [];
  const lines = invoiceLines(invoice);

  if (!invoice.kontrahent_nazwa?.trim()) issues.push("brak kontrahenta");
  if (!invoice.kontrahent_nip?.trim()) issues.push("brak NIP");
  if (lines.length === 0) issues.push("brak pozycji");
  lines.forEach((line, index) => {
    if (!lineReadyForWfirma(line)) issues.push(`pozycja ${index + 1}`);
  });

  return issues;
}

function lineReadyForWfirma(line: InvoiceLine) {
  return Boolean(
    line.nazwa?.trim() &&
      line.jednostka?.trim() &&
      Number(line.ilosc || 0) > 0 &&
      Number(line.cena_netto || 0) > 0 &&
      String(line.stawka_vat || "").trim()
  );
}

function syncLabel(status: InvoiceSyncStatus) {
  return SYNC_OPTIONS.find((item) => item.value === status)?.label || status;
}

function canQueueForWfirma(invoice: Invoice) {
  return invoice.status !== "anulowana" && ["nie_wyslano", "blad"].includes(invoice.wfirma_sync_status);
}

function canSendInvoiceMail(invoice: Invoice) {
  return Boolean(invoice.wfirma_pdf_path && hasInvoiceEmail(invoice) && invoice.status !== "anulowana");
}

function canSendOverdueReminder(invoice: Invoice) {
  return Boolean(invoice.status === "przeterminowana" && hasInvoiceEmail(invoice) && hasInvoicePhone(invoice));
}

function canSelectInvoice(invoice: Invoice) {
  return canQueueForWfirma(invoice) || canSendInvoiceMail(invoice);
}

function hasInvoiceEmail(invoice: Invoice) {
  return [invoice.kontrahent_email, invoice.klienci?.email].some((value) => String(value || "").includes("@"));
}

function hasInvoicePhone(invoice: Invoice) {
  return Boolean(invoice.klienci?.telefon);
}

function invoiceMailHistory(invoice: Invoice) {
  return [...(invoice.faktury_email_history || [])].sort((first, second) =>
    String(second.created_at || "").localeCompare(String(first.created_at || ""))
  );
}

function invoiceHistoryTitle(entry: InvoiceEmailHistory) {
  if (entry.status !== "wyslane") {
    return entry.notification_type === "overdue_notification" ? "Błąd powiadomienia" : "Błąd wysyłki";
  }
  return entry.notification_type === "overdue_notification"
    ? "Wysłano powiadomienie e-mail + SMS"
    : "Wysłano fakturę e-mailem";
}

function invoiceMailSent(invoice: Invoice) {
  return invoiceMailHistory(invoice).some((entry) => entry.status === "wyslane" && entry.notification_type !== "overdue_notification");
}

function invoiceNumberLabel(invoice: Invoice) {
  return invoice.numer || "Czeka na numer";
}

function compareInvoicesByNumber(first: Invoice, second: Invoice) {
  const pendingCompare = Number(Boolean(first.numer)) - Number(Boolean(second.numer));
  if (pendingCompare !== 0) return pendingCompare;

  const firstParts = invoiceNumberParts(first.numer);
  const secondParts = invoiceNumberParts(second.numer);
  const maxLength = Math.max(firstParts.length, secondParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const firstValue = firstParts[index] ?? Number.MAX_SAFE_INTEGER;
    const secondValue = secondParts[index] ?? Number.MAX_SAFE_INTEGER;
    if (firstValue !== secondValue) return secondValue - firstValue;
  }

  const dateCompare = String(second.data_wystawienia || "").localeCompare(String(first.data_wystawienia || ""));
  if (dateCompare !== 0) return dateCompare;
  return invoiceNumberLabel(first).localeCompare(invoiceNumberLabel(second), "pl", { numeric: true, sensitivity: "base" });
}

function compareOverdueInvoices(first: Invoice, second: Invoice) {
  const dueCompare = dateSortValue(first.termin_platnosci) - dateSortValue(second.termin_platnosci);
  if (dueCompare !== 0) return dueCompare;
  const issueCompare = dateSortValue(first.data_wystawienia) - dateSortValue(second.data_wystawienia);
  if (issueCompare !== 0) return issueCompare;
  return compareInvoicesByNumber(first, second);
}

function overdueDays(value: string | null) {
  if (!value) return 0;
  const due = new Date(`${value}T00:00:00.000Z`).getTime();
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today - due) / 86_400_000));
}

function dateSortValue(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`).getTime() : Number.MAX_SAFE_INTEGER;
}

function invoiceListMonth(invoice: Invoice) {
  if (invoice.data_wystawienia) return toMonthInput(invoice.data_wystawienia);
  if (invoice.okres) return toMonthInput(addMonths(invoice.okres, 1));
  return toMonthInput(invoice.created_at);
}

function addMonths(value: string, months: number) {
  const [year = "0", month = "1"] = value.slice(0, 7).split("-");
  const monthIndex = Number(year) * 12 + Number(month) - 1 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function invoiceNumberParts(value: string | null) {
  return (value?.match(/\d+/g) || []).map(Number);
}

function invoiceLines(invoice: Invoice) {
  return [...(invoice.faktury_pozycje || [])].sort((first, second) => {
    const sortOrder = Number(first.sort_order || 0) - Number(second.sort_order || 0);
    if (sortOrder !== 0) return sortOrder;
    return first.nazwa.localeCompare(second.nazwa, "pl", { sensitivity: "base" });
  });
}

function lineGross(line: InvoiceLine) {
  const net = Number(line.kwota_netto || 0);
  const savedGross = Number(line.kwota_brutto || 0);
  const vatRate = Number(String(line.stawka_vat || "").match(/\d+/)?.[0] || 0);
  if (vatRate > 0 && savedGross <= net) return net + Number((net * vatRate / 100).toFixed(2));
  return savedGross;
}

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "24px" };
const headerActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px", marginBottom: "20px" };
const summaryStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, padding: "16px", boxShadow: shadow.soft, display: "grid", gap: "8px", color: colors.muted, fontWeight: 800 };
const automationPanelStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", marginBottom: "14px" };
const listPanelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "20px", boxShadow: shadow.soft, minWidth: 0 };
const automationControlsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto auto auto", gap: "10px", alignItems: "end", width: "min(100%, 960px)" };
const bulkActionsStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "14px" };
const bulkButtonGroupStyle: CSSProperties = { display: "flex", gap: "10px", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" };
const listTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "20px" };
const bulkHelpStyle: CSSProperties = { margin: "6px 0 0", color: colors.muted, fontSize: "13px", fontWeight: 700 };
const fieldStyle: CSSProperties = { display: "grid", gap: "7px", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const inputStyle: CSSProperties = { width: "100%", minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "10px 12px", fontWeight: 750, boxSizing: "border-box" };
const primaryButtonStyle: CSSProperties = { border: `1px solid ${colors.red}`, borderRadius: radius.input, background: colors.red, color: colors.white, minHeight: "42px", padding: "9px 14px", fontSize: "15px", lineHeight: 1, fontWeight: 850, cursor: "pointer", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: "8px", whiteSpace: "nowrap" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, minHeight: "42px", padding: "9px 13px", fontSize: "15px", lineHeight: 1, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", whiteSpace: "nowrap" };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, minHeight: "34px", padding: "7px 10px" };
const filtersStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 170px", gap: "10px", marginBottom: "14px" };
const searchStyle: CSSProperties = { ...inputStyle };
const filterSelectStyle: CSSProperties = { background: colors.white };
const categorySelectStyle: CSSProperties = { width: "150px", background: colors.white, minHeight: "34px", padding: "7px 10px" };
const periodInputStyle: CSSProperties = {
  ...inputStyle,
  width: "176px",
  minWidth: "176px",
  minHeight: "38px",
  padding: "7px 12px",
  fontSize: "14px",
  fontVariantNumeric: "tabular-nums",
};
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: "1280px" };
const thStyle: CSSProperties = { textAlign: "left", padding: "12px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: 0 };
const tdStyle: CSSProperties = { padding: "13px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle" };
const invoiceNumberCellStyle: CSSProperties = { minWidth: "128px", whiteSpace: "nowrap", fontSize: "15px", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" };
const invoiceNumberRowStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "7px", minWidth: 0 };
const mailSentIconStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "20px", borderRadius: radius.badge, background: "#dcfce7", color: colors.success };
const amountCellStyle: CSSProperties = { whiteSpace: "nowrap", minWidth: "118px", fontSize: "15px", fontVariantNumeric: "tabular-nums" };
const rowStyle: CSSProperties = { background: colors.white };
const pendingInvoiceRowStyle: CSSProperties = { background: "#fff8e7" };
const smallStyle: CSSProperties = { display: "block", marginTop: "5px", color: colors.muted, fontSize: "12px", fontWeight: 650 };
const badgeBaseStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, padding: "7px 10px", fontSize: "12px", fontWeight: 900, whiteSpace: "nowrap" };
const successBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#dcfce7", color: colors.success };
const dangerBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#fee2e2", color: colors.danger };
const neutralBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "rgba(23, 59, 115, 0.10)", color: colors.navy };
const overlayStyle: CSSProperties = { position: "fixed", inset: 0, background: "rgba(7, 15, 31, 0.42)", zIndex: 50, display: "flex", justifyContent: "flex-end" };
const overdueOverlayStyle: CSSProperties = { position: "fixed", inset: 0, background: "rgba(7, 15, 31, 0.48)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "28px", boxSizing: "border-box" };
const overdueModalStyle: CSSProperties = { width: "min(1240px, 96vw)", height: "88vh", maxHeight: "88vh", background: colors.white, borderRadius: radius.card, boxShadow: shadow.card, padding: "24px", overflow: "hidden", boxSizing: "border-box", display: "flex", flexDirection: "column" };
const overdueModalHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "18px" };
const overdueModalTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "32px", lineHeight: 1.1 };
const overdueModalMetaStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, fontSize: "14px", fontWeight: 750 };
const overdueModalBodyStyle: CSSProperties = { display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: "14px", flex: 1, minHeight: 0 };
const overdueToolbarStyle: CSSProperties = { display: "flex", gap: "12px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" };
const overdueSearchStyle: CSSProperties = { ...inputStyle, flex: "1 1 420px", minWidth: "260px" };
const overdueTableWrapperStyle: CSSProperties = { overflow: "auto", minHeight: 0, border: `1px solid ${colors.border}`, borderRadius: radius.input };
const overdueTableStyle: CSSProperties = { width: "100%", minWidth: "1080px", borderCollapse: "collapse" };
const emptyOverdueStyle: CSSProperties = { padding: "28px", border: `1px dashed ${colors.border}`, borderRadius: radius.input, background: colors.card, color: colors.muted, textAlign: "center", fontWeight: 800 };
const detailsPanelStyle: CSSProperties = { width: "min(920px, 92vw)", height: "100%", background: colors.white, boxShadow: shadow.card, padding: "24px", overflowY: "auto", boxSizing: "border-box" };
const detailsHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "18px" };
const detailsTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "28px" };
const detailsSummaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: "10px", marginBottom: "16px" };
const detailStatStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", display: "grid", gap: "5px", minHeight: "64px", alignContent: "center", color: colors.text, fontWeight: 500 };
const detailStatValueStyle: CSSProperties = { fontWeight: 650 };
const invoicePdfStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "14px", marginBottom: "16px", background: colors.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" };
const pdfActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" };
const pdfMetaStyle: CSSProperties = { margin: 0, color: colors.muted, fontSize: "13px", fontWeight: 650, overflowWrap: "anywhere" };
const wfirmaReadinessStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "14px", marginBottom: "16px", background: colors.card };
const sectionTitleRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px" };
const readinessGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px 14px" };
const readinessItemStyle: CSSProperties = { display: "grid", gridTemplateColumns: "10px minmax(0, 1fr)", gap: "9px", alignItems: "start", color: colors.text, minWidth: 0 };
const readinessTextStyle: CSSProperties = { display: "grid", gap: "3px", minWidth: 0 };
const readinessLabelStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 650, lineHeight: 1.2 };
const readinessValueStyle: CSSProperties = { color: colors.text, fontSize: "14px", fontWeight: 620, lineHeight: 1.3, overflowWrap: "anywhere" };
const readinessDotOkStyle: CSSProperties = { width: "9px", height: "9px", borderRadius: "999px", background: colors.success };
const readinessDotErrorStyle: CSSProperties = { ...readinessDotOkStyle, background: colors.danger };
const lineTableWrapperStyle: CSSProperties = { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.input };
const lineTableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: "760px" };
const invoiceDescriptionStyle: CSSProperties = { marginTop: "18px", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "14px", background: colors.card };
const descriptionTitleStyle: CSSProperties = { margin: "0 0 8px", color: colors.navy, fontSize: "16px" };
const descriptionTextStyle: CSSProperties = { margin: 0, color: colors.text, fontWeight: 500, lineHeight: 1.55, whiteSpace: "pre-line" };
const mailHistoryListStyle: CSSProperties = { display: "grid", gap: "10px" };
const mailHistoryItemStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", borderTop: `1px solid ${colors.border}`, paddingTop: "10px" };
const mailErrorTextStyle: CSSProperties = { margin: "6px 0 0", color: colors.danger, fontSize: "13px", fontWeight: 700, whiteSpace: "pre-line" };
