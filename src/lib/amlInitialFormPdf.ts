import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { AmlInitialFormData } from "@/lib/amlInitialFormTypes";

type AmlInitialFormPdfInput = {
  clientName: string;
  clientNip: string | null;
  completedAt: Date;
  data: AmlInitialFormData;
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
const LABEL_WIDTH = 170;
const VALUE_X = MARGIN + LABEL_WIDTH + 16;
const VALUE_WIDTH = CONTENT_WIDTH - LABEL_WIDTH - 16;
const LINE_HEIGHT = 13.5;
const FIELD_GAP = 10;

export async function buildAmlInitialFormPdf(input: AmlInitialFormPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFont(), { subset: true });
  const context: PdfContext = { doc, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), font, y: PAGE_HEIGHT - MARGIN };

  drawPageBackground(context.page);
  drawText(context, "Formularz wstępny AML", MARGIN, 20, colors.navy);
  context.y -= 30;
  field(context, "Klient", input.clientName);
  field(context, "NIP", input.clientNip);
  field(context, "Wypełnił(a)", input.data.completedBy);
  field(context, "Data zapisu", input.completedAt.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }));

  section(context, "Odpowiedzi");
  paragraph(context, input.data.answers, 10, colors.text);

  section(context, "Oświadczenie");
  paragraph(
    context,
    `Osoba wypełniająca potwierdziła, że przekazane odpowiedzi są zgodne ze stanem faktycznym na dzień zapisu formularza. Potwierdzenie: ${input.data.confirmation ? "Tak" : "Nie"}.`,
    10,
    colors.text
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function readFont() {
  const paths = [
    join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"),
    join(process.cwd(), "src/assets/fonts/NotoSans-Regular.ttf"),
  ];
  const fontPath = paths.find((path) => existsSync(path));
  if (!fontPath) throw new Error("Brak fontu NotoSans-Regular.ttf do wygenerowania formularza AML.");
  return readFileSync(fontPath);
}

const colors = {
  navy: rgb(0.09, 0.23, 0.45),
  text: rgb(0.04, 0.12, 0.25),
  muted: rgb(0.31, 0.38, 0.5),
  border: rgb(0.78, 0.84, 0.91),
  background: rgb(0.94, 0.96, 1),
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
  ensureSpace(context, 42);
  context.y -= 10;
  drawText(context, title, MARGIN, 13, colors.navy);
  context.y -= 15;
  context.page.drawRectangle({ x: MARGIN, y: context.y, width: CONTENT_WIDTH, height: 1, color: colors.border });
  context.y -= 17;
}

function field(context: PdfContext, label: string, value: string | null | undefined) {
  const labelLines = wrapText(`${label}:`, LABEL_WIDTH, 8.5, context.font);
  const valueLines = wrapText(displayValue(value), VALUE_WIDTH, 9.5, context.font);
  const lineCount = Math.max(labelLines.length, valueLines.length);
  const height = lineCount * LINE_HEIGHT + FIELD_GAP;
  ensureSpace(context, height);

  const startY = context.y;
  labelLines.forEach((line, index) => {
    context.page.drawText(line, { x: MARGIN, y: startY - index * LINE_HEIGHT, size: 8.5, font: context.font, color: colors.muted });
  });
  valueLines.forEach((line, index) => {
    context.page.drawText(line, { x: VALUE_X, y: startY - index * LINE_HEIGHT, size: 9.5, font: context.font, color: colors.text });
  });

  context.y -= height;
}

function paragraph(context: PdfContext, value: string, size: number, color = colors.text) {
  const paragraphs = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const blocks = paragraphs.length ? paragraphs : ["-"];

  blocks.forEach((block) => {
    const lines = wrapText(block, CONTENT_WIDTH, size, context.font);
    ensureSpace(context, lines.length * LINE_HEIGHT + FIELD_GAP);
    lines.forEach((line) => {
      drawText(context, line, MARGIN, size, color);
      context.y -= LINE_HEIGHT;
    });
    context.y -= 4;
  });
}

function displayValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || "-";
}

function wrapText(value: string, width: number, size: number, font: PDFFont) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      return;
    }
    if (current) lines.push(current);
    current = word;

    while (font.widthOfTextAtSize(current, size) > width && current.length > 1) {
      let splitAt = current.length - 1;
      while (splitAt > 1 && font.widthOfTextAtSize(`${current.slice(0, splitAt)}-`, size) > width) splitAt -= 1;
      lines.push(`${current.slice(0, splitAt)}-`);
      current = current.slice(splitAt);
    }
  });

  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}
