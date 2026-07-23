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
  geographicFactors: Record<string, YesNoNaValue>;
  geographicNotes: string;
  industryFactors: Record<string, YesNoNaValue>;
  industryNotes: string;
  channelFactors: Record<string, YesNoNaValue>;
  remoteRiskMitigationNotes: string;
  pepSanctionsFactors: Record<string, YesNoNaValue>;
  pepSanctionsNotes: string;
  behavioralFactors: Record<string, YesNoNaValue>;
  behavioralNotes: string;
  finalRiskLevel: "niskie" | "standardowe" | "podwyzszone" | "wysokie" | "";
  riskJustification: string;
  decisions: Record<string, YesNoNaValue>;
  decisionNotes: string;
  nextUpdateDate: string;
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
  { value: "rozpoczecie_wspolpracy", label: "rozpoczęcie współpracy" },
  { value: "aktualizacja_okresowa", label: "aktualizacja okresowa" },
  { value: "aktualizacja_zdarzeniowa", label: "aktualizacja zdarzeniowa" },
  { value: "zmiana_danych", label: "zmiana danych" },
  { value: "zmiana_poziomu_ryzyka", label: "zmiana poziomu ryzyka" },
  { value: "inna_przyczyna", label: "inna przyczyna" },
];

export const DATA_SOURCE_FIELDS = [
  { key: "initialForm", label: "Formularz wstępny klienta" },
  { key: "krs", label: "KRS", allowNa: true },
  { key: "ceidg", label: "CEIDG", allowNa: true },
  { key: "regon", label: "GUS albo REGON", allowNa: true },
  { key: "vatWhitelist", label: "Biała lista podatników VAT", allowNa: true },
  { key: "vies", label: "VIES", allowNa: true },
  { key: "crbr", label: "Centralny Rejestr Beneficjentów Rzeczywistych", allowNa: true },
  { key: "identityDocument", label: "Dokument tożsamości albo elektroniczna weryfikacja tożsamości", allowNa: true },
  { key: "signatureReport", label: "Raport podpisu elektronicznego", allowNa: true },
  { key: "sanctions", label: "Weryfikacja sankcyjna" },
  { key: "pepStatement", label: "Oświadczenie PEP" },
  { key: "publicInfo", label: "Strona internetowa klienta albo publiczne informacje o działalności" },
];

export const CLIENT_FACTOR_FIELDS = [
  { key: "naturalPerson", label: "Klient jest osobą fizyczną nieprowadzącą działalności gospodarczej" },
  { key: "individualBusiness", label: "Klient jest osobą fizyczną prowadzącą działalność gospodarczą" },
  { key: "legalEntity", label: "Klient jest osobą prawną albo jednostką organizacyjną" },
  { key: "simpleOwnership", label: "Klient ma prostą i zrozumiałą strukturę własności" },
  { key: "complexOwnership", label: "Klient ma złożoną albo wielopoziomową strukturę własności" },
  { key: "foreignOwnershipEntities", label: "W strukturze klienta występują podmioty zagraniczne" },
  { key: "uboEstablished", label: "Beneficjent rzeczywisty został ustalony bez wątpliwości" },
  { key: "uboDifficulties", label: "Wystąpiły trudności w ustaleniu beneficjenta rzeczywistego" },
  { key: "registryConsistent", label: "Dane klienta są spójne z danymi z rejestrów" },
  { key: "inconsistencies", label: "Występują niespójności wymagające wyjaśnienia" },
];

export const GEOGRAPHIC_FACTOR_FIELDS = [
  { key: "onlyPoland", label: "Klient działa wyłącznie w Polsce" },
  { key: "euEeaActivity", label: "Klient prowadzi działalność w UE albo EOG" },
  { key: "outsideEuEeaActivity", label: "Klient prowadzi działalność poza UE albo EOG" },
  { key: "highRiskCountry", label: "Powiązanie z państwem wysokiego ryzyka" },
  { key: "sanctionedCountry", label: "Powiązanie z państwem objętym sankcjami" },
];

export const INDUSTRY_FACTOR_FIELDS = [
  { key: "typicalForCrss", label: "Działalność jest typowa dla klientów obsługiwanych przez CRSS" },
  { key: "understandableActivity", label: "Działalność jest zrozumiała na podstawie formularza, rejestrów i informacji publicznych" },
  { key: "highAttentionIndustry", label: "Klient działa w branży wymagającej zwiększonej uwagi" },
  { key: "cashActivity", label: "Klient prowadzi działalność gotówkową albo gotówka może mieć istotne znaczenie" },
  { key: "crossBorderActivity", label: "Klient prowadzi działalność transgraniczną" },
  { key: "sensitiveGoodsOrServices", label: "Klient działa w obszarach wrażliwych, np. luksus, nieruchomości, paliwa, metale, płatności, kryptoaktywa, hazard albo pośrednictwo finansowe" },
];

export const CHANNEL_FACTOR_FIELDS = [
  { key: "personalContact", label: "Współpraca została nawiązana podczas kontaktu osobistego" },
  { key: "remoteContact", label: "Współpraca została nawiązana zdalnie" },
  { key: "autentiAgreement", label: "Umowa została podpisana przez Autenti" },
  { key: "advancedAutentiSignature", label: "Zastosowano zaawansowany podpis elektroniczny Autenti" },
  { key: "mobywatel", label: "Zastosowano weryfikację tożsamości przez mObywatel" },
  { key: "qualifiedSignature", label: "Zastosowano kwalifikowany podpis elektroniczny" },
  { key: "trustedSignature", label: "Zastosowano podpis zaufany" },
  { key: "remoteRiskMitigated", label: "Brak fizycznej obecności ograniczono inną metodą weryfikacji" },
];

export const PEP_SANCTIONS_FIELDS = [
  { key: "pep", label: "Klient, reprezentant albo beneficjent rzeczywisty posiada status PEP" },
  { key: "pepRelated", label: "Klient, reprezentant albo beneficjent jest członkiem rodziny PEP albo bliskim współpracownikiem PEP" },
  { key: "sanctionsPositive", label: "Wynik weryfikacji sankcyjnej jest pozytywny" },
  { key: "sanctionsRequiresExplanation", label: "Wynik weryfikacji sankcyjnej wymaga dodatkowego wyjaśnienia" },
];

export const BEHAVIORAL_FACTOR_FIELDS = [
  { key: "completeConsistentData", label: "Klient przekazuje dane kompletne i spójne" },
  { key: "refusesData", label: "Klient odmawia przekazania danych wymaganych do oceny AML" },
  { key: "avoidsExplanation", label: "Klient unika wyjaśnienia struktury własności albo charakteru działalności" },
  { key: "expectsEarlyStart", label: "Klient oczekuje rozpoczęcia współpracy przed zakończeniem weryfikacji AML" },
  { key: "unusualBehavior", label: "Klient wykazuje nietypowe zachowania wobec charakteru planowanej współpracy" },
];

export const DECISION_FIELDS = [
  { key: "standardMeasures", label: "Można rozpocząć współpracę przy standardowych środkach bezpieczeństwa finansowego" },
  { key: "enhancedMeasures", label: "Można rozpocząć współpracę przy wzmożonych środkach bezpieczeństwa finansowego" },
  { key: "requiresCompletion", label: "Wymagane jest uzupełnienie danych albo dokumentów przed rozpoczęciem współpracy" },
  { key: "requiresApproval", label: "Wymagana jest akceptacja osoby odpowiedzialnej za AML albo zarządu" },
  { key: "refuseCooperation", label: "CRSS odmawia rozpoczęcia współpracy" },
  { key: "considerNotification", label: "Należy rozważyć zawiadomienie właściwego organu" },
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
    approvedBy: "",
    approvalDate: new Date().toISOString().slice(0, 10),
    confirmation: false,
  };
}

export function validateAmlRiskAssessmentData(data: AmlRiskAssessmentData) {
  const missing: string[] = [];
  requireText(data.clientName, "Nazwa albo imię i nazwisko klienta", missing);
  requireText(data.clientIdentifier, "NIP, PESEL, KRS albo inny identyfikator", missing);
  requireText(data.assessmentDate, "Data sporządzenia oceny ryzyka", missing);
  requireText(data.assessedBy, "Osoba sporządzająca ocenę ryzyka", missing);
  requireText(data.assessmentBasis, "Podstawa sporządzenia oceny", missing);
  requireFieldSet(data.dataSources, DATA_SOURCE_FIELDS, "Źródła danych", missing);
  requireFieldSet(data.clientFactors, CLIENT_FACTOR_FIELDS, "Czynniki dotyczące klienta", missing);
  requireFieldSet(data.geographicFactors, GEOGRAPHIC_FACTOR_FIELDS, "Czynniki geograficzne", missing);
  requireFieldSet(data.industryFactors, INDUSTRY_FACTOR_FIELDS, "Czynniki branżowe", missing);
  requireFieldSet(data.channelFactors, CHANNEL_FACTOR_FIELDS, "Czynniki kanału współpracy", missing);
  requireFieldSet(data.pepSanctionsFactors, PEP_SANCTIONS_FIELDS, "Status PEP i sankcje", missing);
  requireFieldSet(data.behavioralFactors, BEHAVIORAL_FACTOR_FIELDS, "Czynniki behawioralne", missing);
  requireText(data.finalRiskLevel, "Poziom ryzyka", missing);
  requireText(data.riskJustification, "Uzasadnienie oceny ryzyka", missing);
  requireFieldSet(data.decisions, DECISION_FIELDS, "Decyzja CRSS", missing);
  requireText(data.nextUpdateDate, "Termin kolejnej aktualizacji", missing);
  requireText(data.approvedBy, "Osoba zatwierdzająca ocenę", missing);
  requireText(data.approvalDate, "Data zatwierdzenia", missing);
  if (!data.confirmation) missing.push("Potwierdzenie zakończenia oceny ryzyka");
  return missing;
}

export function assessmentBasisLabel(value: string) {
  return ASSESSMENT_BASIS_OPTIONS.find((item) => item.value === value)?.label || value || "-";
}

export function riskLevelLabel(value: string) {
  if (value === "niskie") return "Ryzyko niskie";
  if (value === "standardowe") return "Ryzyko standardowe";
  if (value === "podwyzszone") return "Ryzyko podwyższone";
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
