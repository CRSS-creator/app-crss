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
  "Wybierz preferowany dalszy krok. Po otrzymaniu decyzji opiekun CRSS wróci z potwierdzeniem i kolejnymi ustaleniami.";
const REJECTION_REASONS = [
  "Zakres propozycji nie odpowiada aktualnym potrzebom",
  "Budżet jest za wysoki",
  "Wybraliśmy inne rozwiązanie",
  "Decyzja została odłożona w czasie",
  "Brakuje nam elementów w propozycji",
  "Inny powód",
];

export default function PublicOfferPage() {
  const params = useParams<{ token: string }>();
  const [offer, setOffer] = useState<CrmOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [decisionSaving, setDecisionSaving] = useState<CrmOfferDecision | null>(null);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pdfError, setPdfError] = useState(false);
  const [showRejectionReason, setShowRejectionReason] = useState(false);
  const [rejectionReason, setRejectionReason] = useState(REJECTION_REASONS[0]);
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

  async function handleDecision(decision: CrmOfferDecision, reason?: string | null) {
    if (!offer || decisionSaving) return;
    if (decision === "rejected" && !reason) {
      setShowRejectionReason(true);
      return;
    }

    setDecisionSaving(decision);
    const { data, error } = await recordCrmOfferDecision(offer.id, decision, visitorId, reason || null);
    setDecisionSaving(null);
    if (error) {
      alert("Nie udało się zapisać decyzji. Spróbuj ponownie.");
      return;
    }
    setShowRejectionReason(false);
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
          <p style={eyebrowStyle}>CRSS</p>
          <h1 style={titleStyle}>{offer.tytul}</h1>
          <p style={subtitleStyle}>
            Przygotowana dla: <strong>{offer.przygotowana_dla || "Twojej firmy"}</strong>
            {offer.osoba_kontaktowa ? ` · ${offer.osoba_kontaktowa}` : ""}
          </p>
          {offer.wazna_do && <p style={validInlineStyle}>Ważna do: {formatDate(offer.wazna_do)}</p>}
          {decisionLabel && <p style={decisionStatusStyle}>{decisionLabel}</p>}
        </div>
        <div style={topActionsStackStyle}>
          {offer.pdf_url && <button style={downloadButtonStyle} onClick={handlePdfDownload}>Pobierz PDF</button>}
          <DecisionButtons onDecision={handleDecision} saving={decisionSaving} status={offer.status} />
        </div>
      </section>

      {showRejectionReason && (
        <section style={rejectionPanelStyle}>
          <div>
            <h2 style={rejectionTitleStyle}>Powód rezygnacji</h2>
            <p style={rejectionTextStyle}>Wybór powodu pomoże nam lepiej odnieść się do Państwa decyzji.</p>
          </div>
          <select style={selectStyle} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)}>
            {REJECTION_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          </select>
          <div style={rejectionActionsStyle}>
            <button style={secondaryButtonStyle} onClick={() => setShowRejectionReason(false)} disabled={Boolean(decisionSaving)}>Anuluj</button>
            <button style={rejectButtonStyle} onClick={() => handleDecision("rejected", rejectionReason)} disabled={Boolean(decisionSaving)}>
              {decisionSaving === "rejected" ? "Zapisywanie..." : "Przekaż rezygnację"}
            </button>
          </div>
        </section>
      )}

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
        <div style={footerIntroStyle}>
          <h2 style={footerTitleStyle}>Co dalej?</h2>
          <p style={footerTextStyle}>{offer.warunki || DEFAULT_NEXT_STEP_TEXT}</p>
          {offer.wazna_do && <p style={validStyle}>Propozycja ważna do: {formatDate(offer.wazna_do)}</p>}
        </div>
        <div style={footerActionStackStyle}>
          {offer.pdf_url && <button style={downloadButtonStyle} onClick={handlePdfDownload}>Pobierz PDF</button>}
          <DecisionButtons onDecision={handleDecision} saving={decisionSaving} status={offer.status} compact />
        </div>
      </section>
    </main>
  );
}

function DecisionButtons({ onDecision, saving, status, compact }: { onDecision: (decision: CrmOfferDecision) => void; saving: CrmOfferDecision | null; status: CrmOffer["status"]; compact?: boolean }) {
  const disabled = Boolean(saving);
  return (
    <div style={compact ? footerActionsStyle : actionsStyle}>
      <button style={primaryButtonStyle} onClick={() => onDecision("accepted")} disabled={disabled || status === "accepted"}>
        {saving === "accepted" ? "Zapisywanie..." : status === "accepted" ? "Współpraca potwierdzona" : "Rozpocznij współpracę"}
      </button>
      <button style={secondaryButtonStyle} onClick={() => onDecision("discussion_requested")} disabled={disabled || status === "discussion_requested"}>
        {saving === "discussion_requested" ? "Zapisywanie..." : status === "discussion_requested" ? "Prośba o kontakt wysłana" : "Umów rozmowę"}
      </button>
      <button style={rejectButtonStyle} onClick={() => onDecision("rejected")} disabled={disabled || status === "rejected"}>
        {saving === "rejected" ? "Zapisywanie..." : status === "rejected" ? "Rezygnacja przekazana" : "Rezygnuję"}
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
      const viewport = page.getViewport({ scale: 2.1 });
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { alpha: false });
      if (!canvas || !context || cancelled) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
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
const validInlineStyle: React.CSSProperties = { display: "inline-flex", margin: "10px 0 0", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.08)", color: colors.navy, padding: "7px 12px", fontWeight: 850, fontSize: "14px" };
const decisionStatusStyle: React.CSSProperties = { display: "inline-flex", margin: "12px 0 0", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 12px", fontWeight: 850 };
const actionsStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" };
const topActionsStackStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-end" };
const footerActionStackStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "12px", width: "100%" };
const footerActionsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", width: "100%" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "12px 14px", minHeight: "46px", background: colors.red, color: colors.white, fontWeight: 850, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center", whiteSpace: "normal" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "12px 14px", minHeight: "46px", background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center", whiteSpace: "normal" };
const downloadButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, width: "100%", minWidth: "150px", background: "#f8fbff" };
const rejectButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, color: colors.danger, background: "rgba(220, 38, 38, 0.06)" };
const rejectionPanelStyle: React.CSSProperties = { maxWidth: "1240px", margin: "0 auto 18px", padding: "18px", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft, display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(280px, 420px) auto", gap: "14px", alignItems: "center" };
const rejectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "20px" };
const rejectionTextStyle: React.CSSProperties = { margin: "6px 0 0", color: colors.muted, lineHeight: 1.5 };
const rejectionActionsStyle: React.CSSProperties = { display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" };
const selectStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "12px", fontWeight: 750 };
const viewerShellStyle: React.CSSProperties = { maxWidth: "1240px", height: "calc(100vh - 210px)", minHeight: "620px", margin: "0 auto", background: "#edf2f7", border: `1px solid ${colors.border}`, borderRadius: radius.card, overflow: "auto", boxShadow: shadow.soft };
const pdfPagesStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "30px", alignItems: "center", padding: "36px 32px 44px" };
const pdfPageStyle: React.CSSProperties = { width: "min(100%, 780px)", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" };
const pageLabelStyle: React.CSSProperties = { alignSelf: "flex-start", color: colors.muted, fontSize: "13px", fontWeight: 850 };
const canvasStyle: React.CSSProperties = { width: "100%", height: "auto", background: colors.white, borderRadius: radius.input, boxShadow: "0 18px 38px rgba(15, 23, 42, 0.12)", imageRendering: "auto" };
const pdfFrameStyle: React.CSSProperties = { width: "100%", height: "100%", border: "none", display: "block", background: colors.white };
const emptyPdfStyle: React.CSSProperties = { height: "100%", display: "grid", placeItems: "center", gap: "8px", color: colors.muted, textAlign: "center", padding: "32px" };
const footerCtaStyle: React.CSSProperties = { maxWidth: "1240px", margin: "18px auto 0", padding: "22px", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "16px" };
const footerIntroStyle: React.CSSProperties = { maxWidth: "760px" };
const footerTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const footerTextStyle: React.CSSProperties = { margin: "8px 0 0", color: colors.text, lineHeight: 1.6, whiteSpace: "pre-line" };
const validStyle: React.CSSProperties = { margin: "10px 0 0", color: colors.muted, fontWeight: 800 };
