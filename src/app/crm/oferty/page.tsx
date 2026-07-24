"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { AppDateInput } from "@/components/AppDateInputs";
import { colors, radius, shadow } from "@/app/design";
import { fetchCrmLeads } from "@/lib/crmService";
import {
  createCrmOffer,
  expireCrmOffer,
  fetchCrmOfferEvents,
  fetchCrmOffers,
  publishCrmOffer,
  removeCrmOfferPdf,
  sendCrmOfferToN8n,
  updateCrmOffer,
  uploadCrmOfferPdf,
  type CrmOffer,
  type CrmOfferEvent,
  type CrmOfferPayload,
} from "@/lib/crmOfferService";

type Lead = {
  id: string;
  nazwa: string | null;
  email?: string | null;
  osoba_kontaktowa: string | null;
  szacowany_mrr: number | null;
};

type OfferDraft = {
  tytul: string;
  przygotowana_dla: string;
  osoba_kontaktowa: string;
  email_recipient: string;
  email_subject: string;
  wazna_do: string;
};

export default function CrmOffersPage() {
  return (
    <AppLayout activePage="crm">
      <AccessGuard moduleName="crm">
        <CrmOffersContent />
      </AccessGuard>
    </AppLayout>
  );
}

function CrmOffersContent() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [leadCtaStatuses, setLeadCtaStatuses] = useState<Record<string, string>>({});
  const [offer, setOffer] = useState<CrmOffer | null>(null);
  const [events, setEvents] = useState<CrmOfferEvent[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [expiring, setExpiring] = useState(false);
  const [removingPdf, setRemovingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId) || null, [leads, selectedLeadId]);
  const filteredLeads = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    if (!query) return leads;

    return leads.filter((lead) => {
      const searchable = normalizeSearch([
        lead.nazwa,
        lead.osoba_kontaktowa,
        lead.email,
        leadCtaStatuses[lead.id],
      ].filter(Boolean).join(" "));

      return searchable.includes(query);
    });
  }, [leads, leadCtaStatuses, searchQuery]);
  const [draft, setDraft] = useState<OfferDraft>(() => createOfferDraftFromLead(null));

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    if (selectedLead) loadOffer(selectedLead);
  }, [selectedLeadId]);

  async function loadLeads() {
    setLoading(true);
    const { data, error } = await fetchCrmLeads();
    if (error) {
      console.error("Błąd pobierania szans CRM:", error);
      setLoading(false);
      return;
    }
    const list = (data || []) as Lead[];
    const requestedLeadId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("leadId") || "" : "";
    const leadFromUrl = requestedLeadId ? list.find((lead) => lead.id === requestedLeadId) : null;
    setLeads(list);
    setSelectedLeadId(leadFromUrl?.id || list[0]?.id || "");
    setLoading(false);
    loadLeadCtaStatuses(list);
  }

  async function loadLeadCtaStatuses(list: Lead[]) {
    const entries = await Promise.all(list.map(async (lead) => {
      const { data } = await fetchCrmOffers(lead.id);
      const currentOffer = (data?.[0] || null) as CrmOffer | null;
      if (!currentOffer) return [lead.id, "Brak propozycji"] as const;
      return [lead.id, statusLabel(currentOffer.status)] as const;
    }));
    setLeadCtaStatuses(Object.fromEntries(entries));
  }

  async function loadOffer(lead: Lead) {
    const { data, error } = await fetchCrmOffers(lead.id);
    if (error) {
      console.error("Błąd pobierania propozycji:", error);
      return;
    }
    const currentOffer = (data?.[0] || null) as CrmOffer | null;
    setOffer(currentOffer);
    setDraft(currentOffer ? createOfferDraft(currentOffer, lead) : createOfferDraftFromLead(lead));
    if (currentOffer?.pdf_url) await loadEvents(currentOffer.id);
    else setEvents([]);
  }

  async function loadEvents(offerId: string) {
    const { data, error } = await fetchCrmOfferEvents(offerId);
    if (error) {
      console.error("Błąd pobierania statystyk:", error);
      return;
    }
    setEvents((data || []) as CrmOfferEvent[]);
  }

  function updateDraft<K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveOffer() {
    if (!selectedLead) return null;
    setSaving(true);
    const payload = createOfferPayload(selectedLead, draft);
    const result = offer ? await updateCrmOffer(offer.id, payload) : await createCrmOffer(payload);
    setSaving(false);
    if (result.error) {
      console.error("Błąd zapisu propozycji:", result.error);
      alert("Nie udało się zapisać propozycji.");
      return null;
    }
    const savedOffer = result.data as CrmOffer;
    setOffer(savedOffer);
    if (savedOffer.pdf_url) await loadEvents(savedOffer.id);
    else setEvents([]);
    await loadLeadCtaStatuses(leads);
    return savedOffer;
  }

  async function publishOffer() {
    const savedOffer = offer || await saveOffer();
    if (!savedOffer) return;
    if (savedOffer.status !== "draft" && savedOffer.status !== "expired") return;
    if (!savedOffer.pdf_url) {
      alert("Dodaj PDF przed publikacją linku dla klienta.");
      return;
    }

    const { data, error } = await publishCrmOffer(savedOffer.id);
    if (error) {
      console.error("Błąd publikacji propozycji:", error);
      alert("Nie udało się opublikować propozycji.");
      return;
    }
    setOffer(data as CrmOffer);
    await loadLeadCtaStatuses(leads);
  }

  async function invalidateOfferLink() {
    if (!offer) return;
    const confirmed = window.confirm(
      `Unieważnić link do propozycji "${offer.tytul}"?\n\nKlient nie będzie mógł jej otworzyć z dotychczasowego maila.`
    );
    if (!confirmed) return;

    setExpiring(true);
    const { data, error } = await expireCrmOffer(offer.id);
    setExpiring(false);

    if (error) {
      console.error("Błąd unieważnienia linku:", error);
      alert("Nie udało się unieważnić linku.");
      return;
    }

    setOffer(data as CrmOffer);
    await loadLeadCtaStatuses(leads);
    alert("Link został unieważniony.");
  }

  async function deletePdf() {
    if (!offer?.pdf_url) return;
    const confirmed = window.confirm(
      `Usunąć PDF z propozycji "${offer.tytul}"?\n\nUsunięte zostaną też dotychczasowe statystyki oglądania i decyzje klienta dla tej propozycji.`
    );
    if (!confirmed) return;

    setRemovingPdf(true);
    const { data, error } = await removeCrmOfferPdf(offer);
    setRemovingPdf(false);

    if (error) {
      console.error("Błąd usuwania PDF:", error);
      alert("Nie udało się usunąć PDF.");
      return;
    }

    setOffer(data as CrmOffer);
    setEvents([]);
    await loadLeadCtaStatuses(leads);
    if (fileInputRef.current) fileInputRef.current.value = "";
    alert("PDF i dotychczasowe statystyki zostały usunięte z propozycji.");
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      alert("Wgraj plik PDF.");
      return;
    }

    const savedOffer = offer || await saveOffer();
    if (!savedOffer) return;

    setUploading(true);
    const { data, error } = await uploadCrmOfferPdf(savedOffer.id, file);
    setUploading(false);
    if (error) {
      console.error("Błąd wgrywania PDF:", error);
      alert("Nie udało się wgrać PDF.");
      return;
    }

    setOffer(data as CrmOffer);
    setEvents([]);
    await loadLeadCtaStatuses(leads);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function sendViaN8n() {
    const recipientEmail = draft.email_recipient.trim() || selectedLead?.email || "";

    if (!recipientEmail) {
      alert("Uzupełnij adres e-mail odbiorcy.");
      return;
    }

    const confirmed = window.confirm(
      `Wysłać propozycję współpracy?\n\nOdbiorca: ${recipientEmail}\nFirma: ${draft.przygotowana_dla || selectedLead?.nazwa || "brak firmy"}\nTemat: ${draft.email_subject || "brak tematu"}`
    );
    if (!confirmed) return;

    const savedOffer = await saveOffer();
    if (!savedOffer) return;
    if (!savedOffer.pdf_url) {
      alert("Najpierw wgraj PDF.");
      return;
    }

    setSending(true);
    const result = await sendCrmOfferToN8n(savedOffer, selectedLead);
    setSending(false);
    if (!result.ok) {
      alert(result.error || "Nie udało się przekazać maila do wysyłki.");
      return;
    }

    alert("Mail został przekazany do wysyłki.");
    await loadOffer(selectedLead as Lead);
  }

  function openLeadDetails(leadId: string) {
    const lead = leads.find((item) => item.id === leadId) || null;
    if (leadId !== selectedLeadId) {
      setOffer(null);
      setEvents([]);
      setDraft(createOfferDraftFromLead(lead));
    }
    setSelectedLeadId(leadId);
    setDetailsOpen(true);
  }

  const offerUrl = offer ? createOfferUrl(offer.public_token) : "";
  const isLinkPublished = Boolean(offer && offer.status !== "draft" && offer.status !== "expired");
  const detailsContent = !selectedLead ? (
    <div style={emptyStyle}>Wybierz szansę, aby przygotować propozycję.</div>
  ) : (
    <>
      <div style={toolbarStyle}>
        <div>
          <h2 style={sectionTitleStyle}>{selectedLead.nazwa || "Propozycja"}</h2>
          <p style={metaStyle}>{offer ? statusLabel(offer.status) : "Nowy szkic"}</p>
        </div>
        <div style={actionsStyle}>
          <button style={primaryButtonStyle} onClick={saveOffer} disabled={saving}>{saving ? "Zapisywanie..." : "Zapisz"}</button>
          <button style={isLinkPublished ? disabledButtonStyle : secondaryButtonStyle} onClick={publishOffer} disabled={isLinkPublished}>{isLinkPublished ? "Opublikowano" : "Opublikuj link"}</button>
          {offer && <button style={secondaryButtonStyle} onClick={() => navigator.clipboard.writeText(offerUrl)}>Kopiuj link</button>}
          {offer && offer.status !== "draft" && offer.status !== "expired" && <button style={secondaryButtonStyle} onClick={() => window.open(offerUrl, "_blank", "noopener,noreferrer")}>Podgląd</button>}
          {offer && offer.status !== "draft" && offer.status !== "expired" && <button style={dangerButtonStyle} onClick={invalidateOfferLink} disabled={expiring}>{expiring ? "Unieważnianie..." : "Unieważnij link"}</button>}
        </div>
      </div>

      {offer?.pdf_url && <Analytics offer={offer} events={events} />}

      <section style={uploadPanelStyle}>
        <div>
          <p style={panelEyebrowStyle}>PDF propozycji</p>
          <h3 style={panelTitleStyle}>{offer?.pdf_file_name || "Wgraj dokument propozycji"}</h3>
          <p style={panelTextStyle}>{offer?.pdf_file_size ? `${formatFileSize(offer.pdf_file_size)} · link gotowy do śledzenia` : "Po wgraniu PDF klient zobaczy propozycję na prywatnej stronie, a CRM zapisze otwarcia, pobrania i czas oglądania."}</p>
          {offer?.pdf_url && (
            <div style={pdfActionsStyle}>
              <a style={linkStyle} href={offer.pdf_url} target="_blank" rel="noreferrer">Otwórz PDF</a>
              <button style={dangerTextButtonStyle} type="button" onClick={deletePdf} disabled={removingPdf}>{removingPdf ? "Usuwanie..." : "Usuń PDF"}</button>
            </div>
          )}
        </div>
        <div style={uploadActionsStyle}>
          <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={handleFileChange} />
          <button style={primaryButtonStyle} onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? "Wgrywanie..." : "Wgraj PDF"}</button>
        </div>
      </section>

      <section style={formStyle}>
        <Field label="Tytuł"><input style={inputStyle} value={draft.tytul} onChange={(event) => updateDraft("tytul", event.target.value)} /></Field>
        <Field label="Dla firmy"><input style={inputStyle} value={draft.przygotowana_dla} onChange={(event) => updateDraft("przygotowana_dla", event.target.value)} /></Field>
        <Field label="Osoba kontaktowa"><input style={inputStyle} value={draft.osoba_kontaktowa} onChange={(event) => updateDraft("osoba_kontaktowa", event.target.value)} /></Field>
        <Field label="Ważna do"><AppDateInput style={inputStyle} value={draft.wazna_do} onChange={(value) => updateDraft("wazna_do", value)} /></Field>
      </section>

      <section style={n8nPanelStyle}>
        <div style={n8nHeaderStyle}>
          <p style={panelEyebrowStyle}>Automatyczna wysyłka</p>
          <button style={primaryButtonStyle} onClick={sendViaN8n} disabled={sending || offer?.status === "expired"}>{sending ? "Wysyłanie..." : "Wyślij maila"}</button>
        </div>
        <div style={formStyle}>
          <Field label="Odbiorca"><input style={inputStyle} type="email" value={draft.email_recipient} onChange={(event) => updateDraft("email_recipient", event.target.value)} placeholder="mail klienta" /></Field>
          <Field label="Temat maila"><input style={inputStyle} value={draft.email_subject} onChange={(event) => updateDraft("email_subject", event.target.value)} /></Field>
        </div>
        {offer?.status === "expired" && <p style={sentStyle}>Link jest unieważniony. Opublikuj link ponownie, żeby wrócić do wysyłki.</p>}
        {offer?.email_sent_at && <p style={sentStyle}>Ostatnio wysłano maila: {formatDateTime(offer.email_sent_at)}</p>}
      </section>
    </>
  );

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>CRM</p>
          <h1 style={titleStyle}>Propozycje współpracy</h1>
        </div>
        <button style={secondaryButtonStyle} onClick={() => { window.location.href = "/crm"; }}>Wróć do CRM</button>
      </section>

      <section style={offersListShellStyle}>
        <div style={listHeaderStyle}>
          <h2 style={sectionTitleStyle}>Szanse</h2>
          <input
            style={searchInputStyle}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Szukaj propozycji..."
            aria-label="Szukaj propozycji"
          />
        </div>
          {loading ? <div style={emptyStyle}>Ładowanie...</div> : filteredLeads.length === 0 ? <div style={emptyStyle}>Brak propozycji dla wpisanej frazy.</div> : filteredLeads.map((lead) => (
            <article key={lead.id} style={lead.id === selectedLeadId ? activeOfferRowStyle : offerRowStyle}>
              <div style={offerRowMainStyle}>
                <strong>{lead.nazwa || "Bez nazwy"}</strong>
                <span>{lead.osoba_kontaktowa || lead.email || "Brak kontaktu"}</span>
              </div>
              <em style={ctaStatusStyle}>{leadCtaStatuses[lead.id] || "Sprawdzam status"}</em>
              <button style={secondaryButtonStyle} onClick={() => openLeadDetails(lead.id)}>Szczegóły</button>
            </article>
          ))}
      </section>

      {detailsOpen && (
        <div style={modalOverlayStyle} role="dialog" aria-modal="true" aria-labelledby="offer-details-title">
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <p style={eyebrowStyle}>Szczegóły propozycji</p>
                <h2 id="offer-details-title" style={modalTitleStyle}>{selectedLead?.nazwa || "Propozycja"}</h2>
              </div>
              <button style={secondaryButtonStyle} onClick={() => setDetailsOpen(false)}>Zamknij</button>
            </div>
            {detailsContent}
          </div>
        </div>
      )}
    </>
  );
}

function Analytics({ offer, events }: { offer: CrmOffer; events: CrmOfferEvent[] }) {
  const pageStats = collectPageStats(events);
  const strongestPage = findStrongestPage(pageStats);
  return (
    <section style={analyticsShellStyle}>
      <div style={analyticsStyle}>
        <Stat label="Otwarcia" value={countEvents(events, "open")} />
        <Stat label="Pobrania PDF" value={countEvents(events, "pdf_download")} />
        <Stat label="Status propozycji" value={statusLabel(offer.status)} variant="badge" />
        <Stat label="Najmocniejsza strona" value={strongestPage?.label || "Brak danych"} subtleValue />
      </div>
      {pageStats.length > 0 && (
        <div style={pageStatsStyle}>
          {pageStats.map((page) => (
            <div key={page.key} style={pageStatRowStyle}>
              <strong>{page.label}</strong>
              <span style={pageStatMetaStyle}>{formatPageStatMeta(page.views, page.minutes)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={fieldStyle}><span style={labelStyle}>{label}</span>{children}</label>;
}

function Stat({ label, value, detail, variant, subtleValue }: { label: string | number; value: string | number; detail?: string; variant?: "badge"; subtleValue?: boolean }) {
  const valueStyle = variant === "badge" ? statBadgeValueStyle : subtleValue ? statSubtleValueStyle : undefined;
  return <div style={statStyle}><span>{label}</span><strong style={valueStyle}>{value}</strong>{detail && <small style={statDetailStyle}>{detail}</small>}</div>;
}

function createOfferDraftFromLead(lead: Lead | null): OfferDraft {
  return {
    tytul: `Propozycja współpracy CRSS dla ${lead?.nazwa || "klienta"}`,
    przygotowana_dla: lead?.nazwa || "",
    osoba_kontaktowa: lead?.osoba_kontaktowa || "",
    email_recipient: lead?.email || "",
    email_subject: `Propozycja współpracy CRSS dla ${lead?.nazwa || "Państwa firmy"}`,
    wazna_do: "",
  };
}

function createOfferDraft(offer: CrmOffer, lead: Lead | null): OfferDraft {
  return {
    tytul: offer.tytul || "",
    przygotowana_dla: offer.przygotowana_dla || lead?.nazwa || "",
    osoba_kontaktowa: offer.osoba_kontaktowa || lead?.osoba_kontaktowa || "",
    email_recipient: offer.email_recipient || lead?.email || "",
    email_subject: offer.email_subject || `Propozycja współpracy CRSS dla ${offer.przygotowana_dla || lead?.nazwa || "Państwa firmy"}`,
    wazna_do: offer.wazna_do || "",
  };
}

function createOfferPayload(lead: Lead, draft: OfferDraft): CrmOfferPayload {
  return {
    crm_id: lead.id,
    tytul: draft.tytul.trim() || "Propozycja współpracy CRSS",
    przygotowana_dla: draft.przygotowana_dla.trim() || lead.nazwa || null,
    osoba_kontaktowa: draft.osoba_kontaktowa.trim() || lead.osoba_kontaktowa || null,
    rekomendowany_pakiet: "PDF",
    cta_label: "Proszę o kontakt w sprawie propozycji",
    cta_url: null,
    email_recipient: draft.email_recipient.trim() || lead.email || null,
    email_subject: draft.email_subject.trim() || `Propozycja współpracy CRSS dla ${draft.przygotowana_dla || lead.nazwa || "Państwa firmy"}`,
    warunki: null,
    wazna_do: draft.wazna_do || null,
  };
}

function createOfferUrl(token: string) {
  if (typeof window === "undefined") return `/oferta/${token}`;
  return `${window.location.origin}/oferta/${token}`;
}

function countEvents(events: CrmOfferEvent[], type: CrmOfferEvent["event_type"]) {
  return events.filter((event) => event.event_type === type).length;
}

function collectPageStats(events: CrmOfferEvent[]) {
  const stats = events
    .filter((event) => event.event_type === "section_time" && event.section_key?.startsWith("pdf_page_"))
    .reduce<Record<string, { key: string; label: string; pageNumber: number; views: number; seconds: number }>>((acc, event) => {
      const key = event.section_key || "pdf_page_0";
      const pageNumber = Number(key.replace("pdf_page_", "")) || 0;
      if (!acc[key]) acc[key] = { key, label: `Strona ${pageNumber}`, pageNumber, views: 0, seconds: 0 };
      if (Number(event.duration_seconds || 0) === 0) acc[key].views += 1;
      acc[key].seconds += Number(event.duration_seconds || 0);
      return acc;
    }, {});

  return Object.values(stats)
    .map((item) => ({ ...item, minutes: Math.round(item.seconds / 60) }))
    .sort((first, second) => first.pageNumber - second.pageNumber);
}

function findStrongestPage<T extends { seconds: number; views: number }>(pages: T[]) {
  return [...pages].sort((first, second) => second.seconds - first.seconds || second.views - first.views)[0];
}

function statusLabel(status: CrmOffer["status"]) {
  if (status === "published") return "Czeka na decyzję";
  if (status === "accepted") return "Współpraca potwierdzona";
  if (status === "discussion_requested") return "Prośba o kontakt";
  if (status === "rejected") return "Rezygnacja";
  if (status === "expired") return "Wygasła";
  return "Szkic";
}

function formatPageStatMeta(views: number, minutes: number) {
  return `${views} ${pluralizePolish(views, "wejście", "wejścia", "wejść")} · ${minutes} ${pluralizePolish(minutes, "minuta", "minuty", "minut")}`;
}

function pluralizePolish(value: number, one: string, few: string, many: string) {
  const absolute = Math.abs(value);
  const lastDigit = absolute % 10;
  const lastTwoDigits = absolute % 100;

  if (absolute === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14)) return few;
  return many;
}

function formatFileSize(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const headerStyle: React.CSSProperties = { marginBottom: "28px", display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start" };
const eyebrowStyle: React.CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 800 };
const titleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.05 };
const offersListShellStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "18px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px" };
const listHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", marginBottom: "4px", flexWrap: "wrap" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "22px" };
const searchInputStyle: React.CSSProperties = { width: "min(420px, 100%)", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "12px 14px", fontWeight: 700 };
const offerRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: "14px", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "12px 14px" };
const activeOfferRowStyle: React.CSSProperties = { ...offerRowStyle, borderColor: colors.navy, background: "#f8fbff" };
const offerRowMainStyle: React.CSSProperties = { minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" };
const ctaStatusStyle: React.CSSProperties = { display: "inline-flex", alignSelf: "flex-start", marginTop: "4px", borderRadius: radius.badge, padding: "5px 8px", background: "rgba(23, 59, 115, 0.10)", color: colors.navy, fontStyle: "normal", fontWeight: 800, fontSize: "12px" };
const emptyStyle: React.CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "18px", color: colors.muted, textAlign: "center", fontWeight: 700 };
const toolbarStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", marginBottom: "18px" };
const metaStyle: React.CSSProperties = { margin: "6px 0 0", color: colors.muted, fontWeight: 800 };
const actionsStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "flex-end" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "11px 15px", minHeight: "42px", background: colors.red, color: colors.white, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const disabledButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, background: "#eef2f7", color: "#64748b", cursor: "not-allowed" };
const dangerButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, border: "none", background: "rgba(220, 38, 38, 0.10)", color: colors.danger };
const dangerTextButtonStyle: React.CSSProperties = { border: "none", background: "transparent", color: colors.danger, fontWeight: 850, cursor: "pointer", padding: "10px 0" };
const analyticsShellStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: "#f8fbff", padding: "14px", marginBottom: "18px" };
const analyticsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" };
const pageStatsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginTop: "12px" };
const pageStatRowStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "12px", minHeight: "72px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "5px", color: colors.text, fontWeight: 800 };
const pageStatMetaStyle: React.CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 650, lineHeight: 1.4 };
const statStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "14px", minHeight: "84px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "8px", color: colors.muted, fontWeight: 800 };
const statBadgeValueStyle: React.CSSProperties = { display: "inline-flex", alignSelf: "flex-start", borderRadius: radius.badge, padding: "5px 8px", background: "rgba(23, 59, 115, 0.10)", color: colors.navy, fontWeight: 800, fontSize: "12px", lineHeight: 1.25 };
const statSubtleValueStyle: React.CSSProperties = { color: colors.text, fontSize: "13px", fontWeight: 650, lineHeight: 1.4 };
const statDetailStyle: React.CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 650, lineHeight: 1.35 };
const uploadPanelStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.inputBackground, padding: "22px", marginBottom: "18px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "18px", alignItems: "center" };
const panelEyebrowStyle: React.CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850, fontSize: "13px" };
const panelTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "22px" };
const panelTextStyle: React.CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.6 };
const uploadActionsStyle: React.CSSProperties = { display: "flex", justifyContent: "flex-end" };
const pdfActionsStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "center", marginTop: "10px" };
const linkStyle: React.CSSProperties = { display: "inline-flex", color: colors.navy, fontWeight: 850 };
const formStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "12px" };
const fieldStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "190px 1fr", gap: "14px", alignItems: "start", borderBottom: `1px solid ${colors.border}`, paddingBottom: "12px" };
const labelStyle: React.CSSProperties = { color: colors.muted, fontWeight: 800, fontSize: "14px", paddingTop: "10px" };
const inputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "11px 12px", fontWeight: 650 };
const n8nPanelStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "20px", marginTop: "18px", background: colors.white };
const n8nHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "center", marginBottom: "16px" };
const sentStyle: React.CSSProperties = { margin: "14px 0 0", color: colors.muted, fontWeight: 800 };
const modalOverlayStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15, 23, 42, 0.42)", padding: "34px", display: "flex", alignItems: "center", justifyContent: "center" };
const modalStyle: React.CSSProperties = { width: "min(1180px, 100%)", maxHeight: "calc(100vh - 68px)", overflow: "auto", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "24px", boxShadow: shadow.card };
const modalHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", marginBottom: "20px" };
const modalTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "30px", lineHeight: 1.15 };
