import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AML_REPORT_BUCKET = "crm-umowy";
const GUS_REGON_API_KEY = process.env.GUS_REGON_API_KEY;
const GUS_REGON_API_URL = process.env.GUS_REGON_API_URL || "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
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
    .select("id, nazwa, nip, status_klienta, czynny_vat, vat_ue")
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
  const checks: OfficialCheck[] = [];

  const checksVat = Boolean(client.czynny_vat);
  const checksVies = Boolean(client.vat_ue);
  const vatCheck = checksVat
    ? await verifyVatWhitelist(nip)
    : confirmedCheck("Status VAT", "Weryfikacja potwierdzona: klient jest oznaczony w aplikacji jako zwolniony z VAT.");
  checks.push(vatCheck);

  const vatSubject = getVatSubject(vatCheck);
  const requestId = String((vatCheck.details as { requestId?: unknown }).requestId || "").trim() || null;

  checks.push(checksVies
    ? await verifyVies(nip)
    : confirmedCheck("VAT-UE", "Weryfikacja potwierdzona: klient nie jest oznaczony jako podatnik VAT-UE.")
  );

  const ceidgCheck = await verifyCeidg(nip);
  checks.push(ceidgCheck);

  const regonCheck = GUS_REGON_API_KEY ? await verifyGusRegon(nip) : null;
  if (regonCheck) checks.push(regonCheck);

  const regonSubject = regonCheck ? getRegonSubject(regonCheck) : null;
  const ceidgIdentity = getCeidgIdentity(ceidgCheck);
  const regonNumber = String(vatSubject?.regon || ceidgIdentity.regon || regonSubject?.Regon || "").trim() || null;
  const krsNumber = normalizeKrs(String(vatSubject?.krs || ceidgIdentity.krs || regonSubject?.Krs || ""));
  const krsCheck = krsNumber
    ? await verifyKrs(krsNumber)
    : skippedCheck("KRS", "Brak numeru KRS w danych z Białej Listy VAT i CEIDG. Dla JDG wpis KRS zwykle nie występuje.");
  checks.push(krsCheck);

  const sanctionsCheck = await verifySanctionsLists(client.nazwa || "", nip);
  checks.push(sanctionsCheck);
  checks.push(skippedCheck("PEP", "Brak jednego oficjalnego publicznego API PEP. Status PEP pozostaje do potwierdzenia formularzem i oświadczeniem klienta."));
  const result = summarizeResult(checks);
  const now = new Date();
  const pkdCodes = collectPkdCodes(ceidgCheck, krsCheck);
  const registryDetails = buildRegistryDetails({
    nip,
    vatSubject,
    regonSubject,
    krsCheck,
    ceidgCheck,
    pkdCodes,
    checks,
    checkedAt: now,
  });
  const beneficialOwners = buildBeneficialOwnersDetails(now);
  const reportName = buildReportFileName(client.nazwa, nip, now);
  const pdf = await buildAmlReportPdf({
    clientName: client.nazwa || "Klient bez nazwy",
    nip,
    requesterName: auth.requesterName,
    createdAt: now,
    checks,
    result,
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
      zrodla: checks.map((check) => ({ source: check.source, status: check.status, label: check.label })),
      dane: { checks, dane_rejestrowe: registryDetails, beneficjenci_rzeczywisci: beneficialOwners, kody_pkd: pkdCodes },
      vat_status: checksVat ? (vatCheck.status === "ok" ? String(vatSubject?.statusVat || "sprawdzono") : vatCheck.status) : "potwierdzono_zwolnienie",
      vies_status: checksVies ? statusForSource(checks, "VIES") : "potwierdzono_brak_vat_ue",
      krs_status: statusForSource(checks, "KRS"),
      pep_status: "do_weryfikacji_formularzem",
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
  await auth.admin
    .from("aml_rejestr_klientow")
    .update({
      status: nextStatus,
      ostatnia_weryfikacja_at: now.toISOString(),
      ostatnia_weryfikacja_by: auth.requesterId,
      ostatnia_weryfikacja_id: verification.id,
      pep_status: "do_weryfikacji_formularzem",
      sankcje_status: "do_dopiecia",
      dane_rejestrowe: registryDetails,
      beneficjenci_rzeczywisci: beneficialOwners,
      numer_regon: regonNumber,
      numer_krs: krsNumber || null,
      gus_status: regonCheck ? statusForSource(checks, "GUS REGON") : "nie_uzyto",
      krs_status: statusForSource(checks, "KRS"),
      crbr_status: "do_weryfikacji",
      kody_pkd: pkdCodes,
      updated_at: now.toISOString(),
    })
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
      sources: checks.map((check) => ({ source: check.source, status: check.status, label: check.label })),
      dane_rejestrowe: registryDetails,
      beneficjenci_rzeczywisci: beneficialOwners,
      kody_pkd: pkdCodes,
      pdf_path: storagePath,
    },
    created_by: auth.requesterId,
  });

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
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { source: "Biała Lista VAT MF", status: "error", label: "Nie udało się pobrać danych VAT.", details: { httpStatus: response.status, data } };
    }
    return {
      source: "Biała Lista VAT MF",
      status: data?.result?.subject ? "ok" : "warning",
      label: data?.result?.subject ? "Podmiot odnaleziony w wykazie VAT." : "Brak podmiotu w wykazie VAT.",
      details: { requestId: data?.result?.requestId, subject: data?.result?.subject, checkedAt: new Date().toISOString(), url },
    };
  } catch (error) {
    return { source: "Biała Lista VAT MF", status: "error", label: "Błąd połączenia z API MF.", details: { message: errorMessage(error), url } };
  }
}

async function verifyVies(nip: string): Promise<OfficialCheck> {
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
      return { source: "VIES Komisji Europejskiej", status: "error", label: "Nie udało się pobrać danych VIES.", details: { httpStatus: response.status, response: text.slice(0, 1200) } };
    }

    const valid = readXmlTag(text, "valid");
    return {
      source: "VIES Komisji Europejskiej",
      status: valid === "true" ? "ok" : "warning",
      label: valid === "true" ? "Numer VAT-UE aktywny w VIES." : "Numer VAT-UE nieaktywny albo brak rejestracji w VIES.",
      details: {
        countryCode: readXmlTag(text, "countryCode"),
        vatNumber: readXmlTag(text, "vatNumber"),
        requestDate: readXmlTag(text, "requestDate"),
        valid,
        name: readXmlTag(text, "name"),
        address: readXmlTag(text, "address"),
        checkedAt: new Date().toISOString(),
        url,
      },
    };
  } catch (error) {
    return { source: "VIES Komisji Europejskiej", status: "error", label: "Błąd połączenia z VIES.", details: { message: errorMessage(error), url } };
  }
}

async function verifyKrs(krs: string): Promise<OfficialCheck> {
  const paddedKrs = krs.padStart(10, "0");
  const baseUrl = `https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${paddedKrs}`;

  for (const register of ["P", "S"]) {
    const url = `${baseUrl}?rejestr=${register}&format=json`;
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (response.status === 404) continue;
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return { source: "KRS Ministerstwa Sprawiedliwości", status: "error", label: "Nie udało się pobrać odpisu KRS.", details: { httpStatus: response.status, data, url } };
      }
      return {
        source: "KRS Ministerstwa Sprawiedliwości",
        status: "ok",
        label: "Pobrano aktualny odpis KRS z API Ministerstwa Sprawiedliwości.",
        details: { krs: paddedKrs, register, data, checkedAt: new Date().toISOString(), url },
      };
    } catch (error) {
      return { source: "KRS Ministerstwa Sprawiedliwości", status: "error", label: "Błąd połączenia z API KRS.", details: { message: errorMessage(error), url } };
    }
  }

  return { source: "KRS Ministerstwa Sprawiedliwości", status: "warning", label: "Nie znaleziono odpisu KRS dla numeru z Białej Listy VAT.", details: { krs: paddedKrs } };
}

async function verifyCeidg(nip: string): Promise<OfficialCheck> {
  if (!CEIDG_API_TOKEN) {
    return skippedCheck("CEIDG", "Dodaj sekret CEIDG_API_TOKEN, aby uruchomić automatyczne pobieranie danych i kodów PKD z CEIDG.");
  }

  const url = `${CEIDG_API_URL}?nip=${encodeURIComponent(nip)}`;
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${CEIDG_API_TOKEN}`,
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { source: "CEIDG", status: "error", label: "Nie udało się pobrać danych z API CEIDG.", details: { httpStatus: response.status, data, url } };
    }

    const companies = extractCeidgCompanies(data);
    return {
      source: "CEIDG",
      status: companies.length > 0 ? "ok" : "warning",
      label: companies.length > 0 ? "Podmiot odnaleziony w CEIDG." : "Brak podmiotu w CEIDG dla podanego NIP.",
      details: { companies, data, checkedAt: new Date().toISOString(), url },
    };
  } catch (error) {
    return { source: "CEIDG", status: "error", label: "Błąd połączenia z API CEIDG.", details: { message: errorMessage(error), url } };
  }
}

async function verifySanctionsLists(name: string, nip: string): Promise<OfficialCheck> {
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
      details: { matches, errors, checkedAt: new Date().toISOString() },
    };
  }

  if (errors.length === sources.length) {
    return {
      source: "Listy sankcyjne",
      status: "error",
      label: "Nie udało się pobrać publicznych list sankcyjnych.",
      details: { errors, checkedAt: new Date().toISOString() },
    };
  }

  return {
    source: "Listy sankcyjne",
    status: "ok",
    label: "Nie znaleziono podmiotu na sprawdzonych publicznych listach sankcyjnych.",
    details: { checkedSources: sources.map((source) => source.label), errors, checkedAt: new Date().toISOString() },
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
async function verifyGusRegon(nip: string): Promise<OfficialCheck> {
  if (!GUS_REGON_API_KEY) {
    return skippedCheck("GUS REGON", "Dodaj sekret GUS_REGON_API_KEY, aby uruchomić automatyczną weryfikację w rejestrze REGON.");
  }

  let sessionId: string | null = null;
  try {
    const loginResponse = await gusSoapRequest("Zaloguj", `
      <ns:Zaloguj>
        <ns:pKluczUzytkownika>${escapeXml(GUS_REGON_API_KEY)}</ns:pKluczUzytkownika>
      </ns:Zaloguj>
    `);
    sessionId = readXmlTag(loginResponse, "ZalogujResult");

    if (!sessionId) {
      return { source: "GUS REGON", status: "error", label: "Nie udało się zalogować do API GUS BIR.", details: { checkedAt: new Date().toISOString() } };
    }

    const searchResponse = await gusSoapRequest("DaneSzukajPodmioty", `
      <ns:DaneSzukajPodmioty>
        <ns:pParametryWyszukiwania>
          <dat:Nip>${escapeXml(nip)}</dat:Nip>
        </ns:pParametryWyszukiwania>
      </ns:DaneSzukajPodmioty>
    `, sessionId);
    const resultXml = decodeXmlEntities(readXmlTag(searchResponse, "DaneSzukajPodmiotyResult") || "");
    const records = parseGusRecords(resultXml);
    const firstRecord = records[0] || null;

    return {
      source: "GUS REGON",
      status: firstRecord ? "ok" : "warning",
      label: firstRecord ? "Podmiot odnaleziony w rejestrze REGON." : "Nie odnaleziono podmiotu w rejestrze REGON dla podanego NIP.",
      details: { record: firstRecord, records, checkedAt: new Date().toISOString(), url: GUS_REGON_API_URL },
    };
  } catch (error) {
    return { source: "GUS REGON", status: "error", label: "Błąd połączenia z API GUS BIR.", details: { message: errorMessage(error), checkedAt: new Date().toISOString(), url: GUS_REGON_API_URL } };
  } finally {
    if (sessionId) {
      await gusSoapRequest("Wyloguj", `
        <ns:Wyloguj>
          <ns:pIdentyfikatorSesji>${escapeXml(sessionId)}</ns:pIdentyfikatorSesji>
        </ns:Wyloguj>
      `, sessionId).catch(() => null);
    }
  }
}

async function gusSoapRequest(action: "Zaloguj" | "DaneSzukajPodmioty" | "Wyloguj", body: string, sessionId?: string) {
  const soapAction = `http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/${action}`;
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${escapeXml(GUS_REGON_API_URL)}</wsa:To>
    <wsa:Action>${soapAction}</wsa:Action>
  </soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;

  const headers: Record<string, string> = {
    "Content-Type": `application/soap+xml; charset=utf-8; action="${soapAction}"`,
    Accept: "application/soap+xml",
  };
  if (sessionId) headers.sid = sessionId;

  const response = await fetch(GUS_REGON_API_URL, { method: "POST", headers, body: envelope });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GUS BIR HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return text;
}

function skippedCheck(source: string, label: string): OfficialCheck {
  return { source, status: "skipped", label, details: { checkedAt: new Date().toISOString() } };
}

function confirmedCheck(source: string, label: string): OfficialCheck {
  return { source, status: "confirmed", label, details: { checkedAt: new Date().toISOString() } };
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

function getVatSubject(check: OfficialCheck) {
  const details = check.details as { subject?: Record<string, unknown> };
  return details.subject || null;
}

function getRegonSubject(check: OfficialCheck) {
  const details = check.details as { record?: Record<string, string> | null };
  return details.record || null;
}

function getCeidgIdentity(check: OfficialCheck) {
  const details = check.details as { companies?: Array<Record<string, unknown>> };
  const company = Array.isArray(details.companies) ? details.companies[0] : null;
  if (!company) return { regon: null as string | null, krs: null as string | null };

  return {
    regon: firstDeepText(company, ["regon", "REGON", "numerRegon", "numer_regon"]),
    krs: firstDeepText(company, ["krs", "KRS", "numerKrs", "numer_krs"]),
  };
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
function extractCeidgCompanies(data: unknown) {
  const root = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const candidates = [root.firmy, root.data, root.items, root.results, root.result];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Array<Record<string, unknown>>;
  }
  return [];
}

function collectPkdCodes(...checks: OfficialCheck[]): PkdCode[] {
  const codes = new Map<string, PkdCode>();

  for (const check of checks) {
    const source = check.source.includes("KRS") ? "KRS" : check.source;
    const extracted = extractPkdCodes(check.details, source);
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
  const directName = firstText(record, ["nazwa", "opis", "opisPkd", "name"]);
  const mainFlag = Boolean(record.przewazajace || record.przeważające || record.glowne || record.główne || record.main);
  const directCodes = pkdRecord && directCode
    ? [{ kod: formatPkdCode(directCode), nazwa: directName, przewazajace: mainFlag, zrodlo: source }]
    : [];

  const nestedCodes = Object.entries(record).flatMap(([key, item]) => {
    const childInPkd = pkdRecord || key.toLowerCase().includes("pkd") || key.toLowerCase().includes("dzialalnosci");
    return extractPkdCodes(item, source, childInPkd);
  });

  return [...directCodes, ...nestedCodes].filter((item) => item.kod !== "");
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

function buildRegistryDetails(input: {
  nip: string;
  vatSubject: Record<string, unknown> | null;
  regonSubject: Record<string, string> | null;
  krsCheck: OfficialCheck;
  ceidgCheck: OfficialCheck;
  pkdCodes: PkdCode[];
  checks: OfficialCheck[];
  checkedAt: Date;
}) {
  const krsDetails = input.krsCheck.details as { krs?: string; register?: string; data?: unknown; url?: string };
  const ceidgDetails = input.ceidgCheck.details as { companies?: unknown[]; url?: string };
  const ceidgIdentity = getCeidgIdentity(input.ceidgCheck);

  return {
    updatedAt: input.checkedAt.toISOString(),
    identyfikatory: {
      nip: input.nip,
      regon: String(input.vatSubject?.regon || ceidgIdentity.regon || input.regonSubject?.Regon || "") || null,
      krs: String(input.vatSubject?.krs || ceidgIdentity.krs || input.regonSubject?.Krs || krsDetails.krs || "") || null,
    },
    statusy: {
      vat: statusForAnySource(input.checks, ["Status VAT", "Biała Lista VAT"]),
      vies: statusForSource(input.checks, "VIES"),
      regon: statusForSource(input.checks, "GUS REGON"),
      krs: statusForSource(input.checks, "KRS"),
      ceidg: statusForSource(input.checks, "CEIDG"),
      crbr: "do_weryfikacji",
    },
    kodyPkd: input.pkdCodes,
    ceidg: input.ceidgCheck.status === "ok" ? {
      liczbaWpisow: Array.isArray(ceidgDetails.companies) ? ceidgDetails.companies.length : 0,
      url: ceidgDetails.url || null,
    } : null,
    gusRegon: input.regonSubject ? {
      nazwa: input.regonSubject.Nazwa || null,
      regon: input.regonSubject.Regon || null,
      nip: input.regonSubject.Nip || null,
      krs: input.regonSubject.Krs || null,
      typ: input.regonSubject.Typ || null,
      statusNip: input.regonSubject.StatusNip || null,
      wojewodztwo: input.regonSubject.Wojewodztwo || null,
      powiat: input.regonSubject.Powiat || null,
      gmina: input.regonSubject.Gmina || null,
      miejscowosc: input.regonSubject.Miejscowosc || null,
      kodPocztowy: input.regonSubject.KodPocztowy || null,
      ulica: input.regonSubject.Ulica || null,
      nrNieruchomosci: input.regonSubject.NrNieruchomosci || null,
      nrLokalu: input.regonSubject.NrLokalu || null,
      dataZakonczeniaDzialalnosci: input.regonSubject.DataZakonczeniaDzialalnosci || null,
    } : null,
    krs: input.krsCheck.status === "ok" ? {
      numer: krsDetails.krs || null,
      rejestr: krsDetails.register || null,
      pobranoOdpis: true,
      url: krsDetails.url || null,
      dane: krsDetails.data || null,
    } : null,
    bialaListaVat: input.vatSubject ? {
      nazwa: input.vatSubject.name || null,
      statusVat: input.vatSubject.statusVat || null,
      regon: input.vatSubject.regon || null,
      krs: input.vatSubject.krs || null,
      adresSiedziby: input.vatSubject.residenceAddress || null,
      adresDzialalnosci: input.vatSubject.workingAddress || null,
      rachunki: Array.isArray(input.vatSubject.accountNumbers) ? input.vatSubject.accountNumbers : [],
    } : null,
  };
}

function buildBeneficialOwnersDetails(checkedAt: Date) {
  return [{
    source: "CRBR",
    status: "do_weryfikacji",
    label: "Miejsce przygotowane pod zapis beneficjentów rzeczywistych po podłączeniu oficjalnego źródła CRBR albo po ręcznej weryfikacji.",
    checkedAt: checkedAt.toISOString(),
  }];
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
  return match?.[1]?.replace(/<!\\[CDATA\\[|\\]\\]>/g, "").trim() || null;
}

function parseGusRecords(xml: string) {
  const records = [...xml.matchAll(/<dane>([\s\S]*?)<\/dane>/gi)];
  return records.map((recordMatch) => {
    const recordXml = recordMatch[1] || "";
    const record: Record<string, string> = {};
    for (const fieldMatch of recordXml.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
      record[fieldMatch[1]] = decodeXmlEntities(fieldMatch[2] || "").trim();
    }
    return record;
  });
}

function decodeXmlEntities(value: string) {
  return value
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

async function buildAmlReportPdf(input: {
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
  let y = 790;
  const margin = 42;
  const navy = rgb(0.07, 0.17, 0.39);
  const text = rgb(0.04, 0.12, 0.25);
  const muted = rgb(0.32, 0.38, 0.5);
  const border = rgb(0.80, 0.84, 0.90);
  const soft = rgb(0.96, 0.98, 1);

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

  page.drawText("Przeciwdziałanie praniu pieniędzy i finansowaniu terroryzmu", { x: margin, y, size: 15, font, color: navy });
  y -= 20;
  page.drawText("(AML&CFT)", { x: margin, y, size: 13, font, color: navy });
  y -= 28;
  page.drawText("Skaner AML", { x: margin, y, size: 18, font, color: navy });
  y -= 26;

  drawText(`Data zapytania: ${input.createdAt.toLocaleString("pl-PL")}`, 10, margin, text);
  drawText(`Wygenerował: ${input.requesterName}`, 10, margin, text);
  drawText(`Informacje dla numeru: ${input.nip}`, 10, margin, text);
  drawText(`Pełna nazwa podmiotu: ${input.clientName}`, 10, margin, text, 72);
  drawText(`Wynik weryfikacji: ${resultLabel(input.result)}`, 10, margin, text);
  y -= 8;

  const vatCheck = input.checks.find((check) => check.source.includes("Biała Lista") || check.source === "Status VAT");
  const viesCheck = input.checks.find((check) => check.source.includes("VIES"));
  const ceidgCheck = input.checks.find((check) => check.source.includes("CEIDG"));
  const krsCheck = input.checks.find((check) => check.source.includes("KRS"));
  const sanctionsCheck = input.checks.find((check) => check.source.includes("sankcyjne"));
  const pepCheck = input.checks.find((check) => check.source === "PEP");

  drawReportSection("Dane rejestrowe podmiotu", [["CEIDG", ceidgCheck], ["KRS", krsCheck]], drawText, () => y, (nextY) => { y = nextY; }, page, font, margin, soft, border, navy, muted);
  drawReportSection("Informacje o płatniku VAT", [["Status VAT", vatCheck]], drawText, () => y, (nextY) => { y = nextY; }, page, font, margin, soft, border, navy, muted);
  drawReportSection("Rejestr VIES", [["VIES", viesCheck]], drawText, () => y, (nextY) => { y = nextY; }, page, font, margin, soft, border, navy, muted);
  drawReportSection("Wyniki weryfikacji na listach sankcyjnych", [["Listy sankcyjne", sanctionsCheck]], drawText, () => y, (nextY) => { y = nextY; }, page, font, margin, soft, border, navy, muted);
  drawReportSection("Weryfikacja osób powiązanych z firmą", [["PEP", pepCheck]], drawText, () => y, (nextY) => { y = nextY; }, page, font, margin, soft, border, navy, muted);

  y -= 8;
  drawText("Metryka raportu", 14, margin, navy, 60);
  drawText(`Raport pobrano i zapisano: ${input.createdAt.toLocaleString("pl-PL")}`, 9, margin, muted);
  drawText(`Użytkownik generujący: ${input.requesterName}`, 9, margin, muted);
  const sourceSummary = input.checks.some((check) => check.source.includes("GUS REGON"))
    ? "Źródła: CEIDG, Biała Lista VAT MF, VIES, KRS MS, GUS REGON i publiczna lista sankcyjna ONZ."
    : "Źródła: CEIDG, Biała Lista VAT MF, VIES, KRS MS i publiczna lista sankcyjna ONZ. GUS REGON nie był wymagany dla tej weryfikacji.";
  drawText(sourceSummary, 9, margin, muted, 92);

  drawFooter(page, font);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function drawReportSection(
  title: string,
  rows: Array<[string, OfficialCheck | undefined]>,
  drawText: (value: string, size?: number, x?: number, color?: ReturnType<typeof rgb>, maxChars?: number) => void,
  getY: () => number,
  setY: (value: number) => void,
  page: PDFPage,
  font: PDFFont,
  margin: number,
  soft: ReturnType<typeof rgb>,
  border: ReturnType<typeof rgb>,
  navy: ReturnType<typeof rgb>,
  muted: ReturnType<typeof rgb>
) {
  drawText(title, 14, margin, navy, 64);
  let y = getY() - 4;
  setY(y);

  rows.forEach(([label, check]) => {
    const boxY = getY();
    page.drawRectangle({ x: margin, y: boxY - 52, width: 511, height: 48, color: soft, borderColor: border, borderWidth: 1 });
    page.drawText(label, { x: margin + 10, y: boxY - 18, size: 9, font, color: navy });
    page.drawText(check ? statusLabel(check.status) : "-", { x: margin + 410, y: boxY - 18, size: 8, font, color: check ? statusColor(check.status) : muted });
    setY(boxY - 33);
    drawText(check ? check.label : "Nie dotyczy albo brak danych w źródle.", 8.5, margin + 10, muted, 86);
    const details = check ? summarizeDetails(check.details) : "";
    if (details) drawText(details, 7.5, margin + 10, muted, 96);
    setY(getY() - 10);
  });
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

  const simple = ["valid", "requestDate", "krs", "register", "httpStatus"]
    .map((key) => details[key] ? `${key}: ${String(details[key])}` : null)
    .filter(Boolean);
  return simple.join(" | ");
}

function buildReportFileName(clientName: string | null, nip: string, date: Date) {
  const datePart = date.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const namePart = String(clientName || "klient")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    || "klient";
  return `raport_aml_${nip}_${datePart}_${namePart}.pdf`;
}
