import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildClientCardPdf } from "@/lib/clientCardPdf";
import { validateClientCardFormData, type ClientCardFormData } from "@/lib/clientCardTypes";

const CLIENT_DOCUMENTS_BUCKET = "klienci-dokumenty";

type RouteContext = {
  params: Promise<{ token: string }>;
};

type ClientRecord = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  opiekun_id: string | null;
  telefon: string | null;
  forma_opodatkowania: string | null;
  czynny_vat: boolean | null;
  vat_ue: boolean | null;
  osoba_kontaktowa: string | null;
};

type FormRecord = {
  id: string;
  status: "active" | "completed" | "revoked";
  klient_id: string;
  public_token: string;
  klienci: ClientRecord[] | ClientRecord | null;
};

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getClient(form: FormRecord) {
  return Array.isArray(form.klienci) ? form.klienci[0] : form.klienci;
}

function fileSafeName(value: string | null | undefined) {
  return (value?.trim() || "klient").replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ");
}

async function getForm(token: string) {
  const admin = adminClient();
  if (!admin) return { admin: null, form: null, error: NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 }) };

  const { data, error } = await admin
    .from("klient_karty_formularze")
    .select(`
      id,
      status,
      klient_id,
      public_token,
      klienci (
        id,
        nazwa,
        nip,
        email,
        opiekun_id,
        telefon,
        forma_opodatkowania,
        czynny_vat,
        vat_ue,
        osoba_kontaktowa
      )
    `)
    .eq("public_token", token)
    .maybeSingle();

  if (error) {
    return { admin, form: null, error: NextResponse.json({ error: "Nie udało się pobrać formularza." }, { status: 500 }) };
  }

  if (!data) {
    return { admin, form: null, error: NextResponse.json({ status: "missing" }, { status: 404 }) };
  }

  return { admin, form: data as FormRecord, error: null };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const result = await getForm(token);
  if (result.error) return result.error;

  const form = result.form;
  if (!form) return NextResponse.json({ status: "missing" }, { status: 404 });

  if (form.status !== "active") {
    return NextResponse.json({ status: form.status });
  }

  const client = getClient(form);
  if (!client) {
    return NextResponse.json({ status: "missing" }, { status: 404 });
  }

  return NextResponse.json({
    status: "active",
    client,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const result = await getForm(token);
  if (result.error) return result.error;

  const admin = result.admin;
  const form = result.form;
  if (!admin || !form) return NextResponse.json({ status: "missing" }, { status: 404 });

  if (form.status !== "active") {
    return NextResponse.json({ error: "Ten formularz został już zapisany albo link wygasł." }, { status: 409 });
  }

  const client = getClient(form);
  if (!client) {
    return NextResponse.json({ error: "Nie znaleziono klienta dla formularza." }, { status: 404 });
  }

  let data: ClientCardFormData;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane formularza." }, { status: 400 });
  }

  const missing = validateClientCardFormData(data);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Uzupełnij wszystkie wymagane pola: ${missing.join(", ")}.` }, { status: 400 });
  }

  const completedAt = new Date();
  const pdf = await buildClientCardPdf({
    clientName: client.nazwa || "Klient",
    clientNip: client.nip,
    completedBy: data.osobaKontaktowa.trim(),
    completedAt,
    data,
  });

  const fileName = `Karta klienta - ${fileSafeName(client.nazwa)}.pdf`;
  const storagePath = `${client.id}/karta-klienta-${Date.now()}.pdf`;

  const uploadResult = await admin.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .upload(storagePath, pdf, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadResult.error) {
    console.error("Błąd zapisu PDF karty klienta:", uploadResult.error);
    return NextResponse.json({ error: "Nie udało się zapisać PDF w segregatorze klienta." }, { status: 500 });
  }

  const { data: documentRecord, error: documentError } = await admin
    .from("klienci_dokumenty")
    .insert({
      klient_id: client.id,
      nazwa: fileName,
      sciezka: storagePath,
      rozmiar: pdf.length,
      typ: "application/pdf",
    })
    .select("id")
    .single();

  if (documentError || !documentRecord) {
    console.error("Błąd zapisu dokumentu karty klienta:", documentError);
    return NextResponse.json({ error: "PDF został utworzony, ale nie udało się dodać go do rejestru dokumentów." }, { status: 500 });
  }

  await admin
    .from("klienci")
    .update({
      osoba_kontaktowa: data.osobaKontaktowa.trim(),
      telefon: data.telefon?.trim() || client.telefon || null,
      forma_opodatkowania: data.formaOpodatkowania?.trim() || client.forma_opodatkowania || null,
      czynny_vat: data.czynnyVat === "tak" ? true : data.czynnyVat === "nie" ? false : client.czynny_vat,
      vat_ue: data.vatUe === "tak" ? true : data.vatUe === "nie" ? false : client.vat_ue,
      schemat_zus: data.zusUlgaTytul?.trim() || null,
    })
    .eq("id", client.id);

  await admin
    .from("klient_karty_formularze")
    .update({
      status: "completed",
      completed_at: completedAt.toISOString(),
      completed_by_name: data.osobaKontaktowa.trim(),
      completed_pdf_document_id: documentRecord.id,
      form_data: data,
    })
    .eq("id", form.id);

  await admin
    .from("onboarding_etapy")
    .update({ status: "gotowe" })
    .eq("klient_id", client.id)
    .eq("etap", "client_card");

  await admin.from("onboarding_historia").insert({
    klient_id: client.id,
    etap: "client_card",
    akcja: "uzupelnienie_karty_klienta",
    opis: `Karta klienta została wypełniona przez ${data.osobaKontaktowa.trim()}.`,
    created_by: null,
  });

  if (client.opiekun_id) {
    await admin.from("powiadomienia").insert({
      type: "client_card_completed",
      title: "Karta klienta została wypełniona",
      body: `Klient ${client.nazwa || "bez nazwy"} wypełnił kartę klienta. Karta pojawi się w plikach w zakładce Klienci. Opiekun jest zobowiązany sprawdzić kartę, wyjaśnić ewentualne niejasności oraz nanieść ewentualne zmiany na dane w zakładce Klienci.`,
      priority: "high",
      related_table: "klient_karty_formularze",
      related_id: form.id,
      recipient_id: client.opiekun_id,
      metadata: {
        client_id: client.id,
        client_name: client.nazwa,
        client_nip: client.nip,
        client_card_form_id: form.id,
        document_id: documentRecord.id,
        completed_by_name: data.osobaKontaktowa.trim(),
        notification_kind: "client_card_completed",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
