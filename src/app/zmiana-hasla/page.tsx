"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius, shadow } from "@/app/design";

export default function PasswordChangePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = "/login";
    });
  }, []);

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Nowe hasło musi mieć co najmniej 8 znaków.");
      return;
    }

    if (password !== repeatPassword) {
      setError("Hasła nie są takie same.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Sesja wygasła. Zaloguj się ponownie.");
      return;
    }

    setSaving(true);
    const response = await fetch("/api/admin/users/password-change", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });
    const result = await response.json().catch(() => null);
    setSaving(false);

    if (!response.ok) {
      setError(result?.error || "Nie udało się zmienić hasła.");
      return;
    }

    await supabase.auth.refreshSession();
    router.push("/dashboard");
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Aplikacja CRSS</p>
        <h1 style={titleStyle}>Ustaw nowe hasło</h1>
        <p style={subtitleStyle}>Logujesz się hasłem tymczasowym. Dla bezpieczeństwa ustaw teraz własne hasło do aplikacji.</p>

        <form onSubmit={savePassword} style={formStyle}>
          <input
            style={inputStyle}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Nowe hasło"
          />
          <input
            style={inputStyle}
            type="password"
            value={repeatPassword}
            onChange={(event) => setRepeatPassword(event.target.value)}
            placeholder="Powtórz nowe hasło"
          />
          {error && <p style={errorStyle}>{error}</p>}
          <button style={buttonStyle} disabled={saving} type="submit">{saving ? "Zapisywanie..." : "Zapisz nowe hasło"}</button>
        </form>
      </section>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "32px",
  background: colors.background,
};

const cardStyle: React.CSSProperties = {
  width: "min(520px, 100%)",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  background: colors.card,
  boxShadow: shadow.card,
  padding: "34px",
};

const eyebrowStyle: React.CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850 };
const titleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "38px", lineHeight: 1.08 };
const subtitleStyle: React.CSSProperties = { margin: "14px 0 26px", color: colors.muted, lineHeight: 1.65 };
const formStyle: React.CSSProperties = { display: "grid", gap: "14px" };
const inputStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "14px 16px", fontWeight: 750, minHeight: "48px" };
const buttonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, padding: "13px 18px", fontWeight: 850, cursor: "pointer" };
const errorStyle: React.CSSProperties = { margin: 0, color: colors.danger, fontWeight: 750 };
