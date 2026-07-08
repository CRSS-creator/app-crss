import type { ClientCardFormData } from "@/lib/clientCardTypes";

type ClientCardPdfInput = {
  clientName: string;
  clientNip: string | null;
  completedBy: string;
  completedAt: Date;
  data: ClientCardFormData;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const LINE_HEIGHT = 17;

export function buildClientCardPdf(input: ClientCardPdfInput): Buffer {
  const pages: string[] = [""];
  let pageIndex = 0;
  let y = PAGE_HEIGHT - MARGIN;

  function add(operation: string) {
    pages[pageIndex] += `${operation}\n`;
  }

  function newPage() {
    pageIndex += 1;
    pages[pageIndex] = "";
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(height: number) {
    if (y - height < MARGIN) newPage();
  }

  function text(value: string, x: number, size = 10, bold = false) {
    const safe = escapePdfText(toAscii(value));
    add(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${safe}) Tj ET`);
  }

  function wrapped(value: string, x: number, width: number, size = 10, bold = false) {
    const lines = wrapText(toAscii(value), width, size);
    ensureSpace(lines.length * LINE_HEIGHT);
    lines.forEach((line) => {
      text(line, x, size, bold);
      y -= LINE_HEIGHT;
    });
  }

  function section(title: string) {
    ensureSpace(34);
    y -= 10;
    text(title, MARGIN, 13, true);
    y -= 16;
    add(`${MARGIN} ${y - 5} ${PAGE_WIDTH - MARGIN * 2} 1 re f`);
    y -= 18;
  }

  function field(label: string, value: string | null | undefined) {
    ensureSpace(26);
    text(`${label}:`, MARGIN, 9, true);
    wrapped(value?.trim() || "-", MARGIN + 160, PAGE_WIDTH - MARGIN * 2 - 160, 10);
    y -= 4;
  }

  add("0.93 0.96 1 rg");
  add(`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re f`);
  add("0 0 0 rg");
  text("Karta klienta biura rachunkowego", MARGIN, 18, true);
  y -= 28;
  field("Nazwa firmy", input.clientName);
  field("NIP", input.clientNip);

  section("Dane podstawowe");
  field("Osoba kontaktowa", input.data.osobaKontaktowa);
  field("Telefon", input.data.telefon);
  field("Adres dzialalnosci", input.data.adresDzialalnosci);
  field("Adres zamieszkania", input.data.adresZamieszkania);
  field("Forma opodatkowania", input.data.formaOpodatkowania);
  field("Wlasciwy Urzad Skarbowy", input.data.urzadSkarbowy);
  field("Czy wykonuje lub wykonywal/a uslugi na rzecz bylego pracodawcy", input.data.uslugiBylyPracodawca);

  section("VAT");
  field("Czy jest czynnym podatnikiem VAT", input.data.czynnyVat);
  field("Forma rozliczenia VAT", input.data.vatFormaRozliczenia);
  field("Podstawa zwolnienia z VAT", input.data.vatZwolnieniePodstawy.join(", "));
  field("VAT-UE", input.data.vatUe);
  field("Powod VAT-UE", input.data.vatUePowody.join(", "));
  field("Czy prowadzi sprzedaz na rzecz osob fizycznych z innych krajow UE", input.data.sprzedazOsobyPrywatneUe);

  section("ZUS");
  field("Czy korzysta obecnie z ulg dotyczacych oplacania skladek ZUS", input.data.zusUlga);
  field("Z jakiej ulgi obecnie korzysta", input.data.zusUlgaTytul);
  field("Czy oplaca tylko skladke zdrowotna ZUS z dzialalnosci", input.data.tylkoZdrowotne);
  field("Inny tytul do skladek spolecznych", input.data.tylkoZdrowotneTytul);
  field("Dobrowolne ubezpieczenie chorobowe obecnie lub w przyszlosci", input.data.chorobowe);
  field("Czy posiada orzeczenie o niepelnosprawnosci", input.data.niepelnosprawnosc);
  field("Stopien niepelnosprawnosci", input.data.stopienNiepelnosprawnosci);
  field("Prawo do emerytury lub renty", input.data.emeryturaRenta);

  section("Kasa fiskalna i oswiadczenie");
  field("Czy posiada kase fiskalna", input.data.kasaFiskalna);
  field("Jaki jest powod zwolnienia z kasy fiskalnej", input.data.kasaFiskalnaZwolnienie);
  field("Potwierdzenie ankiety i zgodnosci danych", input.data.potwierdzenie ? "Tak" : "Nie");

  section("Podpis formularza");
  const date = input.completedAt.toLocaleDateString("pl-PL");
  const time = input.completedAt.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  wrapped(`Ja ${input.completedBy} potwierdzam, ze wypelnilem powyzsza ankiete, podane przeze mnie dane sa zgodne z prawda oraz poinformuje CRSS niezwlocznie, najpozniej w terminie 7 dni, o zaistnieniu ewentualnych zmian.`, MARGIN, PAGE_WIDTH - MARGIN * 2, 10, true);
  y -= 8;
  wrapped(`Formularz wypelniony przez ${input.completedBy} w dniu ${date} o godzinie ${time}.`, MARGIN, PAGE_WIDTH - MARGIN * 2, 10, true);

  return createPdf(pages);
}

function createPdf(pageContents: string[]) {
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  const pageRefs: string[] = [];
  pageContents.forEach((content) => {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = objects.length + 2;
    pageRefs.push(`${pageObjectNumber} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

function wrapText(value: string, width: number, size: number) {
  const maxChars = Math.max(18, Math.floor(width / (size * 0.52)));
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function toAscii(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[^\x20-\x7E]/g, "");
}
