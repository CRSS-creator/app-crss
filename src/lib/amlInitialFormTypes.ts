export type AmlInitialFormType = "individual" | "legal_entity";
export type YesNoValue = "" | "tak" | "nie";

export type PublicAmlInitialClient = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  telefon?: string | null;
  forma_prawna?: string | null;
  osoba_kontaktowa?: string | null;
};

export type PublicAmlInitialRegister = {
  id: string | null;
  numer_regon: string | null;
  numer_krs: string | null;
  dane_rejestrowe: Record<string, unknown>;
  beneficjenci_rzeczywisci: Array<Record<string, unknown>>;
  kody_pkd: Array<Record<string, unknown>>;
};

export type PublicAmlInitialFormResponse = {
  status: "active" | "completed" | "revoked" | "missing";
  formType?: AmlInitialFormType;
  client?: PublicAmlInitialClient;
  register?: PublicAmlInitialRegister | null;
};

export type AmlPersonEntry = {
  fullName: string;
  role: string;
  peselOrBirthDate: string;
  citizenship: string;
  birthCountry: string;
  identityDocument: string;
  email: string;
  phone: string;
  powerOfAttorney: YesNoValue;
  powerOfAttorneyDetails: string;
};

export type AmlOperationalContact = {
  fullName: string;
  role: string;
  email: string;
  phone: string;
  authorizationScope: string;
};

export type AmlBeneficialOwnerEntry = {
  fullName: string;
  citizenship: string;
  peselOrBirthDate: string;
  birthCountry: string;
  residenceCountry: string;
  controlType: string;
  capitalShare: string;
  capitalShareNotApplicable: boolean;
  votes: string;
  votesNotApplicable: boolean;
  otherControl: string;
  otherControlNotApplicable: boolean;
  pep: YesNoValue;
};

export type AmlLegalEntityData = {
  foreignEntity: YesNoValue;
  foreignRegistration: string;
  businessAddress: string;
  businessAddressSameAsRegistered: boolean;
  polishBranchAddress: string;
  polishBranchNotApplicable: boolean;
  businessSubject: string;
  businessModel: string;
  representatives: AmlPersonEntry[];
  noOperationalContacts: boolean;
  operationalContacts: AmlOperationalContact[];
  beneficialOwners: AmlBeneficialOwnerEntry[];
  hasShareholders: YesNoValue;
  ownershipStructure: string;
  hasForeignOwnershipEntities: YesNoValue;
  foreignOwnershipCountries: string;
  hasSpecialControlMechanisms: YesNoValue;
  specialControlMechanismsDescription: string;
};

export type AmlIndividualAuthorizedPerson = {
  fullName: string;
  authorizationBasis: string;
  authorizationScope: string;
  peselOrBirthDate: string;
  citizenship: string;
  birthCountry: string;
  email: string;
  phone: string;
};

export type AmlIndividualBeneficialOwner = {
  fullName: string;
  citizenship: string;
  peselOrBirthDate: string;
  birthCountry: string;
  residenceAddress: string;
  controlType: string;
  pep: YesNoValue;
};

export type AmlIndividualData = {
  fullName: string;
  citizenship: string;
  peselOrBirthDate: string;
  birthCountry: string;
  identityDocument: string;
  residenceAddress: string;
  businessName: string;
  regon: string;
  businessAddress: string;
  additionalBusinessAddress: string;
  businessSubject: string;
  hasAuthorizedPersons: YesNoValue;
  authorizedPersons: AmlIndividualAuthorizedPerson[];
  isOnlyBeneficialOwner: YesNoValue;
  beneficialOwners: AmlIndividualBeneficialOwner[];
};

export type AmlCommonData = {
  onlyPoland: YesNoValue;
  activityEuEea: YesNoValue;
  activityOutsideEuEea: YesNoValue;
  activityCountries: string;
  imports: YesNoValue;
  exports: YesNoValue;
  significantCashTransactions: YesNoValue;
  foreignCurrencies: YesNoValue;
  foreignBankAccounts: YesNoValue;
  paymentIntermediaries: YesNoValue;
  paymentIntermediariesDescription: string;
  highAttentionActivities: Record<string, YesNoValue>;
  highAttentionDescription: string;
  geographicRisk: YesNoValue;
  geographicRiskCountries: string;
  pepPublicFunction: YesNoValue;
  pepFamily: YesNoValue;
  pepAssociate: YesNoValue;
  pepDetails: string;
};

export type AmlInitialFormData = {
  formType: AmlInitialFormType;
  completedBy: string;
  confirmation: boolean;
  legalEntity: AmlLegalEntityData;
  individual: AmlIndividualData;
  common: AmlCommonData;
};

export const HIGH_ATTENTION_ACTIVITY_LABELS: Array<{ key: string; label: string }> = [
  { key: "currencyPaymentsCrypto", label: "Obrót walutami, przekazy pieniężne, usługi płatnicze lub kryptoaktywa" },
  { key: "pawnUsedGoods", label: "Działalność lombardowa, komisowa lub obrót towarami używanymi o znacznej wartości" },
  { key: "fuelsSteelScrap", label: "Paliwa, materiały opałowe, stal, złom lub towary szczególnie narażone na nadużycia podatkowe" },
  { key: "realEstate", label: "Nieruchomości, pośrednictwo lub zarządzanie nieruchomościami" },
  { key: "luxuryGoods", label: "Dzieła sztuki, antyki, kamienie lub metale szlachetne, biżuteria, jachty, samochody luksusowe lub inne dobra luksusowe" },
  { key: "gambling", label: "Hazard, gry losowe lub zakłady wzajemne" },
  { key: "loansFinanceInvestments", label: "Branża pożyczkowa, finansowa, inwestycyjna lub windykacyjna" },
  { key: "consultingIntermediation", label: "Doradztwo, konsulting lub pośrednictwo z trudnym do ustalenia uzasadnieniem ekonomicznym transakcji" },
  { key: "weaponsDualUse", label: "Handel bronią, sprzętem wojskowym lub towarami podwójnego zastosowania" },
  { key: "cashIntensive", label: "Działalność, w której istotną rolę odgrywają transakcje gotówkowe" },
];

export function resolveAmlInitialFormType(legalForm: string | null | undefined): AmlInitialFormType {
  const normalized = normalize(legalForm);
  if (
    normalized.includes("jdg") ||
    normalized.includes("jednoosobowa") ||
    normalized.includes("dzialalnosc gospodarcza") ||
    normalized.includes("osoba fizyczna")
  ) {
    return "individual";
  }
  return "legal_entity";
}

export function emptyAmlInitialFormData(formType: AmlInitialFormType = "legal_entity"): AmlInitialFormData {
  return {
    formType,
    completedBy: "",
    confirmation: false,
    legalEntity: {
      foreignEntity: "",
      foreignRegistration: "",
      businessAddress: "",
      businessAddressSameAsRegistered: false,
      polishBranchAddress: "",
      polishBranchNotApplicable: true,
      businessSubject: "",
      businessModel: "",
      representatives: [emptyPersonEntry()],
      noOperationalContacts: false,
      operationalContacts: [emptyOperationalContact()],
      beneficialOwners: [emptyBeneficialOwnerEntry()],
      hasShareholders: "",
      ownershipStructure: "",
      hasForeignOwnershipEntities: "",
      foreignOwnershipCountries: "",
      hasSpecialControlMechanisms: "",
      specialControlMechanismsDescription: "",
    },
    individual: {
      fullName: "",
      citizenship: "POLSKA",
      peselOrBirthDate: "",
      birthCountry: "",
      identityDocument: "",
      residenceAddress: "",
      businessName: "",
      regon: "",
      businessAddress: "",
      additionalBusinessAddress: "",
      businessSubject: "",
      hasAuthorizedPersons: "",
      authorizedPersons: [emptyIndividualAuthorizedPerson()],
      isOnlyBeneficialOwner: "",
      beneficialOwners: [emptyIndividualBeneficialOwner()],
    },
    common: {
      onlyPoland: "",
      activityEuEea: "",
      activityOutsideEuEea: "",
      activityCountries: "",
      imports: "",
      exports: "",
      significantCashTransactions: "",
      foreignCurrencies: "",
      foreignBankAccounts: "",
      paymentIntermediaries: "",
      paymentIntermediariesDescription: "",
      highAttentionActivities: Object.fromEntries(HIGH_ATTENTION_ACTIVITY_LABELS.map((item) => [item.key, ""])) as Record<string, YesNoValue>,
      highAttentionDescription: "",
      geographicRisk: "",
      geographicRiskCountries: "",
      pepPublicFunction: "",
      pepFamily: "",
      pepAssociate: "",
      pepDetails: "",
    },
  };
}

export function emptyPersonEntry(): AmlPersonEntry {
  return {
    fullName: "",
    role: "",
    peselOrBirthDate: "",
    citizenship: "",
    birthCountry: "",
    identityDocument: "",
    email: "",
    phone: "",
    powerOfAttorney: "",
    powerOfAttorneyDetails: "",
  };
}

export function emptyOperationalContact(): AmlOperationalContact {
  return { fullName: "", role: "", email: "", phone: "", authorizationScope: "" };
}

export function emptyBeneficialOwnerEntry(): AmlBeneficialOwnerEntry {
  return {
    fullName: "",
    citizenship: "",
    peselOrBirthDate: "",
    birthCountry: "",
    residenceCountry: "",
    controlType: "",
    capitalShare: "",
    capitalShareNotApplicable: false,
    votes: "",
    votesNotApplicable: false,
    otherControl: "",
    otherControlNotApplicable: false,
    pep: "",
  };
}

export function emptyIndividualAuthorizedPerson(): AmlIndividualAuthorizedPerson {
  return { fullName: "", authorizationBasis: "", authorizationScope: "", peselOrBirthDate: "", citizenship: "", birthCountry: "", email: "", phone: "" };
}

export function emptyIndividualBeneficialOwner(): AmlIndividualBeneficialOwner {
  return { fullName: "", citizenship: "", peselOrBirthDate: "", birthCountry: "", residenceAddress: "", controlType: "", pep: "" };
}

export function validateAmlInitialFormData(data: AmlInitialFormData) {
  const missing: string[] = [];
  if (!data.completedBy?.trim()) missing.push("Imię i nazwisko osoby składającej formularz");
  if (data.formType === "legal_entity") {
    if (!data.legalEntity.businessSubject?.trim()) missing.push("Przedmiot prowadzonej działalności oraz model działalności");
    if (!hasAnyCompletedPerson(data.legalEntity.beneficialOwners)) missing.push("Beneficjent rzeczywisty");
  } else {
    if (!data.individual.fullName?.trim()) missing.push("Imię i nazwisko klienta");
    if (!data.individual.peselOrBirthDate?.trim()) missing.push("PESEL lub data urodzenia klienta");
    if (!data.individual.businessSubject?.trim()) missing.push("Przedmiot prowadzonej działalności");
  }
  if (!data.common.onlyPoland) missing.push("Informacja, czy działalność jest prowadzona wyłącznie w Polsce");
  if (!data.common.pepPublicFunction || !data.common.pepFamily || !data.common.pepAssociate) missing.push("Odpowiedzi dotyczące statusu PEP");
  if (!data.confirmation) missing.push("Oświadczenie o prawdziwości i kompletności danych");
  return missing;
}

function hasAnyCompletedPerson(people: Array<{ fullName?: string; peselOrBirthDate?: string }>) {
  return people.some((person) => person.fullName?.trim() || person.peselOrBirthDate?.trim());
}

function normalize(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
