import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ClientCardFormData } from "@/lib/clientCardTypes";

type ClientCardPdfInput = {
  clientName: string;
  clientNip: string | null;
  completedBy: string;
  completedAt: Date;
  data: ClientCardFormData;
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
const LABEL_WIDTH = 165;
const VALUE_X = MARGIN + LABEL_WIDTH + 16;
const VALUE_WIDTH = CONTENT_WIDTH - LABEL_WIDTH - 16;
const LINE_HEIGHT = 13.5;
const FIELD_GAP = 10;

export async function buildClientCardPdf(input: ClientCardPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = readClientCardFont();
  const font = await doc.embedFont(fontBytes, { subset: true });
  const context: PdfContext = { doc, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), font, y: PAGE_HEIGHT - MARGIN };

  drawPageBackground(context.page);
  drawText(context, "Karta klienta biura rachunkowego", MARGIN, 20, colors.navy);
  context.y -= 29;
  field(context, "Nazwa firmy", input.clientName);
  field(context, "NIP", input.clientNip);

  section(context, "Dane podstawowe");
  field(context, "Osoba kontaktowa", input.data.osobaKontaktowa);
  field(context, "Telefon", input.data.telefon);
  field(context, "Adres działalności", input.data.adresDzialalnosci);
  field(context, "Adres zamieszkania", input.data.adresZamieszkaniaJakDzialalnosci ? "Taki sam jak adres działalności" : input.data.adresZamieszkania);
  field(context, "Forma opodatkowania", input.data.formaOpodatkowania);
  if (input.data.formaOpodatkowania === "Ryczałt") {
    field(context, "Główna stawka ryczałtu", input.data.glownaStawkaRyczaltu);
  }
  field(context, "Właściwy Urząd Skarbowy", input.data.urzadSkarbowy);
  field(context, "Czy wykonuje lub wykonywał/a usługi na rzecz byłego pracodawcy", input.data.uslugiBylyPracodawca);

  section(context, "VAT");
  field(context, "Czy jest czynnym podatnikiem VAT", input.data.czynnyVat);
  field(context, "Forma rozliczenia VAT", input.data.vatFormaRozliczenia);
  field(context, "Podstawa zwolnienia z VAT", input.data.vatZwolnieniePodstawy.join(", "));
  field(context, "VAT-UE", input.data.vatUe);
  field(context, "Powód VAT-UE", input.data.vatUePowody.join(", "));
  field(context, "Czy prowadzi sprzedaż na rzecz osób fizycznych z innych krajów UE", input.data.sprzedazOsobyPrywatneUe);

  section(context, "ZUS");
  field(context, "Czy korzysta obecnie z ulg dotyczących opłacania składek ZUS", input.data.zusUlga);
  field(context, "Z jakiej ulgi obecnie korzysta", input.data.zusUlgaTytul);
  field(context, "Czy opłaca tylko składkę zdrowotną ZUS z działalności", input.data.tylkoZdrowotne);
  field(context, "Inny tytuł do składek społecznych", input.data.tylkoZdrowotneTytul);
  field(context, "Dobrowolne ubezpieczenie chorobowe obecnie lub w przyszłości", input.data.chorobowe);
  field(context, "Czy posiada orzeczenie o niepełnosprawności", input.data.niepelnosprawnosc);
  field(context, "Stopień niepełnosprawności", input.data.stopienNiepelnosprawnosci);
  field(context, "Prawo do emerytury lub renty", input.data.emeryturaRenta);

  section(context, "Kasa fiskalna i oświadczenie");
  field(context, "Czy posiada kasę fiskalną", input.data.kasaFiskalna);
  field(context, "Jaki jest powód zwolnienia z kasy fiskalnej", input.data.kasaFiskalnaZwolnienie);
  field(context, "Potwierdzenie ankiety i zgodności danych", input.data.potwierdzenie ? "Tak" : "Nie");

  section(context, "Podpis formularza");
  const date = input.completedAt.toLocaleDateString("pl-PL");
  const time = input.completedAt.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  paragraph(
    context,
    `Ja ${input.completedBy} potwierdzam, że wypełniłem powyższą ankietę, podane przeze mnie dane są zgodne z prawdą oraz poinformuję CRSS niezwłocznie, najpóźniej w terminie 7 dni, o zaistnieniu ewentualnych zmian.`,
    10,
    colors.text
  );
  context.y -= 4;
  paragraph(context, `Formularz wypełniony przez ${input.completedBy} w dniu ${date} o godzinie ${time}.`, 10, colors.text);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function readClientCardFont() {
  const paths = [
    join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"),
    join(process.cwd(), "src/assets/fonts/NotoSans-Regular.ttf"),
  ];
  const fontPath = paths.find((path) => existsSync(path));
  if (!fontPath) throw new Error("Brak fontu NotoSans-Regular.ttf do wygenerowania karty klienta.");
  return readFileSync(fontPath);
}

const colors = {
  navy: rgb(0.09, 0.23, 0.45),
  text: rgb(0.04, 0.12, 0.25),
  muted: rgb(0.31, 0.38, 0.5),
  border: rgb(0.78, 0.84, 0.91),
  panel: rgb(0.97, 0.98, 1),
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
  ensureSpace(context, 42);
  context.y -= 8;
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
    context.page.drawText(line, {
      x: MARGIN,
      y: startY - index * LINE_HEIGHT,
      size: 8.5,
      font: context.font,
      color: colors.muted,
    });
  });
  valueLines.forEach((line, index) => {
    context.page.drawText(line, {
      x: VALUE_X,
      y: startY - index * LINE_HEIGHT,
      size: 9.5,
      font: context.font,
      color: colors.text,
    });
  });

  context.y -= height;
}

function paragraph(context: PdfContext, value: string, size: number, color = colors.text) {
  const lines = wrapText(value, CONTENT_WIDTH, size, context.font);
  ensureSpace(context, lines.length * LINE_HEIGHT + FIELD_GAP);
  lines.forEach((line) => {
    drawText(context, line, MARGIN, size, color);
    context.y -= LINE_HEIGHT;
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
