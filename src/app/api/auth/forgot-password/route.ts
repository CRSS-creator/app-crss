import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const APP_URL = "https://app.crss.com.pl";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  aktywne?: boolean | null;
};

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function temporaryPasswordWebhookUrl() {
  const webhookUrl = process.env.N8N_USER_TEMP_PASSWORD_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.includes("/webhook-test/")) return null;
  return webhookUrl;
}

async function sendTemporaryPasswordMail(profile: Profile, temporaryPassword: string) {
  const webhookUrl = temporaryPasswordWebhookUrl();
  if (!webhookUrl || !profile.email) return;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "user_temporary_password_requested",
      recipientEmail: profile.email,
      recipientName: profile.full_name || profile.email,
      temporaryPassword,
      reason: "reset",
      role: profile.role,
      appUrl: APP_URL,
      subject: "Reset hasła do aplikacji CRSS",
      template: {
        type: "temporary_password",
        signatureSource: "n8n_html_template",
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `n8n returned ${response.status}`);
  }
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Brak konfiguracji administracyjnej Supabase." }, { status: 500 });
  }

  let email = "";
  try {
    const payload = await request.json();
    email = normalizeEmail(payload?.email);
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane resetu hasła." }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Podaj adres e-mail." }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const genericResponse = NextResponse.json({
    ok: true,
    message: "Jeżeli konto istnieje i jest aktywne, wysłaliśmy hasło tymczasowe na podany adres e-mail.",
  });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, email, role, aktywne")
    .eq("email", email)
    .maybeSingle<Profile>();

  if (profileError || !profile || profile.aktywne === false) {
    if (profileError) console.error("Forgot password profile lookup failed:", profileError);
    return genericResponse;
  }

  const { data: existingUser, error: userError } = await admin.auth.admin.getUserById(profile.id);
  if (userError || !existingUser.user) {
    if (userError) console.error("Forgot password auth lookup failed:", userError);
    return genericResponse;
  }

  const temporaryPassword = generateTemporaryPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
    password: temporaryPassword,
    user_metadata: {
      ...(existingUser.user.user_metadata || {}),
      must_change_password: true,
    },
    app_metadata: {
      ...(existingUser.user.app_metadata || {}),
      must_change_password: true,
    },
  });

  if (updateError) {
    console.error("Forgot password auth update failed:", updateError);
    return genericResponse;
  }

  try {
    await sendTemporaryPasswordMail(profile, temporaryPassword);
  } catch (error) {
    console.error("Forgot password temporary mail failed:", error);
  }

  return genericResponse;
}
