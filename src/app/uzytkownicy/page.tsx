"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
import { fetchClientCaregivers, fetchClients } from "@/lib/clientService";
import {
  createRecurringTask,
  deleteRecurringTask,
  fetchRecurringTaskTemplates,
  updateRecurringTask,
  type RecurringTask,
} from "@/lib/recurringTasksService";
import type { TaskPriority, ProfileSummary } from "@/lib/taskService";

const LEGAL_FORM_OPTIONS = ["", "JDG", "sp. z o.o.", "spółka cywilna", "inna"];
const TAXATION_OPTIONS = ["", "Skala podatkowa", "Podatek liniowy", "Ryczałt", "CIT", "Karta podatkowa", "Inne"];
const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "niski", label: "Niski" },
  { value: "normalny", label: "Normalny" },
  { value: "wysoki", label: "Wysoki" },
  { value: "pilne", label: "Pilne" },
];
const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "accountant", label: "Accountant" },
];

type SettingsTab = "templates" | "users";
type UserProfile = ProfileSummary & { id: string; role: string | null };
type ClientRow = { id: string; nazwa: string | null; forma_prawna: string | null; forma_opodatkowania: string | null; opiekun_id: string | null };
type TemplateDraft = {
  id: string | null;
  tytul: string;
  opis: string;
  forma_prawna: string;
  forma_opodatkowania: string;
  dzien_miesiaca: string;
  priorytet: TaskPriority;
  osoba_id: string;
  aktywne: boolean;
};

const emptyDraft: TemplateDraft = {
  id: null,
  tytul: "",
  opis: "",
  forma_prawna: "",
  forma_opodatkowania: "",
  dzien_miesiaca: "10",
  priorytet: "normalny",
  osoba_id: "",
  aktywne: true,
};

export default function SettingsPage() {
  return (
    <AppLayout activePage="uzytkownicy">
      <AccessGuard moduleName="uzytkownicy">
        <SettingsContent />
      </AccessGuard>
    </AppLayout>
  );
}

function SettingsContent() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("templates");
  const [templates, setTemplates] = useState<RecurringTask[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [assignees, setAssignees] = useState<UserProfile[]>([]);
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    const [templatesResult, clientsResult, usersResult, assigneesResult] = await Promise.all([
      fetchRecurringTaskTemplates(),
      fetchClients(),
      supabase.from("profiles").select("id, full_name, email, role").order("full_name", { ascending: true }),
      fetchClientCaregivers(),
    ]);

    if (templatesResult.error) console.error("Błąd pobierania szablonów:", templatesResult.error);
    if (clientsResult.error) console.error("Błąd pobierania klientów:", clientsResult.error);
    if (usersResult.error) console.error("Błąd pobierania użytkowników:", usersResult.error);
    if (assigneesResult.error) console.error("Błąd pobierania osób:", assigneesResult.error);

    setTemplates((templatesResult.data || []) as RecurringTask[]);
    setClients((clientsResult.data || []) as ClientRow[]);
    setUsers((usersResult.data || []) as UserProfile[]);
    setAssignees((assigneesResult.data || []) as UserProfile[]);
    setLoading(false);
  }

  const activeTemplates = templates.filter((template) => template.aktywne).length;
  const inactiveTemplates = templates.length - activeTemplates;

  async function saveTemplate() {
    if (!draft.tytul.trim()) return alert("Wpisz nazwę zadania cyklicznego.");
    const day = Math.min(31, Math.max(1, Number(draft.dzien_miesiaca || 10)));
    setSaving(true);

    const payload = {
      klient_id: null,
      tytul: draft.tytul.trim(),
      opis: draft.opis.trim() || null,
      forma_prawna: draft.forma_prawna || null,
      forma_opodatkowania: draft.forma_opodatkowania || null,
      dzien_miesiaca: day,
      priorytet: draft.priorytet,
      osoba_id: draft.osoba_id || null,
      aktywne: draft.aktywne,
    };

    const result = draft.id
      ? await updateRecurringTask(draft.id, payload)
      : await createRecurringTask(payload);

    setSaving(false);
    if (result.error) {
      console.error("Błąd zapisu szablonu:", result.error);
      alert("Nie udało się zapisać szablonu.");
      return;
    }

    const saved = result.data as RecurringTask;
    setTemplates((current) => draft.id ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
    setDraft(emptyDraft);
  }

  async function toggleTemplate(template: RecurringTask) {
    const result = await updateRecurringTask(template.id, { aktywne: !template.aktywne });
    if (result.error) return alert("Nie udało się zmienić statusu szablonu.");
    const updated = result.data as RecurringTask;
    setTemplates((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function removeTemplate(template: RecurringTask) {
    if (!confirm(`Usunąć szablon: ${template.tytul}?`)) return;
    const result = await deleteRecurringTask(template.id);
    if (result.error) return alert("Nie udało się usunąć szablonu.");
    setTemplates((current) => current.filter((item) => item.id !== template.id));
    if (draft.id === template.id) setDraft(emptyDraft);
  }

  async function updateUserRole(user: UserProfile, role: string) {
    const result = await supabase.from("profiles").update({ role }).eq("id", user.id).select("id, full_name, email, role").single();
    if (result.error) {
      console.error("Błąd zmiany roli:", result.error);
      alert("Nie udało się zmienić roli użytkownika.");
      return;
    }
    setUsers((current) => current.map((item) => item.id === user.id ? result.data as UserProfile : item));
  }

  function editTemplate(template: RecurringTask) {
    setDraft({
      id: template.id,
      tytul: template.tytul,
      opis: template.opis || "",
      forma_prawna: template.forma_prawna || "",
      forma_opodatkowania: template.forma_opodatkowania || "",
      dzien_miesiaca: String(template.dzien_miesiaca || 10),
      priorytet: template.priorytet,
      osoba_id: template.osoba_id || "",
      aktywne: template.aktywne,
    });
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Administracja</p>
          <h1 style={titleStyle}>Ustawienia</h1>
          <p style={subtitleStyle}>Zarządzanie użytkownikami i stałymi szablonami pracy operacyjnej.</p>
        </div>
        <div style={summaryGridStyle}>
          <Summary label="Szablony aktywne" value={activeTemplates} />
          <Summary label="Szablony wyłączone" value={inactiveTemplates} />
          <Summary label="Użytkownicy" value={users.length} />
        </div>
      </section>

      <div style={tabsStyle}>
        <button style={activeTab === "templates" ? activeTabStyle : tabStyle} onClick={() => setActiveTab("templates")}>Szablony cykliczne</button>
        <button style={activeTab === "users" ? activeTabStyle : tabStyle} onClick={() => setActiveTab("users")}>Użytkownicy</button>
      </div>

      {activeTab === "templates" ? (
        <TemplatesTab
          templates={templates}
          clients={clients}
          assignees={assignees}
          draft={draft}
          loading={loading}
          saving={saving}
          setDraft={setDraft}
          onSave={saveTemplate}
          onEdit={editTemplate}
          onToggle={toggleTemplate}
          onRemove={removeTemplate}
        />
      ) : (
        <UsersTab users={users} loading={loading} onRoleChange={updateUserRole} />
      )}
    </>
  );
}

function TemplatesTab({ templates, clients, assignees, draft, loading, saving, setDraft, onSave, onEdit, onToggle, onRemove }: {
  templates: RecurringTask[];
  clients: ClientRow[];
  assignees: UserProfile[];
  draft: TemplateDraft;
  loading: boolean;
  saving: boolean;
  setDraft: React.Dispatch<React.SetStateAction<TemplateDraft>>;
  onSave: () => void;
  onEdit: (template: RecurringTask) => void;
  onToggle: (template: RecurringTask) => void;
  onRemove: (template: RecurringTask) => void;
}) {
  const sortedTemplates = useMemo(() => [...templates].sort((a, b) => Number(b.aktywne) - Number(a.aktywne) || a.dzien_miesiaca - b.dzien_miesiaca), [templates]);

  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Szablony zadań cyklicznych</h2>
          <p style={hintStyle}>Szablon działa dla każdego klienta, którego forma prawna i opodatkowanie pasują do ustawionych warunków.</p>
        </div>
      </div>

      <div style={formGridStyle}>
        <Field label="Nazwa zadania"><input style={inputStyle} value={draft.tytul} onChange={(event) => setDraft((current) => ({ ...current, tytul: event.target.value }))} placeholder="np. Sprawdzenie kompletu dokumentów" /></Field>
        <Field label="Forma prawna"><Select value={draft.forma_prawna} options={LEGAL_FORM_OPTIONS} emptyLabel="Każda forma" onChange={(value) => setDraft((current) => ({ ...current, forma_prawna: value }))} /></Field>
        <Field label="Opodatkowanie"><Select value={draft.forma_opodatkowania} options={TAXATION_OPTIONS} emptyLabel="Każde opodatkowanie" onChange={(value) => setDraft((current) => ({ ...current, forma_opodatkowania: value }))} /></Field>
        <Field label="Dzień miesiąca"><input style={inputStyle} type="number" min={1} max={31} value={draft.dzien_miesiaca} onChange={(event) => setDraft((current) => ({ ...current, dzien_miesiaca: event.target.value }))} /></Field>
        <Field label="Priorytet"><select style={inputStyle} value={draft.priorytet} onChange={(event) => setDraft((current) => ({ ...current, priorytet: event.target.value as TaskPriority }))}>{PRIORITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
        <Field label="Osoba odpowiedzialna"><select style={inputStyle} value={draft.osoba_id} onChange={(event) => setDraft((current) => ({ ...current, osoba_id: event.target.value }))}><option value="">Opiekun klienta / bez przypisania</option>{assignees.map((user) => <option key={user.id} value={user.id}>{profileName(user)}</option>)}</select></Field>
        <label style={switchStyle}><input type="checkbox" checked={draft.aktywne} onChange={(event) => setDraft((current) => ({ ...current, aktywne: event.target.checked }))} /> Aktywny szablon</label>
        <Field label="Opis"><textarea style={textareaStyle} value={draft.opis} onChange={(event) => setDraft((current) => ({ ...current, opis: event.target.value }))} placeholder="Krótki opis czynności dla księgowości" /></Field>
      </div>

      <div style={buttonRowStyle}>
        <button style={primaryButtonStyle} disabled={saving} onClick={onSave}>{draft.id ? "Zapisz zmiany" : "Dodaj szablon"}</button>
        {draft.id && <button style={secondaryButtonStyle} onClick={() => setDraft(emptyDraft)}>Anuluj edycję</button>}
      </div>

      <div style={tableShellStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Zadanie</Th>
              <Th>Warunki</Th>
              <Th>Dzień</Th>
              <Th>Priorytet</Th>
              <Th>Obejmuje</Th>
              <Th>Status</Th>
              <Th>Akcje</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><Td colSpan={7}>Ładowanie ustawień...</Td></tr>
            ) : sortedTemplates.length === 0 ? (
              <tr><Td colSpan={7}>Brak szablonów cyklicznych.</Td></tr>
            ) : sortedTemplates.map((template) => (
              <tr key={template.id} style={rowStyle}>
                <Td strong>{template.tytul}<Small>{template.opis || "Brak opisu"}</Small></Td>
                <Td>{template.forma_prawna || "Każda forma"}<Small>{template.forma_opodatkowania || "Każde opodatkowanie"}</Small></Td>
                <Td>{template.dzien_miesiaca}</Td>
                <Td><Badge>{priorityLabel(template.priorytet)}</Badge></Td>
                <Td>{matchingClientsCount(template, clients)} klientów</Td>
                <Td><span style={template.aktywne ? activeBadgeStyle : inactiveBadgeStyle}>{template.aktywne ? "Aktywny" : "Wyłączony"}</span></Td>
                <Td>
                  <div style={actionsStyle}>
                    <button style={secondaryButtonStyle} onClick={() => onEdit(template)}>Edytuj</button>
                    <button style={secondaryButtonStyle} onClick={() => onToggle(template)}>{template.aktywne ? "Wyłącz" : "Włącz"}</button>
                    <button style={dangerButtonStyle} onClick={() => onRemove(template)}>Usuń</button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UsersTab({ users, loading, onRoleChange }: { users: UserProfile[]; loading: boolean; onRoleChange: (user: UserProfile, role: string) => void }) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Użytkownicy</h2>
          <p style={hintStyle}>Lista osób z dostępem do aplikacji oraz ich role w CRM.</p>
        </div>
      </div>
      <div style={tableShellStyle}>
        <table style={tableStyle}>
          <thead><tr><Th>Użytkownik</Th><Th>Email</Th><Th>Rola</Th></tr></thead>
          <tbody>
            {loading ? <tr><Td colSpan={3}>Ładowanie użytkowników...</Td></tr> : users.map((user) => (
              <tr key={user.id} style={rowStyle}>
                <Td strong>{user.full_name || "Brak nazwy"}</Td>
                <Td>{user.email || "Brak emaila"}</Td>
                <Td><select style={roleSelectStyle} value={user.role || "accountant"} onChange={(event) => onRoleChange(user, event.target.value)}>{ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Select({ value, options, emptyLabel, onChange }: { value: string; options: string[]; emptyLabel: string; onChange: (value: string) => void }) {
  return <select style={inputStyle} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option || "empty"} value={option}>{option || emptyLabel}</option>)}</select>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={fieldStyle}><span style={labelStyle}>{label}</span>{children}</label>; }
function Summary({ label, value }: { label: string; value: string | number }) { return <div style={summaryStyle}><span>{label}</span><strong>{value}</strong></div>; }
function Th({ children }: { children: ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong, colSpan }: { children: ReactNode; strong?: boolean; colSpan?: number }) { return <td colSpan={colSpan} style={{ ...tdStyle, fontWeight: strong ? 800 : 600 }}>{children}</td>; }
function Badge({ children }: { children: ReactNode }) { return <span style={badgeStyle}>{children}</span>; }
function Small({ children }: { children: ReactNode }) { return <small style={smallTextStyle}>{children}</small>; }

function profileName(user: UserProfile | ProfileSummary) { return user.full_name || user.email || "Użytkownik"; }
function priorityLabel(priority: TaskPriority) { return PRIORITY_OPTIONS.find((item) => item.value === priority)?.label || priority; }
function matchingClientsCount(template: RecurringTask, clients: ClientRow[]) {
  return clients.filter((client) => {
    const legalMatch = !template.forma_prawna || template.forma_prawna === client.forma_prawna;
    const taxMatch = !template.forma_opodatkowania || template.forma_opodatkowania === client.forma_opodatkowania;
    return legalMatch && taxMatch;
  }).length;
}

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap" };
const eyebrowStyle: CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850 };
const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.05 };
const subtitleStyle: CSSProperties = { margin: "12px 0 0", color: colors.muted, fontSize: "17px", lineHeight: 1.65, maxWidth: "760px" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: "12px", minWidth: "460px" };
const summaryStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, padding: "15px", display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 800, boxShadow: shadow.soft };
const tabsStyle: CSSProperties = { display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap" };
const tabStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.card, color: colors.navy, padding: "12px 17px", fontWeight: 850, cursor: "pointer" };
const activeTabStyle: CSSProperties = { ...tabStyle, background: colors.navy, color: colors.white, borderColor: colors.navy };
const panelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "26px", boxShadow: shadow.soft };
const panelHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", marginBottom: "18px", flexWrap: "wrap" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const hintStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.65 };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(260px, 2fr) repeat(3, minmax(150px, 1fr))", gap: "12px", alignItems: "end", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", marginBottom: "14px" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "7px" };
const labelStyle: CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 850 };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "10px 12px", fontWeight: 700, minHeight: "42px", width: "100%" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: "80px", resize: "vertical", gridColumn: "1 / -1", lineHeight: 1.5 };
const switchStyle: CSSProperties = { minHeight: "42px", display: "flex", alignItems: "center", gap: "9px", color: colors.text, fontWeight: 850 };
const buttonRowStyle: CSSProperties = { display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap" };
const primaryButtonStyle: CSSProperties = { border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, padding: "11px 15px", minHeight: "42px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "9px 12px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const dangerButtonStyle: CSSProperties = { ...secondaryButtonStyle, color: colors.danger, background: "#fff5f5" };
const tableShellStyle: CSSProperties = { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", padding: "13px 14px", color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "14px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle" };
const rowStyle: CSSProperties = { background: colors.white };
const badgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: radius.badge, padding: "6px 10px", background: "rgba(23, 59, 115, 0.10)", color: colors.navy, fontSize: "12px", fontWeight: 850, whiteSpace: "nowrap" };
const activeBadgeStyle: CSSProperties = { ...badgeStyle, background: "#dcfce7", color: colors.success };
const inactiveBadgeStyle: CSSProperties = { ...badgeStyle, background: "#f1f5f9", color: colors.muted };
const smallTextStyle: CSSProperties = { display: "block", marginTop: "5px", color: colors.muted, fontSize: "12px", fontWeight: 650, lineHeight: 1.35 };
const actionsStyle: CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap" };
const roleSelectStyle: CSSProperties = { ...inputStyle, maxWidth: "210px" };
