"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { colors, radius, shadow } from "@/app/design";
import {
  HIGH_ATTENTION_ACTIVITY_LABELS,
  emptyAmlInitialFormData,
  emptyBeneficialOwnerEntry,
  emptyIndividualAuthorizedPerson,
  emptyIndividualBeneficialOwner,
  emptyOperationalContact,
  emptyPersonEntry,
  validateAmlInitialFormData,
  type AmlBeneficialOwnerEntry,
  type AmlInitialFormData,
  type AmlInitialFormType,
  type AmlPersonEntry,
  type PublicAmlInitialFormResponse,
  type YesNoValue,
} from "@/lib/amlInitialFormTypes";

export default function AmlInitialFormPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [response, setResponse] = useState<PublicAmlInitialFormResponse | null>(null);
  const [draft, setDraft] = useState<AmlInitialFormData>(emptyAmlInitialFormData());
  const [initializedFor, setInitializedFor] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function loadForm() {
      setLoading(true);
      const result = await fetch(`/api/public/aml-initial-form/${token}`);
      const data = (await result.json()) as PublicAmlInitialFormResponse;
      if (!active) return;
      setResponse(data);
      setLoading(false);
    }
    loadForm();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token || response?.status !== "active" || !response.client || initializedFor === token) return;
    setDraft(buildInitialDraft(response));
    setInitializedFor(token);
  }, [initializedFor, response, token]);

  const formLabel = draft.formType === "individual" ? "osoby fizycznej / JDG" : "osoby prawnej";

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const missing = validateAmlInitialFormData(draft);
    if (missing.length > 0) {
      alert(`Uzupełnij wymagane pola:\n\n${missing.join("\n")}`);
      return;
    }
    setSaving(true);
    const result = await fetch(`/api/public/aml-initial-form/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!result.ok) {
      const data = await result.json().catch(() => null);
      alert(data?.error || "Nie udało się zapisać formularza.");
      return;
    }
    setSaved(true);
    setResponse({ status: "completed" });
  }

  if (loading) return <PublicShell><StatusMessage title="Ładowanie formularza..." text="Sprawdzamy indywidualny link do formularza wstępnego AML." /></PublicShell>;
  if (saved || response?.status === "completed") return <PublicShell><StatusMessage title="Formularz został zapisany" text="Dziękujemy. Link do formularza wstępnego AML został zamknięty." /></PublicShell>;
  if (response?.status === "revoked") return <PublicShell><StatusMessage title="Link jest nieważny" text="Ten link został unieważniony. Skontaktuj się z opiekunem." /></PublicShell>;
  if (response?.status !== "active" || !response.client) return <PublicShell><StatusMessage title="Nie znaleziono formularza" text="Sprawdź link lub skontaktuj się z opiekunem." /></PublicShell>;

  return (
    <PublicShell>
      <form style={cardStyle} onSubmit={submitForm}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Aplikacja CRSS</p>
            <h1 style={titleStyle}>Formularz wstępny AML</h1>
            <p style={subtitleStyle}>{response.client.nazwa || "Podmiot"}{response.client.nip ? ` · NIP ${response.client.nip}` : ""}</p>
          </div>
          <span style={typeBadgeStyle}>Formularz {formLabel}</span>
        </div>

        {draft.formType === "individual" ? (
          <IndividualForm draft={draft} setDraft={setDraft} response={response} />
        ) : (
          <LegalEntityForm draft={draft} setDraft={setDraft} response={response} />
        )}

        <CommonRiskSection draft={draft} setDraft={setDraft} />

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Oświadczenia podmiotu</h2>
          <Statement>Osoba wypełniająca formularz oświadcza, że dane przekazane w formularzu są zgodne z jej wiedzą, prawdziwe i kompletne.</Statement>
          <Statement>Osoba wypełniająca formularz zobowiązuje się poinformować CRSS o zmianie danych przekazanych w formularzu, w szczególności o zmianie reprezentacji, beneficjenta rzeczywistego, struktury własności, statusu PEP, obszarów geograficznych działalności oraz charakteru działalności.</Statement>
          <Statement>Osoba wypełniająca formularz potwierdza, że została poinformowana, iż przekazanie danych jest niezbędne do wykonania przez CRSS obowiązków wynikających z przepisów AML/CFT.</Statement>
          <Field label="Imię i nazwisko osoby składającej formularz" required>
            <input style={inputStyle} value={draft.completedBy} onChange={(event) => setDraft((current) => ({ ...current, completedBy: event.target.value }))} />
          </Field>
          <ReadOnlyField label="Data złożenia formularza" value={new Date().toLocaleDateString("pl-PL")} />
          <label style={confirmationStyle}>
            <input type="checkbox" checked={draft.confirmation} onChange={(event) => setDraft((current) => ({ ...current, confirmation: event.target.checked }))} />
            <span>Potwierdzam prawdziwość i kompletność danych przekazanych w formularzu.</span>
          </label>
        </section>

        <button type="submit" style={saving ? disabledButtonStyle : primaryButtonStyle} disabled={saving}>
          {saving ? "Zapisywanie..." : "Zapisz formularz"}
        </button>
      </form>
    </PublicShell>
  );
}

function LegalEntityForm({ draft, setDraft, response }: FormProps) {
  const client = response.client;
  const registry = registrySummary(response);
  const legal = draft.legalEntity;
  const update = <K extends keyof typeof legal>(key: K, value: (typeof legal)[K]) => setDraft((current) => ({ ...current, legalEntity: { ...current.legalEntity, [key]: value } }));

  return (
    <>
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Dane podmiotu</h2>
        <div style={gridStyle}>
          <ReadOnlyField label="Nazwa" value={client?.nazwa} />
          <ReadOnlyField label="Forma prawna" value={client?.forma_prawna} />
          <ReadOnlyField label="NIP" value={client?.nip} />
          <ReadOnlyField label="KRS" value={registry.krs} />
          <ReadOnlyField label="REGON" value={registry.regon} />
          <ReadOnlyField label="Adres siedziby" value={registry.registeredAddress} />
          <ReadOnlyField label="E-mail do kontaktu" value={client?.email} />
          <ReadOnlyField label="Telefon do kontaktu" value={client?.telefon} />
        </div>
        <YesNoField label={`Czy ${client?.nazwa || "podmiot"} jest podmiotem zagranicznym?`} value={legal.foreignEntity} onChange={(value) => update("foreignEntity", value)} />
        {legal.foreignEntity === "tak" ? <Field label="Kraj rejestracji, rejestr oraz numer rejestru"><textarea style={textareaSmallStyle} value={legal.foreignRegistration} onChange={(event) => update("foreignRegistration", event.target.value)} /></Field> : null}
        <label style={confirmationStyle}>
          <input type="checkbox" checked={legal.businessAddressSameAsRegistered} onChange={(event) => update("businessAddressSameAsRegistered", event.target.checked)} />
          <span>Adres głównego miejsca prowadzenia działalności taki sam jak adres siedziby</span>
        </label>
        {!legal.businessAddressSameAsRegistered ? <Field label="Adres głównego miejsca prowadzenia działalności"><input style={inputStyle} value={legal.businessAddress} onChange={(event) => update("businessAddress", event.target.value)} /></Field> : null}
        {!legal.polishBranchNotApplicable ? (
          <Field label="Adres oddziału w Polsce">
            <input style={inputStyle} value={legal.polishBranchAddress} onChange={(event) => update("polishBranchAddress", event.target.value)} />
          </Field>
        ) : null}
        <label style={confirmationStyle}>
          <input type="checkbox" checked={legal.polishBranchNotApplicable} onChange={(event) => update("polishBranchNotApplicable", event.target.checked)} />
          <span>Nie dotyczy</span>
        </label>
        <ReadOnlyField label="Główne kody PKD" value={registry.pkd} />
        <Field label="Przedmiot prowadzonej działalności" required><textarea style={textareaSmallStyle} value={legal.businessSubject} onChange={(event) => update("businessSubject", event.target.value)} /></Field>
        <Field label="Krótki opis modelu działalności" required><textarea style={textareaSmallStyle} value={legal.businessModel} onChange={(event) => update("businessModel", event.target.value)} /></Field>
      </section>

      <BeneficialOwnersSection owners={legal.beneficialOwners} onChange={(owners) => update("beneficialOwners", owners)} />

      <PeopleSection
        title="Osoby reprezentujące podmiot"
        hint="Wskaż osoby uprawnione do działania w imieniu podmiotu zgodnie z rejestrem, umową, statutem, pełnomocnictwem lub innym dokumentem."
        people={legal.representatives}
        onChange={(people) => update("representatives", people)}
      />

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Osoby upoważnione do kontaktu operacyjnego</h2>
        <label style={confirmationStyle}>
          <input type="checkbox" checked={legal.noOperationalContacts} onChange={(event) => update("noOperationalContacts", event.target.checked)} />
          <span>Nie upoważniam dodatkowych osób do kontaktu operacyjnego</span>
        </label>
        {!legal.noOperationalContacts ? (
          <Repeater
            items={legal.operationalContacts}
            addLabel="Dodaj osobę"
            onAdd={() => update("operationalContacts", [...legal.operationalContacts, emptyOperationalContact()])}
            render={(person, index) => (
              <PersonCard key={index} title={`Osoba ${index + 1}`} onRemove={legal.operationalContacts.length > 1 ? () => update("operationalContacts", removeAt(legal.operationalContacts, index)) : undefined}>
                <Field label="Imię i nazwisko"><input style={inputStyle} value={person.fullName} onChange={(event) => update("operationalContacts", updateAt(legal.operationalContacts, index, { ...person, fullName: event.target.value }))} /></Field>
                <Field label="Rola lub stanowisko"><input style={inputStyle} value={person.role} onChange={(event) => update("operationalContacts", updateAt(legal.operationalContacts, index, { ...person, role: event.target.value }))} /></Field>
                <Field label="Adres e-mail"><input style={inputStyle} value={person.email} onChange={(event) => update("operationalContacts", updateAt(legal.operationalContacts, index, { ...person, email: event.target.value }))} /></Field>
                <Field label="Numer telefonu"><input style={inputStyle} value={person.phone} onChange={(event) => update("operationalContacts", updateAt(legal.operationalContacts, index, { ...person, phone: event.target.value }))} /></Field>
                <Field label="Zakres upoważnienia"><textarea style={textareaSmallStyle} value={person.authorizationScope} onChange={(event) => update("operationalContacts", updateAt(legal.operationalContacts, index, { ...person, authorizationScope: event.target.value }))} /></Field>
              </PersonCard>
            )}
          />
        ) : null}
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Struktura własności i kontroli</h2>
        <YesNoField label="Czy podmiot posiada wspólników, udziałowców jako osoby fizyczne lub akcjonariuszy będących osobami prawnymi lub innymi jednostkami organizacyjnymi?" value={legal.hasShareholders} onChange={(value) => update("hasShareholders", value)} />
        <Field label="Opis struktury własności do poziomu osób fizycznych sprawujących kontrolę"><textarea style={textareaSmallStyle} value={legal.ownershipStructure} onChange={(event) => update("ownershipStructure", event.target.value)} /></Field>
        <YesNoField label="Czy struktura własności obejmuje podmioty zagraniczne?" value={legal.hasForeignOwnershipEntities} onChange={(value) => update("hasForeignOwnershipEntities", value)} />
        {legal.hasForeignOwnershipEntities === "tak" ? <Field label="Państwa rejestracji podmiotów zagranicznych"><input style={inputStyle} value={legal.foreignOwnershipCountries} onChange={(event) => update("foreignOwnershipCountries", event.target.value)} /></Field> : null}
        <YesNoField label="Czy występują umowy, porozumienia, prawa osobiste, uprzywilejowanie udziałów lub inne mechanizmy kontroli?" value={legal.hasSpecialControlMechanisms} onChange={(value) => update("hasSpecialControlMechanisms", value)} />
        {legal.hasSpecialControlMechanisms === "tak" ? <Field label="Opis mechanizmów kontroli"><textarea style={textareaSmallStyle} value={legal.specialControlMechanismsDescription} onChange={(event) => update("specialControlMechanismsDescription", event.target.value)} /></Field> : null}
      </section>
    </>
  );
}

function IndividualForm({ draft, setDraft, response }: FormProps) {
  const client = response.client;
  const registry = registrySummary(response);
  const individual = draft.individual;
  const update = <K extends keyof typeof individual>(key: K, value: (typeof individual)[K]) => setDraft((current) => ({ ...current, individual: { ...current.individual, [key]: value } }));

  return (
    <>
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Dane podmiotu</h2>
        <div style={gridStyle}>
          <Field label="Imię i nazwisko" required><input style={inputStyle} value={individual.fullName} onChange={(event) => update("fullName", event.target.value)} /></Field>
          <Field label="Obywatelstwo"><input style={inputStyle} value={individual.citizenship} onChange={(event) => update("citizenship", event.target.value)} /></Field>
          <Field label="PESEL lub data urodzenia" required><input style={inputStyle} value={individual.peselOrBirthDate} onChange={(event) => update("peselOrBirthDate", event.target.value)} /></Field>
          <Field label="Państwo urodzenia"><input style={inputStyle} value={individual.birthCountry} onChange={(event) => update("birthCountry", event.target.value)} /></Field>
          <Field label="Seria i numer dokumentu tożsamości"><input style={inputStyle} value={individual.identityDocument} onChange={(event) => update("identityDocument", event.target.value)} /></Field>
          <Field label="Adres zamieszkania"><input style={inputStyle} value={individual.residenceAddress} onChange={(event) => update("residenceAddress", event.target.value)} /></Field>
          <ReadOnlyField label="Adres e-mail" value={client?.email} />
          <ReadOnlyField label="Telefon" value={client?.telefon} />
          <ReadOnlyField label="NIP" value={client?.nip} />
          <ReadOnlyField label="REGON" value={registry.regon || individual.regon} />
        </div>
        <Field label="Firma działalności gospodarczej"><input style={inputStyle} value={individual.businessName} onChange={(event) => update("businessName", event.target.value)} /></Field>
        <Field label="Adres głównego miejsca wykonywania działalności gospodarczej"><input style={inputStyle} value={individual.businessAddress} onChange={(event) => update("businessAddress", event.target.value)} /></Field>
        <Field label="Adres dodatkowego miejsca wykonywania działalności, jeżeli dotyczy"><input style={inputStyle} value={individual.additionalBusinessAddress} onChange={(event) => update("additionalBusinessAddress", event.target.value)} /></Field>
        <ReadOnlyField label="Główne kody PKD" value={registry.pkd} />
        <Field label="Przedmiot prowadzonej działalności" required><textarea style={textareaSmallStyle} value={individual.businessSubject} onChange={(event) => update("businessSubject", event.target.value)} /></Field>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Osoby upoważnione do działania lub kontaktu</h2>
        <YesNoField label="Czy podmiot ustanowił osobę upoważnioną do działania w jego imieniu lub do kontaktu z CRSS?" value={individual.hasAuthorizedPersons} onChange={(value) => update("hasAuthorizedPersons", value)} />
        {individual.hasAuthorizedPersons === "tak" ? (
          <Repeater
            items={individual.authorizedPersons}
            addLabel="Dodaj osobę"
            onAdd={() => update("authorizedPersons", [...individual.authorizedPersons, emptyIndividualAuthorizedPerson()])}
            render={(person, index) => (
              <PersonCard key={index} title={`Osoba ${index + 1}`} onRemove={individual.authorizedPersons.length > 1 ? () => update("authorizedPersons", removeAt(individual.authorizedPersons, index)) : undefined}>
                {(["fullName", "authorizationBasis", "authorizationScope", "peselOrBirthDate", "citizenship", "birthCountry", "email", "phone"] as const).map((key) => (
                  <Field key={key} label={individualAuthorizedLabels[key]}>
                    <input style={inputStyle} value={person[key]} onChange={(event) => update("authorizedPersons", updateAt(individual.authorizedPersons, index, { ...person, [key]: event.target.value }))} />
                  </Field>
                ))}
              </PersonCard>
            )}
          />
        ) : null}
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Beneficjent rzeczywisty</h2>
        <YesNoField label="Czy podmiot jest jedyną osobą fizyczną sprawującą bezpośrednio lub pośrednio kontrolę nad prowadzoną działalnością?" value={individual.isOnlyBeneficialOwner} onChange={(value) => update("isOnlyBeneficialOwner", value)} />
        {individual.isOnlyBeneficialOwner === "nie" ? (
          <Repeater
            items={individual.beneficialOwners}
            addLabel="Dodaj beneficjenta"
            onAdd={() => update("beneficialOwners", [...individual.beneficialOwners, emptyIndividualBeneficialOwner()])}
            render={(owner, index) => (
              <PersonCard key={index} title={`Beneficjent ${index + 1}`} onRemove={individual.beneficialOwners.length > 1 ? () => update("beneficialOwners", removeAt(individual.beneficialOwners, index)) : undefined}>
                {(["fullName", "citizenship", "peselOrBirthDate", "birthCountry", "residenceAddress", "controlType"] as const).map((key) => (
                  <Field key={key} label={individualOwnerLabels[key]}>
                    <input style={inputStyle} value={owner[key]} onChange={(event) => update("beneficialOwners", updateAt(individual.beneficialOwners, index, { ...owner, [key]: event.target.value }))} />
                  </Field>
                ))}
                <YesNoField label="Czy beneficjent jest osobą eksponowaną politycznie, członkiem rodziny takiej osoby lub bliskim współpracownikiem?" value={owner.pep} onChange={(value) => update("beneficialOwners", updateAt(individual.beneficialOwners, index, { ...owner, pep: value }))} />
              </PersonCard>
            )}
          />
        ) : null}
      </section>
    </>
  );
}

function PeopleSection({ title, hint, people, onChange }: { title: string; hint: string; people: AmlPersonEntry[]; onChange: (people: AmlPersonEntry[]) => void }) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <p style={hintStyle}>{hint}</p>
      <Repeater
        items={people}
        addLabel="Dodaj nową osobę"
        onAdd={() => onChange([...people, emptyPersonEntry()])}
        render={(person, index) => (
          <PersonCard key={index} title={`Osoba ${index + 1}`} onRemove={people.length > 1 ? () => onChange(removeAt(people, index)) : undefined}>
            {(["fullName", "role", "peselOrBirthDate", "citizenship", "birthCountry", "identityDocument", "email", "phone"] as const).map((key) => (
              <Field key={key} label={personLabels[key]}>
                <input style={inputStyle} value={person[key]} onChange={(event) => onChange(updateAt(people, index, { ...person, [key]: event.target.value }))} />
              </Field>
            ))}
            <YesNoField label="Czy osoba działa na podstawie pełnomocnictwa?" value={person.powerOfAttorney} onChange={(value) => onChange(updateAt(people, index, { ...person, powerOfAttorney: value }))} />
            {person.powerOfAttorney === "tak" ? <Field label="Dokument potwierdzający umocowanie"><input style={inputStyle} value={person.powerOfAttorneyDetails} onChange={(event) => onChange(updateAt(people, index, { ...person, powerOfAttorneyDetails: event.target.value }))} /></Field> : null}
          </PersonCard>
        )}
      />
    </section>
  );
}

function BeneficialOwnersSection({ owners, onChange }: { owners: AmlBeneficialOwnerEntry[]; onChange: (owners: AmlBeneficialOwnerEntry[]) => void }) {
  return (
    <section style={sectionStyle}>
      <h2 style={strongSectionTitleStyle}>Beneficjenci rzeczywiści</h2>
      <p style={hintStyle}>Poniżsi beneficjenci zostali "zaimportowani" z Centralnego Rejestru Beneficjentów Rzeczywistych.</p>
      <Repeater
        items={owners}
        addLabel="Dodaj beneficjenta"
        onAdd={() => onChange([...owners, emptyBeneficialOwnerEntry()])}
        render={(owner, index) => (
          <PersonCard key={index} title={`Beneficjent ${index + 1}`} onRemove={owners.length > 1 ? () => onChange(removeAt(owners, index)) : undefined}>
            {(["fullName", "citizenship", "peselOrBirthDate", "birthCountry", "residenceCountry", "controlType"] as const).map((key) => (
              <Field key={key} label={beneficialOwnerLabels[key]}>
                <input style={inputStyle} value={owner[key]} onChange={(event) => onChange(updateAt(owners, index, { ...owner, [key]: event.target.value }))} />
              </Field>
            ))}
            <Field label="Wielkość udziału w kapitale (zł)">
              <input style={inputStyle} disabled={owner.capitalShareNotApplicable} value={owner.capitalShare} onChange={(event) => onChange(updateAt(owners, index, { ...owner, capitalShare: event.target.value }))} />
            </Field>
            <CheckLine checked={owner.capitalShareNotApplicable} onChange={(checked) => onChange(updateAt(owners, index, { ...owner, capitalShareNotApplicable: checked }))}>Nie dotyczy</CheckLine>
            <Field label="Liczba lub procent głosów">
              <input style={inputStyle} disabled={owner.votesNotApplicable} value={owner.votes} onChange={(event) => onChange(updateAt(owners, index, { ...owner, votes: event.target.value }))} />
            </Field>
            <CheckLine checked={owner.votesNotApplicable} onChange={(checked) => onChange(updateAt(owners, index, { ...owner, votesNotApplicable: checked }))}>Nie dotyczy</CheckLine>
            <Field label="Inny sposób sprawowania kontroli">
              <input style={inputStyle} disabled={owner.otherControlNotApplicable} value={owner.otherControl} onChange={(event) => onChange(updateAt(owners, index, { ...owner, otherControl: event.target.value }))} />
            </Field>
            <CheckLine checked={owner.otherControlNotApplicable} onChange={(checked) => onChange(updateAt(owners, index, { ...owner, otherControlNotApplicable: checked }))}>Nie dotyczy</CheckLine>
            <YesNoField label="Czy beneficjent jest osobą eksponowaną politycznie, członkiem rodziny takiej osoby lub bliskim współpracownikiem?" value={owner.pep} onChange={(value) => onChange(updateAt(owners, index, { ...owner, pep: value }))} />
          </PersonCard>
        )}
      />
    </section>
  );
}

function CommonRiskSection({ draft, setDraft }: { draft: AmlInitialFormData; setDraft: SetDraft }) {
  const common = draft.common;
  const update = <K extends keyof typeof common>(key: K, value: (typeof common)[K]) => setDraft((current) => ({ ...current, common: { ...current.common, [key]: value } }));
  const updateActivity = (key: string, value: YesNoValue) => update("highAttentionActivities", { ...common.highAttentionActivities, [key]: value });

  return (
    <>
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Charakter działalności podmiotu</h2>
        <YesNoField label="Czy podmiot prowadzi działalność wyłącznie w Polsce?" value={common.onlyPoland} onChange={(value) => update("onlyPoland", value)} />
        <YesNoField label="Czy podmiot prowadzi działalność w innych państwach UE lub EOG?" value={common.activityEuEea} onChange={(value) => update("activityEuEea", value)} />
        <YesNoField label="Czy podmiot prowadzi działalność poza UE lub EOG?" value={common.activityOutsideEuEea} onChange={(value) => update("activityOutsideEuEea", value)} />
        {(common.activityEuEea === "tak" || common.activityOutsideEuEea === "tak") ? <Field label="Państwa działalności"><input style={inputStyle} value={common.activityCountries} onChange={(event) => update("activityCountries", event.target.value)} /></Field> : null}
        <div style={twoColumnStyle}>
          <YesNoField label="Import towarów lub usług" value={common.imports} onChange={(value) => update("imports", value)} />
          <YesNoField label="Eksport towarów lub usług" value={common.exports} onChange={(value) => update("exports", value)} />
          <YesNoField label="Istotne transakcje gotówkowe" value={common.significantCashTransactions} onChange={(value) => update("significantCashTransactions", value)} />
          <YesNoField label="Waluty obce w istotnym zakresie" value={common.foreignCurrencies} onChange={(value) => update("foreignCurrencies", value)} />
          <YesNoField label="Rachunki bankowe poza Polską" value={common.foreignBankAccounts} onChange={(value) => update("foreignBankAccounts", value)} />
          <YesNoField label="Pośrednicy płatniczy lub rozwiązania utrudniające identyfikację stron" value={common.paymentIntermediaries} onChange={(value) => update("paymentIntermediaries", value)} />
        </div>
        {common.paymentIntermediaries === "tak" ? <Field label="Opis pośredników lub rozwiązań płatniczych"><textarea style={textareaSmallStyle} value={common.paymentIntermediariesDescription} onChange={(event) => update("paymentIntermediariesDescription", event.target.value)} /></Field> : null}
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Branże i działalności wymagające zwiększonej uwagi</h2>
        <div style={questionsGridStyle}>
          {HIGH_ATTENTION_ACTIVITY_LABELS.map((item) => <YesNoField key={item.key} label={item.label} value={common.highAttentionActivities[item.key] || ""} onChange={(value) => updateActivity(item.key, value)} />)}
        </div>
        <Field label="Jeżeli na którekolwiek pytanie udzielono odpowiedzi TAK, opisz zakres działalności"><textarea style={textareaSmallStyle} value={common.highAttentionDescription} onChange={(event) => update("highAttentionDescription", event.target.value)} /></Field>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Obszary geograficzne i status PEP</h2>
        <YesNoField label="Czy podmiot, beneficjent, kontrahent lub istotny element działalności jest powiązany z państwem wysokiego ryzyka, sankcyjnym lub o podwyższonym poziomie korupcji?" value={common.geographicRisk} onChange={(value) => update("geographicRisk", value)} />
        {common.geographicRisk === "tak" ? <Field label="Państwo oraz charakter powiązania"><textarea style={textareaSmallStyle} value={common.geographicRiskCountries} onChange={(event) => update("geographicRiskCountries", event.target.value)} /></Field> : null}
        <YesNoField label="Czy podmiot, reprezentant, osoba upoważniona lub beneficjent rzeczywisty jest osobą zajmującą eksponowane stanowisko polityczne?" value={common.pepPublicFunction} onChange={(value) => update("pepPublicFunction", value)} />
        <YesNoField label="Czy jest członkiem rodziny osoby zajmującej eksponowane stanowisko polityczne?" value={common.pepFamily} onChange={(value) => update("pepFamily", value)} />
        <YesNoField label="Czy jest osobą znaną jako bliski współpracownik osoby zajmującej eksponowane stanowisko polityczne?" value={common.pepAssociate} onChange={(value) => update("pepAssociate", value)} />
        {(common.pepPublicFunction === "tak" || common.pepFamily === "tak" || common.pepAssociate === "tak") ? <Field label="Osoba, funkcja lub relacja oraz państwo powiązane ze statusem PEP"><textarea style={textareaSmallStyle} value={common.pepDetails} onChange={(event) => update("pepDetails", event.target.value)} /></Field> : null}
      </section>
    </>
  );
}

type SetDraft = React.Dispatch<React.SetStateAction<AmlInitialFormData>>;
type FormProps = { draft: AmlInitialFormData; setDraft: SetDraft; response: PublicAmlInitialFormResponse };

function buildInitialDraft(response: PublicAmlInitialFormResponse) {
  const formType = response.formType || "legal_entity";
  const draft = emptyAmlInitialFormData(formType);
  const registry = registrySummary(response);
  draft.completedBy = response.client?.osoba_kontaktowa || "";
  draft.legalEntity.businessAddress = registry.businessAddress || registry.registeredAddress;
  draft.legalEntity.businessAddressSameAsRegistered = Boolean(registry.registeredAddress && registry.businessAddress && registry.registeredAddress === registry.businessAddress);
  draft.legalEntity.representatives = registry.representatives.length ? registry.representatives : draft.legalEntity.representatives;
  draft.legalEntity.beneficialOwners = registry.beneficialOwners.length ? registry.beneficialOwners : [emptyBeneficialOwnerEntry()];
  draft.individual.fullName = response.client?.osoba_kontaktowa || response.client?.nazwa || "";
  draft.individual.businessName = response.client?.nazwa || "";
  draft.individual.regon = registry.regon;
  draft.individual.businessAddress = registry.businessAddress || registry.registeredAddress;
  return draft;
}

function registrySummary(response: PublicAmlInitialFormResponse) {
  const register = response.register;
  const registry = asRecord(register?.dane_rejestrowe);
  const identifiers = asRecord(registry.identyfikatory);
  const vat = asRecord(registry.bialaListaVat);
  const crbr = asRecord(registry.crbr);
  const companies = Array.isArray(crbr.companies) ? crbr.companies.map(asRecord) : [];
  const company = companies[0] || {};
  const pkd = (register?.kody_pkd || []).map((item) => {
    const record = asRecord(item);
    return [record.kod, record.nazwa].filter(Boolean).join(" - ");
  }).filter(Boolean).join("\n");
  const beneficialOwners = (register?.beneficjenci_rzeczywisci || []).map((owner) => {
    const record = asRecord(owner);
    const shares = Array.isArray(record.udzialy) ? record.udzialy.map(asRecord) : [];
    const firstShare = shares[0] || {};
    const controlType = cleanControlType(asText(record.rola || firstShare.rodzaj));
    const capitalShare = formatCapitalShare(record, firstShare);
    return {
      ...emptyBeneficialOwnerEntry(),
      fullName: asText(record.label || [record.pierwszeImie, record.kolejneImiona, record.nazwisko].filter(Boolean).join(" ")),
      citizenship: asText(record.obywatelstwo),
      peselOrBirthDate: asText(record.pesel || record.dataUrodzenia),
      residenceCountry: asText(record.krajZamieszkania),
      controlType,
      capitalShare,
      votes: [record.procentGlosow ? `${record.procentGlosow}%` : "", record.liczbaGlosow ? `${record.liczbaGlosow}` : ""].filter(Boolean).join(" / "),
    };
  });
  const representatives = (register?.beneficjenci_rzeczywisci || [])
    .map(asRecord)
    .filter((owner) => owner.reprezentant === true)
    .map((owner) => ({
      ...emptyPersonEntry(),
      fullName: asText(owner.label || [owner.pierwszeImie, owner.kolejneImiona, owner.nazwisko].filter(Boolean).join(" ")),
      role: "Reprezentant",
      peselOrBirthDate: asText(owner.pesel || owner.dataUrodzenia),
      citizenship: asText(owner.obywatelstwo),
    }));
  return {
    regon: asText(identifiers.regon || register?.numer_regon || vat.regon),
    krs: asText(identifiers.krs || register?.numer_krs || vat.krs),
    registeredAddress: normalizeAddress(asText(company.adres || vat.adresSiedziby)),
    businessAddress: normalizeAddress(asText(vat.adresDzialalnosci)),
    pkd,
    beneficialOwners,
    representatives,
  };
}

function Repeater<T>({ items, render, onAdd, addLabel }: { items: T[]; render: (item: T, index: number) => ReactNode; onAdd: () => void; addLabel: string }) {
  return <div style={repeaterStyle}>{items.map(render)}<button type="button" style={secondaryButtonStyle} onClick={onAdd}>+ {addLabel}</button></div>;
}

function PersonCard({ title, children, onRemove }: { title: string; children: ReactNode; onRemove?: () => void }) {
  return <div style={personCardStyle}><div style={personCardHeaderStyle}><h3 style={personTitleStyle}>{title}</h3>{onRemove ? <button type="button" style={removeButtonStyle} onClick={onRemove}>Usuń</button> : null}</div>{children}</div>;
}

function YesNoField({ label, value, onChange }: { label: string; value: YesNoValue; onChange: (value: YesNoValue) => void }) {
  return (
    <div style={yesNoFieldStyle}>
      <span style={yesNoLabelStyle}>{label}</span>
      <div style={segmentedStyle}>
        <button type="button" style={value === "tak" ? activeSegmentStyle : segmentStyle} onClick={() => onChange("tak")}>TAK</button>
        <button type="button" style={value === "nie" ? activeSegmentStyle : segmentStyle} onClick={() => onChange("nie")}>NIE</button>
      </div>
    </div>
  );
}

function CheckLine({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return <label style={confirmationStyle}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{children}</span></label>;
}

function ReadOnlyField({ label, value }: { label: string; value: unknown }) {
  return <div style={readOnlyFieldStyle}><span style={readOnlyLabelStyle}>{label}</span><strong style={readOnlyValueStyle}>{asText(value) || "-"}</strong></div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label style={fieldStyle}><span>{label}{required ? " *" : ""}</span>{children}</label>;
}

function Statement({ children }: { children: ReactNode }) {
  return <p style={statementStyle}>{children}</p>;
}

function PublicShell({ children }: { children: ReactNode }) {
  return <main style={pageStyle}><div style={shellStyle}><img src="/logo-crss-mail.png?v=6" alt="CRSS" style={logoStyle} />{children}</div></main>;
}

function StatusMessage({ title, text }: { title: string; text: string }) {
  return <section style={cardStyle}><h1 style={titleStyle}>{title}</h1><p style={subtitleStyle}>{text}</p></section>;
}

function updateAt<T>(items: T[], index: number, item: T) {
  return items.map((current, currentIndex) => currentIndex === index ? item : current);
}

function removeAt<T>(items: T[], index: number) {
  return items.filter((_, currentIndex) => currentIndex !== index);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeAddress(value: string) {
  return value
    .replace(/\bBOROWIKWOA\b/gi, "BOROWIKOWA")
    .replace(/\bBorowikwoa\b/g, "Borowikowa")
    .trim();
}

function cleanControlType(value: string) {
  return value
    .replace(/\s*;\s*brak\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCapitalShare(owner: Record<string, unknown>, firstShare: Record<string, unknown>) {
  const rawValue = owner.wartoscUdzialow || firstShare.ilosc || firstShare.liczbaUdzialow;
  const value = formatNumberLike(rawValue);
  return value ? `${value} zł` : "";
}

function formatNumberLike(value: unknown) {
  const text = asText(value);
  if (!text) return "";
  const numeric = Number(text.replace(",", "."));
  if (Number.isFinite(numeric)) return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(numeric);
  return text;
}

const personLabels: Record<keyof Omit<AmlPersonEntry, "powerOfAttorney" | "powerOfAttorneyDetails">, string> = {
  fullName: "Imię i nazwisko",
  role: "Funkcja lub podstawa umocowania",
  peselOrBirthDate: "PESEL lub data urodzenia",
  citizenship: "Obywatelstwo",
  birthCountry: "Państwo urodzenia",
  identityDocument: "Seria i numer dokumentu tożsamości",
  email: "Adres e-mail",
  phone: "Numer telefonu",
};

const beneficialOwnerLabels = {
  fullName: "Imię i nazwisko",
  citizenship: "Obywatelstwo",
  peselOrBirthDate: "PESEL lub data urodzenia",
  birthCountry: "Państwo urodzenia",
  residenceCountry: "Kraj zamieszkania",
  controlType: "Rodzaj kontroli sprawowanej nad podmiotem",
};

const individualAuthorizedLabels = {
  fullName: "Imię i nazwisko",
  authorizationBasis: "Podstawa upoważnienia",
  authorizationScope: "Zakres upoważnienia",
  peselOrBirthDate: "PESEL lub data urodzenia",
  citizenship: "Obywatelstwo",
  birthCountry: "Państwo urodzenia",
  email: "Adres e-mail",
  phone: "Numer telefonu",
};

const individualOwnerLabels = {
  fullName: "Imię i nazwisko beneficjenta",
  citizenship: "Obywatelstwo",
  peselOrBirthDate: "PESEL lub data urodzenia",
  birthCountry: "Państwo urodzenia",
  residenceAddress: "Adres zamieszkania",
  controlType: "Rodzaj kontroli lub wpływu na działalność",
};

const pageStyle: CSSProperties = { minHeight: "100vh", background: "#eef3fb", padding: "32px 16px", color: colors.text };
const shellStyle: CSSProperties = { maxWidth: "1040px", margin: "0 auto", display: "grid", gap: "18px" };
const logoStyle: CSSProperties = { width: "180px", height: "auto" };
const cardStyle: CSSProperties = { background: colors.white, border: `1px solid ${colors.border}`, borderRadius: "18px", padding: "28px", boxShadow: shadow.card, display: "grid", gap: "22px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", flexWrap: "wrap" };
const eyebrowStyle: CSSProperties = { margin: "0 0 6px", color: colors.danger, fontSize: "12px", fontWeight: 900, letterSpacing: "1px", textTransform: "uppercase" };
const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "30px", lineHeight: 1.15 };
const subtitleStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.5 };
const typeBadgeStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.badge, padding: "10px 14px", color: colors.navy, background: colors.inputBackground, fontWeight: 850 };
const sectionStyle: CSSProperties = { borderTop: `1px solid ${colors.border}`, paddingTop: "20px", display: "grid", gap: "16px" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "20px" };
const strongSectionTitleStyle: CSSProperties = { ...sectionTitleStyle, fontWeight: 900 };
const hintStyle: CSSProperties = { margin: 0, color: colors.muted, lineHeight: 1.5, fontWeight: 400 };
const gridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" };
const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" };
const questionsGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "12px" };
const fieldStyle: CSSProperties = { display: "grid", gap: "8px", color: colors.navy, fontWeight: 700 };
const inputStyle: CSSProperties = { minHeight: "44px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, padding: "0 12px", color: colors.text, fontSize: "15px", outline: "none" };
const textareaSmallStyle: CSSProperties = { ...inputStyle, minHeight: "92px", resize: "vertical", padding: "12px", lineHeight: 1.5 };
const readOnlyFieldStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: "#f8fbff", padding: "12px", display: "grid", gap: "6px", minHeight: "64px" };
const readOnlyLabelStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 900, textTransform: "uppercase" };
const readOnlyValueStyle: CSSProperties = { color: colors.text, fontSize: "14px", lineHeight: 1.4, overflowWrap: "anywhere", whiteSpace: "pre-line", fontWeight: 700 };
const yesNoFieldStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, padding: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" };
const yesNoLabelStyle: CSSProperties = { color: colors.navy, fontWeight: 700, lineHeight: 1.4, flex: "1 1 360px" };
const segmentedStyle: CSSProperties = { display: "inline-flex", border: `1px solid ${colors.border}`, borderRadius: radius.button, overflow: "hidden", background: colors.white };
const segmentStyle: CSSProperties = { minWidth: "64px", minHeight: "36px", border: 0, background: colors.white, color: colors.navy, fontWeight: 900, cursor: "pointer" };
const activeSegmentStyle: CSSProperties = { ...segmentStyle, background: colors.navy, color: colors.white };
const repeaterStyle: CSSProperties = { display: "grid", gap: "14px" };
const personCardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: "#fbfdff", padding: "16px", display: "grid", gap: "12px" };
const personCardHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" };
const personTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "16px" };
const removeButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.danger, fontWeight: 900, padding: "8px 12px", cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, fontWeight: 900, padding: "0 14px", cursor: "pointer", justifySelf: "start" };
const confirmationStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "flex-start", color: colors.text, lineHeight: 1.5, fontWeight: 650 };
const statementStyle: CSSProperties = { margin: 0, border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "12px", background: "#f8fbff", color: colors.text, lineHeight: 1.5 };
const primaryButtonStyle: CSSProperties = { minHeight: "50px", border: 0, borderRadius: radius.button, background: colors.danger, color: colors.white, fontWeight: 900, fontSize: "16px", cursor: "pointer" };
const disabledButtonStyle: CSSProperties = { ...primaryButtonStyle, opacity: 0.65, cursor: "not-allowed" };
