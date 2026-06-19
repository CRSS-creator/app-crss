import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ADMIN_ROLES = new Set(["owner", "manager", "admin"]);
const ALLOWED_USER_ROLES = new Set(["owner", "manager", "admin", "accountant"]);

type CreateUserPayload = {
  fullName?: string;
  email?: string;
  role?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Brak konfiguracji administracyjnej Supabase." }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 });
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
    return NextResponse.json({ error: "Nie udało się potwierdzić uprawnień użytkownika." }, { status: 401 });
  }

  const { data: requesterProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", requesterId)
    .single();

  if (!ALLOWED_ADMIN_ROLES.has(requesterProfile?.role || "")) {
    return NextResponse.json({ error: "Brak uprawnień do dodawania użytkowników." }, { status: 403 });
  }

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
