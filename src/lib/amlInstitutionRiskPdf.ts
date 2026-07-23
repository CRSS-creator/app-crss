import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export type InstitutionRiskLevel = "niskie" | "standardowe" | "podwyzszone" | "wysokie";

type PdfInput = {
  generatedAt: Date;
  requesterName: string;
  city: string;
  companyName: string;
  foreignClientsCount: number;
  politicallyExposedCount: number;
  counts: Record<InstitutionRiskLevel, number>;
  totalClients: number;
  dominantRisk: InstitutionRiskLevel | null;
};

type PdfContext = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  y: number;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 14;

const RISK_ORDER: InstitutionRiskLevel[] = ["niskie", "standardowe", "podwyzszone", "wysokie"];

export async function buildAmlInstitutionRiskPdf(input: PdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFont(), { subset: true });
  const context: PdfContext = { doc, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), font, y: PAGE_HEIGHT - MARGIN };

  drawPageBackground(context.page);
  rightAlignedText(context, `${input.city}, dnia ${formatPolishLongDate(input.generatedAt)} roku`, 10.5);
  context.y -= 28;
  paragraph(
    context,
    "Ocena ryzyka na podstawie analizy ryzyka prania pieniędzy oraz finansowania terroryzmu związana ze stosunkami gospodarczymi lub z transakcją okazjonalną",
    12.5,
    colors.navy
  );
  paragraph(
    context,
    `Ja, ${input.requesterName}, oświadczam, że przeprowadzono ocenę ryzyka prania pieniędzy oraz finansowania terroryzmu związaną ze stosunkami gospodarczymi lub transakcjami okazjonalnymi wykonywanymi w ${input.companyName}.`,
    10
  );
  paragraph(
    context,
    "Dokonując identyfikacji i oceny ryzyka, uwzględniono czynniki ryzyka dotyczące rodzaju klientów, państw lub obszarów geograficznych, przeznaczenia rachunku, rodzaju produktów, usług, transakcji lub kanałów ich dostaw i dystrybucji, poziomu wartości majątkowych deponowanych przez klienta lub wartości przeprowadzonych transakcji, celu, regularności lub czasu trwania stosunków gospodarczych oraz innych czynników ryzyka, związanych ze stosunkami gospodarczymi lub z transakcją okazjonalną z uwzględnieniem dotychczasowej wiedzy o klientach oraz doświadczenia zawodowego i życiowego osoby sporządzającej ocenę.",
    10
  );
  paragraph(
    context,
    `Ocena ryzyka została sporządzona na podstawie analizy czynników oraz z uwzględnieniem okoliczności obsługiwania przez ${input.companyName} klientów zagranicznych (w ${input.generatedAt.getFullYear()} roku - ${input.foreignClientsCount} klientów).`,
    10
  );
  paragraph(context, `Łącznie ocenie poddano ${input.totalClients} klientów. W ${input.companyName} zdefiniowano grupy klientów:`, 10);

  numberedLine(context, 1, `Klienci niskiego ryzyka - ${input.counts.niskie} klientów`);
  numberedLine(context, 2, `Klienci o normalnym poziomie ryzyka - ${input.counts.standardowe} klientów`);
  numberedLine(context, 3, `Klienci o podwyższonym poziomie ryzyka - ${input.counts.podwyzszone} klientów`);
  numberedLine(context, 4, `Klienci o wysokim poziomie ryzyka - ${input.counts.wysokie} klientów`);
  numberedLine(context, 5, `Klienci zajmujący eksponowane stanowisko polityczne - ${input.politicallyExposedCount} klientów`);

  context.y -= 12;
  paragraph(
    context,
    `Na tej podstawie oceniam, że ryzyko prania pieniędzy oraz finansowania terroryzmu związane ze stosunkami gospodarczymi lub transakcjami okazjonalnymi w ${input.companyName} jest następujące:`,
    10
  );

  checkboxLine(context, input.dominantRisk === "niskie", "ryzyko niskie");
  checkboxLine(context, input.dominantRisk === "standardowe", "ryzyko normalne");
  checkboxLine(context, input.dominantRisk === "podwyzszone", "ryzyko podwyższone");
  checkboxLine(context, input.dominantRisk === "wysokie", "ryzyko wysokie");

  context.y -= 44;
  signatureLine(context, MARGIN, "(miejscowość)");
  signatureLine(context, MARGIN + 285, "(data i podpis reprezentanta)");

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export function dominantInstitutionRisk(counts: Record<InstitutionRiskLevel, number>): InstitutionRiskLevel | null {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return null;
  return RISK_ORDER.reduce((winner, level) => {
    if (counts[level] > counts[winner]) return level;
    return winner;
  }, "standardowe" as InstitutionRiskLevel);
}

function readFont() {
  const paths = [
    join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"),
    join(process.cwd(), "src/assets/fonts/NotoSans-Regular.ttf"),
  ];
  const fontPath = paths.find((path) => existsSync(path));
  if (!fontPath) throw new Error("Brak fontu NotoSans-Regular.ttf do wygenerowania weryfikacji instytucji obowiązanej.");
  return readFileSync(fontPath);
}

const colors = {
  navy: rgb(0.09, 0.23, 0.45),
  text: rgb(0.04, 0.12, 0.25),
  border: rgb(0.68, 0.73, 0.82),
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

function paragraph(context: PdfContext, value: string, size = 10, color = colors.text) {
  const lines = wrapText(value, CONTENT_WIDTH, size, context.font);
  ensureSpace(context, lines.length * LINE_HEIGHT + 9);
  lines.forEach((line, index) => {
    context.page.drawText(line, { x: MARGIN, y: context.y - index * LINE_HEIGHT, size, font: context.font, color });
  });
  context.y -= lines.length * LINE_HEIGHT + 9;
}

function rightAlignedText(context: PdfContext, value: string, size = 10, color = colors.text) {
  const width = context.font.widthOfTextAtSize(value, size);
  context.page.drawText(value, { x: MARGIN + CONTENT_WIDTH - width, y: context.y, size, font: context.font, color });
}

function numberedLine(context: PdfContext, number: number, value: string) {
  const text = `${number}. ${value}`;
  const lines = wrapText(text, CONTENT_WIDTH, 10, context.font);
  ensureSpace(context, lines.length * LINE_HEIGHT + 2);
  lines.forEach((line, index) => {
    context.page.drawText(line, { x: MARGIN, y: context.y - index * LINE_HEIGHT, size: 10, font: context.font, color: colors.text });
  });
  context.y -= lines.length * LINE_HEIGHT + 2;
}

function checkboxLine(context: PdfContext, checked: boolean, label: string) {
  ensureSpace(context, LINE_HEIGHT + 4);
  const boxY = context.y - 1;
  context.page.drawRectangle({ x: MARGIN, y: boxY, width: 8, height: 8, borderColor: colors.text, borderWidth: 1 });
  if (checked) {
    context.page.drawRectangle({ x: MARGIN + 2, y: boxY + 2, width: 4, height: 4, color: colors.text });
  }
  context.page.drawText(label, { x: MARGIN + 18, y: context.y, size: 10, font: context.font, color: colors.text });
  context.y -= LINE_HEIGHT + 2;
}

function signatureLine(context: PdfContext, x: number, label: string) {
  const line = "................................................";
  context.page.drawText(line, { x, y: context.y, size: 11, font: context.font, color: colors.text });
  context.page.drawText(label, { x: x + 25, y: context.y - 14, size: 9, font: context.font, color: colors.text });
}

function wrapText(value: string, width: number, size: number, font: PDFFont) {
  const words = value.trim().split(/\s+/);
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

function formatPolishLongDate(date: Date) {
  return date.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
