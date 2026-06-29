"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import { fetchClientCaregivers, fetchClients } from "@/lib/clientService";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type Client = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  forma_prawna: string | null;
  forma_opodatkowania: string | null;
  obsluga_kadrowa: boolean | null;
  status_klienta: string | null;
  czynny_vat: boolean | null;
  vat_ue: boolean | null;
  opiekun_id: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
    role: string | null;
  }[] | null;
};

const EMPTY_FILTER = "Wszystkie";
const LEGAL_FORM_OPTIONS = [
  { value: EMPTY_FILTER, label: "Forma prawna" },
  { value: "JDG", label: "JDG" },
  { value: "sp. z o.o.", label: "sp. z o.o." },
  { value: "prosta spółka akcyjna", label: "prosta spółka akcyjna" },
  { value: "organizacja", label: "organizacja" },
];
const TAXATION_OPTIONS = [
  { value: EMPTY_FILTER, label: "Opodatkowanie" },
  { value: "Skala podatkowa", label: "Skala podatkowa" },
  { value: "Podatek liniowy", label: "Podatek liniowy" },
  { value: "Ryczałt", label: "Ryczałt" },
  { value: "CIT", label: "CIT" },
];
const PAYROLL_OPTIONS = [
  { value: EMPTY_FILTER, label: "Kadry" },
  { value: "Tak", label: "Tak" },
  { value: "Nie", label: "Nie" },
];
const STATUS_OPTIONS = [
  { value: EMPTY_FILTER, label: "Status" },
  { value: "Aktywny", label: "Aktywny" },
  { value: "Onboarding", label: "Onboarding" },
  { value: "Zawieszony", label: "Zawieszony" },
  { value: "Do zamknięcia", label: "Do zamknięcia" },
  { value: "Archiwalny", label: "Archiwalny" },
];

export default function KomunikatyPage() {
  return (
    <AppLayout activePage="komunikaty">
      <AccessGuard moduleName="komunikaty">
        <KomunikatyContent />
      </AccessGuard>
    </AppLayout>
  );
}

function KomunikatyContent() {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [caregivers, setCaregivers] = useState<Profile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [legalFormFilter, setLegalFormFilter] = useState(EMPTY_FILTER);
  const [taxationFilter, setTaxationFilter] = useState(EMPTY_FILTER);
  const [caregiverFilter, setCaregiverFilter] = useState(EMPTY_FILTER);
  const [payrollFilter, setPayrollFilter] = useState(EMPTY_FILTER);
  const [statusFilter, setStatusFilter] = useState("Aktywny");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [showRecipientList, setShowRecipientList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [clientsResult, caregiversResult] = await Promise.all([fetchClients(), fetchClientCaregivers()]);
    setClients(clientsResult.error ? [] : ((clientsResult.data || []) as Client[]));
    setCaregivers(caregiversResult.error ? [] : ((caregiversResult.data || []) as Profile[]));
    setLoading(false);
  }

  const caregiverOptions = useMemo(
    () => [
      { value: EMPTY_FILTER, label: "Opiekun" },
      ...caregivers.map((caregiver) => ({
        value: caregiver.id,
        label: caregiver.full_name || caregiver.email || "Nieustalony opiekun",
      })),
    ],
    [caregivers]
  );

  const filteredClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return clients.filter((client) => {
      const caregiver = getCaregiver(client);
      const haystack = [client.nazwa, client.nip, client.email, caregiver?.full_name, caregiver?.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;
      if (legalFormFilter !== EMPTY_FILTER && client.forma_prawna !== legalFormFilter) return false;
      if (taxationFilter !== EMPTY_FILTER && client.forma_opodatkowania !== taxationFilter) return false;
      if (caregiverFilter !== EMPTY_FILTER && client.opiekun_id !== caregiverFilter) return false;
      if (payrollFilter !== EMPTY_FILTER && (client.obsluga_kadrowa ? "Tak" : "Nie") !== payrollFilter) return false;
      if (statusFilter !== EMPTY_FILTER && client.status_klienta !== statusFilter) return false;
      return true;
    });
  }, [clients, searchQuery, legalFormFilter, taxationFilter, caregiverFilter, payrollFilter, statusFilter]);

  const filteredIds = filteredClients.map((client) => client.id);
  const selectedClients = clients.filter((client) => selectedIds.includes(client.id));
  const selectedWithEmail = selectedClients.filter((client) => Boolean(client.email));
  const filteredWithEmail = filteredClients.filter((client) => Boolean(client.email));
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
  const shouldShowList = showRecipientList || Boolean(searchQuery.trim()) || selectedIds.length > 0;

  function toggleClient(clientId: string) {
    setSelectedIds((current) => current.includes(clientId) ? current.filter((id) => id !== clientId) : [...current, clientId]);
  }

  function toggleFilteredClients() {
    setSelectedIds((current) => {
      if (allFilteredSelected) return current.filter((id) => !filteredIds.includes(id));
      return Array.from(new Set([...current, ...filteredIds]));
    });
  }

  function applyBold() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = message.slice(start, end);
    const replacement = selected ? `**${selected}**` : "**pogrubiony tekst**";
    const nextMessage = `${message.slice(0, start)}${replacement}${message.slice(end)}`;
    setMessage(nextMessage);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursorStart = selected ? start + replacement.length : start + 2;
      const cursorEnd = selected ? cursorStart : start + replacement.length - 2;
      textarea.setSelectionRange(cursorStart, cursorEnd);
    });
  }

  async function handleSend() {
    setResultMessage("");
    if (selectedIds.length === 0) {
      setResultMessage("Wybierz co najmniej jednego klienta.");
      return;
    }
    if (!subject.trim() || !message.trim()) {
      setResultMessage("Uzupełnij temat i treść wiadomości.");
      return;
    }

    if (!window.confirm(`Wysłać komunikat do ${selectedWithEmail.length} klientów z adresem e-mail?`)) return;

    setSending(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const response = await fetch("/api/komunikaty/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ clientIds: selectedIds, subject, message }),
    });

    const result = await response.json().catch(() => ({}));
    setSending(false);

    if (!response.ok) {
      setResultMessage(result.error || "Nie udało się przekazać komunikatu do wysyłki.");
      return;
    }

    setResultMessage(`Przekazano do wysyłki: ${result.sent || 0}. Pominięto bez e-maila: ${result.skipped || 0}.`);
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł operacyjny</p>
          <h1 style={titleStyle}>Komunikaty</h1>
          <p style={subtitleStyle}>Wysyłka zbiorczych wiadomości do wybranych grup klientów.</p>
        </div>
        <div style={summaryStyle}>
          <SummaryCard label="Wybrani" value={selectedIds.length} />
          <SummaryCard label="Z e-mailem" value={selectedWithEmail.length} />
        </div>
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Odbiorcy</h2>
            <p style={sectionSubtitleStyle}>Najpierw wybierz grupę filtrami, a potem zaznacz odbiorców do wysyłki.</p>
          </div>
        </div>

        <div style={recipientPickerStyle}>
          <input style={searchInputStyle} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Szukaj po nazwie, NIP, e-mailu lub opiekunie" />
          <div style={filtersStyle}>
            <span style={filterLabelStyle}>Filtry:</span>
            <AppSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} style={filterSelectStyle} />
            <AppSelect value={caregiverFilter} onChange={setCaregiverFilter} options={caregiverOptions} style={filterSelectStyle} />
            <AppSelect value={legalFormFilter} onChange={setLegalFormFilter} options={LEGAL_FORM_OPTIONS} style={filterSelectStyle} />
            <AppSelect value={taxationFilter} onChange={setTaxationFilter} options={TAXATION_OPTIONS} style={filterSelectStyle} />
            <AppSelect value={payrollFilter} onChange={setPayrollFilter} options={PAYROLL_OPTIONS} style={filterSelectStyle} />
          </div>

          <div style={recipientSummaryStyle}>
            <div>
              <strong>{filteredClients.length}</strong> klientów spełnia warunki, w tym <strong>{filteredWithEmail.length}</strong> z adresem e-mail.
            </div>
            <div style={recipientActionsStyle}>
              <button type="button" style={secondaryButtonStyle} onClick={toggleFilteredClients} disabled={filteredClients.length === 0}>
                {allFilteredSelected ? "Odznacz grupę" : "Zaznacz grupę"}
              </button>
              <button type="button" style={secondaryButtonStyle} onClick={() => setShowRecipientList((current) => !current)}>
                {shouldShowList ? "Ukryj listę" : "Pokaż listę"}
              </button>
            </div>
          </div>
        </div>

        {shouldShowList && (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th width="56px"> </Th>
                  <Th>Klient</Th>
                  <Th>NIP</Th>
                  <Th>Opiekun</Th>
                  <Th>E-mail</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={emptyStyle}>Ładowanie klientów...</td></tr>
                ) : filteredClients.length === 0 ? (
                  <tr><td colSpan={6} style={emptyStyle}>Brak klientów dla wybranych filtrów.</td></tr>
                ) : filteredClients.map((client) => {
                  const caregiver = getCaregiver(client);
                  const selected = selectedIds.includes(client.id);
                  return (
                    <tr key={client.id}>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={selected} onChange={() => toggleClient(client.id)} />
                      </td>
                      <td style={nameTdStyle}>{client.nazwa || "Brak nazwy"}</td>
                      <td style={tdStyle}>{client.nip || "Brak NIP"}</td>
                      <td style={tdStyle}>{caregiver?.full_name || "Brak opiekuna"}</td>
                      <td style={tdStyle}>{client.email || "Brak e-maila"}</td>
                      <td style={tdStyle}><span style={pillStyle}>{client.status_klienta || "Brak statusu"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Treść komunikatu</h2>
        <div style={messageGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Temat</span>
            <input style={inputStyle} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="np. Informacja dla klientów CRSS" />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Wiadomość</span>
            <div style={toolbarStyle}>
              <button type="button" style={toolbarButtonStyle} onClick={applyBold} title="Pogrubienie">B</button>
              <span style={toolbarHintStyle}>Zaznacz tekst i kliknij B, aby go pogrubić.</span>
            </div>
            <textarea ref={textareaRef} style={textareaStyle} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Wpisz treść wiadomości. Akapity oddziel pustą linią." />
          </label>
        </div>
        <div style={sendRowStyle}>
          <button type="button" style={primaryButtonStyle} onClick={handleSend} disabled={sending || selectedWithEmail.length === 0}>
            {sending ? "Wysyłam..." : "Wyślij komunikat"}
          </button>
          <span style={helperStyle}>Wysyłka obejmie {selectedWithEmail.length} klientów z uzupełnionym adresem e-mail.</span>
        </div>
        {resultMessage && <p style={resultStyle}>{resultMessage}</p>}
      </section>
    </>
  );
}

function getCaregiver(client: Client) {
  return Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return <th style={{ ...thStyle, width }}>{children}</th>;
}

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "28px" };
const eyebrowStyle: React.CSSProperties = { margin: "0 0 6px", color: colors.red, fontWeight: 850, fontSize: "17px" };
const titleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "44px", lineHeight: 1.05, fontWeight: 500 };
const subtitleStyle: React.CSSProperties = { margin: "12px 0 0", color: colors.text, fontSize: "18px", lineHeight: 1.55 };
const summaryStyle: React.CSSProperties = { display: "flex", gap: "12px" };
const summaryCardStyle: React.CSSProperties = { minWidth: "145px", border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "18px", boxShadow: shadow.soft };
const summaryLabelStyle: React.CSSProperties = { fontSize: "15px", fontWeight: 850, color: colors.text };
const summaryValueStyle: React.CSSProperties = { marginTop: "8px", fontSize: "20px", fontWeight: 900, color: colors.navy };
const cardStyle: React.CSSProperties = { marginBottom: "24px", padding: "26px", border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, boxShadow: shadow.soft };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", marginBottom: "18px" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "27px", fontWeight: 500 };
const sectionSubtitleStyle: React.CSSProperties = { margin: "8px 0 0", color: colors.text, fontSize: "16px" };
const recipientPickerStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: "#f8fafc", padding: "18px" };
const searchInputStyle: React.CSSProperties = { width: "100%", minHeight: "50px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, padding: "0 18px", fontSize: "15px", fontWeight: 750, color: colors.text, outline: "none", boxSizing: "border-box" };
const filtersStyle: React.CSSProperties = { marginTop: "14px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" };
const filterLabelStyle: React.CSSProperties = { fontSize: "15px", fontWeight: 850, color: colors.text };
const filterSelectStyle: React.CSSProperties = { width: "180px", background: colors.card };
const recipientSummaryStyle: React.CSSProperties = { marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", color: colors.text, fontSize: "15px", fontWeight: 700 };
const recipientActionsStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" };
const tableWrapStyle: React.CSSProperties = { marginTop: "18px", border: `1px solid ${colors.border}`, borderRadius: radius.input, overflow: "hidden" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { padding: "15px 14px", borderBottom: `1px solid ${colors.border}`, textAlign: "left", color: colors.navy, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0", fontWeight: 800 };
const tdStyle: React.CSSProperties = { padding: "16px 14px", borderBottom: `1px solid ${colors.border}`, fontSize: "15px", color: colors.text, verticalAlign: "middle" };
const nameTdStyle: React.CSSProperties = { ...tdStyle, fontWeight: 850, color: colors.navy };
const emptyStyle: React.CSSProperties = { padding: "24px", textAlign: "center", color: colors.text, fontWeight: 850 };
const pillStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: "30px", padding: "4px 12px", borderRadius: radius.badge, background: "#e8eef8", color: colors.navy, fontSize: "13px", fontWeight: 850 };
const messageGridStyle: React.CSSProperties = { marginTop: "18px", display: "grid", gap: "14px" };
const fieldStyle: React.CSSProperties = { display: "grid", gap: "8px" };
const labelStyle: React.CSSProperties = { fontSize: "15px", fontWeight: 850, color: colors.text };
const inputStyle: React.CSSProperties = { minHeight: "50px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "0 16px", fontSize: "16px", fontWeight: 750, color: colors.text, outline: "none" };
const toolbarStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px" };
const toolbarButtonStyle: React.CSSProperties = { width: "40px", height: "36px", border: `1px solid ${colors.border}`, borderRadius: "10px", background: colors.card, color: colors.navy, fontSize: "17px", fontWeight: 900, cursor: "pointer" };
const toolbarHintStyle: React.CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 650 };
const textareaStyle: React.CSSProperties = { minHeight: "180px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "16px", fontSize: "16px", lineHeight: 1.55, fontWeight: 650, color: colors.text, outline: "none", resize: "vertical" };
const sendRowStyle: React.CSSProperties = { marginTop: "18px", display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "15px 22px", background: colors.red, color: colors.white, fontWeight: 900, fontSize: "17px", cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "12px 17px", background: colors.card, color: colors.navy, fontWeight: 850, fontSize: "15px", cursor: "pointer" };
const helperStyle: React.CSSProperties = { color: colors.muted, fontSize: "14px", fontWeight: 700 };
const resultStyle: React.CSSProperties = { margin: "14px 0 0", color: colors.navy, fontSize: "15px", fontWeight: 850 };
