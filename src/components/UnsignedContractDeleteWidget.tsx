"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createCrmContractSignedUrl,
  deleteUnsignedCrmContract,
  fetchCrmContracts,
  uploadCrmContractPdf,
  type CrmContract,
  type CrmContractType,
} from "@/lib/crmContractService";
import { colors, radius, shadow } from "@/app/design";

declare global {
  interface Window {
    PDFLib?: any;
    fontkit?: any;
  }
}

type ContractDraftFromDrawer = {
  typ_umowy: CrmContractType;
  numer_umowy: string;
  data_zawarcia: string;
  miejsce_zawarcia: string;
  pierwszy_okres: string;
  nazwa_klienta: string;
  siedziba: string;
  rejestr: string;
  krs: string;
  nip: string;
  reprezentant: string;
  email_klienta: string;
  abonament_netto: string;
  limit_dokumentow: string;
  ustalenia_indywidualne: string;
};

const PDF_LIB_SCRIPT = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
const PDF_FONTKIT_SCRIPT = "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js";
const PDF_FONT_REGULAR = "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";
const PDF_FONT_BOLD = "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf";

export default function UnsignedContractDeleteWidget() {
  const [open, setOpen] = useState(false);
  const [contracts, setContracts] = useState<CrmContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const removableContracts = useMemo(
    () => contracts.filter((contract) => contract.status !== "podpisana" && !contract.podpisany_pdf_path),
    [contracts]
  );

  const filteredRemovableContracts = useMemo(() => {
    const query = normalize(searchQuery);
    if (!query) return removableContracts;

    return removableContracts.filter((contract) =>
      [
        contract.numer_umowy,
        contract.nazwa_klienta,
        contract.wygenerowany_pdf_name,
        contract.typ_umowy,
        statusLabel(contract.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [removableContracts, searchQuery]);

  useEffect(() => {
    function interceptGenerateClick(event: MouseEvent) {
      const button = (event.target as HTMLElement | null)?.closest("button");
      if (!button || button.textContent?.trim() !== "Generuj PDF") return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void generateFromCurrentDrawer();
    }

    document.addEventListener("click", interceptGenerateClick, true);
    return () => document.removeEventListener("click", interceptGenerateClick, true);
  }, []);

  async function openPanel() {
    setOpen(true);
    setSearchQuery("");
    setLoading(true);
    const result = await fetchCrmContracts();
    setLoading(false);

    if (result.error) {
      console.error("Błąd pobierania umów do usunięcia:", result.error);
      alert("Nie udało się pobrać listy umów.");
      return;
    }

    setContracts((result.data || []) as CrmContract[]);
  }

  async function generateFromCurrentDrawer() {
    if (generating) return;

    const draft = readContractDraftFromDrawer();
    if (!draft) {
      alert("Otwórz szczegóły zapisanej umowy i spróbuj ponownie.");
      return;
    }

    setGenerating(true);
    const contractsResult = await fetchCrmContracts();

    if (contractsResult.error) {
      setGenerating(false);
      console.error("Błąd pobierania umów:", contractsResult.error);
      alert("Nie udało się pobrać umowy z rejestru.");
      return;
    }

    const matchingContract = findMatchingContract((contractsResult.data || []) as CrmContract[], draft);
    if (!matchingContract) {
      setGenerating(false);
      alert("Najpierw zapisz umowę w rejestrze, a potem wygeneruj PDF z wzoru.");
      return;
    }

    try {
      const file = await buildTemplateContractPdf(draft);
      const uploadResult = await uploadCrmContractPdf(matchingContract.id, file, "generated");

      if (uploadResult.error || !uploadResult.data) {
        console.error("Błąd zapisu PDF umowy:", uploadResult.error);
        alert("Nie udało się zapisać wygenerowanego PDF.");
        return;
      }

      alert("Umowa została wygenerowana na oryginalnym wzorze PDF. Zmienione są tylko wykropkowane pola.");
      window.location.reload();
    } catch (error) {
      console.error("Błąd generowania PDF z wzoru:", error);
      alert("Nie udało się wygenerować PDF z wzoru.");
    } finally {
      setGenerating(false);
    }
  }

  async function openPdf(path: string | null) {
    if (!path) return;
    const result = await createCrmContractSignedUrl(path);
    if (result.error || !result.data?.signedUrl) {
      alert("Nie udało się otworzyć PDF.");
      return;
    }

    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteContract(contract: CrmContract) {
    const confirmed = window.confirm("Usunąć tę umowę i wygenerowany PDF? Tej operacji nie można cofnąć.");
    if (!confirmed) return;

    setDeletingId(contract.id);
    const result = await deleteUnsignedCrmContract(contract);
    setDeletingId(null);

    if (result.error) {
      console.error("Błąd usuwania umowy:", result.error);
      alert("Nie udało się usunąć umowy.");
      return;
    }

    setContracts((current) => current.filter((item) => item.id !== contract.id));
    window.location.reload();
  }

  return (
    <>
      <button type="button" style={triggerStyle} onClick={openPanel}>Usuń umowę</button>

      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <aside style={panelStyle} onClick={(event) => event.stopPropagation()}>
            <div style={headerStyle}>
              <div>
                <p style={eyebrowStyle}>Umowy</p>
                <h2 style={titleStyle}>Usuń niepodpisaną umowę</h2>
                <p style={subtitleStyle}>Usuwane są tylko umowy bez podpisanego PDF i bez statusu „Podpisana”.</p>
              </div>
              <button type="button" style={closeStyle} onClick={() => setOpen(false)}>×</button>
            </div>

            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Szukaj po numerze, kliencie, statusie lub PDF"
              style={searchInputStyle}
            />

            {loading ? (
              <div style={emptyStyle}>Ładowanie umów...</div>
            ) : removableContracts.length === 0 ? (
              <div style={emptyStyle}>Brak umów możliwych do usunięcia.</div>
            ) : filteredRemovableContracts.length === 0 ? (
              <div style={emptyStyle}>Brak umów pasujących do wyszukiwania.</div>
            ) : (
              <div style={listStyle}>
                {filteredRemovableContracts.map((contract) => (
                  <div key={contract.id} style={itemStyle}>
                    <div>
                      <strong style={itemTitleStyle}>{contract.numer_umowy || contract.nazwa_klienta || "Umowa bez numeru"}</strong>
                      <p style={itemMetaStyle}>{contract.nazwa_klienta || "Bez klienta"} · {statusLabel(contract.status)}</p>
                      <p style={itemMetaStyle}>{contract.wygenerowany_pdf_name || "Brak wygenerowanego PDF"}</p>
                    </div>
                    <div style={actionsStyle}>
                      {contract.wygenerowany_pdf_path && (
                        <button type="button" style={secondaryStyle} onClick={() => openPdf(contract.wygenerowany_pdf_path)}>PDF</button>
                      )}
                      <button
                        type="button"
                        style={dangerStyle}
                        onClick={() => deleteContract(contract)}
                        disabled={deletingId === contract.id}
                      >
                        {deletingId === contract.id ? "Usuwanie..." : "Usuń"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function readContractDraftFromDrawer(): ContractDraftFromDrawer | null {
  const drawer = document.querySelector<HTMLElement>("aside");
  if (!drawer) return null;

  const read = (label: string) => {
    const rows = Array.from(drawer.querySelectorAll<HTMLElement>("label, div"));
    const row = rows.find((item) => item.querySelector("span")?.textContent?.trim() === label);
    const field = row?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
    return field?.value?.trim() || "";
  };

  const typeValue = read("Typ umowy");
  const typ_umowy: CrmContractType = typeValue === "KU" ? "KU" : "KH";

  return {
    typ_umowy,
    numer_umowy: read("Numer umowy"),
    data_zawarcia: read("Data zawarcia"),
    miejsce_zawarcia: read("Miejsce zawarcia"),
    pierwszy_okres: read("Pierwszy okres"),
    nazwa_klienta: read("Nazwa klienta"),
    siedziba: read("Siedziba"),
    rejestr: read("Rejestr"),
    krs: read("KRS"),
    nip: read("NIP"),
    reprezentant: read("Reprezentant"),
    email_klienta: read("Email klienta"),
    abonament_netto: read("Abonament netto"),
    limit_dokumentow: read("Limit dokumentów") || read("Limit pozycji"),
    ustalenia_indywidualne: read("Ustalenia indywidualne"),
  };
}

function findMatchingContract(contracts: CrmContract[], draft: ContractDraftFromDrawer) {
  const byNumber = draft.numer_umowy
    ? contracts.find((contract) => normalize(contract.numer_umowy) === normalize(draft.numer_umowy))
    : null;
  if (byNumber) return byNumber;

  return contracts.find((contract) =>
    contract.typ_umowy === draft.typ_umowy &&
    normalize(contract.nazwa_klienta) === normalize(draft.nazwa_klienta)
  ) || null;
}

async function buildTemplateContractPdf(draft: ContractDraftFromDrawer) {
  const PDFLib = await loadPdfLib();
  const fontkit = await loadPdfFontkit();
  const templatePath = draft.typ_umowy === "KH" ? "/templates/umowa-crss-kh.pdf" : "/templates/umowa-crss-ku.pdf";
  const pdfDoc = await PDFLib.PDFDocument.load(await fetchArrayBuffer(templatePath));
  pdfDoc.registerFontkit(fontkit);

  const [regularFontBytes, boldFontBytes] = await Promise.all([
    fetchArrayBuffer(PDF_FONT_REGULAR),
    fetchArrayBuffer(PDF_FONT_BOLD),
  ]);
  const regularFont = await pdfDoc.embedFont(regularFontBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: true });
  const textColor = PDFLib.rgb(0.06, 0.16, 0.37);
  const white = PDFLib.rgb(1, 1, 1);
  const pages = pdfDoc.getPages();

  const draw = (pageIndex: number, text: string, x: number, y: number, width: number, options: { size?: number; bold?: boolean } = {}) => {
    const value = text?.trim();
    if (!value || !pages[pageIndex]) return;
    const size = options.size || 10.3;
    const page = pages[pageIndex];
    page.drawRectangle({ x: x - 1, y: y - 2, width, height: size + 6, color: white });
    page.drawText(value, { x, y, size, font: options.bold ? boldFont : regularFont, color: textColor, maxWidth: width - 4 });
  };

  const drawMultiline = (pageIndex: number, text: string, x: number, y: number, width: number, lineHeight = 13.8, maxLines = 5) => {
    const value = text?.trim();
    if (!value || !pages[pageIndex]) return;
    const page = pages[pageIndex];
    page.drawRectangle({ x: x - 1, y: y - (lineHeight * (maxLines - 1)) - 4, width, height: lineHeight * maxLines + 8, color: white });
    wrapText(value, regularFont, 10.1, width - 4).slice(0, maxLines).forEach((line, index) => {
      page.drawText(line, { x, y: y - index * lineHeight, size: 10.1, font: regularFont, color: textColor });
    });
  };

  draw(0, draft.numer_umowy, 245, 636.7, 160, { size: 12.5, bold: true });
  draw(0, formatDisplayDate(draft.data_zawarcia), 141, 591.1, 110);
  draw(0, draft.miejsce_zawarcia, 319, 591.1, 130);
  draw(0, draft.nazwa_klienta, 62.4, 571.3, 480);
  draw(0, draft.siedziba, 128, 551.5, 390);
  draw(0, draft.rejestr, 120, 531.5, 395);

  if (draft.typ_umowy === "KH") {
    draw(0, draft.krs, 144, 511.8, 160);
    draw(0, draft.nip, 144, 491.9, 160);
    draw(0, draft.reprezentant, 181, 472.1, 320);
    draw(1, draft.pierwszy_okres, 375, 475.3, 105);
    draw(4, draft.abonament_netto, 374, 192.4, 105);
    draw(4, draft.limit_dokumentow, 385, 178.6, 95);
    draw(9, draft.email_klienta, 313, 572.1, 210);
    drawMultiline(9, draft.ustalenia_indywidualne, 62.4, 366.3, 470);
  } else {
    draw(0, draft.nip, 144, 511.8, 160);
    draw(0, draft.reprezentant, 181, 491.9, 320);
    draw(1, draft.pierwszy_okres, 375, 419.9, 105);
    draw(5, draft.abonament_netto, 374, 544.4, 105);
    draw(5, draft.limit_dokumentow, 385, 530.6, 95);
    draw(9, draft.email_klienta, 313, 469.1, 210);
    drawMultiline(9, draft.ustalenia_indywidualne, 62.4, 263.3, 470);
  }

  const bytes = await pdfDoc.save();
  const fileName = sanitizePdfFileName(`Umowa CRSS ${draft.typ_umowy} ${draft.nazwa_klienta || "klient"}.pdf`);
  return new File([new Blob([bytes], { type: "application/pdf" })], fileName, { type: "application/pdf" });
}

async function loadPdfLib() {
  if (!window.PDFLib) await loadExternalScript(PDF_LIB_SCRIPT);
  if (!window.PDFLib) throw new Error("PDF-lib nie jest dostępny.");
  return window.PDFLib;
}

async function loadPdfFontkit() {
  if (!window.fontkit) await loadExternalScript(PDF_FONTKIT_SCRIPT);
  if (!window.fontkit) throw new Error("Fontkit nie jest dostępny.");
  return window.fontkit;
}

function loadExternalScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Nie udało się załadować ${src}`));
    document.head.appendChild(script);
  });
}

async function fetchArrayBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nie udało się pobrać zasobu PDF: ${url}`);
  return response.arrayBuffer();
}

function wrapText(text: string, font: any, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : [""];
}

function formatDisplayDate(value: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("pl-PL");
}

function sanitizePdfFileName(value: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "umowa"}.pdf`;
}

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function statusLabel(status: CrmContract["status"]) {
  const labels: Record<CrmContract["status"], string> = {
    szkic: "Szkic",
    wygenerowana: "Wygenerowana",
    wyslana_do_podpisu: "Wysłana do podpisu",
    podpisana: "Podpisana",
    anulowana: "Anulowana",
  };
  return labels[status] || status;
}

const triggerStyle: React.CSSProperties = {
  position: "fixed",
  right: "28px",
  bottom: "28px",
  zIndex: 40,
  border: "1px solid #fecdd3",
  borderRadius: radius.button,
  padding: "12px 16px",
  background: "#fff1f2",
  color: "#be123c",
  fontWeight: 850,
  cursor: "pointer",
  boxShadow: shadow.soft,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 70,
  background: "rgba(15, 23, 42, 0.32)",
  display: "flex",
  justifyContent: "flex-end",
};

const panelStyle: React.CSSProperties = {
  width: "560px",
  maxWidth: "100%",
  minHeight: "100vh",
  background: colors.card,
  borderLeft: `1px solid ${colors.border}`,
  padding: "28px",
  boxShadow: "-12px 0 30px rgba(15, 23, 42, 0.12)",
  overflowY: "auto",
};

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", marginBottom: "22px" };
const eyebrowStyle: React.CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "28px", lineHeight: 1.15 };
const subtitleStyle: React.CSSProperties = { margin: "10px 0 0", color: colors.muted, lineHeight: 1.55 };
const closeStyle: React.CSSProperties = { width: "42px", height: "42px", borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontSize: "24px", cursor: "pointer" };
const searchInputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "12px 14px", marginBottom: "16px", background: colors.inputBackground, color: colors.text, fontWeight: 700, outline: "none" };
const emptyStyle: React.CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "18px", color: colors.muted, fontWeight: 750, textAlign: "center" };
const listStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "12px" };
const itemStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "14px", display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center", background: colors.white };
const itemTitleStyle: React.CSSProperties = { color: colors.navy, fontSize: "16px" };
const itemMetaStyle: React.CSSProperties = { margin: "6px 0 0", color: colors.muted, fontWeight: 650, lineHeight: 1.4 };
const actionsStyle: React.CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" };
const secondaryStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "9px 12px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer" };
const dangerStyle: React.CSSProperties = { ...secondaryStyle, background: "#fff1f2", borderColor: "#fecdd3", color: "#be123c" };
