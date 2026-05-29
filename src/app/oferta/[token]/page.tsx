"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { colors, radius, shadow } from "@/app/design";
import {
  fetchPublicCrmOffer,
  recordCrmOfferDecision,
  trackCrmOfferEvent,
  type CrmOffer,
  type CrmOfferDecision,
} from "@/lib/crmOfferService";

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

const PDFJS_SCRIPT = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const DEFAULT_NEXT_STEP_TEXT =
  "Po wybraniu jednej z opcji opiekun CRSS skontaktuje się z Państwem, aby potwierdzić decyzję i ustalić dalsze kroki.";

export default function PublicOfferPage() {
  const params = useParams<{ token: string }>();
  const [offer, setOffer] = useState<CrmOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [decisionSaving, setDecisionSaving] = useState<CrmOfferDecision | null>(null);
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
      console.error("Błąd pobierania propozycji:", error);
      setOffer(null);
      setLoading(false);
      return;
    }

    setOffer(data as CrmOffer);
    setLoading(false);
  }

  async function handleDecision(decision: CrmOfferDecision) {
    if (!offer || decisionSaving) return;
    setDecisionSaving(decision);
    const { data, error } = await recordCrmOfferDecision(offer.id, decision, visitorId);
    setDecisionSaving(null);
    if (error) {
      alert("Nie udało się zapisać decyzji. Spróbuj ponownie.");
      return;
    }
    setOffer(data as CrmOffer);
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

  if (loading) return <main style={statePageStyle}>Ładowanie propozycji...</main>;
  if (!offer) return <main style={statePageStyle}>Propozycja jest niedostępna albo link wygasł.</main>;

  const decisionLabel = statusDecisionLabel(offer.status);

  return (
    <main style={pageStyle}>
      <section style={topBarStyle}>
        <div>
          <p style={eyebrowStyle}>Propozycja CRSS</p>
          <h1 style={titleStyle}>{offer.tytul}</h1>
          <p style={subtitleStyle}>
            Przygotowana dla: <strong>{offer.przygotowana_dla || "Twojej firmy"}</strong>
            {offer.osoba_kontaktowa ? ` · ${offer.osoba_kontaktowa}` : ""}
          </p>
          {decisionLabel && <p style={decisionStatusStyle}>{decisionLabel}</p>}
        </div>
        <DecisionButtons onDecision={handleDecision} saving={decisionSaving} status={offer.status} />
      </section>

      <section style={viewerShellStyle}>
        {offer.pdf_url && pdfDocument ? (
          <div style={pdfPagesStyle}>
            {Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1).map((pageNumber) => (
              <PdfPageCanvas key={pageNumber} document={pdfDocument} pageNumber={pageNumber} />
            ))}
          </div>
        ) : offer.pdf_url && pdfError ? (
          <iframe src={offer.pdf_url} title="Propozycja PDF" style={pdfFrameStyle} />
        ) : offer.pdf_url ? (
          <div style={emptyPdfStyle}>Przygotowuję podgląd PDF...</div>
        ) : (
          <div style={emptyPdfStyle}>
            <strong>PDF nie został jeszcze dodany.</strong>
            <span>Poproś opiekuna propozycji o dosłanie dokumentu.</span>
          </div>
        )}
      </section>

      <section style={footerCtaStyle}>
        <div>
          <h2 style={footerTitleStyle}>Następny krok</h2>
          <p style={footerTextStyle}>{offer.warunki || DEFAULT_NEXT_STEP_TEXT}</p>
          {offer.wazna_do && <p style={validStyle}>Propozycja ważna do: {formatDate(offer.wazna_do)}</p>}
        </div>
        <DecisionButtons onDecision={handleDecision} saving={decisionSaving} status={offer.status} compact />
      </section>
    </main>
  );
}

function DecisionButtons({ onDecision, saving, status, compact }: { onDecision: (decision: CrmOfferDecision) => void; saving: CrmOfferDecision | null; status: CrmOffer["status"]; compact?: boolean }) {
  const disabled = Boolean(saving);
  return (
    <div style={compact ? footerActionsStyle : actionsStyle}>
      <button style={primaryButtonStyle} onClick={() => onDecision("accepted")} disabled={disabled || status === "accepted"}>
        {saving === "accepted" ? "Zapisywanie..." : status === "accepted" ? "Współpraca potwierdzona" : "Potwierdzam rozpoczęcie współpracy"}
      </button>
      <button style={secondaryButtonStyle} onClick={() => onDecision("discussion_requested")} disabled={disabled || status === "discussion_requested"}>
        {saving === "discussion_requested" ? "Zapisywanie..." : status === "discussion_requested" ? "Prośba o kontakt wysłana" : "Proszę o kontakt w sprawie propozycji"}
      </button>
      <button style={rejectButtonStyle} onClick={() => onDecision("rejected")} disabled={disabled || status === "rejected"}>
        {saving === "rejected" ? "Zapisywanie..." : status === "rejected" ? "Rezygnacja przekazana" : "Rezygnuję z propozycji"}
      </button>
    </div>
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

function statusDecisionLabel(status: CrmOffer["status"]) {
  if (status === "accepted") return "Dziękujemy za potwierdzenie. Opiekun CRSS skontaktuje się z Państwem, aby ustalić dalsze kroki.";
  if (status === "discussion_requested") return "Dziękujemy. Opiekun CRSS skontaktuje się z Państwem, aby omówić propozycję.";
  if (status === "rejected") return "Dziękujemy za informację. Opiekun CRSS odnotuje Państwa decyzję.";
  return null;
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: colors.background, color: colors.text, padding: "24px" };
const statePageStyle: React.CSSProperties = { ...pageStyle, display: "grid", placeItems: "center", fontWeight: 800 };
const topBarStyle: React.CSSProperties = { maxWidth: "1240px", margin: "0 auto 18px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "18px", alignItems: "end" };
const eyebrowStyle: React.CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850 };
const titleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.08 };
const subtitleStyle: React.CSSProperties = { margin: "10px 0 0", color: colors.muted, fontSize: "16px", lineHeight: 1.6 };
const decisionStatusStyle: React.CSSProperties = { display: "inline-flex", margin: "12px 0 0", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 12px", fontWeight: 850 };
const actionsStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" };
const footerActionsStyle: React.CSSProperties = { ...actionsStyle, minWidth: "360px" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "13px 16px", minHeight: "44px", background: colors.red, color: colors.white, fontWeight: 850, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "12px 15px", minHeight: "44px", background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const rejectButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, color: colors.danger, background: "rgba(220, 38, 38, 0.06)" };
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
