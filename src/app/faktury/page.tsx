"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CalendarClock, DownloadCloud, RotateCw } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import {
  ensureSubscriptionInvoices,
  fetchInvoices,
  importWfirmaInvoices,
  sendInvoicesToWfirma,
  updateInvoice,
  type Invoice,
  type InvoiceCategory,
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
  const [queueing, setQueueing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState(EMPTY_FILTER);
  const [query, setQuery] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState(() => currentMonthInput());
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [detailsInvoice, setDetailsInvoice] = useState<Invoice | null>(null);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [savingPeriodId, setSavingPeriodId] = useState<string | null>(null);

  useEffect(() => {
    void loadData({ generateCurrentMonth: true });
  }, []);

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesSource = sourceFilter === EMPTY_FILTER || invoice.zrodlo === sourceFilter;
      const matchesIssueMonth = Boolean(invoice.data_wystawienia && toMonthInput(invoice.data_wystawienia) === invoiceMonth);
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
    });
  }, [invoices, invoiceMonth, query, sourceFilter]);

  const totals = useMemo(() => {
    const activeInvoices = invoices.filter((invoice) => invoice.status !== "anulowana");
    return {
      count: invoices.length,
      sentToWfirma: invoices.filter((invoice) => invoice.wfirma_sync_status === "wyslano").length,
      net: activeInvoices.reduce((sum, invoice) => sum + Number(invoice.kwota_netto || 0), 0),
    };
  }, [invoices]);

  const selectableInvoices = useMemo(
    () => filteredInvoices.filter((invoice) => canQueueForWfirma(invoice)),
    [filteredInvoices]
  );

  const selectedCount = selectedInvoiceIds.length;
  const allSelectableChecked =
    selectableInvoices.length > 0 && selectableInvoices.every((invoice) => selectedInvoiceIds.includes(invoice.id));

  async function loadData(options?: { generateCurrentMonth?: boolean }) {
    setLoading(true);
    if (options?.generateCurrentMonth) {
      await generateInvoices(monthToDate(currentMonthInput()), { silent: true });
    }
    const result = await fetchInvoices();
    if (result.error) console.error("Błąd pobierania faktur:", result.error);
    setInvoices((result.data || []) as Invoice[]);
    setSelectedInvoiceIds((current) =>
      current.filter((invoiceId) => (result.data || []).some((invoice) => invoice.id === invoiceId && canQueueForWfirma(invoice as Invoice)))
    );
    setLoading(false);
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

  async function queueSelectedForWfirma() {
    if (selectedInvoiceIds.length === 0) return;

    setQueueing(true);
    const result = await sendInvoicesToWfirma(selectedInvoiceIds);
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

  async function importInvoicesFromWfirma() {
    const year = Number(invoiceMonth.slice(0, 4)) || new Date().getFullYear();
    setImportingWfirma(true);
    const result = await importWfirmaInvoices(year);
    setImportingWfirma(false);

    if (result.error) {
      console.error("Błąd importu faktur z wFirmy:", result.error);
      alert(`Nie udało się zaimportować faktur z wFirmy.\n\n${result.error.message}`);
      return;
    }

    await loadData();
    alert(`Zaimportowano lub zaktualizowano faktury z ${year}: ${result.data?.imported || 0}.`);
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

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Automatyzacja</p>
          <h1 style={titleStyle}>Faktury</h1>
        </div>
        <button type="button" style={secondaryButtonStyle} onClick={() => loadData()} disabled={loading || generating}>
          <RotateCw size={18} />
          Odśwież
        </button>
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
            <input
              style={inputStyle}
              type="month"
              value={invoiceMonth}
              onChange={(event) => setInvoiceMonth(event.target.value)}
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
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={selectedCount === 0 || queueing}
            onClick={queueSelectedForWfirma}
          >
            {queueing ? "Przekazywanie..." : `Wyślij do wFirmy (${selectedCount})`}
          </button>
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
                  <tr key={invoice.id} style={rowStyle}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.includes(invoice.id)}
                        disabled={!canQueueForWfirma(invoice)}
                        onChange={(event) => toggleInvoiceSelection(invoice.id, event.target.checked)}
                        aria-label={`Zaznacz fakturę ${invoice.numer || invoice.kontrahent_nazwa}`}
                      />
                    </Td>
                    <Td strong>
                      {invoiceNumberLabel(invoice)}
                      <Small>{invoice.numer ? "Numer z wFirmy" : "Po wysłaniu do wFirmy"}</Small>
                    </Td>
                    <Td>
                      {invoice.kontrahent_nazwa}
                      <Small>{invoice.kontrahent_nip || invoice.klienci?.nazwa || "Brak NIP"}</Small>
                    </Td>
                    <Td>{formatDate(invoice.data_wystawienia)}</Td>
                    <Td>
                      <input
                        style={periodInputStyle}
                        type="month"
                        value={toMonthInput(invoice.okres || invoice.data_wystawienia)}
                        disabled={savingPeriodId === invoice.id}
                        onChange={(event) => changeInvoicePeriod(invoice, event.target.value)}
                        aria-label={`Zmień okres faktury ${invoice.numer || invoice.kontrahent_nazwa}`}
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
                    <Td strong>{formatMoney(invoice.kwota_netto)}</Td>
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

      {detailsInvoice && (
        <div style={overlayStyle} onClick={() => setDetailsInvoice(null)}>
          <aside style={detailsPanelStyle} onClick={(event) => event.stopPropagation()}>
            <div style={detailsHeaderStyle}>
              <div>
                <p style={eyebrowStyle}>Podgląd PDF</p>
                <h2 style={detailsTitleStyle}>{invoiceNumberLabel(detailsInvoice)}</h2>
              </div>
              <button type="button" style={secondaryButtonStyle} onClick={() => setDetailsInvoice(null)}>
                Zamknij
              </button>
            </div>

            <div style={detailsMetaStyle}>
              <span>{detailsInvoice.kontrahent_nazwa}</span>
              <span>{formatMonth(detailsInvoice.okres || detailsInvoice.data_wystawienia)}</span>
              <strong>Netto {formatMoney(detailsInvoice.kwota_netto)}</strong>
            </div>

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
                        <Td strong>{formatMoney(line.kwota_brutto)}</Td>
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

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children, strong, colSpan }: { children: React.ReactNode; strong?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ ...tdStyle, fontWeight: strong ? 850 : 650 }}>{children}</td>;
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
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short" }).format(new Date(`${value}T00:00:00`));
}

function paymentStatusLabel(invoice: Invoice) {
  if (invoice.status === "oplacona") return "Zapłacona";
  if (invoice.status === "anulowana") return "Anulowana";
  return "Niezapłacona";
}

function paymentStatusTone(invoice: Invoice): "success" | "danger" | "neutral" {
  if (invoice.status === "oplacona") return "success";
  if (invoice.status === "anulowana") return "danger";
  return "neutral";
}

function formatQuantity(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

function syncLabel(status: InvoiceSyncStatus) {
  return SYNC_OPTIONS.find((item) => item.value === status)?.label || status;
}

function canQueueForWfirma(invoice: Invoice) {
  return invoice.status !== "anulowana" && ["nie_wyslano", "blad"].includes(invoice.wfirma_sync_status);
}

function invoiceNumberLabel(invoice: Invoice) {
  return invoice.numer || "Czeka na numer";
}

function invoiceLines(invoice: Invoice) {
  return [...(invoice.faktury_pozycje || [])].sort((first, second) => {
    const sortOrder = Number(first.sort_order || 0) - Number(second.sort_order || 0);
    if (sortOrder !== 0) return sortOrder;
    return first.nazwa.localeCompare(second.nazwa, "pl", { sensitivity: "base" });
  });
}

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "24px" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px", marginBottom: "20px" };
const summaryStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, padding: "16px", boxShadow: shadow.soft, display: "grid", gap: "8px", color: colors.muted, fontWeight: 800 };
const automationPanelStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", marginBottom: "14px" };
const listPanelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "20px", boxShadow: shadow.soft, minWidth: 0 };
const automationControlsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px", alignItems: "end", width: "min(100%, 650px)" };
const bulkActionsStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "14px" };
const listTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "20px" };
const bulkHelpStyle: CSSProperties = { margin: "6px 0 0", color: colors.muted, fontSize: "13px", fontWeight: 700 };
const fieldStyle: CSSProperties = { display: "grid", gap: "7px", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const inputStyle: CSSProperties = { width: "100%", minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "10px 12px", fontWeight: 750, boxSizing: "border-box" };
const primaryButtonStyle: CSSProperties = { border: `1px solid ${colors.red}`, borderRadius: radius.button, background: colors.red, color: colors.white, minHeight: "44px", padding: "11px 15px", fontWeight: 900, cursor: "pointer", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: "8px" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, minHeight: "42px", padding: "10px 14px", fontWeight: 850, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, minHeight: "34px", padding: "7px 10px" };
const filtersStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 170px", gap: "10px", marginBottom: "14px" };
const searchStyle: CSSProperties = { ...inputStyle };
const filterSelectStyle: CSSProperties = { background: colors.white };
const categorySelectStyle: CSSProperties = { width: "150px", background: colors.white, minHeight: "34px", padding: "7px 10px" };
const periodInputStyle: CSSProperties = { ...inputStyle, width: "140px", minHeight: "34px", padding: "7px 10px" };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: "1280px" };
const thStyle: CSSProperties = { textAlign: "left", padding: "12px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: 0 };
const tdStyle: CSSProperties = { padding: "13px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle" };
const rowStyle: CSSProperties = { background: colors.white };
const smallStyle: CSSProperties = { display: "block", marginTop: "5px", color: colors.muted, fontSize: "12px", fontWeight: 650 };
const badgeBaseStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, padding: "7px 10px", fontSize: "12px", fontWeight: 900, whiteSpace: "nowrap" };
const successBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#dcfce7", color: colors.success };
const dangerBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#fee2e2", color: colors.danger };
const neutralBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "rgba(23, 59, 115, 0.10)", color: colors.navy };
const overlayStyle: CSSProperties = { position: "fixed", inset: 0, background: "rgba(7, 15, 31, 0.42)", zIndex: 50, display: "flex", justifyContent: "flex-end" };
const detailsPanelStyle: CSSProperties = { width: "min(920px, 92vw)", height: "100%", background: colors.white, boxShadow: shadow.card, padding: "24px", overflowY: "auto", boxSizing: "border-box" };
const detailsHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "18px" };
const detailsTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "28px" };
const detailsMetaStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 170px 140px", gap: "12px", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "12px", color: colors.text, fontWeight: 800, marginBottom: "16px" };
const lineTableWrapperStyle: CSSProperties = { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.input };
const lineTableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: "760px" };
const invoiceDescriptionStyle: CSSProperties = { marginTop: "18px", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "14px", background: colors.card };
const descriptionTitleStyle: CSSProperties = { margin: "0 0 8px", color: colors.navy, fontSize: "16px" };
const descriptionTextStyle: CSSProperties = { margin: 0, color: colors.text, fontWeight: 700, lineHeight: 1.55, whiteSpace: "pre-line" };
