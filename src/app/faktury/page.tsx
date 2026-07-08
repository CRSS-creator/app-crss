"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CalendarClock, RotateCw } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import {
  ensureSubscriptionInvoices,
  fetchInvoices,
  queueInvoicesForWfirma,
  type Invoice,
  type InvoiceSource,
  type InvoiceStatus,
  type InvoiceSyncStatus,
} from "@/lib/invoiceService";

const EMPTY_FILTER = "Wszystkie";
const STATUS_OPTIONS = [
  { value: "szkic", label: "Szkic" },
  { value: "wystawiona", label: "Wystawiona" },
  { value: "wyslana", label: "Wysłana" },
  { value: "oplacona", label: "Opłacona" },
  { value: "anulowana", label: "Anulowana" },
] as const;
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
  const [queueing, setQueueing] = useState(false);
  const [statusFilter, setStatusFilter] = useState(EMPTY_FILTER);
  const [sourceFilter, setSourceFilter] = useState(EMPTY_FILTER);
  const [query, setQuery] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState(() => currentMonthInput());
  const [lastGeneratedCount, setLastGeneratedCount] = useState<number | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  useEffect(() => {
    void loadData({ generateCurrentMonth: true });
  }, []);

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesStatus = statusFilter === EMPTY_FILTER || invoice.status === statusFilter;
      const matchesSource = sourceFilter === EMPTY_FILTER || invoice.zrodlo === sourceFilter;
      const haystack = [
        invoice.numer,
        invoice.kontrahent_nazwa,
        invoice.kontrahent_nip,
        invoice.klienci?.nazwa,
        invoice.opis,
        invoice.wfirma_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesStatus && matchesSource && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [invoices, query, sourceFilter, statusFilter]);

  const totals = useMemo(() => {
    const activeInvoices = invoices.filter((invoice) => invoice.status !== "anulowana");
    return {
      count: invoices.length,
      automatic: invoices.filter((invoice) => invoice.automatyczna).length,
      unsynced: invoices.filter(
        (invoice) => invoice.wfirma_sync_status === "nie_wyslano" || invoice.wfirma_sync_status === "blad"
      ).length,
      gross: activeInvoices.reduce((sum, invoice) => sum + Number(invoice.kwota_brutto || 0), 0),
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

    setLastGeneratedCount(Number(result.data || 0));
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
    const result = await queueInvoicesForWfirma(selectedInvoiceIds);
    setQueueing(false);

    if (result.error) {
      console.error("Błąd przekazania faktur do wFirmy:", result.error);
      alert("Nie udało się przekazać zaznaczonych faktur do wFirmy.");
      return;
    }

    setSelectedInvoiceIds([]);
    await loadData();
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
        <Summary label="Automatyczne" value={totals.automatic} />
        <Summary label="Do wFirmy" value={totals.unsynced} />
        <Summary label="Brutto" value={formatMoney(totals.gross)} />
      </section>

      <section style={automationPanelStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Faktury abonamentowe z góry</h2>
          <p style={panelTextStyle}>
            Dla klientów rozliczanych z góry aplikacja tworzy fakturę 1. dnia miesiąca za poprzedni miesiąc
            rozliczeniowy. Dla klientów rozliczanych z dołu faktura powstaje po zmianie statusu rozliczenia na „Podatki
            wysłane”, razem z opłatami dodatkowymi z tego rozliczenia.
          </p>
          {lastGeneratedCount !== null && (
            <p style={resultTextStyle}>Ostatnio sprawdzono {lastGeneratedCount} klientów do fakturowania.</p>
          )}
        </div>
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
            placeholder="Szukaj po numerze, kontrahencie, NIP, opisie albo ID wFirma"
          />
          <AppSelect
            style={filterSelectStyle}
            value={statusFilter}
            options={[{ value: EMPTY_FILTER, label: "Status" }, ...STATUS_OPTIONS]}
            onChange={setStatusFilter}
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
                <Th>Okres</Th>
                <Th>Opis</Th>
                <Th>Kwota</Th>
                <Th>Status</Th>
                <Th>wFirma</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <Td colSpan={8}>Ładowanie faktur...</Td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <Td colSpan={8}>Brak faktur dla wybranych filtrów.</Td>
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
                      {invoice.numer || "Bez numeru"}
                      <Small>{invoice.automatyczna ? "Automatyczna" : sourceLabel(invoice.zrodlo)}</Small>
                    </Td>
                    <Td>
                      {invoice.kontrahent_nazwa}
                      <Small>{invoice.kontrahent_nip || invoice.klienci?.nazwa || "Brak NIP"}</Small>
                    </Td>
                    <Td>{formatMonth(invoice.okres || invoice.data_wystawienia)}</Td>
                    <Td>{invoice.opis || "Brak opisu"}</Td>
                    <Td strong>{formatMoney(invoice.kwota_brutto)}</Td>
                    <Td>
                      <Badge tone={invoice.status === "oplacona" ? "success" : invoice.status === "anulowana" ? "danger" : "neutral"}>
                        {statusLabel(invoice.status)}
                      </Badge>
                    </Td>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
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

function currentMonthInput() {
  return new Date().toISOString().slice(0, 7);
}

function monthToDate(value: string) {
  return `${value || currentMonthInput()}-01`;
}

function formatMoney(value: number | string | null | undefined) {
  return `${Number(value || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function formatMonth(value: string | null) {
  if (!value) return "Brak";
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function statusLabel(status: InvoiceStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function sourceLabel(source: InvoiceSource) {
  return SOURCE_OPTIONS.find((item) => item.value === source)?.label || source;
}

function syncLabel(status: InvoiceSyncStatus) {
  return SYNC_OPTIONS.find((item) => item.value === status)?.label || status;
}

function canQueueForWfirma(invoice: Invoice) {
  return invoice.status !== "anulowana" && ["nie_wyslano", "blad"].includes(invoice.wfirma_sync_status);
}

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "24px" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "16px", marginBottom: "20px" };
const summaryStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, padding: "16px", boxShadow: shadow.soft, display: "grid", gap: "8px", color: colors.muted, fontWeight: 800 };
const automationPanelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "20px", boxShadow: shadow.soft, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "18px", alignItems: "center", marginBottom: "18px" };
const listPanelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "20px", boxShadow: shadow.soft, minWidth: 0 };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "22px" };
const panelTextStyle: CSSProperties = { margin: "10px 0 0", color: colors.muted, fontSize: "14px", lineHeight: 1.55, fontWeight: 700 };
const resultTextStyle: CSSProperties = { margin: "10px 0 0", color: colors.success, fontSize: "13px", fontWeight: 850 };
const automationControlsStyle: CSSProperties = { display: "grid", gap: "10px" };
const bulkActionsStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "14px" };
const listTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "20px" };
const bulkHelpStyle: CSSProperties = { margin: "6px 0 0", color: colors.muted, fontSize: "13px", fontWeight: 700 };
const fieldStyle: CSSProperties = { display: "grid", gap: "7px", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const inputStyle: CSSProperties = { width: "100%", minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "10px 12px", fontWeight: 750, boxSizing: "border-box" };
const primaryButtonStyle: CSSProperties = { border: `1px solid ${colors.red}`, borderRadius: radius.button, background: colors.red, color: colors.white, minHeight: "44px", padding: "11px 15px", fontWeight: 900, cursor: "pointer", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: "8px" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, minHeight: "42px", padding: "10px 14px", fontWeight: 850, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" };
const filtersStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 170px 170px", gap: "10px", marginBottom: "14px" };
const searchStyle: CSSProperties = { ...inputStyle };
const filterSelectStyle: CSSProperties = { background: colors.white };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: "980px" };
const thStyle: CSSProperties = { textAlign: "left", padding: "12px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: 0 };
const tdStyle: CSSProperties = { padding: "13px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle" };
const rowStyle: CSSProperties = { background: colors.white };
const smallStyle: CSSProperties = { display: "block", marginTop: "5px", color: colors.muted, fontSize: "12px", fontWeight: 650 };
const badgeBaseStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, padding: "7px 10px", fontSize: "12px", fontWeight: 900, whiteSpace: "nowrap" };
const successBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#dcfce7", color: colors.success };
const dangerBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#fee2e2", color: colors.danger };
const neutralBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "rgba(23, 59, 115, 0.10)", color: colors.navy };
