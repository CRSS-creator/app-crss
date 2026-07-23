import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  assessmentBasisLabel,
  BEHAVIORAL_FACTOR_FIELDS,
  CHANNEL_FACTOR_FIELDS,
  CLIENT_FACTOR_FIELDS,
  DATA_SOURCE_FIELDS,
  DECISION_FIELDS,
  GEOGRAPHIC_FACTOR_FIELDS,
  INDUSTRY_FACTOR_FIELDS,
  PEP_SANCTIONS_FIELDS,
  riskLevelLabel,
  type AmlRiskAssessmentData,
} from "@/lib/amlRiskAssessmentTypes";

type PdfInput = {
  formToken: string;
  completedAt: Date;
  data: AmlRiskAssessmentData;
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
const LABEL_WIDTH = 210;
const VALUE_X = MARGIN + LABEL_WIDTH + 12;
const VALUE_WIDTH = CONTENT_WIDTH - LABEL_WIDTH - 12;
const LINE_HEIGHT = 13.2;
const FIELD_GAP = 8;

export async function buildAmlRiskAssessmentPdf(input: PdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFont(), { subset: true });
  const context: PdfContext = { doc, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), font, y: PAGE_HEIGHT - MARGIN };

  drawPageBackground(context.page);
  drawText(context, "Karta oceny ryzyka AML klienta", MARGIN, 15, colors.navy);
  context.y -= 22;
  paragraph(context, "Karta służy do udokumentowania indywidualnej oceny ryzyka prania pieniędzy oraz finansowania terroryzmu związanego z klientem, stosunkami gospodarczymi albo transakcją okazjonalną.", 9.3);

  section(context, "Dane identyfikacyjne karty");
  field(context, "Nazwa albo imię i nazwisko klienta", input.data.clientName);
  field(context, "NIP, PESEL, KRS albo inny identyfikator", input.data.clientIdentifier);
  field(context, "Data sporządzenia oceny ryzyka", input.data.assessmentDate);
  field(context, "Osoba sporządzająca ocenę ryzyka", input.data.assessedBy);
  field(context, "Podstawa sporządzenia oceny", assessmentBasisLabel(input.data.assessmentBasis));
  field(context, "Token karty", input.formToken);

  section(context, "Źródła danych wykorzystane do oceny");
  fieldsFromDefinitions(context, DATA_SOURCE_FIELDS, input.data.dataSources);
  field(context, "Inne źródła", input.data.otherSources);

  section(context, "Czynniki dotyczące klienta");
  fieldsFromDefinitions(context, CLIENT_FACTOR_FIELDS, input.data.clientFactors);
  field(context, "Opis niespójności albo uwag", input.data.clientFactorNotes);

  section(context, "Czynniki geograficzne");
  fieldsFromDefinitions(context, GEOGRAPHIC_FACTOR_FIELDS, input.data.geographicFactors);
  field(context, "Opis powiązań geograficznych", input.data.geographicNotes);

  section(context, "Czynniki dotyczące branży i rodzaju działalności");
  fieldsFromDefinitions(context, INDUSTRY_FACTOR_FIELDS, input.data.industryFactors);
  field(context, "Opis czynników branżowych", input.data.industryNotes);

  section(context, "Kanał nawiązania współpracy");
  fieldsFromDefinitions(context, CHANNEL_FACTOR_FIELDS, input.data.channelFactors);
  field(context, "Opis metody ograniczenia ryzyka zdalnego zawarcia umowy", input.data.remoteRiskMitigationNotes);

  section(context, "Status PEP i sankcje");
  fieldsFromDefinitions(context, PEP_SANCTIONS_FIELDS, input.data.pepSanctionsFactors);
  field(context, "Opis wyniku weryfikacji PEP i sankcyjnej", input.data.pepSanctionsNotes);

  section(context, "Czynniki behawioralne i organizacyjne");
  fieldsFromDefinitions(context, BEHAVIORAL_FACTOR_FIELDS, input.data.behavioralFactors);
  field(context, "Opis okoliczności behawioralnych", input.data.behavioralNotes);

  section(context, "Ocena końcowa");
  field(context, "Przypisany poziom ryzyka", riskLevelLabel(input.data.finalRiskLevel));
  field(context, "Uzasadnienie oceny ryzyka", input.data.riskJustification);

  section(context, "Decyzja CRSS");
  fieldsFromDefinitions(context, DECISION_FIELDS, input.data.decisions);
  field(context, "Opis decyzji i ewentualnych warunków", input.data.decisionNotes);

  section(context, "Termin kolejnej aktualizacji");
  field(context, "Termin kolejnej aktualizacji danych i oceny ryzyka", input.data.nextUpdateDate);
  field(context, "Osoba zatwierdzająca ocenę", input.data.approvedBy);
  field(context, "Data zatwierdzenia", input.data.approvalDate);
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
  if (!fontPath) throw new Error("Brak fontu NotoSans-Regular.ttf do wygenerowania karty oceny ryzyka AML.");
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

function fieldsFromDefinitions(context: PdfContext, definitions: Array<{ key: string; label: string }>, values: Record<string, string>) {
  definitions.forEach((definition) => field(context, definition.label, choiceLabel(values[definition.key])));
}

function field(context: PdfContext, label: string, value: string | null | undefined) {
  const labelLines = wrapText(`${label}:`, LABEL_WIDTH, 8.1, context.font);
  const valueLines = wrapText(displayValue(value), VALUE_WIDTH, 9.2, context.font);
  const lineCount = Math.max(labelLines.length, valueLines.length);
  const height = lineCount * LINE_HEIGHT + FIELD_GAP;
  ensureSpace(context, height);
  const startY = context.y;
  labelLines.forEach((line, index) => {
    context.page.drawText(line, { x: MARGIN, y: startY - index * LINE_HEIGHT, size: 8.1, font: context.font, color: colors.muted });
  });
  valueLines.forEach((line, index) => {
    context.page.drawText(line, { x: VALUE_X, y: startY - index * LINE_HEIGHT, size: 9.2, font: context.font, color: colors.text });
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

function choiceLabel(value: string | null | undefined) {
  if (value === "tak") return "TAK";
  if (value === "nie") return "NIE";
  if (value === "nie_dotyczy") return "NIE DOTYCZY";
  return "-";
}
