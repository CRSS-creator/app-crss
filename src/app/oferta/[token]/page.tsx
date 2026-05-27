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

const SECTIONS = [
  { key: "summary", label: "Podsumowanie rozmowy" },
  { key: "needs", label: "Najważniejsze potrzeby" },
  { key: "package", label: "Rekomendowany pakiet" },
  { key: "scope", label: "Zakres współpracy" },
  { key: "terms", label: "Warunki" },
];

export default function PublicOfferPage() {
  const params = useParams<{ token: string }>();
  const [offer, setOffer] = useState<CrmOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const activeSectionRef = useRef<string | null>(null);
  const visitorId = useMemo(() => getVisitorId(), []);

  useEffect(() => {
    loadOffer();
  }, [params.token]);

  useEffect(() => {
    if (!offer) return;

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

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

        if (visible?.target instanceof HTMLElement) {
          activeSectionRef.current = visible.target.dataset.section || null;
        }
      },
      { threshold: [0.35, 0.6, 0.8] }
    );

    document.querySelectorAll("[data-section]").forEach((section) => observer.observe(section));

    const timer = window.setInterval(() => {
      const sectionKey = activeSectionRef.current;
      if (!sectionKey) return;

      trackCrmOfferEvent({
        oferta_id: offer.id,
        event_type: "section_time",
        section_key: sectionKey,
        visitor_id: visitorId,
        duration_seconds: 5,
      });
    }, 5000);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
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
    });

    window.open(offer.pdf_url, "_blank", "noopener,noreferrer");
  }

  if (loading) return <main style={statePageStyle}>Ładowanie oferty...</main>;
  if (!offer) return <main style={statePageStyle}>Oferta jest niedostępna albo link wygasł.</main>;

  const prices = [
    { label: "Standard", value: offer.cena_standard },
    { label: "Premium", value: offer.cena_premium },
    { label: "Wdrożenie", value: offer.cena_wdrozenia },
  ].filter((item) => item.value !== null && item.value !== undefined);

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={heroInnerStyle}>
          <p style={eyebrowStyle}>Oferta CRSS</p>
          <h1 style={titleStyle}>{offer.tytul}</h1>
          <p style={subtitleStyle}>
            Przygotowana dla: <strong>{offer.przygotowana_dla || "Twojej firmy"}</strong>
            {offer.osoba_kontaktowa ? ` · ${offer.osoba_kontaktowa}` : ""}
          </p>

          <div style={heroActionsStyle}>
            <button style={primaryButtonStyle} onClick={handleAccept} disabled={accepted}>
              {accepted ? "Oferta zaakceptowana" : "Akceptuję ofertę"}
            </button>
            <button style={secondaryButtonStyle} onClick={handleCtaClick}>{offer.cta_label}</button>
            {offer.pdf_url && <button style={secondaryButtonStyle} onClick={handlePdfDownload}>Pobierz PDF</button>}
          </div>
        </div>
      </section>

      <nav style={navStyle}>
        {SECTIONS.map((section) => (
          <a key={section.key} href={`#${section.key}`} style={navItemStyle}>{section.label}</a>
        ))}
      </nav>

      <section id="summary" data-section="summary" style={sectionStyle}>
        <p style={sectionEyebrowStyle}>01</p>
        <h2 style={sectionTitleStyle}>Podsumowanie rozmowy</h2>
        <p style={bodyStyle}>{offer.podsumowanie_rozmowy || "Uzupełnimy tę część po rozmowie z klientem."}</p>
      </section>

      <section id="needs" data-section="needs" style={sectionStyle}>
        <p style={sectionEyebrowStyle}>02</p>
        <h2 style={sectionTitleStyle}>Najważniejsze potrzeby</h2>
        <p style={bodyStyle}>{offer.potrzeby_klienta || "Tu pojawią się potrzeby i priorytety wskazane podczas rozmowy."}</p>
      </section>

      <section id="package" data-section="package" style={sectionStyle}>
        <p style={sectionEyebrowStyle}>03</p>
        <h2 style={sectionTitleStyle}>Rekomendowany pakiet</h2>
        <div style={packageGridStyle}>
          <div>
            <strong style={packageNameStyle}>{offer.rekomendowany_pakiet}</strong>
            <p style={bodyStyle}>{offer.opis_pakietu || "Zakres pakietu zostanie dopasowany do potrzeb klienta."}</p>
          </div>
          {prices.length > 0 && (
            <div style={priceBoxStyle}>
              {prices.map((price) => (
                <div key={price.label} style={priceRowStyle}>
                  <span>{price.label}</span>
                  <strong>{formatMoney(price.value || 0)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="scope" data-section="scope" style={sectionStyle}>
        <p style={sectionEyebrowStyle}>04</p>
        <h2 style={sectionTitleStyle}>Zakres współpracy</h2>
        <p style={bodyStyle}>{offer.zakres || "W tej sekcji opisujemy, co dokładnie przejmuje zespół CRSS."}</p>
      </section>

      <section id="terms" data-section="terms" style={sectionStyle}>
        <p style={sectionEyebrowStyle}>05</p>
        <h2 style={sectionTitleStyle}>Warunki i następny krok</h2>
        <p style={bodyStyle}>{offer.warunki || "Po akceptacji oferty skontaktujemy się, aby ustalić szczegóły startu współpracy."}</p>
        {offer.wazna_do && <p style={validStyle}>Oferta ważna do: {formatDate(offer.wazna_do)}</p>}
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

function formatMoney(value: number) {
  return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: colors.background, color: colors.text };
const statePageStyle: React.CSSProperties = { ...pageStyle, display: "grid", placeItems: "center", fontWeight: 800 };
const heroStyle: React.CSSProperties = { background: colors.navy, color: colors.white, padding: "68px 28px 54px" };
const heroInnerStyle: React.CSSProperties = { maxWidth: "1120px", margin: "0 auto" };
const eyebrowStyle: React.CSSProperties = { margin: "0 0 12px", color: "#f8b4c2", fontWeight: 850 };
const titleStyle: React.CSSProperties = { margin: 0, maxWidth: "900px", fontSize: "clamp(36px, 6vw, 72px)", lineHeight: 1.02 };
const subtitleStyle: React.CSSProperties = { margin: "18px 0 0", fontSize: "18px", lineHeight: 1.7, color: "rgba(255,255,255,0.82)" };
const heroActionsStyle: React.CSSProperties = { display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "28px" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "14px 18px", background: colors.red, color: colors.white, fontWeight: 850, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.28)", borderRadius: radius.button, padding: "14px 18px", background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const navStyle: React.CSSProperties = { maxWidth: "1120px", margin: "0 auto", padding: "18px 28px", display: "flex", gap: "10px", flexWrap: "wrap" };
const navItemStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.badge, padding: "9px 12px", background: colors.card, color: colors.navy, textDecoration: "none", fontWeight: 800, fontSize: "13px" };
const sectionStyle: React.CSSProperties = { maxWidth: "1120px", margin: "18px auto", padding: "34px", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft };
const sectionEyebrowStyle: React.CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850 };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "30px" };
const bodyStyle: React.CSSProperties = { whiteSpace: "pre-line", fontSize: "17px", lineHeight: 1.8, color: colors.text };
const packageGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, 0.6fr)", gap: "22px", alignItems: "start" };
const packageNameStyle: React.CSSProperties = { display: "block", marginTop: "18px", color: colors.navy, fontSize: "28px" };
const priceBoxStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "18px", background: colors.inputBackground };
const priceRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "14px", padding: "10px 0", borderBottom: `1px solid ${colors.border}` };
const validStyle: React.CSSProperties = { color: colors.muted, fontWeight: 800 };
