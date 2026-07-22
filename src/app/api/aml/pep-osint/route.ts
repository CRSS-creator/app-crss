import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const N8N_PEP_OSINT_WEBHOOK_URL = process.env.N8N_AML_PEP_OSINT_WEBHOOK_URL?.trim();

type Payload = {
  clientId?: string;
};

type PepSubject = {
  name: string;
  role: string;
  companyName: string | null;
  country: string | null;
};

type PepWebhookConfig =
  | { webhookUrl: string; error: null }
  | { webhookUrl: null; error: NextResponse };

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const webhookConfig = getPepOsintWebhookUrl();
  if (webhookConfig.error) return webhookConfig.error;

  const auth = await getAuthorizedUser(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null) as Payload | null;
  if (!body?.clientId) {
    return NextResponse.json({ error: "Brak klienta AML." }, { status: 400 });
  }

  const { data: client, error: clientError } = await auth.admin
    .from("klienci")
    .select("id, nazwa, nip")
    .eq("id", body.clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
  }

  const register = await ensureAmlRegister(auth.admin, client.id);
  const registryDetails = asRecord(register.dane_rejestrowe);
  const owners = Array.isArray(register.beneficjenci_rzeczywisci) ? register.beneficjenci_rzeczywisci as Array<Record<string, unknown>> : [];
  const subjects = buildPepSubjects(owners, String(client.nazwa || ""));

  if (subjects.length === 0) {
    return NextResponse.json({ error: "Brak osób do sprawdzenia PEP OSINT. Najpierw pobierz beneficjentów z właściwego źródła albo uzupełnij formularz wstępny AML." }, { status: 400 });
  }

  const checkedAt = new Date().toISOString();
  const payload = {
    event: "aml_pep_osint_requested",
    checkedAt,
    client: {
      id: client.id,
      name: client.nazwa,
      nip: client.nip,
      krs: String(asRecord(registryDetails.identyfikatory).krs || register.numer_krs || ""),
    },
    subjects,
    instructions: {
      purpose: "Wspomagające sprawdzenie publicznych źródeł pod kątem PEP. To nie jest oficjalna baza PEP.",
      doNotSearchByPesel: true,
      expectedResponse: {
        status: "ok | warning | error",
        label: "Krótki opis wyniku po polsku",
        findings: [{ subject: "imię i nazwisko", risk: "none | possible_pep | confirmed_pep | unclear", summary: "opis", sources: [{ title: "tytuł", url: "https://...", snippet: "fragment" }] }],
      },
    },
  };

  const response = await fetch(webhookConfig.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "Nie udało się połączyć z n8n.";
    return { error: message };
  });

  if ("error" in response) {
    return NextResponse.json({ error: `Nie udało się połączyć z n8n: ${response.error}` }, { status: 502 });
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    return NextResponse.json(
      { error: details ? `n8n zwróciło status ${response.status}: ${details.slice(0, 700)}` : `n8n zwróciło status ${response.status}.` },
      { status: 502 }
    );
  }

  const result = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!result) {
    return NextResponse.json({ error: "n8n nie zwróciło wyniku JSON dla PEP OSINT." }, { status: 502 });
  }

  const pepOsint = normalizePepOsintResult(result, checkedAt, subjects);
  const nextRegistryDetails = { ...registryDetails, pepOsint };

  const { data: updatedRegister, error: updateError } = await auth.admin
    .from("aml_rejestr_klientow")
    .update({
      pep_status: pepOsint.status,
      dane_rejestrowe: nextRegistryDetails,
      updated_at: new Date().toISOString(),
    })
    .eq("id", register.id)
    .select("*")
    .single();

  if (updateError || !updatedRegister) {
    return NextResponse.json({ error: updateError?.message || "Nie udało się zapisać wyniku PEP OSINT." }, { status: 500 });
  }

  await auth.admin.from("aml_historia").insert({
    klient_id: client.id,
    aml_rejestr_id: register.id,
    akcja: "sprawdzenie_pep_osint",
    opis: pepOsint.label,
    zmiany: { pepOsint },
    created_by: auth.requesterId,
  });

  return NextResponse.json({ pepOsint, register: updatedRegister });
}

function getPepOsintWebhookUrl(): PepWebhookConfig {
  if (!N8N_PEP_OSINT_WEBHOOK_URL) {
    return {
      webhookUrl: null,
      error: NextResponse.json({ error: "Brak konfiguracji PEP OSINT. Uzupełnij N8N_AML_PEP_OSINT_WEBHOOK_URL." }, { status: 500 }),
    };
  }
  if (N8N_PEP_OSINT_WEBHOOK_URL.includes("/webhook-test/")) {
    return {
      webhookUrl: null,
      error: NextResponse.json({ error: "Ustawiony jest testowy webhook n8n. Użyj produkcyjnego adresu /webhook/... i aktywuj workflow." }, { status: 500 }),
    };
  }
  return { webhookUrl: N8N_PEP_OSINT_WEBHOOK_URL, error: null };
}

async function getAuthorizedUser(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 }) };

  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const requesterId = userData.user?.id;
  if (userError || !requesterId) {
    return { error: NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 }) };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false || !ALLOWED_ROLES.has(String(profile?.role || ""))) {
    return { error: NextResponse.json({ error: "Brak uprawnień do sprawdzenia PEP OSINT." }, { status: 403 }) };
  }

  return { admin, requesterId };
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

  if (error || !data) throw new Error(error?.message || "Nie udało się utworzyć rejestru AML.");
  return data;
}

function buildPepSubjects(owners: Array<Record<string, unknown>>, fallbackCompanyName: string): PepSubject[] {
  return owners
    .map((owner) => ({
      name: String(owner.label || [owner.pierwszeImie, owner.kolejneImiona, owner.nazwisko].filter(Boolean).join(" ")).trim(),
      role: "beneficjent rzeczywisty",
      companyName: String(asRecord(owner.spolka).nazwa || fallbackCompanyName || "").trim() || null,
      country: String(owner.krajZamieszkania || owner.obywatelstwo || "").trim() || null,
    }))
    .filter((subject) => subject.name)
    .slice(0, 12);
}

function normalizePepOsintResult(result: Record<string, unknown>, checkedAt: string, subjects: PepSubject[]) {
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const rawStatus = String(result.status || "").toLowerCase();
  const status = ["ok", "warning", "error"].includes(rawStatus)
    ? rawStatus
    : findings.some((finding) => /possible|confirmed|pep|unclear/i.test(String((finding as Record<string, unknown>).risk || "")))
      ? "warning"
      : "ok";
  const label = String(result.label || (status === "ok"
    ? "PEP OSINT: brak przesłanek PEP w sprawdzonych publicznych źródłach."
    : status === "warning"
      ? "PEP OSINT: znaleziono potencjalne przesłanki, wymagana analiza ręczna."
      : "PEP OSINT: nie udało się zakończyć sprawdzenia publicznych źródeł."));

  return {
    source: "n8n PEP OSINT",
    status,
    label,
    checkedAt,
    subjects,
    findings,
    checkedSources: normalizeCheckedSources(result.checkedSources, findings),
    notes: result.notes || null,
    disclaimer: "Wynik ma charakter wspomagający. Publiczne wyszukiwanie internetowe nie zastępuje oficjalnego screeningu PEP u licencjonowanego dostawcy danych.",
  };
}

function normalizeCheckedSources(value: unknown, findings: unknown[]) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const record = asRecord(item);
        if (Object.keys(record).length > 0) {
          return {
            title: String(record.title || record.name || record.source || record.url || "").trim(),
            url: String(record.url || "").trim() || null,
            description: String(record.description || record.snippet || record.query || "").trim() || null,
          };
        }
        return { title: String(item || "").trim(), url: null, description: null };
      })
      .filter((item) => item.title);
  }

  const byUrl = new Map<string, { title: string; url: string | null; description: string | null }>();
  findings.forEach((finding) => {
    const sources = Array.isArray(asRecord(finding).sources) ? asRecord(finding).sources as unknown[] : [];
    sources.forEach((source) => {
      const record = asRecord(source);
      const url = String(record.url || "").trim();
      const title = String(record.title || url || "").trim();
      if (!title) return;
      byUrl.set(url || title, {
        title,
        url: url || null,
        description: String(record.snippet || "").trim() || null,
      });
    });
  });
  return [...byUrl.values()].slice(0, 12);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
