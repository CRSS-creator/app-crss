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

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

const PDFJS_SCRIPT = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

export default function PublicOfferPage() {
  const params = useParams<{ token: string }>();
  const [offer, setOffer] = useState<CrmOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pdfError, setPdfError] = useState(false);
  const activePageRef = useRef<number | null>(null);
  const previousVisiblePageRef = useRef<number | null>(null);
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
    if (!offer?.pdf_url) return;

    let cancelled = false;
    setPdfDocument(null);
    setPdfError(false);

    loadPdfJs()
      .then(async (pdfjsLib) => {
        const task = pdfjsLib.getDocument({ url: offer.pdf_url, withCredentials: false });
        const document = await task.promise;
        if (!cancelled) setPdfDocument(document);
      })
      .catch((error) => {
        console.error("Błąd renderowania PDF:", error);
        if (!cancelled) setPdfError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [offer?.pdf_url]);

  useEffect(() => {
    if (!offer || !pdfDocument) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

        if (!(visible?.target instanceof HTMLElement)) return;

        const pageNumber = Number(visible.target.dataset.pdfPage || 0);
        if (!pageNumber) return;

        activePageRef.current = pageNumber;
        if (previousVisiblePageRef.current !== pageNumber) {
          previousVisiblePageRef.current = pageNumber;
          trackCrmOfferEvent({
            oferta_id: offer.id,
            event_type: "section_time",
            section_key: `pdf_page_${pageNumber}`,
            visitor_id: visitorId,
            duration_seconds: 0,
            metadata: { page_number: pageNumber, action: "page_visible" },
          });
        }
      },
      { threshold: [0.35, 0.55, 0.75] }
    );

    document.querySelectorAll("[data-pdf-page]").forEach((page) => observer.observe(page));

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const pageNumber = activePageRef.current;
      if (!pageNumber) return;

      trackCrmOfferEvent({
        oferta_id: offer.id,
        event_type: "section_time",
        section_key: `pdf_page_${pageNumber}`,
        visitor_id: visitorId,
        duration_seconds: 5,
        metadata: { page_number: pageNumber, action: "page_time" },
      });
    }, 5000);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [offer?.id, pdfDocument, visitorId]);

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
        {offer.pdf_url && pdfDocument ? (
          <div style={pdfPagesStyle}>
            {Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1).map((pageNumber) => (
              <PdfPageCanvas key={pageNumber} document={pdfDocument} pageNumber={pageNumber} />
            ))}
          </div>
        ) : offer.pdf_url && pdfError ? (
          <iframe src={offer.pdf_url} title="Oferta PDF" style={pdfFrameStyle} />
        ) : offer.pdf_url ? (
          <div style={emptyPdfStyle}>Przygotowuję podgląd PDF...</div>
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

function PdfPageCanvas({ document, pageNumber }: { document: any; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.35 });
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context || cancelled) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
    }

    renderPage().catch((error) => console.error(`Błąd renderowania strony PDF ${pageNumber}:`, error));

    return () => {
      cancelled = true;
    };
  }, [document, pageNumber]);

  return (
    <article data-pdf-page={pageNumber} style={pdfPageStyle}>
      <div style={pageLabelStyle}>Strona {pageNumber}</div>
      <canvas ref={canvasRef} style={canvasStyle} />
    </article>
  );
}

function loadPdfJs() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return Promise.resolve(window.pdfjsLib);
  }

  return new Promise<any>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${PDFJS_SCRIPT}"]`);

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (!window.pdfjsLib) reject(new Error("PDF.js nie jest dostępny."));
        else {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
          resolve(window.pdfjsLib);
        }
      });
      existingScript.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = PDFJS_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (!window.pdfjsLib) reject(new Error("PDF.js nie jest dostępny."));
      else {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      }
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
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
const viewerShellStyle: React.CSSProperties = { maxWidth: "1240px", height: "calc(100vh - 210px)", minHeight: "620px", margin: "0 auto", background: "#eef2f7", border: `1px solid ${colors.border}`, borderRadius: radius.card, overflow: "auto", boxShadow: shadow.soft };
const pdfPagesStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "22px", alignItems: "center", padding: "24px" };
const pdfPageStyle: React.CSSProperties = { width: "min(100%, 920px)", display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" };
const pageLabelStyle: React.CSSProperties = { alignSelf: "flex-start", color: colors.muted, fontSize: "13px", fontWeight: 850 };
const canvasStyle: React.CSSProperties = { width: "100%", height: "auto", background: colors.white, borderRadius: radius.input, boxShadow: shadow.soft };
const pdfFrameStyle: React.CSSProperties = { width: "100%", height: "100%", border: "none", display: "block", background: colors.white };
const emptyPdfStyle: React.CSSProperties = { height: "100%", display: "grid", placeItems: "center", gap: "8px", color: colors.muted, textAlign: "center", padding: "32px" };
const footerCtaStyle: React.CSSProperties = { maxWidth: "1240px", margin: "18px auto 0", padding: "22px", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "18px", alignItems: "center" };
const footerTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const footerTextStyle: React.CSSProperties = { margin: "8px 0 0", color: colors.text, lineHeight: 1.7, whiteSpace: "pre-line" };
const validStyle: React.CSSProperties = { color: colors.muted, fontWeight: 800 };
