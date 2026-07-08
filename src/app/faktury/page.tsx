"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Plus, RotateCw } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients } from "@/lib/clientService";
import {
  createInvoice,
  fetchInvoices,
  updateInvoice,
  type Invoice,
  type InvoicePayload,
  type InvoiceSource,
  type InvoiceStatus,
  type InvoiceSyncStatus,
  type InvoiceType,
} from "@/lib/invoiceService";

type ClientOption = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
};

type InvoiceDraft = {
  id?: string;
  klient_id: string;
  numer: string;
  typ: InvoiceType;
  status: InvoiceStatus;
  zrodlo: InvoiceSource;
  data_wystawienia: string;
  data_sprzedazy: string;
  termin_platnosci: string;
  kontrahent_nazwa: string;
  kontrahent_nip: string;
  kontrahent_email: string;
  waluta: string;
  kwota_netto: string;
  kwota_vat: string;
  kwota_brutto: string;
  opis: string;
  wfirma_id: string;
  wfirma_url: string;
  wfirma_sync_status: InvoiceSyncStatus;
};

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
const TYPE_OPTIONS = [
  { value: "sprzedaz", label: "Sprzedaż" },
  { value: "korekta", label: "Korekta" },
  { value: "proforma", label: "Pro forma" },
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
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState(EMPTY_FILTER);
  const [sourceFilter, setSourceFilter] = useState(EMPTY_FILTER);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<InvoiceDraft>(() => emptyDraft());

  useEffect(() => {
    void loadData();
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
        invoice.wfirma_id,
      ].filter(Boolean).join(" ").toLowerCase();
      return matchesStatus && matchesSource && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [invoices, query, sourceFilter, statusFilter]);

  const totals = useMemo(() => {
    const issued = invoices.filter((invoice) => invoice.status !== "anulowana");
    return {
      count: invoices.length,
      unsynced: invoices.filter((invoice) => invoice.wfirma_sync_status === "nie_wyslano" || invoice.wfirma_sync_status === "blad").length,
      imported: invoices.filter((invoice) => invoice.zrodlo === "wfirma" || invoice.zrodlo === "import").length,
      gross: issued.reduce((sum, invoice) => sum + Number(invoice.kwota_brutto || 0), 0),
    };
  }, [invoices]);

  async function loadData() {
    setLoading(true);
    const [invoicesResult, clientsResult] = await Promise.all([fetchInvoices(), fetchClients()]);
    if (invoicesResult.error) console.error("Błąd pobierania faktur:", invoicesResult.error);
    if (clientsResult.error) console.error("Błąd pobierania klientów do faktur:", clientsResult.error);
    setInvoices((invoicesResult.data || []) as Invoice[]);
    setClients((clientsResult.data || []) as unknown as ClientOption[]);
    setLoading(false);
  }

  function updateDraft<K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "klient_id") {
        const client = clients.find((item) => item.id === value);
        if (client) {
          next.kontrahent_nazwa = client.nazwa || next.kontrahent_nazwa;
          next.kontrahent_nip = client.nip || next.kontrahent_nip;
          next.kontrahent_email = client.email || next.kontrahent_email;
        }
      }
      return next;
    });
  }

  function editInvoice(invoice: Invoice) {
    setDraft({
      id: invoice.id,
      klient_id: invoice.klient_id || "",
      numer: invoice.numer || "",
      typ: invoice.typ,
      status: invoice.status,
      zrodlo: invoice.zrodlo,
      data_wystawienia: invoice.data_wystawienia || "",
      data_sprzedazy: invoice.data_sprzedazy || "",
      termin_platnosci: invoice.termin_platnosci || "",
      kontrahent_nazwa: invoice.kontrahent_nazwa,
      kontrahent_nip: invoice.kontrahent_nip || "",
      kontrahent_email: invoice.kontrahent_email || "",
      waluta: invoice.waluta || "PLN",
      kwota_netto: String(invoice.kwota_netto || ""),
      kwota_vat: String(invoice.kwota_vat || ""),
      kwota_brutto: String(invoice.kwota_brutto || ""),
      opis: invoice.opis || "",
      wfirma_id: invoice.wfirma_id || "",
      wfirma_url: invoice.wfirma_url || "",
      wfirma_sync_status: invoice.wfirma_sync_status,
    });
  }

  async function saveInvoice() {
    if (!draft.kontrahent_nazwa.trim()) {
      alert("Uzupełnij nazwę kontrahenta.");
      return;
    }

    setSaving(true);
    const payload = buildPayload(draft);
    const result = draft.id ? await updateInvoice(draft.id, payload) : await createInvoice(payload);
    setSaving(false);

    if (result.error) {
      console.error("Błąd zapisu faktury:", result.error);
      alert("Nie udało się zapisać faktury.");
      return;
    }

    const saved = result.data as Invoice;
    setInvoices((current) => draft.id ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
    setDraft(emptyDraft());
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Zarządzanie</p>
          <h1 style={titleStyle}>Faktury</h1>
        </div>
        <button type="button" style={secondaryButtonStyle} onClick={loadData} disabled={loading}>
          <RotateCw size={18} />
          Odśwież
        </button>
      </section>

      <section style={summaryGridStyle}>
        <Summary label="Faktury" value={totals.count} />
        <Summary label="Zaimportowane" value={totals.imported} />
        <Summary label="Do synchronizacji" value={totals.unsynced} />
        <Summary label="Brutto" value={formatMoney(totals.gross)} />
      </section>

      <section style={workspaceStyle}>
        <div style={formPanelStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>{draft.id ? "Edycja faktury" : "Nowa faktura lub import"}</h2>
            {draft.id && <button type="button" style={smallButtonStyle} onClick={() => setDraft(emptyDraft())}>Wyczyść</button>}
          </div>
          <div style={formGridStyle}>
            <Field label="Klient">
              <AppSelect value={draft.klient_id} options={[{ value: "", label: "Bez powiązania" }, ...clients.map((client) => ({ value: client.id, label: client.nazwa || client.nip || "Klient" }))]} onChange={(value) => updateDraft("klient_id", value)} />
            </Field>
            <Field label="Numer">
              <input style={inputStyle} value={draft.numer} onChange={(event) => updateDraft("numer", event.target.value)} placeholder="np. FV/1/07/2026" />
            </Field>
            <Field label="Typ">
              <AppSelect value={draft.typ} options={TYPE_OPTIONS} onChange={(value) => updateDraft("typ", value as InvoiceType)} />
            </Field>
            <Field label="Status">
              <AppSelect value={draft.status} options={STATUS_OPTIONS} onChange={(value) => updateDraft("status", value as InvoiceStatus)} />
            </Field>
            <Field label="Źródło">
              <AppSelect value={draft.zrodlo} options={SOURCE_OPTIONS} onChange={(value) => updateDraft("zrodlo", value as InvoiceSource)} />
            </Field>
            <Field label="Status wFirma">
              <AppSelect value={draft.wfirma_sync_status} options={SYNC_OPTIONS} onChange={(value) => updateDraft("wfirma_sync_status", value as InvoiceSyncStatus)} />
            </Field>
            <Field label="Data wystawienia">
              <input style={inputStyle} type="date" value={draft.data_wystawienia} onChange={(event) => updateDraft("data_wystawienia", event.target.value)} />
            </Field>
            <Field label="Termin płatności">
              <input style={inputStyle} type="date" value={draft.termin_platnosci} onChange={(event) => updateDraft("termin_platnosci", event.target.value)} />
            </Field>
            <Field label="Kontrahent">
              <input style={inputStyle} value={draft.kontrahent_nazwa} onChange={(event) => updateDraft("kontrahent_nazwa", event.target.value)} />
            </Field>
            <Field label="NIP">
              <input style={inputStyle} value={draft.kontrahent_nip} onChange={(event) => updateDraft("kontrahent_nip", event.target.value)} />
            </Field>
            <Field label="Netto">
              <input style={inputStyle} type="number" value={draft.kwota_netto} onChange={(event) => updateDraft("kwota_netto", event.target.value)} />
            </Field>
            <Field label="VAT">
              <input style={inputStyle} type="number" value={draft.kwota_vat} onChange={(event) => updateDraft("kwota_vat", event.target.value)} />
            </Field>
            <Field label="Brutto">
              <input style={inputStyle} type="number" value={draft.kwota_brutto} onChange={(event) => updateDraft("kwota_brutto", event.target.value)} />
            </Field>
            <Field label="ID wFirma">
              <input style={inputStyle} value={draft.wfirma_id} onChange={(event) => updateDraft("wfirma_id", event.target.value)} />
            </Field>
          </div>
          <Field label="Opis">
            <textarea style={textareaStyle} value={draft.opis} onChange={(event) => updateDraft("opis", event.target.value)} />
          </Field>
          <button type="button" style={primaryButtonStyle} disabled={saving} onClick={saveInvoice}>
            <Plus size={18} />
            {saving ? "Zapisywanie..." : draft.id ? "Zapisz zmiany" : "Dodaj fakturę"}
          </button>
        </div>

        <div style={listPanelStyle}>
          <div style={filtersStyle}>
            <input style={searchStyle} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Szukaj po numerze, kontrahencie, NIP albo ID wFirma" />
            <AppSelect style={filterSelectStyle} value={statusFilter} options={[{ value: EMPTY_FILTER, label: "Status" }, ...STATUS_OPTIONS]} onChange={setStatusFilter} />
            <AppSelect style={filterSelectStyle} value={sourceFilter} options={[{ value: EMPTY_FILTER, label: "Źródło" }, ...SOURCE_OPTIONS]} onChange={setSourceFilter} />
          </div>

          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Numer</Th>
                  <Th>Kontrahent</Th>
                  <Th>Data</Th>
                  <Th>Kwota</Th>
                  <Th>Status</Th>
                  <Th>wFirma</Th>
                  <Th>Akcja</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><Td colSpan={7}>Ładowanie faktur...</Td></tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr><Td colSpan={7}>Brak faktur dla wybranych filtrów.</Td></tr>
                ) : filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} style={rowStyle}>
                    <Td strong>{invoice.numer || "Bez numeru"}<Small>{sourceLabel(invoice.zrodlo)}</Small></Td>
                    <Td>{invoice.kontrahent_nazwa}<Small>{invoice.kontrahent_nip || invoice.klienci?.nazwa || "Brak NIP"}</Small></Td>
                    <Td>{formatDate(invoice.data_wystawienia)}</Td>
                    <Td strong>{formatMoney(invoice.kwota_brutto)}</Td>
                    <Td><Badge tone={invoice.status === "oplacona" ? "success" : invoice.status === "anulowana" ? "danger" : "neutral"}>{statusLabel(invoice.status)}</Badge></Td>
                    <Td><Badge tone={invoice.wfirma_sync_status === "blad" ? "danger" : invoice.wfirma_sync_status === "wyslano" || invoice.wfirma_sync_status === "zaimportowano" ? "success" : "neutral"}>{syncLabel(invoice.wfirma_sync_status)}</Badge></Td>
                    <Td><button type="button" style={smallButtonStyle} onClick={() => editInvoice(invoice)}>Edytuj</button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function buildPayload(draft: InvoiceDraft): InvoicePayload {
  return {
    klient_id: draft.klient_id || null,
    numer: draft.numer,
    typ: draft.typ,
    status: draft.status,
    zrodlo: draft.zrodlo,
    data_wystawienia: draft.data_wystawienia || null,
    data_sprzedazy: draft.data_sprzedazy || draft.data_wystawienia || null,
    termin_platnosci: draft.termin_platnosci || null,
    kontrahent_nazwa: draft.kontrahent_nazwa.trim(),
    kontrahent_nip: draft.kontrahent_nip,
    kontrahent_email: draft.kontrahent_email,
    waluta: draft.waluta || "PLN",
    kwota_netto: Number(draft.kwota_netto || 0),
    kwota_vat: Number(draft.kwota_vat || 0),
    kwota_brutto: Number(draft.kwota_brutto || 0),
    opis: draft.opis,
    wfirma_id: draft.wfirma_id,
    wfirma_url: draft.wfirma_url,
    wfirma_sync_status: draft.wfirma_sync_status,
  };
}

function emptyDraft(): InvoiceDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    klient_id: "",
    numer: "",
    typ: "sprzedaz",
    status: "szkic",
    zrodlo: "aplikacja",
    data_wystawienia: today,
    data_sprzedazy: today,
    termin_platnosci: "",
    kontrahent_nazwa: "",
    kontrahent_nip: "",
    kontrahent_email: "",
    waluta: "PLN",
    kwota_netto: "",
    kwota_vat: "",
    kwota_brutto: "",
    opis: "",
    wfirma_id: "",
    wfirma_url: "",
    wfirma_sync_status: "nie_wyslano",
  };
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div style={summaryStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={fieldStyle}><span>{label}</span>{children}</label>;
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

function formatMoney(value: number | string | null | undefined) {
  return `${Number(value || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function formatDate(value: string | null) {
  if (!value) return "Brak";
  return new Intl.DateTimeFormat("pl-PL").format(new Date(`${value}T00:00:00`));
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

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", marginBottom: "24px" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "16px", marginBottom: "20px" };
const summaryStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, padding: "16px", boxShadow: shadow.soft, display: "grid", gap: "8px", color: colors.muted, fontWeight: 800 };
const workspaceStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(340px, 430px) minmax(0, 1fr)", gap: "18px", alignItems: "start" };
const formPanelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "20px", boxShadow: shadow.soft, display: "grid", gap: "14px" };
const listPanelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "20px", boxShadow: shadow.soft, minWidth: 0 };
const sectionHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "22px" };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" };
const fieldStyle: CSSProperties = { display: "grid", gap: "7px", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const inputStyle: CSSProperties = { width: "100%", minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "10px 12px", fontWeight: 750, boxSizing: "border-box" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: "84px", resize: "vertical" };
const primaryButtonStyle: CSSProperties = { border: `1px solid ${colors.red}`, borderRadius: radius.button, background: colors.red, color: colors.white, minHeight: "44px", padding: "11px 15px", fontWeight: 900, cursor: "pointer", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: "8px" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, minHeight: "42px", padding: "10px 14px", fontWeight: 850, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, minHeight: "36px", padding: "8px 11px" };
const filtersStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 170px 170px", gap: "10px", marginBottom: "14px" };
const searchStyle: CSSProperties = { ...inputStyle };
const filterSelectStyle: CSSProperties = { background: colors.white };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: "860px" };
const thStyle: CSSProperties = { textAlign: "left", padding: "12px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" };
const tdStyle: CSSProperties = { padding: "13px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle" };
const rowStyle: CSSProperties = { background: colors.white };
const smallStyle: CSSProperties = { display: "block", marginTop: "5px", color: colors.muted, fontSize: "12px", fontWeight: 650 };
const badgeBaseStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, padding: "7px 10px", fontSize: "12px", fontWeight: 900, whiteSpace: "nowrap" };
const successBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#dcfce7", color: colors.success };
const dangerBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#fee2e2", color: colors.danger };
const neutralBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "rgba(23, 59, 115, 0.10)", color: colors.navy };
