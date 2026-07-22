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
    requireYesNo(data.legalEntity.foreignEntity, "Informacja, czy podmiot jest podmiotem zagranicznym", missing);
    if (data.legalEntity.foreignEntity === "tak" && !data.legalEntity.foreignRegistration?.trim()) missing.push("Kraj rejestracji, rejestr oraz numer rejestru");
    requireCompleteRepresentatives(data.legalEntity.representatives, missing);
    requireCompleteBeneficialOwners(data.legalEntity.beneficialOwners, missing);
    requireYesNo(data.legalEntity.hasShareholders, "Informacja o kontroli innych osób", missing);
    if (data.legalEntity.hasShareholders === "tak" && !data.legalEntity.ownershipStructure?.trim()) missing.push("Osoby sprawujące inną kontrolę nad podmiotem");
    requireYesNo(data.legalEntity.hasForeignOwnershipEntities, "Informacja, czy struktura własności obejmuje podmioty zagraniczne", missing);
    if (data.legalEntity.hasForeignOwnershipEntities === "tak" && !data.legalEntity.foreignOwnershipCountries?.trim()) missing.push("Państwa rejestracji podmiotów zagranicznych");
    requireYesNo(data.legalEntity.hasSpecialControlMechanisms, "Informacja o innych mechanizmach kontroli", missing);
    if (data.legalEntity.hasSpecialControlMechanisms === "tak" && !data.legalEntity.specialControlMechanismsDescription?.trim()) missing.push("Opis mechanizmów kontroli");
  } else {
    if (!data.individual.fullName?.trim()) missing.push("Imię i nazwisko klienta");
    if (!data.individual.peselOrBirthDate?.trim()) missing.push("PESEL lub data urodzenia klienta");
    if (!data.individual.businessSubject?.trim()) missing.push("Przedmiot prowadzonej działalności");
    requireYesNo(data.individual.hasAuthorizedPersons, "Informacja, czy ustanowiono osobę upoważnioną", missing);
    if (data.individual.hasAuthorizedPersons === "tak") requireCompleteIndividualAuthorizedPersons(data.individual.authorizedPersons, missing);
    requireYesNo(data.individual.isOnlyBeneficialOwner, "Informacja o beneficjencie rzeczywistym", missing);
    if (data.individual.isOnlyBeneficialOwner === "nie") requireCompleteIndividualBeneficialOwners(data.individual.beneficialOwners, missing);
  }
  requireYesNo(data.common.onlyPoland, "Informacja, czy działalność jest prowadzona wyłącznie w Polsce", missing);
  requireYesNo(data.common.activityEuEea, "Informacja, czy działalność jest prowadzona w innych państwach UE lub EOG", missing);
  requireYesNo(data.common.activityOutsideEuEea, "Informacja, czy działalność jest prowadzona poza UE lub EOG", missing);
  if ((data.common.activityEuEea === "tak" || data.common.activityOutsideEuEea === "tak") && !data.common.activityCountries?.trim()) missing.push("Państwa działalności");
  requireYesNo(data.common.imports, "Informacja o imporcie towarów lub usług", missing);
  requireYesNo(data.common.exports, "Informacja o eksporcie towarów lub usług", missing);
  requireYesNo(data.common.significantCashTransactions, "Informacja o istotnych transakcjach gotówkowych", missing);
  requireYesNo(data.common.foreignCurrencies, "Informacja o walutach obcych", missing);
  requireYesNo(data.common.foreignBankAccounts, "Informacja o rachunkach bankowych poza Polską", missing);
  requireYesNo(data.common.paymentIntermediaries, "Informacja o pośrednikach płatniczych", missing);
  if (data.common.paymentIntermediaries === "tak" && !data.common.paymentIntermediariesDescription?.trim()) missing.push("Opis pośredników lub rozwiązań płatniczych");
  HIGH_ATTENTION_ACTIVITY_LABELS.forEach((item) => requireYesNo(data.common.highAttentionActivities?.[item.key], item.label, missing));
  const hasHighAttentionActivity = Object.values(data.common.highAttentionActivities || {}).some((value) => value === "tak");
  if (hasHighAttentionActivity && !data.common.highAttentionDescription?.trim()) missing.push("Opis zakresu działalności w branżach wymagających zwiększonej uwagi");
  requireYesNo(data.common.geographicRisk, "Informacja o powiązaniach z państwami wysokiego ryzyka", missing);
  if (data.common.geographicRisk === "tak" && !data.common.geographicRiskCountries?.trim()) missing.push("Państwo oraz charakter powiązania");
  requireYesNo(data.common.pepPublicFunction, "Informacja o eksponowanym stanowisku politycznym", missing);
  requireYesNo(data.common.pepFamily, "Informacja o członku rodziny osoby eksponowanej politycznie", missing);
  requireYesNo(data.common.pepAssociate, "Informacja o bliskim współpracowniku osoby eksponowanej politycznie", missing);
  if ((data.common.pepPublicFunction === "tak" || data.common.pepFamily === "tak" || data.common.pepAssociate === "tak") && !data.common.pepDetails?.trim()) missing.push("Szczegóły statusu PEP");
  if (!data.confirmation) missing.push("Oświadczenie o prawdziwości i kompletności danych");
  return missing;
}

function requireYesNo(value: YesNoValue | undefined, label: string, missing: string[]) {
  if (value !== "tak" && value !== "nie") missing.push(label);
}

function requireCompleteRepresentatives(people: AmlPersonEntry[], missing: string[]) {
  if (people.length === 0) {
    missing.push("Osoby reprezentujące podmiot");
    return;
  }
  people.forEach((person, index) => {
    const prefix = `Osoba reprezentująca ${index + 1}`;
    requireText(person.fullName, `${prefix}: imię i nazwisko`, missing);
    requireText(person.role, `${prefix}: funkcja lub podstawa umocowania`, missing);
    requireText(person.peselOrBirthDate, `${prefix}: PESEL lub data urodzenia`, missing);
    requireText(person.citizenship, `${prefix}: obywatelstwo`, missing);
    requireText(person.birthCountry, `${prefix}: państwo urodzenia`, missing);
    requireText(person.identityDocument, `${prefix}: dokument tożsamości`, missing);
    requireText(person.email, `${prefix}: adres e-mail`, missing);
    requireText(person.phone, `${prefix}: numer telefonu`, missing);
    requireYesNo(person.powerOfAttorney, `${prefix}: informacja o pełnomocnictwie`, missing);
    if (person.powerOfAttorney === "tak") requireText(person.powerOfAttorneyDetails, `${prefix}: dokument potwierdzający umocowanie`, missing);
  });
}

function requireCompleteBeneficialOwners(owners: AmlBeneficialOwnerEntry[], missing: string[]) {
  if (owners.length === 0) {
    missing.push("Beneficjenci rzeczywiści");
    return;
  }
  owners.forEach((owner, index) => {
    const prefix = `Beneficjent rzeczywisty ${index + 1}`;
    requireText(owner.fullName, `${prefix}: imię i nazwisko`, missing);
    requireText(owner.citizenship, `${prefix}: obywatelstwo`, missing);
    requireText(owner.peselOrBirthDate, `${prefix}: PESEL lub data urodzenia`, missing);
    requireText(owner.birthCountry, `${prefix}: państwo urodzenia`, missing);
    requireText(owner.residenceCountry, `${prefix}: kraj zamieszkania`, missing);
    requireText(owner.controlType, `${prefix}: rodzaj kontroli`, missing);
    if (!owner.capitalShareNotApplicable) requireText(owner.capitalShare, `${prefix}: wielkość udziału w kapitale`, missing);
    if (!owner.votesNotApplicable) requireText(owner.votes, `${prefix}: liczba lub procent głosów`, missing);
    if (!owner.otherControlNotApplicable) requireText(owner.otherControl, `${prefix}: inny sposób sprawowania kontroli`, missing);
    requireYesNo(owner.pep, `${prefix}: status PEP`, missing);
  });
}

function requireCompleteIndividualAuthorizedPersons(people: AmlIndividualAuthorizedPerson[], missing: string[]) {
  people.forEach((person, index) => {
    const prefix = `Osoba upoważniona ${index + 1}`;
    requireText(person.fullName, `${prefix}: imię i nazwisko`, missing);
    requireText(person.authorizationBasis, `${prefix}: podstawa upoważnienia`, missing);
    requireText(person.authorizationScope, `${prefix}: zakres upoważnienia`, missing);
    requireText(person.peselOrBirthDate, `${prefix}: PESEL lub data urodzenia`, missing);
    requireText(person.citizenship, `${prefix}: obywatelstwo`, missing);
    requireText(person.birthCountry, `${prefix}: państwo urodzenia`, missing);
    requireText(person.email, `${prefix}: adres e-mail`, missing);
    requireText(person.phone, `${prefix}: numer telefonu`, missing);
  });
}

function requireCompleteIndividualBeneficialOwners(owners: AmlIndividualBeneficialOwner[], missing: string[]) {
  owners.forEach((owner, index) => {
    const prefix = `Beneficjent rzeczywisty ${index + 1}`;
    requireText(owner.fullName, `${prefix}: imię i nazwisko`, missing);
    requireText(owner.citizenship, `${prefix}: obywatelstwo`, missing);
    requireText(owner.peselOrBirthDate, `${prefix}: PESEL lub data urodzenia`, missing);
    requireText(owner.birthCountry, `${prefix}: państwo urodzenia`, missing);
    requireText(owner.residenceAddress, `${prefix}: adres zamieszkania`, missing);
    requireText(owner.controlType, `${prefix}: rodzaj kontroli lub wpływu`, missing);
    requireYesNo(owner.pep, `${prefix}: status PEP`, missing);
  });
}

function requireText(value: string | null | undefined, label: string, missing: string[]) {
  if (!value?.trim()) missing.push(label);
}

function normalize(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
