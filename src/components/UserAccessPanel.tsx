"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";

type UserAccessRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  aktywne: boolean | null;
};

export default function UserAccessPanel() {
  const [users, setUsers] = useState<UserAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, aktywne")
      .order("aktywne", { ascending: false })
      .order("full_name", { ascending: true });

    if (error) {
      console.error("Błąd pobierania statusów użytkowników:", error);
      alert("Nie udało się pobrać statusów użytkowników.");
    }

    setUsers((data || []) as UserAccessRow[]);
    setLoading(false);
  }

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) => [user.full_name, user.email, user.role].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [search, users]);

  async function changeUserAccess(user: UserAccessRow, active: boolean) {
    const action = active ? "activate" : "deactivate";
    const label = profileName(user);
    const question = active
      ? `Przywrócić dostęp użytkownikowi ${label}?`
      : `Zablokować dostęp użytkownikowi ${label}? Historia jego czynności zostanie zachowana.`;

    if (!confirm(question)) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return alert("Sesja wygasła. Zaloguj się ponownie.");

    setActionUserId(user.id);
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId: user.id, action }),
    });
    const result = await response.json().catch(() => null);
    setActionUserId(null);

    if (!response.ok || !result?.user) {
      alert(result?.error || "Nie udało się zmienić statusu użytkownika.");
      return;
    }

    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, aktywne: active } : item));
  }

  return (
    <section style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>Dostęp użytkowników</h2>
          <p style={hintStyle}>Blokada wyłącza logowanie, ale zostawia historię zadań, czasu pracy i zmian wykonaną przez daną osobę.</p>
        </div>
        <input
          style={searchStyle}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Szukaj po imieniu, emailu lub roli"
        />
      </div>

      <div style={tableShellStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Użytkownik</Th>
              <Th>Email</Th>
              <Th>Rola</Th>
              <Th>Status</Th>
              <Th>Akcje</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><Td colSpan={5}>Ładowanie użytkowników...</Td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><Td colSpan={5}>Brak użytkowników dla wybranego wyszukiwania.</Td></tr>
            ) : filteredUsers.map((user) => {
              const active = user.aktywne !== false;
              return (
                <tr key={user.id}>
                  <Td strong>{profileName(user)}</Td>
                  <Td>{user.email || "Brak emaila"}</Td>
                  <Td>{roleLabel(user.role)}</Td>
                  <Td><span style={active ? activeBadgeStyle : inactiveBadgeStyle}>{active ? "Aktywny" : "Nieaktywny"}</span></Td>
                  <Td>
                    {active ? (
                      <button style={dangerButtonStyle} disabled={actionUserId === user.id} onClick={() => changeUserAccess(user, false)}>
                        {actionUserId === user.id ? "Blokowanie..." : "Zablokuj"}
                      </button>
                    ) : (
                      <button style={secondaryButtonStyle} disabled={actionUserId === user.id} onClick={() => changeUserAccess(user, true)}>
                        {actionUserId === user.id ? "Przywracanie..." : "Przywróć dostęp"}
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function profileName(user: UserAccessRow) {
  return user.full_name || user.email || "Użytkownik";
}

function roleLabel(role: string | null) {
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  if (role === "admin") return "Admin";
  if (role === "accountant") return "Accountant";
  return role || "Brak roli";
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children, strong, colSpan }: { children: React.ReactNode; strong?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ ...tdStyle, fontWeight: strong ? 850 : 650 }}>{children}</td>;
}

const panelStyle: CSSProperties = {
  marginTop: "24px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  background: colors.card,
  padding: "24px",
  boxShadow: shadow.soft,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "18px",
  alignItems: "flex-start",
  marginBottom: "18px",
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const hintStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.55, maxWidth: "760px" };
const searchStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "11px 13px", minHeight: "44px", minWidth: "320px", fontWeight: 750 };
const tableShellStyle: CSSProperties = { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", padding: "13px 14px", color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "14px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle" };
const badgeBaseStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: radius.badge, padding: "7px 11px", fontWeight: 850, fontSize: "12px", whiteSpace: "nowrap" };
const activeBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#dcfce7", color: colors.success };
const inactiveBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#fee2e2", color: colors.danger };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "10px 13px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const dangerButtonStyle: CSSProperties = { ...secondaryButtonStyle, color: colors.danger, background: "#fff5f5" };
