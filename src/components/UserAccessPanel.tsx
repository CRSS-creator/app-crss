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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
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

    const rows = (data || []) as UserAccessRow[];
    setUsers(rows);
    setSelectedUserId((current) => current || rows[0]?.id || null);
    setLoading(false);
  }

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) => [user.full_name, user.email, user.role].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [search, users]);

  const selectedUser = users.find((user) => user.id === selectedUserId) || filteredUsers[0] || null;

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
          <h2 style={titleStyle}>Blokada dostępu</h2>
          <p style={hintStyle}>Wybierz użytkownika tylko wtedy, gdy chcesz zablokować albo przywrócić jego dostęp do aplikacji.</p>
        </div>
        <input
          style={searchStyle}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Szukaj użytkownika"
        />
      </div>

      {loading ? (
        <div style={emptyStyle}>Ładowanie użytkowników...</div>
      ) : filteredUsers.length === 0 ? (
        <div style={emptyStyle}>Brak użytkowników dla wybranego wyszukiwania.</div>
      ) : (
        <div style={accessGridStyle}>
          <div style={userListStyle}>
            {filteredUsers.slice(0, 8).map((user) => {
              const active = user.aktywne !== false;
              const selected = selectedUser?.id === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  style={selected ? selectedUserButtonStyle : userButtonStyle}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <span style={userButtonNameStyle}>{profileName(user)}</span>
                  <span style={userButtonMetaStyle}>{user.email || roleLabel(user.role)}</span>
                  <span style={active ? activeBadgeStyle : inactiveBadgeStyle}>{active ? "Aktywny" : "Nieaktywny"}</span>
                </button>
              );
            })}
          </div>

          {selectedUser && (
            <div style={selectedCardStyle}>
              <div>
                <span style={labelStyle}>Wybrany użytkownik</span>
                <h3 style={selectedTitleStyle}>{profileName(selectedUser)}</h3>
                <p style={selectedMetaStyle}>{selectedUser.email || "Brak emaila"} · {roleLabel(selectedUser.role)}</p>
              </div>
              <div style={selectedActionsStyle}>
                <span style={selectedUser.aktywne !== false ? activeBadgeStyle : inactiveBadgeStyle}>{selectedUser.aktywne !== false ? "Aktywny" : "Nieaktywny"}</span>
                {selectedUser.aktywne !== false ? (
                  <button style={dangerButtonStyle} disabled={actionUserId === selectedUser.id} onClick={() => changeUserAccess(selectedUser, false)}>
                    {actionUserId === selectedUser.id ? "Blokowanie..." : "Zablokuj dostęp"}
                  </button>
                ) : (
                  <button style={secondaryButtonStyle} disabled={actionUserId === selectedUser.id} onClick={() => changeUserAccess(selectedUser, true)}>
                    {actionUserId === selectedUser.id ? "Przywracanie..." : "Przywróć dostęp"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
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
const accessGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(260px, 360px) minmax(280px, 1fr)", gap: "14px", alignItems: "stretch" };
const userListStyle: CSSProperties = { display: "grid", gap: "8px", alignContent: "start" };
const userButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "11px 12px", display: "grid", gridTemplateColumns: "1fr auto", gap: "5px 10px", textAlign: "left", cursor: "pointer", alignItems: "center" };
const selectedUserButtonStyle: CSSProperties = { ...userButtonStyle, borderColor: colors.navy, background: "rgba(23, 59, 115, 0.08)" };
const userButtonNameStyle: CSSProperties = { fontWeight: 850, color: colors.text };
const userButtonMetaStyle: CSSProperties = { gridColumn: "1 / 2", color: colors.muted, fontSize: "12px", fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const selectedCardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "18px", display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "center", flexWrap: "wrap" };
const selectedTitleStyle: CSSProperties = { margin: "8px 0 4px", color: colors.navy, fontSize: "22px" };
const selectedMetaStyle: CSSProperties = { margin: 0, color: colors.muted, fontWeight: 700 };
const selectedActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" };
const labelStyle: CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 850 };
const emptyStyle: CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.muted, padding: "18px", fontWeight: 800, textAlign: "center" };
const badgeBaseStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: radius.badge, padding: "7px 11px", fontWeight: 850, fontSize: "12px", whiteSpace: "nowrap" };
const activeBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#dcfce7", color: colors.success };
const inactiveBadgeStyle: CSSProperties = { ...badgeBaseStyle, background: "#fee2e2", color: colors.danger };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "10px 13px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const dangerButtonStyle: CSSProperties = { ...secondaryButtonStyle, color: colors.danger, background: "#fff5f5" };
