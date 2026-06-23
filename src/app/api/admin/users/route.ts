import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ADMIN_ROLES = new Set(["owner", "manager", "admin"]);
const ALLOWED_USER_ROLES = new Set(["owner", "manager", "admin", "accountant"]);

type CreateUserPayload = {
  fullName?: string;
  email?: string;
  role?: string;
  password?: string;
};

type ResetUserPasswordPayload = {
  userId?: string;
  password?: string;
};

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

type AuthorizedAdminResult =
  | { admin: SupabaseClient; error: null }
  | { admin: null; error: NextResponse };

async function getAuthorizedAdmin(request: NextRequest): Promise<AuthorizedAdminResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { admin: null, error: NextResponse.json({ error: "Brak konfiguracji administracyjnej Supabase." }, { status: 500 }) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { admin: null, error: NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 }) };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: requesterData, error: requesterError } = await admin.auth.getUser(token);
  const requesterId = requesterData.user?.id;
  if (requesterError || !requesterId) {
    return { admin: null, error: NextResponse.json({ error: "Nie udało się potwierdzić uprawnień użytkownika." }, { status: 401 }) };
  }

  const { data: requesterProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", requesterId)
    .single();

  if (!ALLOWED_ADMIN_ROLES.has(requesterProfile?.role || "")) {
    return { admin: null, error: NextResponse.json({ error: "Brak uprawnień do zarządzania użytkownikami." }, { status: 403 }) };
  }

  return { admin, error: null };
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedAdmin(request);
  if (auth.error) return auth.error;
  const admin = auth.admin;

  let payload: CreateUserPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane użytkownika." }, { status: 400 });
  }

  const fullName = payload.fullName?.trim();
  const email = payload.email?.trim().toLowerCase();
  const role = ALLOWED_USER_ROLES.has(payload.role || "") ? payload.role as string : "accountant";
  const password = payload.password?.trim();

  if (!fullName || !email || !password) {
    return NextResponse.json({ error: "Uzupełnij imię i nazwisko, email oraz hasło." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Hasło musi mieć co najmniej 8 znaków." }, { status: 400 });
  }

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      must_change_password: true,
    },
    app_metadata: {
      role,
      must_change_password: true,
    },
  });

  if (createError || !createdUser.user) {
    return NextResponse.json({ error: createError?.message || "Nie udało się utworzyć użytkownika." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: createdUser.user.id,
      full_name: fullName,
      email,
      role,
    }, { onConflict: "id" })
    .select("id, full_name, email, role")
    .single();

  if (profileError) {
    return NextResponse.json({ error: "Użytkownik został utworzony, ale nie udało się zapisać profilu." }, { status: 500 });
  }

  return NextResponse.json({ user: profile });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthorizedAdmin(request);
  if (auth.error) return auth.error;
  const admin = auth.admin;

  let payload: ResetUserPasswordPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane resetu hasła." }, { status: 400 });
  }

  const userId = payload.userId?.trim();
  const temporaryPassword = payload.password?.trim() || generateTemporaryPassword();

  if (!userId) {
    return NextResponse.json({ error: "Brak użytkownika do resetu hasła." }, { status: 400 });
  }

  if (temporaryPassword.length < 8) {
    return NextResponse.json({ error: "Hasło musi mieć co najmniej 8 znaków." }, { status: 400 });
  }

  const { data: existingUser, error: existingUserError } = await admin.auth.admin.getUserById(userId);
  if (existingUserError || !existingUser.user) {
    return NextResponse.json({ error: "Nie znaleziono użytkownika w Supabase Auth." }, { status: 404 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
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
    return NextResponse.json({ error: updateError.message || "Nie udało się zresetować hasła." }, { status: 400 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", userId)
    .single();

  return NextResponse.json({
    user: profile,
    temporaryPassword,
  });
}
