import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { HIGH_ATTENTION_ACTIVITY_LABELS, type AmlInitialFormData } from "@/lib/amlInitialFormTypes";

type AmlInitialFormPdfInput = {
  clientName: string;
  clientNip: string | null;
  formToken: string;
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
const LABEL_WIDTH = 190;
const VALUE_X = MARGIN + LABEL_WIDTH + 14;
const VALUE_WIDTH = CONTENT_WIDTH - LABEL_WIDTH - 14;
const LINE_HEIGHT = 13.5;
const FIELD_GAP = 9;

export async function buildAmlInitialFormPdf(input: AmlInitialFormPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFont(), { subset: true });
  const context: PdfContext = { doc, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), font, y: PAGE_HEIGHT - MARGIN };

  drawPageBackground(context.page);
  drawText(context, "Formularz wstępny AML", MARGIN, 20, colors.navy);
  context.y -= 30;
  field(context, "Typ formularza", input.data.formType === "individual" ? "Osoba fizyczna / JDG" : "Osoba prawna");
  field(context, "Klient", input.clientName);
  field(context, "NIP", input.clientNip);
  field(context, "Token formularza", input.formToken);
  field(context, "Wypełnił(a)", input.data.completedBy);
  field(context, "Data zapisu", input.completedAt.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }));

  if (input.data.formType === "individual") drawIndividualData(context, input.data);
  else drawLegalEntityData(context, input.data);

  drawCommonData(context, input.data);

  section(context, "Oświadczenia");
  paragraph(context, "Osoba wypełniająca oświadczyła, że dane przekazane w formularzu są zgodne z jej wiedzą, prawdziwe i kompletne.", 9.5);
  paragraph(context, "Osoba wypełniająca zobowiązała się poinformować CRSS o zmianie danych przekazanych w formularzu.", 9.5);
  field(context, "Potwierdzenie", input.data.confirmation ? "TAK" : "NIE");

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function drawLegalEntityData(context: PdfContext, data: AmlInitialFormData) {
  const legal = data.legalEntity;
  section(context, "Dane klienta");
  field(context, "Podmiot zagraniczny", yesNo(legal.foreignEntity));
  field(context, "Rejestr zagraniczny", legal.foreignRegistration);
  field(context, "Adres głównego miejsca działalności", legal.businessAddressSameAsRegistered ? "Taki sam jak adres siedziby" : legal.businessAddress);
  field(context, "Adres oddziału w Polsce", legal.polishBranchNotApplicable ? "Nie dotyczy" : legal.polishBranchAddress);
  field(context, "Przedmiot działalności", legal.businessSubject);
  field(context, "Model działalności", legal.businessModel);

  section(context, "Osoby reprezentujące klienta");
  legal.representatives.forEach((person, index) => {
    subsection(context, `Osoba ${index + 1}`);
    field(context, "Imię i nazwisko", person.fullName);
    field(context, "Funkcja / umocowanie", person.role);
    field(context, "PESEL / data urodzenia", person.peselOrBirthDate);
    field(context, "Obywatelstwo", person.citizenship);
    field(context, "Państwo urodzenia", person.birthCountry);
    field(context, "Dokument tożsamości", person.identityDocument);
    field(context, "E-mail", person.email);
    field(context, "Telefon", person.phone);
    field(context, "Pełnomocnictwo", yesNo(person.powerOfAttorney));
    field(context, "Dokument umocowania", person.powerOfAttorneyDetails);
  });

  section(context, "Osoby upoważnione do kontaktu operacyjnego");
  if (legal.noOperationalContacts) paragraph(context, "Klient nie upoważnił dodatkowych osób do kontaktu operacyjnego.", 9.5);
  else legal.operationalContacts.forEach((person, index) => {
    subsection(context, `Osoba ${index + 1}`);
    field(context, "Imię i nazwisko", person.fullName);
    field(context, "Rola / stanowisko", person.role);
    field(context, "E-mail", person.email);
    field(context, "Telefon", person.phone);
    field(context, "Zakres upoważnienia", person.authorizationScope);
  });

  section(context, "Beneficjenci rzeczywiści");
  legal.beneficialOwners.forEach((owner, index) => drawBeneficialOwner(context, index, owner));

  section(context, "Struktura własności i kontroli");
  field(context, "Wspólnicy / udziałowcy / akcjonariusze", yesNo(legal.hasShareholders));
  field(context, "Opis struktury własności", legal.ownershipStructure);
  field(context, "Podmioty zagraniczne w strukturze", yesNo(legal.hasForeignOwnershipEntities));
  field(context, "Państwa rejestracji", legal.foreignOwnershipCountries);
  field(context, "Szczególne mechanizmy kontroli", yesNo(legal.hasSpecialControlMechanisms));
  field(context, "Opis mechanizmów", legal.specialControlMechanismsDescription);
}

function drawIndividualData(context: PdfContext, data: AmlInitialFormData) {
  const individual = data.individual;
  section(context, "Dane klienta");
  field(context, "Imię i nazwisko", individual.fullName);
  field(context, "Obywatelstwo", individual.citizenship);
  field(context, "PESEL / data urodzenia", individual.peselOrBirthDate);
  field(context, "Państwo urodzenia", individual.birthCountry);
  field(context, "Dokument tożsamości", individual.identityDocument);
  field(context, "Adres zamieszkania", individual.residenceAddress);
  field(context, "Firma działalności", individual.businessName);
  field(context, "REGON", individual.regon);
  field(context, "Adres działalności", individual.businessAddress);
  field(context, "Dodatkowy adres działalności", individual.additionalBusinessAddress);
  field(context, "Przedmiot działalności", individual.businessSubject);

  section(context, "Osoby upoważnione do działania lub kontaktu");
  field(context, "Ustanowiono osoby upoważnione", yesNo(individual.hasAuthorizedPersons));
  if (individual.hasAuthorizedPersons === "tak") {
    individual.authorizedPersons.forEach((person, index) => {
      subsection(context, `Osoba ${index + 1}`);
      field(context, "Imię i nazwisko", person.fullName);
      field(context, "Podstawa upoważnienia", person.authorizationBasis);
      field(context, "Zakres upoważnienia", person.authorizationScope);
      field(context, "PESEL / data urodzenia", person.peselOrBirthDate);
      field(context, "Obywatelstwo", person.citizenship);
      field(context, "Państwo urodzenia", person.birthCountry);
      field(context, "E-mail", person.email);
      field(context, "Telefon", person.phone);
    });
  }

  section(context, "Beneficjent rzeczywisty");
  field(context, "Klient jest jedynym beneficjentem", yesNo(individual.isOnlyBeneficialOwner));
  if (individual.isOnlyBeneficialOwner === "nie") {
    individual.beneficialOwners.forEach((owner, index) => {
      subsection(context, `Beneficjent ${index + 1}`);
      field(context, "Imię i nazwisko", owner.fullName);
      field(context, "Obywatelstwo", owner.citizenship);
      field(context, "PESEL / data urodzenia", owner.peselOrBirthDate);
      field(context, "Państwo urodzenia", owner.birthCountry);
      field(context, "Adres zamieszkania", owner.residenceAddress);
      field(context, "Rodzaj kontroli / wpływu", owner.controlType);
      field(context, "Status PEP", yesNo(owner.pep));
    });
  }
}

function drawBeneficialOwner(context: PdfContext, index: number, owner: AmlInitialFormData["legalEntity"]["beneficialOwners"][number]) {
  subsection(context, `Beneficjent ${index + 1}`);
  field(context, "Imię i nazwisko", owner.fullName);
  field(context, "Obywatelstwo", owner.citizenship);
  field(context, "PESEL / data urodzenia", owner.peselOrBirthDate);
  field(context, "Państwo urodzenia", owner.birthCountry);
  field(context, "Kraj zamieszkania", owner.residenceCountry);
  field(context, "Rodzaj kontroli", owner.controlType);
  field(context, "Udział w kapitale", owner.capitalShareNotApplicable ? "Nie dotyczy" : owner.capitalShare);
  field(context, "Głosy", owner.votesNotApplicable ? "Nie dotyczy" : owner.votes);
  field(context, "Inny sposób kontroli", owner.otherControlNotApplicable ? "Nie dotyczy" : owner.otherControl);
  field(context, "Status PEP", yesNo(owner.pep));
}

function drawCommonData(context: PdfContext, data: AmlInitialFormData) {
  const common = data.common;
  section(context, "Charakter działalności klienta");
  field(context, "Działalność wyłącznie w Polsce", yesNo(common.onlyPoland));
  field(context, "Działalność w UE / EOG", yesNo(common.activityEuEea));
  field(context, "Działalność poza UE / EOG", yesNo(common.activityOutsideEuEea));
  field(context, "Państwa działalności", common.activityCountries);
  field(context, "Import", yesNo(common.imports));
  field(context, "Eksport", yesNo(common.exports));
  field(context, "Istotne transakcje gotówkowe", yesNo(common.significantCashTransactions));
  field(context, "Waluty obce", yesNo(common.foreignCurrencies));
  field(context, "Rachunki poza Polską", yesNo(common.foreignBankAccounts));
  field(context, "Pośrednicy płatniczy", yesNo(common.paymentIntermediaries));
  field(context, "Opis pośredników", common.paymentIntermediariesDescription);

  section(context, "Branże wymagające zwiększonej uwagi");
  HIGH_ATTENTION_ACTIVITY_LABELS.forEach((item) => field(context, item.label, yesNo(common.highAttentionActivities[item.key])));
  field(context, "Opis działalności zwiększonej uwagi", common.highAttentionDescription);

  section(context, "Obszary geograficzne i PEP");
  field(context, "Powiązania geograficzne podwyższonego ryzyka", yesNo(common.geographicRisk));
  field(context, "Państwa / charakter powiązania", common.geographicRiskCountries);
  field(context, "PEP - funkcja publiczna", yesNo(common.pepPublicFunction));
  field(context, "PEP - członek rodziny", yesNo(common.pepFamily));
  field(context, "PEP - bliski współpracownik", yesNo(common.pepAssociate));
  field(context, "Szczegóły PEP", common.pepDetails);
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
  ensureSpace(context, 44);
  context.y -= 10;
  drawText(context, title, MARGIN, 13, colors.navy);
  context.y -= 15;
  context.page.drawRectangle({ x: MARGIN, y: context.y, width: CONTENT_WIDTH, height: 1, color: colors.border });
  context.y -= 17;
}

function subsection(context: PdfContext, title: string) {
  ensureSpace(context, 26);
  drawText(context, title, MARGIN, 10.5, colors.navy);
  context.y -= 16;
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

function paragraph(context: PdfContext, value: string, size: number, color = colors.text) {
  const blocks = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  (blocks.length ? blocks : ["-"]).forEach((block) => {
    const lines = wrapText(block, CONTENT_WIDTH, size, context.font);
    ensureSpace(context, lines.length * LINE_HEIGHT + FIELD_GAP);
    lines.forEach((line) => {
      drawText(context, line, MARGIN, size, color);
      context.y -= LINE_HEIGHT;
    });
    context.y -= 4;
  });
}

function yesNo(value: string | null | undefined) {
  if (value === "tak") return "TAK";
  if (value === "nie") return "NIE";
  return "-";
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
