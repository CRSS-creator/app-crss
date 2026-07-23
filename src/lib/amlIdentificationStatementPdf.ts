import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { actionTypeLabel, type AmlIdentificationStatementData } from "@/lib/amlIdentificationStatementTypes";

type PdfInput = {
  formToken: string;
  completedAt: Date;
  data: AmlIdentificationStatementData;
};

type PdfContext = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  y: number;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LABEL_WIDTH = 190;
const VALUE_X = MARGIN + LABEL_WIDTH + 14;
const VALUE_WIDTH = CONTENT_WIDTH - LABEL_WIDTH - 14;
const LINE_HEIGHT = 13.5;
const FIELD_GAP = 9;

export async function buildAmlIdentificationStatementPdf(input: PdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFont(), { subset: true });
  const context: PdfContext = { doc, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), font, y: PAGE_HEIGHT - MARGIN };

  drawPageBackground(context.page);
  drawText(context, "Załącznik nr 4. Potwierdzenie identyfikacji i weryfikacji klienta", MARGIN, 15, colors.navy);
  context.y -= 22;
  paragraph(context, "Potwierdzenie służy do udokumentowania, że CRSS wykonała czynności identyfikacyjne i weryfikacyjne wymagane przed rozpoczęciem współpracy albo w toku aktualizacji danych klienta.", 9.3);

  section(context, "Dane czynności");
  field(context, "Nazwa albo imię i nazwisko klienta", input.data.clientName);
  field(context, "NIP, PESEL, KRS albo inny identyfikator", input.data.clientIdentifier);
  field(context, "Data weryfikacji", input.data.verificationDate);
  field(context, "Osoba dokonująca weryfikacji", input.data.verifiedBy);
  field(context, "Rodzaj czynności", actionTypeLabel(input.data.actionType));
  field(context, "Token oświadczenia", input.formToken);

  section(context, "Identyfikacja i weryfikacja klienta");
  paragraph(context, "Potwierdzam, że przeprowadzono identyfikację i weryfikację klienta w zakresie wymaganym dla jego formy prawnej, w tym danych identyfikacyjnych, rejestrowych, reprezentacji oraz podstawowych informacji o działalności.", 9.3);
  field(context, "Źródła weryfikacji", input.data.clientVerificationSources);
  field(context, "Wynik weryfikacji klienta", resultLabel(input.data.clientVerificationResult));
  field(context, "Uwagi", input.data.clientNotes);

  section(context, "Identyfikacja beneficjenta rzeczywistego");
  paragraph(context, "Potwierdzam, że przeprowadzono identyfikację beneficjenta rzeczywistego oraz podjęto uzasadnione czynności w celu weryfikacji jego tożsamości.", 9.3);
  field(context, "Imię i nazwisko beneficjenta rzeczywistego", input.data.beneficialOwnerName);
  field(context, "Rodzaj kontroli", input.data.beneficialOwnerControlType);
  field(context, "Źródła danych", input.data.beneficialOwnerSources.join(", "));
  field(context, "Struktura własności i kontroli została ustalona", yesNo(input.data.ownershipStructureEstablished));
  field(context, "Dane są spójne z rejestrami i dokumentami", yesNo(input.data.beneficialOwnerDataConsistent));
  field(context, "Występują rozbieżności wymagające wyjaśnienia", yesNo(input.data.discrepanciesRequireExplanation));
  field(context, "Opis rozbieżności albo uwag", input.data.discrepancyNotes);

  section(context, "Weryfikacja zdalna i podpis elektroniczny");
  field(context, "Umowa albo dokumenty podpisane zdalnie", yesNo(input.data.remoteSigned));
  field(context, "Narzędzie podpisu elektronicznego", input.data.electronicSignatureTool);
  field(context, "Weryfikacja tożsamości przez mObywatel", yesNo(input.data.mobywatelVerification));

  section(context, "Wynik potwierdzenia");
  field(context, "Pozytywny", yesNo(input.data.finalPositive));
  field(context, "Wymagający uzupełnienia", yesNo(input.data.finalRequiresCompletion));
  field(context, "Negatywny", yesNo(input.data.finalNegative));
  field(context, "Opis wymaganych uzupełnień albo decyzji", input.data.finalNotes);
  field(context, "Data", input.data.verificationDate);
  field(context, "Osoba dokonująca weryfikacji", input.data.verifiedBy);
  field(context, "Data zapisu PDF", input.completedAt.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }));

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function readFont() {
  const paths = [
    join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"),
    join(process.cwd(), "src/assets/fonts/NotoSans-Regular.ttf"),
  ];
  const fontPath = paths.find((path) => existsSync(path));
  if (!fontPath) throw new Error("Brak fontu NotoSans-Regular.ttf do wygenerowania oświadczenia AML.");
  return readFileSync(fontPath);
}

const colors = {
  navy: rgb(0.09, 0.23, 0.45),
  text: rgb(0.04, 0.12, 0.25),
  muted: rgb(0.31, 0.38, 0.5),
  border: rgb(0.78, 0.84, 0.91),
  background: rgb(1, 1, 1),
};

function drawPageBackground(page: PDFPage) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: colors.background });
}

function ensureSpace(context: PdfContext, height: number) {
  if (context.y - height >= MARGIN) return;
  context.page = context.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageBackground(context.page);
  context.y = PAGE_HEIGHT - MARGIN;
}

function drawText(context: PdfContext, text: string, x: number, size: number, color = colors.text) {
  context.page.drawText(text, { x, y: context.y, size, font: context.font, color });
}

function section(context: PdfContext, title: string) {
  ensureSpace(context, 44);
  context.y -= 10;
  drawText(context, title, MARGIN, 13, colors.navy);
  context.y -= 15;
  context.page.drawRectangle({ x: MARGIN, y: context.y, width: CONTENT_WIDTH, height: 1, color: colors.border });
  context.y -= 17;
}

function field(context: PdfContext, label: string, value: string | null | undefined) {
  const labelLines = wrapText(`${label}:`, LABEL_WIDTH, 8.2, context.font);
  const valueLines = wrapText(displayValue(value), VALUE_WIDTH, 9.3, context.font);
  const lineCount = Math.max(labelLines.length, valueLines.length);
  const height = lineCount * LINE_HEIGHT + FIELD_GAP;
  ensureSpace(context, height);
  const startY = context.y;
  labelLines.forEach((line, index) => {
    context.page.drawText(line, { x: MARGIN, y: startY - index * LINE_HEIGHT, size: 8.2, font: context.font, color: colors.muted });
  });
  valueLines.forEach((line, index) => {
    context.page.drawText(line, { x: VALUE_X, y: startY - index * LINE_HEIGHT, size: 9.3, font: context.font, color: colors.text });
  });
  context.y -= height;
}

function paragraph(context: PdfContext, value: string, size = 9.3) {
  const lines = wrapText(value, CONTENT_WIDTH, size, context.font);
  ensureSpace(context, lines.length * LINE_HEIGHT + 8);
  lines.forEach((line, index) => {
    context.page.drawText(line, { x: MARGIN, y: context.y - index * LINE_HEIGHT, size, font: context.font, color: colors.text });
  });
  context.y -= lines.length * LINE_HEIGHT + 8;
}

function wrapText(value: string, width: number, size: number, font: PDFFont) {
  const words = displayValue(value).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ["-"];
}

function displayValue(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || "-";
}

function yesNo(value: string) {
  if (value === "tak") return "TAK";
  if (value === "nie") return "NIE";
  return "-";
}

function resultLabel(value: string) {
  if (value === "pozytywny") return "pozytywny";
  if (value === "wymaga_wyjasnien") return "wymaga wyjaśnień";
  if (value === "negatywny") return "negatywny";
  return "-";
}
