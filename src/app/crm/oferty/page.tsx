"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { fetchCrmLeads } from "@/lib/crmService";
import {
  createCrmOffer,
  fetchCrmOfferEvents,
  fetchCrmOffers,
  publishCrmOffer,
  updateCrmOffer,
  type CrmOffer,
  type CrmOfferEvent,
  type CrmOfferPayload,
} from "@/lib/crmOfferService";

type Lead = {
  id: string;
  nazwa: string | null;
  osoba_kontaktowa: string | null;
  szacowany_mrr: number | null;
  powod_kontaktu: string | null;
  powod_zmiany_biura: string | null;
  liczba_dokumentow: number | null;
  liczba_transakcji: number | null;
  czy_kadry: boolean | null;
  liczba_pracownikow: number | null;
};

type OfferDraft = {
  tytul: string;
  przygotowana_dla: string;
  osoba_kontaktowa: string;
  podsumowanie_rozmowy: string;
  potrzeby_klienta: string;
  rekomendowany_pakiet: string;
  opis_pakietu: string;
  cena_standard: string;
  cena_premium: string;
  cena_wdrozenia: string;
  zakres: string;
  warunki: string;
  cta_label: string;
  cta_url: string;
  pdf_url: string;
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
  const [offer, setOffer] = useState<CrmOffer | null>(null);
  const [events, setEvents] = useState<CrmOfferEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId) || null, [leads, selectedLeadId]);
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
      console.error("Blad pobierania szans CRM:", error);
      setLoading(false);
      return;
    }
    const list = (data || []) as Lead[];
    setLeads(list);
    setSelectedLeadId(list[0]?.id || "");
    setLoading(false);
  }

  async function loadOffer(lead: Lead) {
    const { data, error } = await fetchCrmOffers(lead.id);
    if (error) {
      console.error("Blad pobierania ofert:", error);
      return;
    }
    const currentOffer = (data?.[0] || null) as CrmOffer | null;
    setOffer(currentOffer);
    setDraft(currentOffer ? createOfferDraft(currentOffer) : createOfferDraftFromLead(lead));
    if (currentOffer) await loadEvents(currentOffer.id);
    else setEvents([]);
  }

  async function loadEvents(offerId: string) {
    const { data, error } = await fetchCrmOfferEvents(offerId);
    if (error) {
      console.error("Blad pobierania statystyk:", error);
      return;
    }
    setEvents((data || []) as CrmOfferEvent[]);
  }

  function updateDraft<K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveOffer() {
    if (!selectedLead) return;
    setSaving(true);
    const payload = createOfferPayload(selectedLead.id, draft);
    const result = offer ? await updateCrmOffer(offer.id, payload) : await createCrmOffer(payload);
    setSaving(false);
    if (result.error) {
      console.error("Blad zapisu oferty:", result.error);
      alert("Nie udalo sie zapisac oferty.");
      return;
    }
    setOffer(result.data as CrmOffer);
    await loadEvents((result.data as CrmOffer).id);
  }

  async function publishOffer() {
    if (!offer) return alert("Najpierw zapisz oferte.");
    const { data, error } = await publishCrmOffer(offer.id);
    if (error) {
      console.error("Blad publikacji oferty:", error);
      alert("Nie udalo sie opublikowac oferty.");
      return;
    }
    setOffer(data as CrmOffer);
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>CRM</p>
          <h1 style={titleStyle}>Oferty interaktywne</h1>
          <p style={subtitleStyle}>Edytuj indywidualne oferty dla leadow, publikuj prywatny link i sprawdzaj, ktore sekcje najbardziej przyciagnely uwage.</p>
        </div>
      </section>

      <section style={gridStyle}>
        <aside style={sideStyle}>
          <h2 style={sectionTitleStyle}>Szanse</h2>
          {loading ? <div style={emptyStyle}>Ladowanie...</div> : leads.map((lead) => (
            <button key={lead.id} style={lead.id === selectedLeadId ? activeLeadStyle : leadButtonStyle} onClick={() => setSelectedLeadId(lead.id)}>
              <strong>{lead.nazwa || "Bez nazwy"}</strong>
              <span>{lead.osoba_kontaktowa || "Brak osoby"}</span>
            </button>
          ))}
        </aside>

        <main style={mainStyle}>
          {!selectedLead ? (
            <div style={emptyStyle}>Wybierz szanse, aby przygotowac oferte.</div>
          ) : (
            <>
              <div style={toolbarStyle}>
                <div>
                  <h2 style={sectionTitleStyle}>{selectedLead.nazwa || "Oferta"}</h2>
                  <p style={metaStyle}>{offer ? statusLabel(offer.status) : "Nowy szkic"}</p>
                </div>
                <div style={actionsStyle}>
                  <button style={primaryButtonStyle} onClick={saveOffer} disabled={saving}>{saving ? "Zapisywanie..." : "Zapisz"}</button>
                  <button style={secondaryButtonStyle} onClick={publishOffer} disabled={!offer}>Opublikuj</button>
                  {offer && <button style={secondaryButtonStyle} onClick={() => navigator.clipboard.writeText(createOfferUrl(offer.public_token))}>Kopiuj link</button>}
                  {offer && offer.status !== "draft" && <button style={secondaryButtonStyle} onClick={() => window.open(createOfferUrl(offer.public_token), "_blank", "noopener,noreferrer")}>Podglad</button>}
                </div>
              </div>

              {offer && <Analytics events={events} />}

              <section style={formStyle}>
                <Field label="Tytul"><input style={inputStyle} value={draft.tytul} onChange={(event) => updateDraft("tytul", event.target.value)} /></Field>
                <Field label="Dla firmy"><input style={inputStyle} value={draft.przygotowana_dla} onChange={(event) => updateDraft("przygotowana_dla", event.target.value)} /></Field>
                <Field label="Osoba kontaktowa"><input style={inputStyle} value={draft.osoba_kontaktowa} onChange={(event) => updateDraft("osoba_kontaktowa", event.target.value)} /></Field>
                <Field label="Podsumowanie rozmowy"><textarea style={textareaStyle} value={draft.podsumowanie_rozmowy} onChange={(event) => updateDraft("podsumowanie_rozmowy", event.target.value)} /></Field>
                <Field label="Potrzeby klienta"><textarea style={textareaStyle} value={draft.potrzeby_klienta} onChange={(event) => updateDraft("potrzeby_klienta", event.target.value)} /></Field>
                <Field label="Pakiet"><input style={inputStyle} value={draft.rekomendowany_pakiet} onChange={(event) => updateDraft("rekomendowany_pakiet", event.target.value)} /></Field>
                <Field label="Opis pakietu"><textarea style={textareaStyle} value={draft.opis_pakietu} onChange={(event) => updateDraft("opis_pakietu", event.target.value)} /></Field>
                <Field label="Cena Standard"><input style={inputStyle} type="number" value={draft.cena_standard} onChange={(event) => updateDraft("cena_standard", event.target.value)} /></Field>
                <Field label="Cena Premium"><input style={inputStyle} type="number" value={draft.cena_premium} onChange={(event) => updateDraft("cena_premium", event.target.value)} /></Field>
                <Field label="Cena wdrozenia"><input style={inputStyle} type="number" value={draft.cena_wdrozenia} onChange={(event) => updateDraft("cena_wdrozenia", event.target.value)} /></Field>
                <Field label="Zakres"><textarea style={textareaStyle} value={draft.zakres} onChange={(event) => updateDraft("zakres", event.target.value)} /></Field>
                <Field label="Warunki"><textarea style={textareaStyle} value={draft.warunki} onChange={(event) => updateDraft("warunki", event.target.value)} /></Field>
                <Field label="CTA"><input style={inputStyle} value={draft.cta_label} onChange={(event) => updateDraft("cta_label", event.target.value)} /></Field>
                <Field label="Link CTA"><input style={inputStyle} value={draft.cta_url} onChange={(event) => updateDraft("cta_url", event.target.value)} /></Field>
                <Field label="Link PDF"><input style={inputStyle} value={draft.pdf_url} onChange={(event) => updateDraft("pdf_url", event.target.value)} /></Field>
                <Field label="Wazna do"><input style={inputStyle} type="date" value={draft.wazna_do} onChange={(event) => updateDraft("wazna_do", event.target.value)} /></Field>
              </section>
            </>
          )}
        </main>
      </section>
    </>
  );
}

function Analytics({ events }: { events: CrmOfferEvent[] }) {
  return (
    <section style={analyticsStyle}>
      <Stat label="Otwarcia" value={countEvents(events, "open")} />
      <Stat label="Klikniecia CTA" value={countEvents(events, "cta_click")} />
      <Stat label="Pobrania PDF" value={countEvents(events, "pdf_download")} />
      <Stat label="Najdluzej ogladane" value={topSectionLabel(events)} />
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={fieldStyle}><span style={labelStyle}>{label}</span>{children}</label>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div style={statStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function createOfferDraftFromLead(lead: Lead | null): OfferDraft {
  return {
    tytul: `Oferta wspolpracy dla ${lead?.nazwa || "klienta"}`,
    przygotowana_dla: lead?.nazwa || "",
    osoba_kontaktowa: lead?.osoba_kontaktowa || "",
    podsumowanie_rozmowy: lead?.powod_kontaktu || "",
    potrzeby_klienta: lead?.powod_zmiany_biura || "",
    rekomendowany_pakiet: lead?.czy_kadry ? "Premium" : "Standard",
    opis_pakietu: "Pakiet dopasowany do informacji z rozmowy i aktualnych potrzeb firmy.",
    cena_standard: lead?.szacowany_mrr ? String(lead.szacowany_mrr) : "",
    cena_premium: "",
    cena_wdrozenia: "",
    zakres: createDefaultScope(lead),
    warunki: "Po akceptacji oferty ustalimy harmonogram wdrozenia i osobe odpowiedzialna po stronie klienta.",
    cta_label: "Chce omowic oferte",
    cta_url: "",
    pdf_url: "",
    wazna_do: "",
  };
}

function createOfferDraft(offer: CrmOffer): OfferDraft {
  return {
    tytul: offer.tytul || "",
    przygotowana_dla: offer.przygotowana_dla || "",
    osoba_kontaktowa: offer.osoba_kontaktowa || "",
    podsumowanie_rozmowy: offer.podsumowanie_rozmowy || "",
    potrzeby_klienta: offer.potrzeby_klienta || "",
    rekomendowany_pakiet: offer.rekomendowany_pakiet || "Standard",
    opis_pakietu: offer.opis_pakietu || "",
    cena_standard: offer.cena_standard !== null && offer.cena_standard !== undefined ? String(offer.cena_standard) : "",
    cena_premium: offer.cena_premium !== null && offer.cena_premium !== undefined ? String(offer.cena_premium) : "",
    cena_wdrozenia: offer.cena_wdrozenia !== null && offer.cena_wdrozenia !== undefined ? String(offer.cena_wdrozenia) : "",
    zakres: offer.zakres || "",
    warunki: offer.warunki || "",
    cta_label: offer.cta_label || "Chce omowic oferte",
    cta_url: offer.cta_url || "",
    pdf_url: offer.pdf_url || "",
    wazna_do: offer.wazna_do || "",
  };
}

function createOfferPayload(crmId: string, draft: OfferDraft): CrmOfferPayload {
  return {
    crm_id: crmId,
    tytul: draft.tytul.trim() || "Oferta wspolpracy",
    przygotowana_dla: draft.przygotowana_dla.trim() || null,
    osoba_kontaktowa: draft.osoba_kontaktowa.trim() || null,
    podsumowanie_rozmowy: draft.podsumowanie_rozmowy.trim() || null,
    potrzeby_klienta: draft.potrzeby_klienta.trim() || null,
    rekomendowany_pakiet: draft.rekomendowany_pakiet.trim() || "Standard",
    opis_pakietu: draft.opis_pakietu.trim() || null,
    cena_standard: draft.cena_standard ? Number(draft.cena_standard) : null,
    cena_premium: draft.cena_premium ? Number(draft.cena_premium) : null,
    cena_wdrozenia: draft.cena_wdrozenia ? Number(draft.cena_wdrozenia) : null,
    zakres: draft.zakres.trim() || null,
    warunki: draft.warunki.trim() || null,
    cta_label: draft.cta_label.trim() || "Chce omowic oferte",
    cta_url: draft.cta_url.trim() || null,
    pdf_url: draft.pdf_url.trim() || null,
    wazna_do: draft.wazna_do || null,
  };
}

function createDefaultScope(lead: Lead | null) {
  return [
    "Biezaca obsluga ksiegowa i podatkowa.",
    lead?.liczba_dokumentow ? `Szacowana liczba dokumentow: ${lead.liczba_dokumentow}.` : "",
    lead?.liczba_transakcji ? `Szacowana liczba transakcji: ${lead.liczba_transakcji}.` : "",
    lead?.czy_kadry ? `Obsluga kadrowo-placowa${lead.liczba_pracownikow ? ` dla ${lead.liczba_pracownikow} osob` : ""}.` : "",
  ].filter(Boolean).join("\n");
}

function createOfferUrl(token: string) {
  if (typeof window === "undefined") return `/oferta/${token}`;
  return `${window.location.origin}/oferta/${token}`;
}

function countEvents(events: CrmOfferEvent[], type: CrmOfferEvent["event_type"]) {
  return events.filter((event) => event.event_type === type).length;
}

function topSectionLabel(events: CrmOfferEvent[]) {
  const totals = events.filter((event) => event.event_type === "section_time" && event.section_key).reduce<Record<string, number>>((acc, event) => {
    acc[event.section_key || ""] = (acc[event.section_key || ""] || 0) + Number(event.duration_seconds || 0);
    return acc;
  }, {});
  const [sectionKey] = Object.entries(totals).sort((first, second) => second[1] - first[1])[0] || [];
  if (!sectionKey) return "Brak danych";
  const labels: Record<string, string> = { summary: "Podsumowanie", needs: "Potrzeby", package: "Pakiet", scope: "Zakres", terms: "Warunki" };
  return labels[sectionKey] || sectionKey;
}

function statusLabel(status: CrmOffer["status"]) {
  if (status === "published") return "Opublikowana";
  if (status === "accepted") return "Zaakceptowana";
  if (status === "expired") return "Wygasla";
  return "Szkic";
}

const headerStyle: React.CSSProperties = { marginBottom: "28px" };
const eyebrowStyle: React.CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 800 };
const titleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.05 };
const subtitleStyle: React.CSSProperties = { maxWidth: "760px", color: colors.muted, fontSize: "17px", lineHeight: 1.7 };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: "22px", alignItems: "start" };
const sideStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "18px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px" };
const mainStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "24px", boxShadow: shadow.soft };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "22px" };
const leadButtonStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "12px", textAlign: "left", cursor: "pointer" };
const activeLeadStyle: React.CSSProperties = { ...leadButtonStyle, borderColor: colors.navy, background: "#e8eef8" };
const emptyStyle: React.CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "18px", color: colors.muted, textAlign: "center", fontWeight: 700 };
const toolbarStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", marginBottom: "18px" };
const metaStyle: React.CSSProperties = { margin: "6px 0 0", color: colors.muted, fontWeight: 800 };
const actionsStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "flex-end" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "11px 15px", background: colors.red, color: colors.white, fontWeight: 800, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer" };
const analyticsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", marginBottom: "18px" };
const statStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 800 };
const formStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "12px" };
const fieldStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "190px 1fr", gap: "14px", alignItems: "start", borderBottom: `1px solid ${colors.border}`, paddingBottom: "12px" };
const labelStyle: React.CSSProperties = { color: colors.muted, fontWeight: 800, fontSize: "14px", paddingTop: "10px" };
const inputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "11px 12px", fontWeight: 650 };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: "100px", resize: "vertical", lineHeight: 1.6 };
