export type YesNoValue = "" | "tak" | "nie";
export type YesNoNaValue = "" | "tak" | "nie" | "nie_dotyczy";

export type AmlRiskAssessmentData = {
  clientName: string;
  clientIdentifier: string;
  assessmentDate: string;
  assessedBy: string;
  assessmentBasis: string;
  dataSources: Record<string, YesNoNaValue>;
  otherSources: string;
  clientFactors: Record<string, YesNoNaValue>;
  clientFactorNotes: string;
  geographicFactors: Record<string, YesNoValue>;
  geographicNotes: string;
  industryFactors: Record<string, YesNoValue>;
  industryNotes: string;
  channelFactors: Record<string, YesNoValue>;
  remoteRiskMitigationNotes: string;
  pepSanctionsFactors: Record<string, YesNoValue>;
  pepSanctionsNotes: string;
  behavioralFactors: Record<string, YesNoValue>;
  behavioralNotes: string;
  finalRiskLevel: "niskie" | "standardowe" | "podwyzszone" | "wysokie" | "";
  riskJustification: string;
  decisions: Record<string, YesNoValue>;
  decisionNotes: string;
  nextUpdateDate: string;
  nextUpdateReason: string;
  approvedBy: string;
  approvalDate: string;
  confirmation: boolean;
};

export type PublicAmlRiskAssessmentResponse = {
  status: "active" | "completed" | "revoked" | "missing";
  client?: {
    id: string;
    nazwa: string | null;
    nip: string | null;
  };
  defaults?: Partial<AmlRiskAssessmentData>;
};

export const ASSESSMENT_BASIS_OPTIONS = [
  { value: "rozpoczecie_wspolpracy", label: "rozpoczecie wspolpracy" },
  { value: "aktualizacja_okresowa", label: "aktualizacja okresowa" },
  { value: "aktualizacja_zdarzeniowa", label: "aktualizacja zdarzeniowa" },
  { value: "zmiana_danych", label: "zmiana danych" },
  { value: "zmiana_poziomu_ryzyka", label: "zmiana poziomu ryzyka" },
  { value: "inna_przyczyna", label: "inna przyczyna" },
];

export const DATA_SOURCE_FIELDS = [
  { key: "initialForm", label: "Formularz wstepny klienta", allowNa: false },
  { key: "krs", label: "KRS", allowNa: true },
  { key: "ceidg", label: "CEIDG", allowNa: true },
  { key: "regon", label: "GUS albo REGON", allowNa: true },
  { key: "vatWhitelist", label: "Biala lista podatnikow VAT", allowNa: true },
  { key: "vies", label: "VIES", allowNa: true },
  { key: "crbr", label: "Centralny Rejestr Beneficjentow Rzeczywistych", allowNa: true },
  { key: "identityDocument", label: "Dokument tozsamosci albo elektroniczna weryfikacja tozsamosci", allowNa: true },
  { key: "signatureReport", label: "Raport podpisu elektronicznego", allowNa: true },
  { key: "sanctions", label: "Weryfikacja sankcyjna", allowNa: false },
  { key: "pepStatement", label: "Oswiadczenie PEP", allowNa: false },
  { key: "publicInfo", label: "Strona internetowa klienta albo publiczne informacje o dzialalnosci", allowNa: false },
];

export const CLIENT_FACTOR_FIELDS = [
  { key: "naturalPerson", label: "Klient jest osoba fizyczna nieprowadzaca dzialalnosci gospodarczej", allowNa: false },
  { key: "individualBusiness", label: "Klient jest osoba fizyczna prowadzaca dzialalnosc gospodarcza", allowNa: false },
  { key: "legalEntity", label: "Klient jest osoba prawna albo jednostka organizacyjna", allowNa: false },
  { key: "simpleOwnership", label: "Klient ma prosta i zrozumiala strukture wlasnosci", allowNa: true },
  { key: "complexOwnership", label: "Klient ma zlozona albo wielopoziomowa strukture wlasnosci", allowNa: false },
  { key: "foreignOwnershipEntities", label: "W strukturze klienta wystepuja podmioty zagraniczne", allowNa: false },
  { key: "uboEstablished", label: "Beneficjent rzeczywisty zostal ustalony bez watpliwosci", allowNa: false },
  { key: "uboDifficulties", label: "Wystapily trudnosci w ustaleniu beneficjenta rzeczywistego", allowNa: false },
  { key: "registryConsistent", label: "Dane klienta sa spojne z danymi z rejestrow", allowNa: false },
  { key: "inconsistencies", label: "Wystepuja niespojnosci wymagajace wyjasnienia", allowNa: false },
];

export const GEOGRAPHIC_FACTOR_FIELDS = [
  { key: "onlyPoland", label: "Klient dziala wylacznie w Polsce" },
  { key: "euEeaActivity", label: "Klient prowadzi dzialalnosc w UE albo EOG" },
  { key: "outsideEuEeaActivity", label: "Klient prowadzi dzialalnosc poza UE albo EOG" },
  { key: "highRiskCountry", label: "Powiazanie z panstwem wysokiego ryzyka" },
  { key: "sanctionedCountry", label: "Powiazanie z panstwem objetym sankcjami" },
];

export const INDUSTRY_FACTOR_FIELDS = [
  { key: "typicalForCrss", label: "Dzialalnosc jest typowa dla klientow obslugiwanych przez CRSS" },
  { key: "understandableActivity", label: "Dzialalnosc jest zrozumiala na podstawie formularza, rejestrow i informacji publicznych" },
  { key: "highAttentionIndustry", label: "Klient dziala w branzy wymagajacej zwiekszonej uwagi" },
  { key: "cashActivity", label: "Klient prowadzi dzialalnosc gotowkowa albo gotowka moze miec istotne znaczenie" },
  { key: "crossBorderActivity", label: "Klient prowadzi dzialalnosc transgraniczna" },
  { key: "sensitiveGoodsOrServices", label: "Klient dziala w obszarach wrazliwych, np. luksus, nieruchomosci, paliwa, metale, platnosci, kryptoaktywa, hazard albo posrednictwo finansowe" },
];

export const CHANNEL_FACTOR_FIELDS = [
  { key: "personalContact", label: "Wspolpraca zostala nawiazana podczas kontaktu osobistego" },
  { key: "remoteContact", label: "Wspolpraca zostala nawiazana zdalnie" },
  { key: "autentiAgreement", label: "Umowa zostala podpisana przez Autenti" },
  { key: "advancedAutentiSignature", label: "Zastosowano zaawansowany podpis elektroniczny Autenti" },
  { key: "mobywatel", label: "Zastosowano weryfikacje tozsamosci przez mObywatel" },
  { key: "qualifiedSignature", label: "Zastosowano kwalifikowany podpis elektroniczny" },
  { key: "trustedSignature", label: "Zastosowano podpis zaufany" },
  { key: "remoteRiskMitigated", label: "Brak fizycznej obecnosci ograniczono inna metoda weryfikacji" },
];

export const PEP_SANCTIONS_FIELDS = [
  { key: "pep", label: "Klient, reprezentant albo beneficjent rzeczywisty posiada status PEP" },
  { key: "pepRelated", label: "Klient, reprezentant albo beneficjent jest czlonkiem rodziny PEP albo bliskim wspolpracownikiem PEP" },
  { key: "sanctionsPositive", label: "Wynik weryfikacji sankcyjnej jest pozytywny" },
  { key: "sanctionsRequiresExplanation", label: "Wynik weryfikacji sankcyjnej wymaga dodatkowego wyjasnienia" },
];

export const BEHAVIORAL_FACTOR_FIELDS = [
  { key: "completeConsistentData", label: "Klient przekazuje dane kompletne i spojne" },
  { key: "refusesData", label: "Klient odmawia przekazania danych wymaganych do oceny AML" },
  { key: "avoidsExplanation", label: "Klient unika wyjasnienia struktury wlasnosci albo charakteru dzialalnosci" },
  { key: "expectsEarlyStart", label: "Klient oczekuje rozpoczecia wspolpracy przed zakonczeniem weryfikacji AML" },
  { key: "unusualBehavior", label: "Klient wykazuje nietypowe zachowania wobec charakteru planowanej wspolpracy" },
];

export const DECISION_FIELDS = [
  { key: "standardMeasures", label: "Mozna rozpoczac wspolprace przy standardowych srodkach bezpieczenstwa finansowego" },
  { key: "enhancedMeasures", label: "Mozna rozpoczac wspolprace przy wzmozonych srodkach bezpieczenstwa finansowego" },
  { key: "requiresCompletion", label: "Wymagane jest uzupelnienie danych albo dokumentow przed rozpoczeciem wspolpracy" },
  { key: "requiresApproval", label: "Wymagana jest akceptacja osoby odpowiedzialnej za AML albo zarzadu" },
  { key: "refuseCooperation", label: "CRSS odmawia rozpoczecia wspolpracy" },
  { key: "considerNotification", label: "Nalezy rozwazyc zawiadomienie wlasciwego organu" },
];

export function emptyAmlRiskAssessmentData(): AmlRiskAssessmentData {
  return {
    clientName: "",
    clientIdentifier: "",
    assessmentDate: new Date().toISOString().slice(0, 10),
    assessedBy: "",
    assessmentBasis: "rozpoczecie_wspolpracy",
    dataSources: emptyValues(DATA_SOURCE_FIELDS, ""),
    otherSources: "",
    clientFactors: emptyValues(CLIENT_FACTOR_FIELDS, ""),
    clientFactorNotes: "",
    geographicFactors: emptyValues(GEOGRAPHIC_FACTOR_FIELDS, ""),
    geographicNotes: "",
    industryFactors: emptyValues(INDUSTRY_FACTOR_FIELDS, ""),
    industryNotes: "",
    channelFactors: emptyValues(CHANNEL_FACTOR_FIELDS, ""),
    remoteRiskMitigationNotes: "",
    pepSanctionsFactors: emptyValues(PEP_SANCTIONS_FIELDS, ""),
    pepSanctionsNotes: "",
    behavioralFactors: emptyValues(BEHAVIORAL_FACTOR_FIELDS, ""),
    behavioralNotes: "",
    finalRiskLevel: "",
    riskJustification: "",
    decisions: emptyValues(DECISION_FIELDS, ""),
    decisionNotes: "",
    nextUpdateDate: "",
    nextUpdateReason: "",
    approvedBy: "",
    approvalDate: new Date().toISOString().slice(0, 10),
    confirmation: false,
  };
}

export function validateAmlRiskAssessmentData(data: AmlRiskAssessmentData) {
  const missing: string[] = [];
  requireText(data.clientName, "Nazwa albo imie i nazwisko klienta", missing);
  requireText(data.clientIdentifier, "NIP, PESEL, KRS albo inny identyfikator", missing);
  requireText(data.assessmentDate, "Data sporzadzenia oceny ryzyka", missing);
  requireText(data.assessedBy, "Osoba sporzadzajaca ocene ryzyka", missing);
  requireText(data.assessmentBasis, "Podstawa sporzadzenia oceny", missing);
  requireFieldSet(data.dataSources, DATA_SOURCE_FIELDS, "Zrodla danych", missing);
  requireFieldSet(data.clientFactors, CLIENT_FACTOR_FIELDS, "Czynniki dotyczace klienta", missing);
  requireFieldSet(data.geographicFactors, GEOGRAPHIC_FACTOR_FIELDS, "Czynniki geograficzne", missing);
  requireFieldSet(data.industryFactors, INDUSTRY_FACTOR_FIELDS, "Czynniki branzowe", missing);
  requireFieldSet(data.channelFactors, CHANNEL_FACTOR_FIELDS, "Czynniki kanalu wspolpracy", missing);
  requireFieldSet(data.pepSanctionsFactors, PEP_SANCTIONS_FIELDS, "Status PEP i sankcje", missing);
  requireFieldSet(data.behavioralFactors, BEHAVIORAL_FACTOR_FIELDS, "Czynniki behawioralne", missing);
  requireText(data.finalRiskLevel, "Poziom ryzyka", missing);
  requireText(data.riskJustification, "Uzasadnienie oceny ryzyka", missing);
  requireFieldSet(data.decisions, DECISION_FIELDS, "Decyzja CRSS", missing);
  requireText(data.nextUpdateDate, "Termin kolejnej aktualizacji", missing);
  requireText(data.nextUpdateReason, "Przyczyna terminu kolejnej aktualizacji", missing);
  requireText(data.approvedBy, "Osoba zatwierdzajaca ocene", missing);
  requireText(data.approvalDate, "Data zatwierdzenia", missing);
  if (!data.confirmation) missing.push("Potwierdzenie zakonczenia oceny ryzyka");
  return missing;
}

export function assessmentBasisLabel(value: string) {
  return ASSESSMENT_BASIS_OPTIONS.find((item) => item.value === value)?.label || value || "-";
}

export function riskLevelLabel(value: string) {
  if (value === "niskie") return "Ryzyko niskie";
  if (value === "standardowe") return "Ryzyko standardowe";
  if (value === "podwyzszone") return "Ryzyko podwyzszone";
  if (value === "wysokie") return "Ryzyko wysokie";
  return "-";
}

function emptyValues<T extends Array<{ key: string }>>(fields: T, value: "") {
  return Object.fromEntries(fields.map((field) => [field.key, value])) as Record<string, "">;
}

function requireText(value: string | null | undefined, label: string, missing: string[]) {
  if (!value?.trim()) missing.push(label);
}

function requireFieldSet(fields: Record<string, string>, definitions: Array<{ key: string; label: string }>, groupLabel: string, missing: string[]) {
  const empty = definitions.filter((field) => !fields[field.key]).map((field) => field.label);
  if (empty.length > 0) missing.push(`${groupLabel}: ${empty.slice(0, 4).join(", ")}${empty.length > 4 ? "..." : ""}`);
}
