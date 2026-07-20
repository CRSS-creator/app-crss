import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Payload = {
  clientId?: string;
  nextVerificationDate?: string | null;
};

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const requesterId = userData.user?.id;
  if (userError || !requesterId) {
    return NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false || !ALLOWED_ROLES.has(String(profile?.role || ""))) {
    return NextResponse.json({ error: "Brak uprawnień do zmiany daty następnej weryfikacji AML." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Payload | null;
  if (!body?.clientId) {
    return NextResponse.json({ error: "Brak klienta AML." }, { status: 400 });
  }

  const nextDate = normalizeDate(body.nextVerificationDate);
  if (nextDate === false) {
    return NextResponse.json({ error: "Podaj datę w formacie RRRR-MM-DD." }, { status: 400 });
  }

  const { data: existingRegister } = await admin
    .from("aml_rejestr_klientow")
    .select("id, nastepna_weryfikacja_at")
    .eq("klient_id", body.clientId)
    .maybeSingle();

  const previousDate = existingRegister?.nastepna_weryfikacja_at || null;
  const payload = {
    klient_id: body.clientId,
    status: "do_weryfikacji",
    nastepna_weryfikacja_at: nextDate,
    updated_at: new Date().toISOString(),
  };

  const query = existingRegister
    ? admin
      .from("aml_rejestr_klientow")
      .update({ nastepna_weryfikacja_at: nextDate, updated_at: payload.updated_at })
      .eq("id", existingRegister.id)
      .select("*")
      .single()
    : admin
      .from("aml_rejestr_klientow")
      .insert(payload)
      .select("*")
      .single();

  const { data: register, error: saveError } = await query;
  if (saveError || !register) {
    return NextResponse.json({ error: saveError?.message || "Nie udało się zapisać daty następnej weryfikacji AML." }, { status: 500 });
  }

  await admin.from("aml_historia").insert({
    klient_id: body.clientId,
    aml_rejestr_id: register.id,
    akcja: "aktualizacja_nastepnej_weryfikacji",
    opis: nextDate
      ? `Ustawiono datę następnej weryfikacji AML na ${nextDate}.`
      : "Wyczyszczono datę następnej weryfikacji AML.",
    zmiany: { poprzednia_data: previousDate, nowa_data: nextDate },
    created_by: requesterId,
  });

  return NextResponse.json({ register });
}

function normalizeDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) return false;
  return trimmed;
}
