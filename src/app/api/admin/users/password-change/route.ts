import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PasswordChangePayload = {
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

  let payload: PasswordChangePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane zmiany hasła." }, { status: 400 });
  }

  const password = payload.password?.trim();
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Nowe hasło musi mieć co najmniej 8 znaków." }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: requesterData, error: requesterError } = await admin.auth.getUser(token);
  const user = requesterData.user;
  if (requesterError || !user) {
    return NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password,
    user_metadata: {
      ...(user.user_metadata || {}),
      must_change_password: false,
    },
    app_metadata: {
      ...(user.app_metadata || {}),
      must_change_password: false,
    },
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message || "Nie udało się zmienić hasła." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
