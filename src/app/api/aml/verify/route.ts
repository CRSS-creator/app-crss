import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, PDFFont, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AML_REPORT_BUCKET = "crm-umowy";

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
  status: "ok" | "warning" | "error" | "skipped";
  label: string;
  details: Record<string, unknown>;
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
    .select("id, nazwa, nip, status_klienta")
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

  const vatCheck = await verifyVatWhitelist(nip);
  checks.push(vatCheck);

  const vatSubject = getVatSubject(vatCheck);
  const krsNumber = normalizeKrs(String(vatSubject?.krs || ""));
  const regonNumber = String(vatSubject?.regon || "").trim() || null;
  const requestId = String((vatCheck.details as { requestId?: unknown }).requestId || "").trim() || null;

  checks.push(await verifyVies(nip));
  checks.push(krsNumber ? await verifyKrs(krsNumber) : skippedCheck("KRS", "Brak numeru KRS w danych z Białej Listy VAT."));
  checks.push(skippedCheck("CEIDG", "Oficjalne API CEIDG wymaga skonfigurowanego dostępu. Źródło przygotowane do dopięcia po dodaniu klucza."));
  checks.push(skippedCheck("GUS REGON", "Oficjalne API GUS BIR wymaga klucza API. Źródło przygotowane do dopięcia po dodaniu klucza."));
  checks.push(skippedCheck("Listy sankcyjne", "Weryfikacja sankcyjna zostanie dopięta do oficjalnego źródła list sankcyjnych w kolejnym kroku."));
  checks.push(skippedCheck("PEP", "Nie ma jednego publicznego oficjalnego API PEP. Status PEP pozostaje do weryfikacji formularzem i oświadczeniem."));

  const result = summarizeResult(checks);
  const now = new Date();
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
      dane: { checks },
      vat_status: vatCheck.status === "ok" ? String(vatSubject?.statusVat || "sprawdzono") : vatCheck.status,
      vies_status: statusForSource(checks, "VIES"),
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
      sources: checks.map((check) => ({ source: check.source, status: check.status })),
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

function skippedCheck(source: string, label: string): OfficialCheck {
  return { source, status: "skipped", label, details: { checkedAt: new Date().toISOString() } };
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

function getVatSubject(check: OfficialCheck) {
  const details = check.details as { subject?: Record<string, unknown> };
  return details.subject || null;
}

function normalizeNip(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeKrs(value: string) {
  return value.replace(/\D/g, "");
}

function readXmlTag(xml: string, tag: string) {
  const pattern = new RegExp(`<(?:\\\\w+:)?${tag}>([\\\\s\\\\S]*?)</(?:\\\\w+:)?${tag}>`, "i");
  const match = xml.match(pattern);
  return match?.[1]?.replace(/<!\\[CDATA\\[|\\]\\]>/g, "").trim() || null;
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
