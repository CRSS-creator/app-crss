"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { colors, radius, shadow } from "@/app/design";
import {
  fetchPublicCrmOffer,
  markCrmOfferAccepted,
  trackCrmOfferEvent,
  type CrmOffer,
} from "@/lib/crmOfferService";

export default function PublicOfferPage() {
  const params = useParams<{ token: string }>();
  const [offer, setOffer] = useState<CrmOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const visitorId = useMemo(() => getVisitorId(), []);
  const hasTrackedOpenRef = useRef(false);

  useEffect(() => {
    loadOffer();
  }, [params.token]);

  useEffect(() => {
    if (!offer || hasTrackedOpenRef.current) return;
    hasTrackedOpenRef.current = true;

    trackCrmOfferEvent({
      oferta_id: offer.id,
      event_type: "open",
      visitor_id: visitorId,
      metadata: {
        href: window.location.href,
        userAgent: window.navigator.userAgent,
      },
    });
  }, [offer?.id, visitorId]);

  useEffect(() => {
    if (!offer) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;

      trackCrmOfferEvent({
        oferta_id: offer.id,
        event_type: "section_time",
        section_key: "pdf",
        visitor_id: visitorId,
        duration_seconds: 5,
        metadata: { view: "pdf" },
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [offer?.id, visitorId]);

  async function loadOffer() {
    setLoading(true);
    const { data, error } = await fetchPublicCrmOffer(params.token);

    if (error) {
      console.error("Błąd pobierania oferty:", error);
      setOffer(null);
      setLoading(false);
      return;
    }

    setOffer(data as CrmOffer);
    setAccepted(data.status === "accepted");
    setLoading(false);
  }

  async function handleCtaClick() {
    if (!offer) return;

    await trackCrmOfferEvent({
      oferta_id: offer.id,
      event_type: "cta_click",
      visitor_id: visitorId,
      metadata: { label: offer.cta_label },
    });

    if (offer.cta_url) {
      window.open(offer.cta_url, "_blank", "noopener,noreferrer");
    }
  }

  async function handleAccept() {
    if (!offer || accepted) return;

    const { data, error } = await markCrmOfferAccepted(offer.id, visitorId);
    if (error) {
      alert("Nie udało się potwierdzić oferty. Spróbuj ponownie.");
      return;
    }

    setOffer(data as CrmOffer);
    setAccepted(true);
  }

  async function handlePdfDownload() {
    if (!offer?.pdf_url) return;

    await trackCrmOfferEvent({
      oferta_id: offer.id,
      event_type: "pdf_download",
      visitor_id: visitorId,
      metadata: { fileName: offer.pdf_file_name },
    });

    window.open(offer.pdf_url, "_blank", "noopener,noreferrer");
  }

  if (loading) return <main style={statePageStyle}>Ładowanie oferty...</main>;
  if (!offer) return <main style={statePageStyle}>Oferta jest niedostępna albo link wygasł.</main>;

  return (
    <main style={pageStyle}>
      <section style={topBarStyle}>
        <div>
          <p style={eyebrowStyle}>Oferta CRSS</p>
          <h1 style={titleStyle}>{offer.tytul}</h1>
          <p style={subtitleStyle}>
            Przygotowana dla: <strong>{offer.przygotowana_dla || "Twojej firmy"}</strong>
            {offer.osoba_kontaktowa ? ` · ${offer.osoba_kontaktowa}` : ""}
          </p>
        </div>
        <div style={actionsStyle}>
          <button style={primaryButtonStyle} onClick={handleAccept} disabled={accepted}>
            {accepted ? "Oferta zaakceptowana" : "Akceptuję ofertę"}
          </button>
          <button style={secondaryButtonStyle} onClick={handleCtaClick}>{offer.cta_label}</button>
          {offer.pdf_url && <button style={secondaryButtonStyle} onClick={handlePdfDownload}>Pobierz PDF</button>}
        </div>
      </section>

      <section style={viewerShellStyle}>
        {offer.pdf_url ? (
          <iframe src={offer.pdf_url} title="Oferta PDF" style={pdfFrameStyle} />
        ) : (
          <div style={emptyPdfStyle}>
            <strong>PDF nie został jeszcze dodany.</strong>
            <span>Poproś opiekuna oferty o dosłanie dokumentu.</span>
          </div>
        )}
      </section>

      <section style={footerCtaStyle}>
        <div>
          <h2 style={footerTitleStyle}>Następny krok</h2>
          <p style={footerTextStyle}>{offer.warunki || "Po akceptacji oferty skontaktujemy się, aby ustalić szczegóły startu współpracy."}</p>
          {offer.wazna_do && <p style={validStyle}>Oferta ważna do: {formatDate(offer.wazna_do)}</p>}
        </div>
        <button style={primaryButtonStyle} onClick={handleAccept} disabled={accepted}>
          {accepted ? "Dziękujemy za akceptację" : "Akceptuję ofertę"}
        </button>
      </section>
    </main>
  );
}

function getVisitorId() {
  if (typeof window === "undefined") return null;
  const key = "crss_offer_visitor";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem(key, value);
  return value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: colors.background, color: colors.text, padding: "24px" };
const statePageStyle: React.CSSProperties = { ...pageStyle, display: "grid", placeItems: "center", fontWeight: 800 };
const topBarStyle: React.CSSProperties = { maxWidth: "1240px", margin: "0 auto 18px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "18px", alignItems: "end" };
const eyebrowStyle: React.CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850 };
const titleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.08 };
const subtitleStyle: React.CSSProperties = { margin: "10px 0 0", color: colors.muted, fontSize: "16px", lineHeight: 1.6 };
const actionsStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "13px 16px", background: colors.red, color: colors.white, fontWeight: 850, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "12px 15px", background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const viewerShellStyle: React.CSSProperties = { maxWidth: "1240px", height: "calc(100vh - 210px)", minHeight: "620px", margin: "0 auto", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, overflow: "hidden", boxShadow: shadow.soft };
const pdfFrameStyle: React.CSSProperties = { width: "100%", height: "100%", border: "none", display: "block", background: colors.white };
const emptyPdfStyle: React.CSSProperties = { height: "100%", display: "grid", placeItems: "center", gap: "8px", color: colors.muted, textAlign: "center", padding: "32px" };
const footerCtaStyle: React.CSSProperties = { maxWidth: "1240px", margin: "18px auto 0", padding: "22px", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "18px", alignItems: "center" };
const footerTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const footerTextStyle: React.CSSProperties = { margin: "8px 0 0", color: colors.text, lineHeight: 1.7, whiteSpace: "pre-line" };
const validStyle: React.CSSProperties = { color: colors.muted, fontWeight: 800 };
