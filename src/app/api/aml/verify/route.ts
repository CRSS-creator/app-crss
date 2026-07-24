import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { resolveAmlInitialFormType } from "@/lib/amlInitialFormTypes";
import { completeOnboardingAmlIfReady, markOnboardingAmlInProgress } from "@/lib/server/onboardingAmlStatus";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AML_REPORT_BUCKET = "crm-umowy";
const CRBR_SERVICE_NAMESPACE = "http://www.mf.gov.pl/uslugiBiznesowe/uslugiESB/AP/ApiPrzegladoweCRBR/2022/12/01";
const CRBR_SCHEMA_NAMESPACE = "http://www.mf.gov.pl/schematy/AP/ApiPrzegladoweCRBR/2022/12/01";
const CRBR_API_URL = process.env.CRBR_API_URL || "https://bramka-crbr.mf.gov.pl:5058/uslugiBiznesowe/uslugiESB/AP/ApiPrzegladoweCRBR/2022/12/01";
const CEIDG_API_TOKEN = process.env.CEIDG_API_TOKEN;
const CEIDG_API_URL = process.env.CEIDG_API_URL || "https://dane.biznes.gov.pl/api/ceidg/v3/firmy";

type VerifyPayload = {
  clientId?: string;
};

type AuthorizedUser = {
  admin: SupabaseClient;
  requesterId: string;
  requesterName: string;
};

type OfficialCheck = {
  source: string;
  status: "ok" | "warning" | "error" | "skipped" | "confirmed";
  label: string;
  details: Record<string, unknown>;
};

type PkdCode = {
  kod: string;
  nazwa: string | null;
  przewazajace: boolean;
  zrodlo: string;
};

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => null) as VerifyPayload | null;
  if (!payload?.clientId) {
    return NextResponse.json({ error: "Brak klienta do weryfikacji AML." }, { status: 400 });
  }

  const { data: client, error: clientError } = await auth.admin
    .from("klienci")
    .select("id, nazwa, nip, status_klienta, czynny_vat, vat_ue, forma_prawna")
    .eq("id", payload.clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
  }

  const nip = normalizeNip(client.nip);
  if (!nip) {
    return NextResponse.json({ error: "Klient nie ma prawidłowego NIP do automatycznej weryfikacji." }, { status: 400 });
  }

  const register = await ensureAmlRegister(auth.admin, client.id);
  await markOnboardingAmlInProgress(auth.admin, client.id, auth.requesterId);
  const checks: OfficialCheck[] = [];
  const isDeclaredIndividualForm = resolveAmlInitialFormType(client.forma_prawna) === "individual";
  const startsAsIndividualBusiness = isDeclaredIndividualForm && !looksLikeLegalEntity(client.nazwa, client.forma_prawna);

  const checksVat = Boolean(client.czynny_vat);
  const checksVies = Boolean(client.vat_ue);
  const vatCheck = checksVat
    ? await verifyVatWhitelist(nip)
    : skippedCheck("Biała Lista VAT", "Nie odpytano Białej Listy VAT, ponieważ klient nie jest oznaczony w aplikacji jako czynny podatnik VAT.");
  checks.push(vatCheck);

  const vatSubject = getVatSubject(vatCheck);
  const requestId = String((vatCheck.details as { requestId?: unknown }).requestId || "").trim() || null;

  checks.push(checksVies
    ? await verifyVies(nip)
    : confirmedCheck("VAT-UE", "Weryfikacja potwierdzona: klient nie jest oznaczony jako podatnik VAT-UE.")
  );

  let ceidgCheck: OfficialCheck | null = null;
  let crbrCheck: OfficialCheck;
  let krsCheck: OfficialCheck;
  let ceidgIdentity = { regon: null as string | null, krs: null as string | null };
  let krsNumber = normalizeKrs(String(vatSubject?.krs || ""));
  let actualIndividualBusiness = startsAsIndividualBusiness;

  if (startsAsIndividualBusiness) {
    ceidgCheck = await verifyCeidg(nip);
    checks.push(ceidgCheck);
    ceidgIdentity = getCeidgIdentity(ceidgCheck);
    krsCheck = skippedCheck("KRS", "KRS nie dotyczy jednoosobowej działalności gospodarczej.");
    crbrCheck = skippedCheck("CRBR", "CRBR nie dotyczy osób fizycznych ani JDG.");
  } else {
    const crbrCandidate = await verifyCrbr(nip, krsNumber || null);
    const crbrIdentity = getCrbrIdentity(crbrCandidate);
    krsNumber = normalizeKrs(String(vatSubject?.krs || crbrIdentity.krs || ""));

    if (!krsNumber) {
      ceidgCheck = await verifyCeidg(nip);
      ceidgIdentity = getCeidgIdentity(ceidgCheck);
      if (ceidgCheck.status === "ok") {
        actualIndividualBusiness = true;
        checks.push(ceidgCheck);
        krsCheck = skippedCheck("KRS", "Podmiot odnaleziony w CEIDG jako JDG; KRS nie dotyczy.");
        crbrCheck = skippedCheck("CRBR", "Podmiot odnaleziony w CEIDG jako JDG; CRBR nie dotyczy.");
      } else {
        checks.push(ceidgCheck);
        krsCheck = skippedCheck("KRS", "Nie ustalono numeru KRS po NIP w rejestrach spółek.");
        crbrCheck = crbrCandidate;
      }
    } else {
      krsCheck = await verifyKrs(krsNumber);
      crbrCheck = crbrCandidate;
    }
  }

  const krsIdentity = getKrsIdentity(krsCheck);
  const regonNumber = String(vatSubject?.regon || krsIdentity.regon || ceidgIdentity.regon || "").trim() || null;
  krsNumber = normalizeKrs(String(krsNumber || krsIdentity.krs || ""));
  checks.push(krsCheck);
  checks.push(crbrCheck);

  const sanctionsCheck = await verifySanctionsLists(client.nazwa || "", nip);
  checks.push(sanctionsCheck);
  const now = new Date();
  const pkdCodes = collectPkdCodes(ceidgCheck, krsCheck);
  const initialFormIndividual = actualIndividualBusiness
    ? await getLatestIndividualInitialFormData(auth.admin, client.id)
    : null;
  const downloadedBeneficialOwners = actualIndividualBusiness
    ? buildJdgBeneficialOwners(ceidgCheck, client.nazwa, nip, now, initialFormIndividual)
    : extractCrbrBeneficialOwners(crbrCheck, now, krsCheck);
  const beneficialOwners = mergeManualBeneficialOwnerEdits(register.beneficjenci_rzeczywisci, downloadedBeneficialOwners);
  const result = summarizeResult(checks);
  const visibleSourceChecks = checks.filter((check) => !(actualIndividualBusiness && check.source === "CRBR"));
  const registryDetails = buildRegistryDetails({
    nip,
    vatSubject,
    krsCheck,
    ceidgCheck,
    crbrCheck,
    pkdCodes,
    checks,
    isIndividualBusiness: actualIndividualBusiness,
    checkedAt: now,
  });
  const reportName = buildReportFileName(client.nazwa, nip, now);
  const pdf = await buildAmlReportPdf({
    clientName: client.nazwa || "Klient bez nazwy",
    nip,
    requesterName: auth.requesterName,
    createdAt: now,
    checks,
    result,
    registryDetails,
    beneficialOwners,
    pkdCodes,
  });
  const storagePath = `aml/${client.id}/verifications/${Date.now()}-${reportName}`;

  const upload = await auth.admin.storage.from(AML_REPORT_BUCKET).upload(storagePath, pdf, {
    cacheControl: "3600",
    contentType: "application/pdf",
    upsert: false,
  });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const { data: verification, error: verificationError } = await auth.admin
    .from("aml_weryfikacje")
    .insert({
      klient_id: client.id,
      aml_rejestr_id: register.id,
      wykonana_by: auth.requesterId,
      status: "wykonana",
      wynik: result,
      zrodla: visibleSourceChecks.map((check) => ({ source: check.source, status: check.status, label: check.label })),
      dane: { checks, dane_rejestrowe: registryDetails, beneficjenci_rzeczywisci: beneficialOwners, kody_pkd: pkdCodes },
      vat_status: checksVat ? (vatCheck.status === "ok" ? String(vatSubject?.statusVat || "sprawdzono") : vatCheck.status) : "nie_sprawdzono",
      vies_status: checksVies ? statusForSource(checks, "VIES") : "potwierdzono_brak_vat_ue",
      krs_status: statusForSource(checks, "KRS"),
      pep_status: "nie_sprawdzono",
      sankcje_status: "do_dopiecia",
      numer_krs: krsNumber,
      numer_regon: regonNumber,
      identyfikator_zapytania: requestId,
      pdf_path: storagePath,
      pdf_name: reportName,
    })
    .select("*")
    .single();

  if (verificationError || !verification) {
    return NextResponse.json({ error: verificationError?.message || "Nie udało się zapisać weryfikacji AML." }, { status: 500 });
  }

  const nextStatus = result === "pozytywna" ? "zweryfikowano_automatycznie" : "wymaga_analizy";
  const registerUpdate: Record<string, unknown> = {
    status: nextStatus,
    ostatnia_weryfikacja_at: now.toISOString(),
    ostatnia_weryfikacja_by: auth.requesterId,
    ostatnia_weryfikacja_id: verification.id,
    pep_status: "nie_sprawdzono",
    sankcje_status: "do_dopiecia",
    dane_rejestrowe: registryDetails,
    numer_regon: regonNumber,
    numer_krs: krsNumber || null,
    gus_status: "nie_uzyto",
    krs_status: statusForSource(checks, "KRS"),
    crbr_status: statusForSource(checks, "CRBR"),
    kody_pkd: pkdCodes,
    updated_at: now.toISOString(),
  };
  registerUpdate.beneficjenci_rzeczywisci = beneficialOwners;

  await auth.admin
    .from("aml_rejestr_klientow")
    .update(registerUpdate)
    .eq("id", register.id);

  await auth.admin.from("aml_historia").insert({
    klient_id: client.id,
    aml_rejestr_id: register.id,
    aml_weryfikacja_id: verification.id,
    akcja: "automatyczna_weryfikacja_aml",
    opis: `${auth.requesterName} wykonał automatyczną weryfikację AML w oficjalnych źródłach.`,
    zmiany: {
      status: nextStatus,
      wynik: result,
      sources: visibleSourceChecks.map((check) => ({ source: check.source, status: check.status, label: check.label })),
      dane_rejestrowe: registryDetails,
      beneficjenci_rzeczywisci: beneficialOwners,
      kody_pkd: pkdCodes,
      pdf_path: storagePath,
    },
    created_by: auth.requesterId,
  });

  await completeOnboardingAmlIfReady(auth.admin, client.id, auth.requesterId);

  return NextResponse.json({ ok: true, verification });
}

async function getAuthorizedUser(request: NextRequest): Promise<AuthorizedUser | { error: NextResponse }> {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return { error: NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 }) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 }) };
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const requesterId = userData.user?.id;
  if (userError || !requesterId) {
    return { error: NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 }) };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne, full_name, email")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false || !ALLOWED_ROLES.has(String(profile?.role || ""))) {
    return { error: NextResponse.json({ error: "Brak uprawnień do weryfikacji AML." }, { status: 403 }) };
  }

  return {
    admin,
    requesterId,
    requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik",
  };
}

async function ensureAmlRegister(admin: SupabaseClient, clientId: string) {
  const { data: existing } = await admin
    .from("aml_rejestr_klientow")
    .select("*")
    .eq("klient_id", clientId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await admin
    .from("aml_rejestr_klientow")
    .insert({ klient_id: clientId, status: "do_weryfikacji" })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "Nie udało się utworzyć wpisu AML.");
  return data;
}

async function verifyVatWhitelist(nip: string): Promise<OfficialCheck> {
  const date = new Date().toISOString().slice(0, 10);
  const url = `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`;
  const queryId = createSourceQueryId("VAT");
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { source: "Biała Lista VAT MF", status: "error", label: "Nie udało się pobrać danych VAT.", details: { identyfikatorZapytania: queryId, httpStatus: response.status, data, checkedAt: new Date().toISOString(), url } };
    }
    const requestId = data?.result?.requestId || null;
    return {
      source: "Biała Lista VAT MF",
      status: data?.result?.subject ? "ok" : "warning",
      label: data?.result?.subject ? "Podmiot odnaleziony w wykazie VAT." : "Brak podmiotu w wykazie VAT.",
      details: { identyfikatorZapytania: requestId || queryId, identyfikatorTechniczny: queryId, requestId, subject: data?.result?.subject, checkedAt: new Date().toISOString(), url },
    };
  } catch (error) {
    return { source: "Biała Lista VAT MF", status: "error", label: "Błąd połączenia z API MF.", details: { identyfikatorZapytania: queryId, message: errorMessage(error), checkedAt: new Date().toISOString(), url } };
  }
}

async function verifyVies(nip: string): Promise<OfficialCheck> {
  const queryId = createSourceQueryId("VIES");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>PL</urn:countryCode>
      <urn:vatNumber>${escapeXml(nip)}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`;

  const url = "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/xml;charset=UTF-8", soapaction: "" },
      body,
    });
    const text = await response.text();
    if (!response.ok) {
      return { source: "VIES Komisji Europejskiej", status: "error", label: "Nie udało się pobrać danych VIES.", details: { identyfikatorZapytania: queryId, httpStatus: response.status, response: text.slice(0, 1200), checkedAt: new Date().toISOString(), url } };
    }

    const valid = readXmlTag(text, "valid");
    const requestDate = readXmlTag(text, "requestDate");
    return {
      source: "VIES Komisji Europejskiej",
      status: valid === "true" ? "ok" : "warning",
      label: valid === "true" ? "Numer VAT-UE aktywny w VIES." : "Numer VAT-UE nieaktywny albo brak rejestracji w VIES.",
      details: {
        identyfikatorZapytania: queryId,
        countryCode: readXmlTag(text, "countryCode"),
        vatNumber: readXmlTag(text, "vatNumber"),
        requestDate,
        valid,
        name: readXmlTag(text, "name"),
        address: readXmlTag(text, "address"),
        checkedAt: new Date().toISOString(),
        url,
      },
    };
  } catch (error) {
    return { source: "VIES Komisji Europejskiej", status: "error", label: "Błąd połączenia z VIES.", details: { identyfikatorZapytania: queryId, message: errorMessage(error), checkedAt: new Date().toISOString(), url } };
  }
}

async function verifyKrs(krs: string): Promise<OfficialCheck> {
  const paddedKrs = krs.padStart(10, "0");
  const baseUrl = `https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${paddedKrs}`;
  const queryId = createSourceQueryId("KRS");

  for (const register of ["P", "S"]) {
    const url = `${baseUrl}?rejestr=${register}&format=json`;
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (response.status === 404) continue;
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return { source: "KRS Ministerstwa Sprawiedliwości", status: "error", label: "Nie udało się pobrać odpisu KRS.", details: { identyfikatorZapytania: queryId, httpStatus: response.status, data, checkedAt: new Date().toISOString(), url } };
      }
      return {
        source: "KRS Ministerstwa Sprawiedliwości",
        status: "ok",
        label: "Pobrano aktualny odpis KRS z API Ministerstwa Sprawiedliwości.",
        details: { identyfikatorZapytania: queryId, krs: paddedKrs, register, data, checkedAt: new Date().toISOString(), url },
      };
    } catch (error) {
      return { source: "KRS Ministerstwa Sprawiedliwości", status: "error", label: "Błąd połączenia z API KRS.", details: { identyfikatorZapytania: queryId, message: errorMessage(error), checkedAt: new Date().toISOString(), url } };
    }
  }

  return { source: "KRS Ministerstwa Sprawiedliwości", status: "warning", label: "Nie znaleziono odpisu KRS dla numeru z Białej Listy VAT.", details: { identyfikatorZapytania: queryId, krs: paddedKrs, checkedAt: new Date().toISOString() } };
}

async function verifyCeidg(nip: string): Promise<OfficialCheck> {
  if (!CEIDG_API_TOKEN) {
    return skippedCheck("CEIDG", "Dodaj sekret CEIDG_API_TOKEN, aby uruchomić automatyczne pobieranie danych i kodów PKD z CEIDG.");
  }

  const url = `${CEIDG_API_URL}?nip=${encodeURIComponent(nip)}`;
  const queryId = createSourceQueryId("CEIDG");
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${CEIDG_API_TOKEN}`,
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { source: "CEIDG", status: "error", label: "Nie udało się pobrać danych z API CEIDG.", details: { identyfikatorZapytania: queryId, httpStatus: response.status, data, checkedAt: new Date().toISOString(), url } };
    }

    const companies = await enrichCeidgCompanies(extractCeidgCompanies(data));
    return {
      source: "CEIDG",
      status: companies.length > 0 ? "ok" : "warning",
      label: companies.length > 0 ? "Podmiot odnaleziony w CEIDG." : "Brak podmiotu w CEIDG dla podanego NIP.",
      details: { identyfikatorZapytania: queryId, companies, data, checkedAt: new Date().toISOString(), url },
    };
  } catch (error) {
    return { source: "CEIDG", status: "error", label: "Błąd połączenia z API CEIDG.", details: { identyfikatorZapytania: queryId, message: errorMessage(error), checkedAt: new Date().toISOString(), url } };
  }
}

async function enrichCeidgCompanies(companies: Array<Record<string, unknown>>) {
  const token = CEIDG_API_TOKEN;
  if (!token) return companies;

  return Promise.all(companies.map(async (company) => {
    const link = firstText(company, ["link", "url", "href"]);
    if (!link || !/^https?:\/\//.test(link)) return company;

    try {
      const response = await fetch(link, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
        },
      });
      const details = await response.json().catch(() => null);
      if (!response.ok || !details) return company;
      return { ...company, szczegoly: details };
    } catch {
      return company;
    }
  }));
}

async function verifySanctionsLists(name: string, nip: string): Promise<OfficialCheck> {
  const queryId = createSourceQueryId("SANCTIONS");
  const normalizedName = normalizeTextForMatch(name);
  const normalizedNip = normalizeNip(nip);
  const sources = [
    {
      label: "Lista sankcyjna ONZ",
      url: "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
    },
  ];

  const matches: Array<{ source: string; value: string }> = [];
  const errors: Array<{ source: string; message: string }> = [];

  for (const source of sources) {
    try {
      const response = await fetch(source.url, { headers: { accept: "application/xml,text/xml,*/*" } });
      const text = await response.text();
      if (!response.ok) {
        errors.push({ source: source.label, message: `HTTP ${response.status}` });
        continue;
      }

      const normalizedList = normalizeTextForMatch(text);
      if (normalizedName && normalizedList.includes(normalizedName)) {
        matches.push({ source: source.label, value: name });
      }
      if (normalizedNip && text.replace(/\D/g, "").includes(normalizedNip)) {
        matches.push({ source: source.label, value: normalizedNip });
      }
    } catch (error) {
      errors.push({ source: source.label, message: errorMessage(error) });
    }
  }

  if (matches.length > 0) {
    return {
      source: "Listy sankcyjne",
      status: "warning",
      label: "W publicznych listach sankcyjnych znaleziono potencjalne dopasowanie. Wymagana analiza ręczna.",
      details: { identyfikatorZapytania: queryId, matches, errors, checkedAt: new Date().toISOString() },
    };
  }

  if (errors.length === sources.length) {
    return {
      source: "Listy sankcyjne",
      status: "error",
      label: "Nie udało się pobrać publicznych list sankcyjnych.",
      details: { identyfikatorZapytania: queryId, errors, checkedAt: new Date().toISOString() },
    };
  }

  return {
    source: "Listy sankcyjne",
    status: "ok",
    label: "Nie znaleziono podmiotu na sprawdzonych publicznych listach sankcyjnych.",
    details: { identyfikatorZapytania: queryId, checkedSources: sources.map((source) => source.label), errors, checkedAt: new Date().toISOString() },
  };
}

function normalizeTextForMatch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function mergeManualBeneficialOwnerEdits(existingOwnersValue: unknown, downloadedOwners: Array<Record<string, unknown>>) {
  const existingOwners = Array.isArray(existingOwnersValue)
    ? existingOwnersValue as Array<Record<string, unknown>>
    : [];
  const manualOwnersByKey = new Map<string, Record<string, unknown>>();

  existingOwners
    .filter((owner) => Boolean(owner.manualnaAktualizacja))
    .forEach((owner) => {
      beneficialOwnerIdentityKeys(owner).forEach((key) => {
        if (!manualOwnersByKey.has(key)) manualOwnersByKey.set(key, owner);
      });
    });

  if (manualOwnersByKey.size === 0) return downloadedOwners;

  return downloadedOwners.map((owner) => {
    const manualOwner = beneficialOwnerIdentityKeys(owner)
      .map((key) => manualOwnersByKey.get(key))
      .find(Boolean);

    if (!manualOwner) return owner;

    return {
      ...owner,
      rola: manualOwner.rola ?? owner.rola,
      reprezentant: manualOwner.reprezentant ?? owner.reprezentant,
      udzialowiec: manualOwner.udzialowiec ?? owner.udzialowiec,
      procentUdzialow: manualOwner.procentUdzialow ?? owner.procentUdzialow,
      wartoscUdzialow: manualOwner.wartoscUdzialow ?? owner.wartoscUdzialow,
      manualnaAktualizacja: manualOwner.manualnaAktualizacja,
    };
  });
}

function beneficialOwnerIdentityKeys(owner: Record<string, unknown>) {
  const keys: string[] = [];
  const pesel = String(owner.pesel || "").replace(/\D/g, "");
  if (pesel) keys.push(`pesel:${pesel}`);

  const name = normalizePersonName([
    owner.pierwszeImie,
    owner.kolejneImiona,
    owner.nazwisko,
  ].filter(Boolean).join(" ") || String(owner.label || ""));
  const company = beneficialOwnerCompanyKey(owner);

  if (name && company) keys.push(`name-company:${name}:${company}`);
  if (name) keys.push(`name:${name}`);

  return keys;
}

function beneficialOwnerCompanyKey(owner: Record<string, unknown>) {
  const company = owner.spolka;
  if (!company || typeof company !== "object") return "";

  const record = company as Record<string, unknown>;
  const krs = normalizeKrs(String(record.krs || ""));
  if (krs) return `krs:${krs}`;

  const nip = normalizeNip(record.nip);
  if (nip) return `nip:${nip}`;

  return normalizeTextForMatch(String(record.nazwa || ""));
}
async function verifyCrbr(nip: string, krs: string | null): Promise<OfficialCheck> {
  const queryId = createSourceQueryId("CRBR");
  const searchTag = krs ? `<api:KRS>${escapeXml(krs.padStart(10, "0"))}</api:KRS>` : `<api:NIP>${escapeXml(nip)}</api:NIP>`;
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="${CRBR_SERVICE_NAMESPACE}" xmlns:api="${CRBR_SCHEMA_NAMESPACE}">
  <soap:Header/>
  <soap:Body>
    <ns:PobierzInformacjeOSpolkachIBeneficjentach>
      <PobierzInformacjeOSpolkachIBeneficjentachDane>
        <api:SzczegolyWniosku>${searchTag}</api:SzczegolyWniosku>
      </PobierzInformacjeOSpolkachIBeneficjentachDane>
    </ns:PobierzInformacjeOSpolkachIBeneficjentach>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch(CRBR_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/soap+xml; charset=utf-8",
        accept: "application/soap+xml, text/xml",
        soapaction: `${CRBR_SERVICE_NAMESPACE}/PobierzInformacjeOSpolkachIBeneficjentach`,
      },
      body: envelope,
    });
    const xml = await response.text();
    if (!response.ok) {
      return { source: "CRBR", status: "error", label: "Nie udało się pobrać danych z CRBR.", details: { identyfikatorZapytania: queryId, httpStatus: response.status, response: xml.slice(0, 1200), checkedAt: new Date().toISOString(), url: CRBR_API_URL } };
    }

    const status = readXmlTag(xml, "Status") || "";
    const requestMeta = {
      identyfikatorWniosku: readFirstXmlTag(xml, ["IdentyfikatorWniosku", "IdentyfikatorZlozonegoWniosku", "IdentyfikatorZłożonegoWniosku"]),
      dataICzasZlozeniaWniosku: readFirstXmlTag(xml, ["DataICzasZlozeniaWniosku", "DataICzasZłożeniaWniosku", "DataZlozeniaWniosku", "DataZłożeniaWniosku"]),
      dataICzasUdostepnieniaWniosku: readFirstXmlTag(xml, ["DataICzasUdostepnieniaWniosku", "DataICzasUdostępnieniaWniosku", "DataUdostepnieniaWniosku", "DataUdostępnieniaWniosku"]),
      celZapytania: readXmlTag(xml, "CelZapytania"),
      kryterium: krs ? "KRS" : "NIP",
      wartoscKryterium: krs ? krs.padStart(10, "0") : nip,
    };
    const companies = parseCrbrCompanies(xml);
    const hasOwners = companies.some((company) => company.beneficjenci.length > 0);
    return {
      source: "CRBR",
      status: hasOwners ? "ok" : "warning",
      label: hasOwners ? "Pobrano beneficjentów rzeczywistych z CRBR." : "CRBR nie zwrócił beneficjentów dla podmiotu.",
      details: { identyfikatorZapytania: queryId, status, requestMeta, companies, checkedAt: new Date().toISOString(), url: CRBR_API_URL, searchBy: krs ? "KRS" : "NIP" },
    };
  } catch (error) {
    return { source: "CRBR", status: "error", label: "Błąd połączenia z CRBR.", details: { identyfikatorZapytania: queryId, message: errorMessage(error), checkedAt: new Date().toISOString(), url: CRBR_API_URL } };
  }
}

function skippedCheck(source: string, label: string): OfficialCheck {
  return { source, status: "skipped", label, details: { identyfikatorZapytania: createSourceQueryId(source), checkedAt: new Date().toISOString() } };
}

function confirmedCheck(source: string, label: string): OfficialCheck {
  return { source, status: "confirmed", label, details: { identyfikatorZapytania: createSourceQueryId(source), checkedAt: new Date().toISOString() } };
}

function summarizeResult(checks: OfficialCheck[]) {
  if (checks.some((check) => check.status === "error")) return "wymaga_analizy";
  if (checks.some((check) => check.status === "warning")) return "wymaga_analizy";
  return "pozytywna";
}

function statusForSource(checks: OfficialCheck[], source: string) {
  const check = checks.find((item) => item.source.toLowerCase().includes(source.toLowerCase()));
  return check?.status || "nie_sprawdzono";
}

function statusForAnySource(checks: OfficialCheck[], sources: string[]) {
  for (const source of sources) {
    const check = checks.find((item) => item.source.toLowerCase().includes(source.toLowerCase()));
    if (check) return check.status;
  }
  return "nie_sprawdzono";
}

function createSourceQueryId(source: string) {
  const sourcePart = normalizeTextForMatch(source).replace(/\s+/g, "-").toUpperCase().slice(0, 18) || "SOURCE";
  const datePart = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()
    : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `AML-${sourcePart}-${datePart}-${randomPart}`;
}

function getVatSubject(check: OfficialCheck) {
  const details = check.details as { subject?: Record<string, unknown> };
  return details.subject || null;
}

function getCeidgIdentity(check: OfficialCheck) {
  const details = check.details as { companies?: Array<Record<string, unknown>> };
  const company = ceidgCompanyFromDetails(details);
  if (!company) return { regon: null as string | null, krs: null as string | null };

  return {
    regon: firstDeepText(company, ["regon", "REGON", "numerRegon", "numer_regon"]),
    krs: firstDeepText(company, ["krs", "KRS", "numerKrs", "numer_krs"]),
  };
}

function getCeidgRegistryData(check: OfficialCheck | null | undefined) {
  const details = check?.details as { companies?: Array<Record<string, unknown>> } | undefined;
  const company = ceidgCompanyFromDetails(details);
  const owner = company ? firstDeepRecord(company, ["wlasciciel", "właściciel", "owner"]) : null;
  const businessAddress = company ? firstDeepRecord(company, ["adresDzialalnosci", "adresDziałalnosci", "adresDziałalności", "adres"]) : null;
  const residenceAddress = company ? firstDeepRecord(company, ["adresZamieszkania", "adresDoDoreczen", "adresDoDoręczeń"]) : null;
  const ownerLabel = owner ? [firstDeepText(owner, ["imie", "pierwszeImie", "imiona"]), firstDeepText(owner, ["nazwisko"])].filter(Boolean).join(" ").trim() : "";

  return {
    company,
    owner,
    nazwa: company ? firstDeepText(company, ["nazwa", "firma", "name"]) : null,
    adres: formatRegistryAddress(businessAddress) || formatRegistryAddress(residenceAddress),
    forma: company ? "Jednoosobowa działalność gospodarcza" : null,
    przedsiebiorca: ownerLabel || null,
  };
}

function ceidgCompanyFromDetails(details: { companies?: Array<Record<string, unknown>> } | undefined) {
  return Array.isArray(details?.companies) ? details.companies[0] : null;
}

function getCrbrIdentity(check: OfficialCheck) {
  const details = check.details as { companies?: Array<Record<string, unknown>> };
  const company = Array.isArray(details.companies) ? details.companies[0] : null;
  if (!company) return { krs: null as string | null };

  return {
    krs: firstDeepText(company, ["krs", "KRS", "numerKrs", "numer_krs"]),
  };
}

function getKrsIdentity(check: OfficialCheck) {
  const details = check.details as { krs?: string; data?: unknown };
  return {
    regon: firstDeepText(details.data, ["regon", "REGON", "numerRegon", "numer_regon"]),
    krs: details.krs || firstDeepText(details.data, ["numerKRS", "numerKrs", "krs", "KRS"]),
  };
}

function looksLikeLegalEntity(...values: Array<string | null | undefined>) {
  const text = normalizeTextForMatch(values.filter(Boolean).join(" "));
  return /\b(spolka|spolki|sp z o o|sp zoo|z ograniczona odpowiedzialnoscia|akcyjna|s a|komandyt|jawna|partnerska|fundacja|stowarzyszenie|spoldzielnia)\b/.test(text);
}

function firstDeepText(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstDeepText(item, keys);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    if (typeof direct === "number") return String(direct);
  }

  for (const nested of Object.values(record)) {
    const found = firstDeepText(nested, keys);
    if (found) return found;
  }
  return null;
}

function firstDeepRecord(value: unknown, keys: string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstDeepRecord(item, keys);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct as Record<string, unknown>;
  }

  for (const nested of Object.values(record)) {
    const found = firstDeepRecord(nested, keys);
    if (found) return found;
  }
  return null;
}

function formatRegistryAddress(address: Record<string, unknown> | null) {
  if (!address) return null;
  const parts = [
    firstDeepText(address, ["kod", "kodPocztowy", "kod_pocztowy"]),
    firstDeepText(address, ["miejscowosc", "miejscowość", "miasto"]),
    firstDeepText(address, ["ulica"]),
    firstDeepText(address, ["budynek", "nrBudynku", "nrDomu", "numerDomu"]),
    firstDeepText(address, ["lokal", "nrLokalu", "numerLokalu"]),
  ].filter(Boolean);
  return parts.join(" ").trim() || null;
}

function extractCeidgCompanies(data: unknown) {
  const root = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const candidates = [root.firmy, root.data, root.items, root.results, root.result];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Array<Record<string, unknown>>;
  }
  return [];
}

function collectPkdCodes(...checks: Array<OfficialCheck | null | undefined>): PkdCode[] {
  const codes = new Map<string, PkdCode>();

  for (const check of checks) {
    if (!check) continue;
    const source = check.source.includes("KRS") ? "KRS" : check.source;
    const extracted = source === "KRS" ? extractKrsPkdCodes(check.details) : extractPkdCodes(check.details, source);
    for (const item of extracted) {
      const key = `${item.zrodlo}:${item.kod}`;
      const existing = codes.get(key);
      codes.set(key, {
        kod: item.kod,
        nazwa: existing?.nazwa || item.nazwa,
        przewazajace: Boolean(existing?.przewazajace || item.przewazajace),
        zrodlo: item.zrodlo,
      });
    }
  }

  return [...codes.values()].sort((first, second) => {
    if (first.przewazajace !== second.przewazajace) return first.przewazajace ? -1 : 1;
    return first.kod.localeCompare(second.kod, "pl");
  });
}

function extractPkdCodes(value: unknown, source: string, inPkdNode = false): PkdCode[] {
  if (typeof value === "string") {
    return inPkdNode ? pkdCodesFromText(value, source) : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractPkdCodes(item, source, inPkdNode));
  }
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const hasPkdKey = Object.keys(record).some((key) => key.toLowerCase().includes("pkd"));
  const pkdRecord = inPkdNode || hasPkdKey;
  const directCode = firstText(record, ["kod", "kodPkd", "kod_pkd", "pkd", "code"]);
  const krsCompositeCode = record.kodDzial && record.kodKlasa
    ? `${String(record.kodDzial)}${String(record.kodKlasa)}${record.kodPodklasa ? String(record.kodPodklasa) : ""}`
    : null;
  const directName = firstText(record, ["nazwa", "opis", "opisPkd", "name"]);
  const mainFlag = Boolean(record.przewazajace || record.przeważające || record.glowne || record.główne || record.main || Object.keys(record).some((key) => key.toLowerCase().includes("przewazajacej")));
  const finalCode = directCode || krsCompositeCode;
  const directCodes = pkdRecord && finalCode
    ? [{ kod: formatPkdCode(finalCode), nazwa: directName, przewazajace: mainFlag, zrodlo: source }]
    : [];

  const nestedCodes = Object.entries(record).flatMap(([key, item]) => {
    const lowerKey = key.toLowerCase();
    const childInPkd = isPkdContainerKey(lowerKey) || (pkdRecord && isPkdActivityChildKey(lowerKey));
    const childCodes = extractPkdCodes(item, source, childInPkd);
    return lowerKey.includes("przewazajacej") ? childCodes.map((code) => ({ ...code, przewazajace: true })) : childCodes;
  });

  return [...directCodes, ...nestedCodes].filter((item) => item.kod !== "");
}

function isPkdContainerKey(lowerKey: string) {
  return lowerKey.includes("pkd") || lowerKey.includes("przedmiotdzialalnosci") || lowerKey.includes("przedmiotdziałalności");
}

function isPkdActivityChildKey(lowerKey: string) {
  return (lowerKey.includes("dzialalnosci") || lowerKey.includes("działalności")) && !lowerKey.includes("adres");
}

function pkdCodesFromText(value: string, source: string): PkdCode[] {
  const matches = [...value.toUpperCase().matchAll(/\b(\d{2})[.\s-]?(\d{2})(?:[.\s-]?([A-Z]))?\b/g)];
  return matches.map((match) => ({
    kod: formatPkdCode(`${match[1]}${match[2]}${match[3] || ""}`),
    nazwa: null,
    przewazajace: false,
    zrodlo: source,
  }));
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function formatPkdCode(value: string) {
  const compact = value.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const match = compact.match(/^(\d{2})(\d{2})([A-Z])?$/);
  if (!match) return value.trim();
  return match[3] ? `${match[1]}.${match[2]}.${match[3]}` : `${match[1]}.${match[2]}`;
}

function extractKrsPkdCodes(details: Record<string, unknown>): PkdCode[] {
  return extractPkdCodes(details, "KRS");
}

function buildRegistryDetails(input: {
  nip: string;
  vatSubject: Record<string, unknown> | null;
  krsCheck: OfficialCheck;
  ceidgCheck: OfficialCheck | null;
  crbrCheck: OfficialCheck;
  pkdCodes: PkdCode[];
  checks: OfficialCheck[];
  isIndividualBusiness: boolean;
  checkedAt: Date;
}) {
  const krsDetails = input.krsCheck.details as { krs?: string; register?: string; data?: unknown; url?: string };
  const ceidgDetails = input.ceidgCheck?.details as { companies?: unknown[]; url?: string } | undefined;
  const vatCheck = input.checks.find((check) => normalizeTextForMatch(check.source).includes("biala lista") || check.source === "Status VAT");
  const vatDetails = vatCheck?.details as { identyfikatorZapytania?: unknown; identyfikatorTechniczny?: unknown; requestId?: unknown } | undefined;
  const ceidgIdentity = input.ceidgCheck ? getCeidgIdentity(input.ceidgCheck) : { regon: null, krs: null };
  const ceidgRegistry = getCeidgRegistryData(input.ceidgCheck);
  const crbrIdentity = getCrbrIdentity(input.crbrCheck);
  const krsIdentity = getKrsIdentity(input.krsCheck);
  const registryKrs = input.isIndividualBusiness ? null : String(input.vatSubject?.krs || krsDetails.krs || krsIdentity.krs || crbrIdentity.krs || ceidgIdentity.krs || "") || null;

  return {
    updatedAt: input.checkedAt.toISOString(),
    typPodmiotu: input.isIndividualBusiness ? "jdg" : "podmiot_krs",
    identyfikatory: {
      nip: input.nip,
      regon: String(input.vatSubject?.regon || krsIdentity.regon || ceidgIdentity.regon || "") || null,
      krs: registryKrs,
      rejestr: input.isIndividualBusiness ? null : krsDetails.register === "P" ? "Rejestr przedsiębiorców" : krsDetails.register || null,
      nazwa: input.isIndividualBusiness ? ceidgRegistry.nazwa : null,
      adres: input.isIndividualBusiness ? ceidgRegistry.adres : null,
      forma: input.isIndividualBusiness ? ceidgRegistry.forma : null,
    },
    statusy: {
      vat: statusForAnySource(input.checks, ["Status VAT", "Biała Lista VAT"]),
      vies: statusForSource(input.checks, "VIES"),
      krs: statusForSource(input.checks, "KRS"),
      ceidg: statusForSource(input.checks, "CEIDG"),
      crbr: statusForSource(input.checks, "CRBR"),
    },
    kodyPkd: input.pkdCodes,
    ceidg: input.ceidgCheck?.status === "ok" ? {
      liczbaWpisow: Array.isArray(ceidgDetails?.companies) ? ceidgDetails.companies.length : 0,
      url: ceidgDetails?.url || null,
      dane: ceidgRegistry.company || null,
      nazwa: ceidgRegistry.nazwa,
      adres: ceidgRegistry.adres,
      forma: ceidgRegistry.forma,
      przedsiebiorca: ceidgRegistry.przedsiebiorca,
    } : null,
    krs: input.krsCheck.status === "ok" ? {
      numer: krsDetails.krs || null,
      rejestr: krsDetails.register || null,
      pobranoOdpis: true,
      url: krsDetails.url || null,
      dane: krsDetails.data || null,
    } : null,
    bialaListaVat: input.vatSubject ? {
      identyfikatorZapytania: vatDetails?.identyfikatorZapytania || vatDetails?.requestId || null,
      identyfikatorTechniczny: vatDetails?.identyfikatorTechniczny || null,
      requestId: vatDetails?.requestId || null,
      nazwa: input.vatSubject.name || null,
      statusVat: input.vatSubject.statusVat || null,
      regon: input.vatSubject.regon || null,
      krs: input.vatSubject.krs || null,
      adresSiedziby: input.vatSubject.residenceAddress || null,
      adresDzialalnosci: input.vatSubject.workingAddress || null,
      rachunki: Array.isArray(input.vatSubject.accountNumbers) ? input.vatSubject.accountNumbers : [],
    } : null,
    crbr: input.crbrCheck.status === "ok" ? input.crbrCheck.details : null,
  };
}

async function getLatestIndividualInitialFormData(admin: SupabaseClient, clientId: string) {
  const { data } = await admin
    .from("aml_formularze_wstepne")
    .select("form_data")
    .eq("klient_id", clientId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const formData = data?.form_data && typeof data.form_data === "object" ? data.form_data as Record<string, unknown> : null;
  return formData?.individual && typeof formData.individual === "object" ? formData.individual as Record<string, unknown> : null;
}

function buildJdgBeneficialOwners(check: OfficialCheck | null, clientName: string | null, nip: string, checkedAt: Date, initialFormIndividual: Record<string, unknown> | null) {
  const ceidg = getCeidgRegistryData(check);
  const owner = ceidg.owner || {};
  const label = ceidg.przedsiebiorca || clientName || "Przedsiębiorca";
  return [{
    typ: "jdg",
    source: "CEIDG",
    status: "pobrano",
    label,
    pierwszeImie: firstDeepText(owner, ["imie", "pierwszeImie", "imiona"]),
    nazwisko: firstDeepText(owner, ["nazwisko"]),
    pesel: firstText(initialFormIndividual || {}, ["peselOrBirthDate"]),
    adresZamieszkania: firstText(initialFormIndividual || {}, ["residenceAddress"]),
    krajZamieszkania: firstText(initialFormIndividual || {}, ["residenceAddress"]),
    nip: firstDeepText(owner, ["nip"]) || nip,
    regon: firstDeepText(owner, ["regon"]),
    spolka: { nazwa: ceidg.nazwa || clientName || null, nip, forma: "Jednoosobowa działalność gospodarcza" },
    checkedAt: checkedAt.toISOString(),
  }];
}

function extractCrbrBeneficialOwners(check: OfficialCheck, checkedAt: Date, krsCheck: OfficialCheck) {
  const details = check.details as { companies?: Array<{ beneficjenci?: Array<Record<string, unknown>>; nazwa?: string; nip?: string; krs?: string }> };
  const companies = Array.isArray(details.companies) ? details.companies : [];
  const krsRepresentatives = collectKrsRepresentativeNames(krsCheck);
  const krsShareholders = collectKrsShareholderDetails(krsCheck);
  const owners = companies.flatMap((company) => (company.beneficjenci || []).map((owner) => ({
    source: "CRBR",
    status: "pobrano",
    label: [owner.pierwszeImie, owner.kolejneImiona, owner.nazwisko].filter(Boolean).join(" ").trim() || "Beneficjent rzeczywisty",
    pierwszeImie: owner.pierwszeImie || null,
    kolejneImiona: owner.kolejneImiona || null,
    nazwisko: owner.nazwisko || null,
    pesel: owner.pesel || null,
    obywatelstwo: owner.obywatelstwo || null,
    krajZamieszkania: owner.krajZamieszkania || null,
    dataUrodzenia: owner.dataUrodzenia || null,
    rola: owner.rola || null,
    reprezentant: owner.reprezentant || krsRepresentatives.has(normalizePersonName([owner.pierwszeImie, owner.kolejneImiona, owner.nazwisko].filter(Boolean).join(" "))),
    udzialowiec: owner.udzialowiec ?? isShareholderRole(String(owner.rola || ""), Array.isArray(owner.udzialy) ? owner.udzialy : []),
    liczbaUdzialow: owner.liczbaUdzialow || krsShareholders.get(normalizePersonName([owner.pierwszeImie, owner.kolejneImiona, owner.nazwisko].filter(Boolean).join(" ")))?.liczbaUdzialow || null,
    procentUdzialow: owner.procentUdzialow || krsShareholders.get(normalizePersonName([owner.pierwszeImie, owner.kolejneImiona, owner.nazwisko].filter(Boolean).join(" ")))?.procentUdzialow || null,
    wartoscUdzialow: owner.wartoscUdzialow || krsShareholders.get(normalizePersonName([owner.pierwszeImie, owner.kolejneImiona, owner.nazwisko].filter(Boolean).join(" ")))?.wartoscUdzialow || null,
    liczbaGlosow: owner.liczbaGlosow || krsShareholders.get(normalizePersonName([owner.pierwszeImie, owner.kolejneImiona, owner.nazwisko].filter(Boolean).join(" ")))?.liczbaGlosow || null,
    procentGlosow: owner.procentGlosow || krsShareholders.get(normalizePersonName([owner.pierwszeImie, owner.kolejneImiona, owner.nazwisko].filter(Boolean).join(" ")))?.procentGlosow || null,
    udzialy: Array.isArray(owner.udzialy) ? owner.udzialy : [],
    spolka: { nazwa: company.nazwa || null, nip: company.nip || null, krs: company.krs || null },
    checkedAt: checkedAt.toISOString(),
  })));

  return owners;
}

function normalizeNip(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeKrs(value: string) {
  return value.replace(/\D/g, "");
}

function readXmlTag(xml: string, tag: string) {
  const pattern = new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i");
  const match = xml.match(pattern);
  return match?.[1] ? decodeXmlEntities(match[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, "").trim()) || null : null;
}

function parseCrbrCompanies(xml: string) {
  return xmlBlocks(xml, "SpolkaIBeneficjenci").map((block) => ({
    nazwa: readXmlTag(block, "Nazwa"),
    nip: readXmlTag(block, "NIP"),
    krs: readXmlTag(block, "KRS"),
    formaOrganizacyjna: readXmlTag(block, "OpisFormyOrganizacyjnej"),
    poczatkowaDataPrezentacjiZgloszenia: readFirstXmlTag(block, ["PoczatkowaDataPrezentacjiZgloszenia", "PoczątkowaDataPrezentacjiZgłoszenia", "DataOd"]),
    koncowaDataPrezentacjiZgloszenia: readFirstXmlTag(block, ["KoncowaDataPrezentacjiZgloszenia", "KońcowaDataPrezentacjiZgłoszenia", "DataDo"]),
    kodPocztowy: readXmlTag(block, "KodPocztowy"),
    miejscowosc: readXmlTag(block, "Miejscowosc"),
    ulica: readXmlTag(block, "Ulica"),
    numerDomu: readXmlTag(block, "NrDomu") || readXmlTag(block, "Numer") || readXmlTag(block, "NumerDomu"),
    numerLokalu: readXmlTag(block, "NrLokalu") || readXmlTag(block, "NumerLokalu"),
    adres: [
      readXmlTag(block, "KodPocztowy"),
      readXmlTag(block, "Miejscowosc"),
      readXmlTag(block, "Ulica"),
      readXmlTag(block, "NrDomu") || readXmlTag(block, "Numer"),
      readXmlTag(block, "NrLokalu"),
    ].filter(Boolean).join(" "),
    beneficjenci: xmlBlocks(block, "BeneficjentRzeczywisty").map((ownerBlock) => {
      const shareBlocks = xmlBlocks(ownerBlock, "InformacjaOUdzialach");
      const ownershipDescriptions = shareBlocks.map(readOwnershipDescription).filter(Boolean) as string[];
      return {
        pierwszeImie: readXmlTag(ownerBlock, "PierwszeImie"),
        kolejneImiona: readXmlTag(ownerBlock, "KolejneImiona"),
        nazwisko: readXmlTag(ownerBlock, "Nazwisko"),
        pesel: readXmlTag(ownerBlock, "PESEL"),
        dataUrodzenia: readXmlTag(ownerBlock, "DataUrodzenia"),
        obywatelstwo: readDictionaryValue(ownerBlock, "Obywatelstwo"),
        krajZamieszkania: readDictionaryValue(ownerBlock, "KrajZamieszkania"),
        rola: readBeneficiaryRole(ownerBlock, ownershipDescriptions),
        reprezentant: isCrbrRepresentative(ownerBlock, ownershipDescriptions),
        udzialowiec: isCrbrShareholder(ownerBlock, ownershipDescriptions),
        liczbaUdzialow: readFirstXmlTag(ownerBlock, ["LiczbaUdzialow", "IloscUdzialow", "LiczbaAkcji"]),
        procentUdzialow: readFirstXmlTag(ownerBlock, ["ProcentUdzialow", "UdzialProcentowy", "WartoscProcentowaUdzialow", "ProcentAkcji"]),
        wartoscUdzialow: readFirstXmlTag(ownerBlock, ["WartoscUdzialow", "WartoscNominalnaUdzialow", "WartoscAkcji"]),
        liczbaGlosow: readFirstXmlTag(ownerBlock, ["LiczbaGlosow", "IloscGlosow"]),
        procentGlosow: readFirstXmlTag(ownerBlock, ["ProcentGlosow", "UdzialProcentowyGlosow", "WartoscProcentowaGlosow"]),
        udzialy: shareBlocks.map((shareBlock) => ({
          rodzaj: readOwnershipDescription(shareBlock),
          ilosc: readXmlTag(shareBlock, "Ilosc"),
          jednostka: readDictionaryValue(shareBlock, "JednostkaMiary"),
          liczbaUdzialow: readFirstXmlTag(shareBlock, ["LiczbaUdzialow", "IloscUdzialow", "LiczbaAkcji", "Ilosc"]),
          procentUdzialow: readFirstXmlTag(shareBlock, ["ProcentUdzialow", "UdzialProcentowy", "WartoscProcentowaUdzialow", "ProcentAkcji"]),
          wartoscUdzialow: readFirstXmlTag(shareBlock, ["WartoscUdzialow", "WartoscNominalnaUdzialow", "WartoscAkcji"]),
          liczbaGlosow: readFirstXmlTag(shareBlock, ["LiczbaGlosow", "IloscGlosow"]),
          procentGlosow: readFirstXmlTag(shareBlock, ["ProcentGlosow", "UdzialProcentowyGlosow", "WartoscProcentowaGlosow"]),
        })),
      };
    }),
    reprezentanci: xmlBlocksAny(block, ["Reprezentant", "ReprezentantZglaszajacy", "ReprezentantZgłaszający", "OsobaReprezentujaca", "OsobaReprezentująca"]).map((representativeBlock) => ({
      pierwszeImie: readXmlTag(representativeBlock, "PierwszeImie"),
      kolejneImiona: readXmlTag(representativeBlock, "KolejneImiona"),
      nazwisko: readXmlTag(representativeBlock, "Nazwisko"),
      pesel: readXmlTag(representativeBlock, "PESEL"),
      dataUrodzenia: readXmlTag(representativeBlock, "DataUrodzenia"),
      obywatelstwo: readDictionaryValue(representativeBlock, "Obywatelstwo"),
      krajZamieszkania: readDictionaryValue(representativeBlock, "KrajZamieszkania"),
      funkcja: readDictionaryValue(representativeBlock, "FunkcjaZglaszajacego")
        || readDictionaryValue(representativeBlock, "FunkcjaZgłaszającego")
        || readDictionaryValue(representativeBlock, "Funkcja")
        || "REPREZENTANT",
    })),
  }));
}

function readDictionaryValue(xml: string, tag: string) {
  const block = xmlBlocks(xml, tag)[0];
  if (!block) return readXmlTag(xml, tag);
  return readXmlTag(block, "Nazwa") || readXmlTag(block, "Opis") || readXmlTag(block, "Kod") || readXmlTag(xml, tag);
}

function readFirstXmlTag(xml: string, tags: string[]) {
  for (const tag of tags) {
    const value = readXmlTag(xml, tag);
    if (value) return value;
  }
  return null;
}

function readBeneficiaryRole(ownerBlock: string, ownershipDescriptions: string[]) {
  return readDictionaryValue(ownerBlock, "RodzajBeneficjenta")
    || readDictionaryValue(ownerBlock, "Funkcja")
    || readDictionaryValue(ownerBlock, "Rola")
    || ownershipDescriptions.join("; ")
    || null;
}

function isCrbrRepresentative(ownerBlock: string, ownershipDescriptions: string[]) {
  const text = normalizeTextForMatch([
    readXmlTag(ownerBlock, "CzyReprezentant"),
    readDictionaryValue(ownerBlock, "Funkcja"),
    readDictionaryValue(ownerBlock, "Rola"),
    ownershipDescriptions.join(" "),
  ].filter(Boolean).join(" "));
  if (/\b(true|tak|1)\b/.test(text)) return true;
  if (/\breprezent/.test(text) || /\bzarzad/.test(text) || /\bprokur/.test(text)) return true;
  return false;
}

function isCrbrShareholder(ownerBlock: string, ownershipDescriptions: string[]) {
  const text = normalizeTextForMatch([
    readXmlTag(ownerBlock, "CzyUdzialowiec"),
    readDictionaryValue(ownerBlock, "Funkcja"),
    readDictionaryValue(ownerBlock, "Rola"),
    ownershipDescriptions.join(" "),
  ].filter(Boolean).join(" "));
  if (/\b(true|tak|1)\b/.test(text)) return true;
  if (/\bwspolnik|\budzial|akcj|wlasci|glos/.test(text)) return true;
  return false;
}

function isShareholderRole(role: string, shares: unknown[]) {
  const text = normalizeTextForMatch(role);
  return shares.length > 0 || /\bwspolnik|\budzial|akcj|wlasci|glos/.test(text);
}

function collectKrsRepresentativeNames(krsCheck: OfficialCheck) {
  const details = krsCheck.details as { data?: unknown };
  const names = new Set<string>();
  collectRepresentativeNames(details.data, "", names);
  return names;
}

function collectKrsShareholderDetails(krsCheck: OfficialCheck) {
  const details = krsCheck.details as { data?: unknown };
  const shareholders = new Map<string, Record<string, string | null>>();
  collectShareholderDetails(details.data, "", shareholders);
  return shareholders;
}

function collectRepresentativeNames(value: unknown, context: string, names: Set<string>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectRepresentativeNames(item, context, names));
    return;
  }

  const record = value as Record<string, unknown>;
  const nextContext = normalizeTextForMatch(`${context} ${Object.keys(record).join(" ")}`);
  const firstName = firstText(record, ["imie", "imiona", "pierwszeImie", "pierwsze_imie"]);
  const lastName = firstText(record, ["nazwisko", "nazwiskoNazwa", "nazwisko_nazwa"]);
  if (firstName && lastName && /\breprezent|zarzad|prokur|organ/.test(nextContext)) {
    names.add(normalizePersonName(`${firstName} ${lastName}`));
  }

  Object.entries(record).forEach(([key, nested]) => {
    collectRepresentativeNames(nested, `${nextContext} ${key}`, names);
  });
}

function collectShareholderDetails(value: unknown, context: string, shareholders: Map<string, Record<string, string | null>>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectShareholderDetails(item, context, shareholders));
    return;
  }

  const record = value as Record<string, unknown>;
  const nextContext = normalizeTextForMatch(`${context} ${Object.keys(record).join(" ")}`);
  const firstName = firstText(record, ["imie", "imiona", "pierwszeImie", "pierwsze_imie"]);
  const lastName = firstText(record, ["nazwisko", "nazwiskoNazwa", "nazwisko_nazwa"]);
  const isShareholderContext = /\bwspolnik|\budzial|akcj|glos|kapital/.test(nextContext);

  if (firstName && lastName && isShareholderContext) {
    const name = normalizePersonName(`${firstName} ${lastName}`);
    const existing = shareholders.get(name) || {};
    shareholders.set(name, {
      liczbaUdzialow: existing.liczbaUdzialow || firstDeepText(record, ["liczbaUdzialow", "iloscUdzialow", "liczbaAkcji", "ilosc"]),
      procentUdzialow: existing.procentUdzialow || firstDeepText(record, ["procentUdzialow", "udzialProcentowy", "procentAkcji"]),
      wartoscUdzialow: existing.wartoscUdzialow || firstDeepText(record, ["wartoscUdzialow", "wartoscNominalnaUdzialow", "wartoscAkcji", "wartosc"]),
      liczbaGlosow: existing.liczbaGlosow || firstDeepText(record, ["liczbaGlosow", "iloscGlosow"]),
      procentGlosow: existing.procentGlosow || firstDeepText(record, ["procentGlosow", "udzialProcentowyGlosow"]),
    });
  }

  Object.entries(record).forEach(([key, nested]) => {
    collectShareholderDetails(nested, `${nextContext} ${key}`, shareholders);
  });
}

function normalizePersonName(value: string) {
  return normalizeTextForMatch(value).replace(/\s+/g, " ").trim();
}

function readOwnershipDescription(xml: string) {
  const directOwnership = xmlBlocks(xml, "UprawnieniaWlascicielskieBezposrednie")[0];
  if (directOwnership) {
    const ownershipKind = xmlBlocks(directOwnership, "UprawnieniaWlascicielskie")[0];
    const privilegeKind = xmlBlocks(directOwnership, "InformacjaOUprzywilejowaniu")[0];
    return [
      ownershipKind ? readDictionaryValue(ownershipKind, "UprawnieniaWlascicielskie") || readXmlTag(ownershipKind, "Opis") : null,
      privilegeKind ? readDictionaryValue(privilegeKind, "RodzajUprzywilejowania") : null,
    ].filter(Boolean).join("; ") || "uprawnienia właścicielskie bezpośrednie";
  }

  const indirectOwnership = readXmlTag(xml, "UprawnieniaWlascicielskiePosrednie");
  if (indirectOwnership) return indirectOwnership;

  const otherRights = xmlBlocks(xml, "InneUprawnienia")[0];
  if (otherRights) {
    return [
      readDictionaryValue(otherRights, "RodzajInnychUprawnien"),
      readXmlTag(otherRights, "OpisInnychUprawnien"),
    ].filter(Boolean).join("; ") || "inne uprawnienia";
  }

  return null;
}

function xmlBlocks(xml: string, tag: string) {
  const pattern = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1] || "");
}

function xmlBlocksAny(xml: string, tags: string[]) {
  return tags.flatMap((tag) => xmlBlocks(xml, tag));
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;",
  }[char] || char));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nieznany błąd";
}

function asPdfText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

async function buildAmlReportPdf(input: {
  clientName: string;
  nip: string;
  requesterName: string;
  createdAt: Date;
  checks: OfficialCheck[];
  result: string;
  registryDetails: Record<string, unknown>;
  beneficialOwners: Array<Record<string, unknown>>;
  pkdCodes: PkdCode[];
}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFontBytes(), { subset: true });
  const logoBytes = readLogoBytes();
  const logoImage = logoBytes ? await doc.embedPng(logoBytes) : null;
  let page = doc.addPage([595, 842]);
  let y = 790;
  const margin = 42;
  const contentWidth = 511;
  const navy = rgb(0.07, 0.17, 0.39);
  const text = rgb(0.04, 0.12, 0.25);
  const muted = rgb(0.32, 0.38, 0.5);
  const border = rgb(0.80, 0.84, 0.90);
  const soft = rgb(0.96, 0.98, 1);
  const green = rgb(0.09, 0.50, 0.24);
  const red = rgb(0.86, 0.15, 0.22);

  const ensurePage = (height = 54) => {
    if (y - height >= 58) return;
    drawFooter(page, font);
    page = doc.addPage([595, 842]);
    y = 790;
  };

  const drawText = (value: string, size = 10, x = margin, color = text, maxChars = 88) => {
    for (const line of wrapText(value, maxChars)) {
      ensurePage(size + 12);
      page.drawText(line, { x, y, size, font, color });
      y -= size + 5;
    }
  };

  const identifiers = input.registryDetails.identyfikatory && typeof input.registryDetails.identyfikatory === "object"
    ? input.registryDetails.identyfikatory as Record<string, unknown>
    : {};
  const vatData = input.registryDetails.bialaListaVat && typeof input.registryDetails.bialaListaVat === "object"
    ? input.registryDetails.bialaListaVat as Record<string, unknown>
    : {};

  if (logoImage) {
    page.drawImage(logoImage, { x: margin, y: 766, width: 58, height: 58 });
  } else {
    page.drawText("CRSS", { x: margin, y: 802, size: 28, font, color: navy });
  }
  page.drawText("Skaner AML", { x: margin + 78, y: 802, size: 22, font, color: navy });
  page.drawText("Przeciwdziałanie praniu pieniędzy i finansowaniu terroryzmu", { x: margin + 78, y: 782, size: 10, font, color: muted });
  y = 740;

  drawText(`Data zapytania: ${input.createdAt.toLocaleString("pl-PL")}`, 10, margin, text);
  drawText(`Wygenerował: ${input.requesterName}`, 10, margin, text);
  drawText(`Pełna nazwa podmiotu: ${input.clientName}`, 10, margin, text, 72);
  y -= 8;

  const vatCheck = input.checks.find((check) => normalizeTextForMatch(check.source).includes("biala lista") || check.source === "Status VAT");
  const viesCheck = input.checks.find((check) => check.source.includes("VIES"));
  const ceidgCheck = input.checks.find((check) => check.source.includes("CEIDG"));
  const krsCheck = input.checks.find((check) => check.source.includes("KRS"));
  const crbrCheck = input.checks.find((check) => check.source.includes("CRBR"));
  const crbrWasUsed = Boolean(crbrCheck && crbrCheck.status !== "skipped");
  const sanctionsCheck = input.checks.find((check) => check.source.includes("sankcyjne"));
  const crbrDetails = input.registryDetails.crbr && typeof input.registryDetails.crbr === "object"
    ? input.registryDetails.crbr as Record<string, unknown>
    : {};
  const crbrMeta = crbrDetails.requestMeta && typeof crbrDetails.requestMeta === "object"
    ? crbrDetails.requestMeta as Record<string, unknown>
    : {};
  const crbrCompanies = Array.isArray(crbrDetails.companies) ? crbrDetails.companies as Array<Record<string, unknown>> : [];
  const crbrCompany = crbrCompanies[0] || {};
  const isIndividualBusiness = input.registryDetails.typPodmiotu === "jdg";

  drawInfoBox("Identyfikatory", [
    ["NIP", asPdfText(identifiers.nip || input.nip)],
    ["REGON", asPdfText(identifiers.regon)],
    ...(!isIndividualBusiness ? [
      ["KRS", asPdfText(identifiers.krs)],
      ["Rejestr", asPdfText(identifiers.rejestr || "Rejestr przedsiębiorców")],
    ] as [string, string][] : []),
    ...(crbrWasUsed ? [["Id wniosku", asPdfText(crbrMeta.identyfikatorWniosku || crbrDetails.identyfikatorZapytania)] as [string, string]] : []),
    ["Nazwa", asPdfText(identifiers.nazwa || crbrCompany.nazwa)],
    ["Adres", asPdfText(identifiers.adres || crbrCompany.adres)],
    ["Forma", asPdfText(identifiers.forma || crbrCompany.formaOrganizacyjna)],
  ]);
  drawReportSection("Dane rejestrowe podmiotu", ceidgCheck ? (isIndividualBusiness ? [["CEIDG", ceidgCheck]] : [["CEIDG", ceidgCheck], ["KRS", krsCheck]]) : [["KRS", krsCheck]]);
  drawInfoBox("Informacje o płatniku VAT", vatReportRows(vatData, vatCheck));
  drawReportSection("Rejestr VIES", [["VIES", viesCheck]]);
  drawReportSection("Wyniki weryfikacji na listach sankcyjnych", [["Listy sankcyjne", sanctionsCheck]]);
  if (crbrWasUsed || isIndividualBusiness) {
    if (crbrWasUsed) drawReportSection("Beneficjenci rzeczywiści", [["CRBR", crbrCheck]]);
    drawInfoBox("Beneficjenci rzeczywiści", input.beneficialOwners.length > 0
      ? input.beneficialOwners.slice(0, 8).map((owner, index) => [
        `${index + 1}.`,
        [
          owner.label,
          owner.pesel ? `PESEL: ${owner.pesel}` : null,
          owner.liczbaUdzialow || owner.procentUdzialow || owner.wartoscUdzialow ? `udziały: ${[owner.liczbaUdzialow, owner.procentUdzialow, owner.wartoscUdzialow].filter(Boolean).join(" / ")}` : null,
          owner.liczbaGlosow || owner.procentGlosow ? `głosy: ${[owner.liczbaGlosow, owner.procentGlosow].filter(Boolean).join(" / ")}` : null,
          owner.obywatelstwo ? `obywatelstwo: ${owner.obywatelstwo}` : null,
          owner.krajZamieszkania ? `kraj: ${owner.krajZamieszkania}` : null,
        ].filter(Boolean).join(" | ") || "-"
      ])
      : [["-", "Brak zapisanych beneficjentów rzeczywistych z CRBR."]]
    );
  }
  drawInfoBox("Kody PKD", input.pkdCodes.length > 0
    ? input.pkdCodes.slice(0, 12).map((pkd) => [
      pkd.kod,
      [pkd.nazwa, pkd.przewazajace ? "przeważające" : null, pkd.zrodlo].filter(Boolean).join(" | ")
    ])
    : [["-", "Brak zapisanych kodów PKD."]]
  );

  y -= 8;
  drawText("Metryka raportu", 14, margin, navy, 60);
  drawText(`Raport pobrano i zapisano: ${input.createdAt.toLocaleString("pl-PL")}`, 9, margin, muted);
  drawText(`Użytkownik generujący: ${input.requesterName}`, 9, margin, muted);
  const sources = [
    ceidgCheck ? "CEIDG" : null,
    vatCheck?.status !== "skipped" ? "Biała Lista VAT MF" : null,
    "VIES",
    krsCheck?.status !== "skipped" ? "KRS MS" : null,
    crbrWasUsed ? "CRBR MF" : null,
    "publiczna lista sankcyjna ONZ",
  ].filter(Boolean);
  const sourceSummary = `Źródła: ${sources.join(", ")}.`;
  drawText(sourceSummary, 9, margin, muted, 92);

  drawFooter(page, font);
  const bytes = await doc.save();
  return Buffer.from(bytes);

  function drawInfoBox(title: string, rows: Array<[string, string]>) {
    const preparedRows = rows.map(([label, value]) => ({ label, value: value || "-", lines: wrapText(value || "-", 62) }));
    const rowHeights = preparedRows.map((row) => Math.max(24, 14 + row.lines.length * 11));
    ensurePage(30 + rowHeights.reduce((sum, height) => sum + height, 0));
    page.drawText(title, { x: margin, y, size: 14, font, color: navy });
    y -= 18;
    preparedRows.forEach((row, index) => {
      const height = rowHeights[index];
      page.drawRectangle({ x: margin, y: y - height + 8, width: contentWidth, height, color: soft, borderColor: border, borderWidth: 0.5 });
      page.drawText(row.label, { x: margin + 8, y: y - 7, size: 8.5, font, color: navy });
      let valueY = y - 7;
      row.lines.forEach((line) => {
        page.drawText(line, { x: margin + 92, y: valueY, size: 8.5, font, color: text });
        valueY -= 11;
      });
      y -= height + 2;
    });
    y -= 8;
  }

  function drawReportSection(title: string, rows: Array<[string, OfficialCheck | undefined]>) {
    const preparedRows = rows.map(([label, check]) => {
      const body = check ? check.label : "Nie dotyczy albo brak danych w zrodle.";
      const details = check ? summarizeDetails(check.details) : "";
      const bodyLines = wrapText(body, 78);
      const detailLines = details ? wrapText(details, 88).slice(0, 3) : [];
      const height = Math.max(52, 30 + bodyLines.length * 11 + detailLines.length * 10);
      return { label, check, bodyLines, detailLines, height };
    });
    ensurePage(30 + preparedRows.reduce((sum, row) => sum + row.height + 8, 0));
    page.drawText(title, { x: margin, y, size: 14, font, color: navy });
    y -= 18;
    preparedRows.forEach((row) => {
      page.drawRectangle({ x: margin, y: y - row.height + 8, width: contentWidth, height: row.height, color: soft, borderColor: border, borderWidth: 1 });
      page.drawText(row.label, { x: margin + 10, y: y - 10, size: 9, font, color: navy });
      page.drawText(row.check ? statusLabelForReport(row.check) : "-", { x: margin + 410, y: y - 10, size: 8, font, color: row.check ? statusColor(row.check.status) : muted });
      let rowY = y - 25;
      row.bodyLines.forEach((line) => {
        page.drawText(line, { x: margin + 10, y: rowY, size: 8.5, font, color: muted });
        rowY -= 11;
      });
      row.detailLines.forEach((line) => {
        page.drawText(line, { x: margin + 10, y: rowY, size: 7.5, font, color: muted });
        rowY -= 10;
      });
      y -= row.height + 8;
    });
    y -= 4;
  }
}

function readLogoBytes() {
  const candidates = [
    path.join(process.cwd(), "public", "logo-crss.png"),
    path.join(process.cwd(), "public", "logo-crss-mail.png"),
  ];
  const logoPath = candidates.find((candidate) => existsSync(candidate));
  return logoPath ? readFileSync(logoPath) : null;
}

function statusLabelForReport(check: OfficialCheck) {
  return statusLabel(check.status);
}

function vatReportRows(vatData: Record<string, unknown>, vatCheck: OfficialCheck | undefined): Array<[string, string]> {
  const statusVat = String(vatData.statusVat || "").trim();
  const label = vatCheck?.label || "";
  const rows: Array<[string, string]> = [
    ["Identyfikator zapytania", asPdfText(vatData.identyfikatorZapytania || vatData.requestId)],
    ["Identyfikator techniczny", asPdfText(vatData.identyfikatorTechniczny)],
    ["Status VAT", statusVat ? `VAT ${statusVat.toLowerCase()}` : label || "-"],
    ["Nazwa", asPdfText(vatData.nazwa)],
    ["REGON", asPdfText(vatData.regon)],
    ["KRS", asPdfText(vatData.krs)],
    ["Adres siedziby", asPdfText(vatData.adresSiedziby)],
    ["Adres działalności", asPdfText(vatData.adresDzialalnosci)],
  ];
  return rows.filter(([, value], index) => index === 0 || value !== "-");
}

function drawFooter(page: PDFPage, font: PDFFont) {
  page.drawText("Raport wygenerowany automatycznie w module AML CRSS.", {
    x: 42,
    y: 28,
    size: 7,
    font,
    color: rgb(0.42, 0.48, 0.58),
  });
}

function resultLabel(result: string) {
  if (result === "pozytywna") return "Pozytywna";
  if (result === "wymaga_analizy") return "Wymaga analizy";
  if (result === "negatywna") return "Negatywna";
  return result || "-";
}

function statusLabel(status: OfficialCheck["status"]) {
  switch (status) {
    case "ok":
      return "OK";
    case "confirmed":
      return "Potwierdzono";
    case "warning":
      return "Uwaga";
    case "error":
      return "Błąd";
    case "skipped":
      return "Pominięto";
    default:
      return "-";
  }
}

function statusColor(status: OfficialCheck["status"]) {
  switch (status) {
    case "ok":
    case "confirmed":
      return rgb(0.09, 0.50, 0.24);
    case "warning":
      return rgb(0.72, 0.40, 0.02);
    case "error":
      return rgb(0.78, 0.12, 0.12);
    case "skipped":
    default:
      return rgb(0.42, 0.48, 0.58);
  }
}

async function buildAmlReportPdfLegacy(input: {
  clientName: string;
  nip: string;
  requesterName: string;
  createdAt: Date;
  checks: OfficialCheck[];
  result: string;
}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFontBytes(), { subset: true });
  let page = doc.addPage([595, 842]);
  let y = 800;

  const draw = (text: string, size = 10, x = 42) => {
    const lines = wrapText(text, size === 16 ? 56 : 86);
    for (const line of lines) {
      if (y < 52) {
        page = doc.addPage([595, 842]);
        y = 800;
      }
      page.drawText(line, { x, y, size, font, color: rgb(0.05, 0.12, 0.25) });
      y -= size + 5;
    }
  };

  page.drawText("Raport weryfikacji AML", { x: 42, y, size: 18, font, color: rgb(0.09, 0.23, 0.45) });
  y -= 34;
  draw(`Klient: ${input.clientName}`, 11);
  draw(`NIP: ${input.nip}`, 11);
  draw(`Wykonał: ${input.requesterName}`, 11);
  draw(`Data: ${input.createdAt.toLocaleString("pl-PL")}`, 11);
  draw(`Wynik: ${input.result}`, 11);
  y -= 10;
  draw("Źródła oficjalne", 16);

  input.checks.forEach((check) => {
    y -= 6;
    draw(`${check.source}: ${check.label} [${check.status}]`, 11);
    const summary = summarizeDetails(check.details);
    if (summary) draw(summary, 9, 58);
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function readFontBytes() {
  const candidates = [
    path.join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"),
    path.join(process.cwd(), "src/assets/fonts/NotoSans-Regular.ttf"),
  ];
  const fontPath = candidates.find((candidate) => existsSync(candidate));
  if (!fontPath) throw new Error("Brak fontu NotoSans-Regular.ttf do wygenerowania raportu AML.");
  return readFileSync(fontPath);
}

function wrapText(value: string, maxChars: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    if (`${line} ${word}`.trim().length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function summarizeDetails(details: Record<string, unknown>) {
  const subject = (details as { subject?: Record<string, unknown> }).subject;
  if (subject) {
    return [
      subject.name ? `Nazwa: ${subject.name}` : null,
      subject.statusVat ? `Status VAT: ${subject.statusVat}` : null,
      subject.krs ? `KRS: ${subject.krs}` : null,
      subject.regon ? `REGON: ${subject.regon}` : null,
      subject.accountNumbers ? `Rachunki: ${Array.isArray(subject.accountNumbers) ? subject.accountNumbers.join(", ") : subject.accountNumbers}` : null,
    ].filter(Boolean).join(" | ");
  }

  const simple = ["identyfikatorZapytania", "identyfikatorTechniczny", "requestId", "requestDate", "krs", "register", "httpStatus"]
    .map((key) => details[key] ? `${key}: ${String(details[key])}` : null)
    .filter(Boolean);
  return simple.join(" | ");
}

function buildReportFileName(clientName: string | null, nip: string, date: Date) {
  const datePart = date.toISOString().slice(0, 10);
  const namePart = String(clientName || "klient")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    || "klient";
  return `Analiza_AML_${namePart}_${datePart}.pdf`;
}
