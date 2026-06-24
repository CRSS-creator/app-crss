"use client";

import { useEffect, useState } from "react";
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
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    let frame = 0;

    function scheduleAttach() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => attachAccessControls(users, actionUserId, changeUserAccess));
    }

    scheduleAttach();
    const observer = new MutationObserver(scheduleAttach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [users, actionUserId]);

  async function loadUsers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, aktywne")
      .order("aktywne", { ascending: false })
      .order("full_name", { ascending: true });

    if (error) {
      console.error("Błąd pobierania statusów użytkowników:", error);
      return;
    }

    setUsers((data || []) as UserAccessRow[]);
  }

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

  return null;
}

function attachAccessControls(
  users: UserAccessRow[],
  actionUserId: string | null,
  onChange: (user: UserAccessRow, active: boolean) => void,
) {
  const page = document.querySelector<HTMLElement>('[data-active-page="uzytkownicy"]');
  if (!page) return;

  const usersTitle = Array.from(page.querySelectorAll<HTMLHeadingElement>("h2"))
    .find((heading) => heading.textContent?.trim() === "Użytkownicy");
  const usersSection = usersTitle?.closest<HTMLElement>("section");
  if (!usersSection) return;

  const table = Array.from(usersSection.querySelectorAll<HTMLTableElement>("table"))
    .find((candidate) => Array.from(candidate.querySelectorAll("th")).some((th) => th.textContent?.trim() === "Hasło"));
  if (!table) return;

  const headerRow = table.querySelector<HTMLTableRowElement>("thead tr");
  if (!headerRow) return;

  if (!headerRow.querySelector('[data-user-access-header="status"]')) {
    headerRow.appendChild(buildHeaderCell("Status", "status"));
    headerRow.appendChild(buildHeaderCell("Dostęp", "access"));
  }

  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  rows.forEach((row) => {
    const cells = Array.from(row.children) as HTMLElement[];
    if (cells.length < 2) return;

    const email = normalize(cells[1]?.textContent || "");
    const user = users.find((item) => normalize(item.email || "") === email);
    if (!user) return;

    row.querySelectorAll('[data-user-access-cell="true"]').forEach((cell) => cell.remove());
    row.appendChild(buildStatusCell(user));
    row.appendChild(buildActionCell(user, actionUserId, onChange));
  });
}

function buildHeaderCell(label: string, key: string) {
  const th = document.createElement("th");
  th.dataset.userAccessHeader = key;
  th.textContent = label;
  th.style.textAlign = "left";
  th.style.padding = "13px 14px";
  th.style.color = "#4b5d78";
  th.style.fontSize = "12px";
  th.style.textTransform = "uppercase";
  th.style.letterSpacing = "0.04em";
  th.style.borderBottom = "1px solid #cbd7e6";
  th.style.whiteSpace = "nowrap";
  return th;
}

function buildStatusCell(user: UserAccessRow) {
  const td = buildBaseCell();
  const active = user.aktywne !== false;
  const badge = document.createElement("span");
  badge.textContent = active ? "Aktywny" : "Nieaktywny";
  badge.style.display = "inline-flex";
  badge.style.alignItems = "center";
  badge.style.justifyContent = "center";
  badge.style.borderRadius = "999px";
  badge.style.padding = "7px 11px";
  badge.style.fontWeight = "850";
  badge.style.fontSize = "12px";
  badge.style.whiteSpace = "nowrap";
  badge.style.background = active ? "#dcfce7" : "#fee2e2";
  badge.style.color = active ? "#16a34a" : "#dc2626";
  td.appendChild(badge);
  return td;
}

function buildActionCell(user: UserAccessRow, actionUserId: string | null, onChange: (user: UserAccessRow, active: boolean) => void) {
  const td = buildBaseCell();
  const active = user.aktywne !== false;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = actionUserId === user.id ? (active ? "Blokowanie..." : "Przywracanie...") : (active ? "Zablokuj" : "Przywróć");
  button.disabled = actionUserId === user.id;
  button.style.border = "1px solid #cbd7e6";
  button.style.borderRadius = "14px";
  button.style.background = active ? "#fff5f5" : "#ffffff";
  button.style.color = active ? "#dc2626" : "#102a5c";
  button.style.padding = "9px 12px";
  button.style.fontWeight = "850";
  button.style.cursor = button.disabled ? "default" : "pointer";
  button.style.whiteSpace = "nowrap";
  button.addEventListener("click", () => onChange(user, !active));
  td.appendChild(button);
  return td;
}

function buildBaseCell() {
  const td = document.createElement("td");
  td.dataset.userAccessCell = "true";
  td.style.padding = "14px";
  td.style.borderBottom = "1px solid #cbd7e6";
  td.style.color = "#0f2147";
  td.style.verticalAlign = "middle";
  return td;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function profileName(user: UserAccessRow) {
  return user.full_name || user.email || "Użytkownik";
}
