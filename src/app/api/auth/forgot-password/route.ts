import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const APP_URL = "https://app.crss.com.pl";
const LOGO_URL = `${APP_URL}/logo-crss-mail.png`;

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildTemporaryPasswordEmail(profile: Profile, temporaryPassword: string) {
  const recipientName = escapeHtml(profile.full_name || profile.email || "Użytkowniku");
  const recipientEmail = escapeHtml(profile.email || "");
  const safePassword = escapeHtml(temporaryPassword);

  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${LOGO_URL}" alt="CRSS" style="height:54px;max-width:180px;display:block;">
      </div>

      <p style="margin:0 0 18px 0;font-size:16px;line-height:1.55;color:#173b73;">Dzień dobry,</p>

      <p style="margin:0 0 20px 0;font-size:16px;line-height:1.55;color:#173b73;">
        otrzymaliśmy prośbę o reset hasła do aplikacji CRSS dla użytkownika
        <strong>${recipientName}</strong>.
      </p>

      <div style="background:#eef3fb;border:1px solid #c9d6e8;border-radius:14px;padding:18px 20px;margin:22px 0;">
        <p style="margin:0 0 10px 0;font-size:13px;font-weight:bold;color:#465675;">Dane logowania</p>
        <p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;color:#173b73;">
          Login: <strong>${recipientEmail}</strong>
        </p>
        <p style="margin:0;font-size:15px;line-height:1.5;color:#173b73;">
          Hasło tymczasowe:
          <span style="display:inline-block;background:#ffffff;border:1px solid #c9d6e8;border-radius:10px;padding:8px 12px;font-size:18px;font-weight:bold;color:#173b73;">${safePassword}</span>
        </p>
      </div>

      <p style="margin:0 0 22px 0;font-size:15px;line-height:1.55;color:#173b73;">
        Po zalogowaniu system poprosi o ustawienie własnego hasła.
      </p>

      <p style="margin:0 0 24px 0;">
        <a href="${APP_URL}" style="display:inline-block;background:#f52f57;color:#ffffff;text-decoration:none;border-radius:12px;padding:13px 22px;font-size:15px;font-weight:bold;">
          Przejdź do aplikacji CRSS
        </a>
      </p>

      <p style="margin:0 0 6px 0;font-size:16px;line-height:1.55;color:#173b73;">Pozdrawiamy serdecznie,</p>
      <p style="margin:0;font-size:16px;font-weight:bold;color:#173b73;">Zespół CRSS</p>
    </div>

    <p style="margin:18px 4px 0 4px;font-size:13px;line-height:1.45;color:#7c8799;">
      Wiadomość wysłana automatycznie, prosimy na nią nie odpowiadać.
    </p>
  </div>
</div>`.trim();
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
      html: buildTemporaryPasswordEmail(profile, temporaryPassword),
      template: {
        type: "temporary_password",
        signatureSource: "app_html_template",
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
