import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type BeneficialOwnerChanges = {
  rola?: unknown;
  reprezentant?: unknown;
  udzialowiec?: unknown;
  procentUdzialow?: unknown;
  wartoscUdzialow?: unknown;
};

type Payload = {
  clientId?: string;
  ownerIndex?: number;
  changes?: BeneficialOwnerChanges;
};

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Brak aktywnej sesji u\u017cytkownika." }, { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const requesterId = userData.user?.id;
  if (userError || !requesterId) {
    return NextResponse.json({ error: "Nie uda\u0142o si\u0119 potwierdzi\u0107 sesji u\u017cytkownika." }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false || !ALLOWED_ROLES.has(String(profile?.role || ""))) {
    return NextResponse.json({ error: "Brak uprawnie\u0144 do edycji beneficjent\u00f3w AML." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Payload | null;
  if (!body?.clientId) {
    return NextResponse.json({ error: "Brak klienta AML." }, { status: 400 });
  }
  if (!Number.isInteger(body.ownerIndex) || Number(body.ownerIndex) < 0) {
    return NextResponse.json({ error: "Nieprawid\u0142owy beneficjent AML." }, { status: 400 });
  }

  const changes = normalizeChanges(body.changes || {});
  if ("error" in changes) {
    return NextResponse.json({ error: changes.error }, { status: 400 });
  }

  const { data: register, error: registerError } = await admin
    .from("aml_rejestr_klientow")
    .select("*")
    .eq("klient_id", body.clientId)
    .maybeSingle();

  if (registerError || !register) {
    return NextResponse.json({ error: "Nie znaleziono rejestru AML klienta." }, { status: 404 });
  }

  const owners = Array.isArray(register.beneficjenci_rzeczywisci)
    ? register.beneficjenci_rzeczywisci as Array<Record<string, unknown>>
    : [];
  const index = Number(body.ownerIndex);
  const currentOwner = owners[index];
  if (!currentOwner) {
    return NextResponse.json({ error: "Nie znaleziono wskazanego beneficjenta." }, { status: 404 });
  }

  const updatedOwner = {
    ...currentOwner,
    rola: changes.rola,
    reprezentant: changes.reprezentant,
    udzialowiec: changes.udzialowiec,
    procentUdzialow: changes.procentUdzialow,
    wartoscUdzialow: changes.wartoscUdzialow,
    manualnaAktualizacja: {
      updatedAt: new Date().toISOString(),
      updatedBy: requesterId,
    },
  };
  const nextOwners = owners.map((owner, ownerIndex) => ownerIndex === index ? updatedOwner : owner);

  const { data: updatedRegister, error: updateError } = await admin
    .from("aml_rejestr_klientow")
    .update({
      beneficjenci_rzeczywisci: nextOwners,
      updated_at: new Date().toISOString(),
    })
    .eq("id", register.id)
    .select("*")
    .single();

  if (updateError || !updatedRegister) {
    return NextResponse.json({ error: updateError?.message || "Nie uda\u0142o si\u0119 zapisa\u0107 beneficjenta AML." }, { status: 500 });
  }

  const ownerLabel = String(currentOwner.label || [currentOwner.pierwszeImie, currentOwner.kolejneImiona, currentOwner.nazwisko].filter(Boolean).join(" ") || "beneficjent rzeczywisty");
  await admin.from("aml_historia").insert({
    klient_id: body.clientId,
    aml_rejestr_id: register.id,
    akcja: "aktualizacja_beneficjenta_rzeczywistego",
    opis: `Zaktualizowano dane beneficjenta rzeczywistego: ${ownerLabel}.`,
    zmiany: {
      beneficjent: ownerLabel,
      poprzednio: pickEditableOwnerFields(currentOwner),
      aktualnie: pickEditableOwnerFields(updatedOwner),
    },
    created_by: requesterId,
  });

  return NextResponse.json({ register: updatedRegister, owner: updatedOwner });
}

function normalizeChanges(changes: BeneficialOwnerChanges) {
  const rola = normalizeText(changes.rola, 180);
  const procentUdzialow = normalizeText(changes.procentUdzialow, 40);
  const wartoscUdzialow = normalizeText(changes.wartoscUdzialow, 60);
  if (!rola) return { error: "Uzupe\u0142nij rol\u0119 beneficjenta." };

  return {
    rola,
    reprezentant: Boolean(changes.reprezentant),
    udzialowiec: Boolean(changes.udzialowiec),
    procentUdzialow: procentUdzialow || null,
    wartoscUdzialow: wartoscUdzialow || null,
  };
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function pickEditableOwnerFields(owner: Record<string, unknown>) {
  return {
    rola: owner.rola || null,
    reprezentant: owner.reprezentant ?? null,
    udzialowiec: owner.udzialowiec ?? null,
    procentUdzialow: owner.procentUdzialow || null,
    wartoscUdzialow: owner.wartoscUdzialow || null,
  };
}
