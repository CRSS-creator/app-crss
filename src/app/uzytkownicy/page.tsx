"use client";

import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
import { fetchClients } from "@/lib/clientService";
import { LEGAL_FORM_OPTIONS, TAXATION_FORM_OPTIONS } from "@/lib/clientDictionaries";
import {
  createRecurringTask,
  createRecurringTasks,
  deleteRecurringTask,
  fetchRecurringTaskTemplates,
  recurringFrequencyLabel,
  recurringTaskMatchesClient,
  recurringScopeLabel,
  updateRecurringTask,
  type RecurringTask,
} from "@/lib/recurringTasksService";
import type { ProfileSummary } from "@/lib/taskService";

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "accountant", label: "Accountant" },
];

const VAT_OPTIONS = [
  { value: "any", label: "Dowolny VAT" },
  { value: "active", label: "Tylko czynny VAT" },
  { value: "inactive", label: "Tylko bez VAT" },
] as const;

const FREQUENCY_OPTIONS = [
  { value: "miesieczne", label: "Miesięczne" },
  { value: "roczne", label: "Roczne" },
] as const;

const MONTH_OPTIONS = [
  { value: 1, label: "Styczeń" },
  { value: 2, label: "Luty" },
  { value: 3, label: "Marzec" },
  { value: 4, label: "Kwiecień" },
  { value: 5, label: "Maj" },
  { value: 6, label: "Czerwiec" },
  { value: 7, label: "Lipiec" },
  { value: 8, label: "Sierpień" },
  { value: 9, label: "Wrzesień" },
  { value: 10, label: "Październik" },
  { value: 11, label: "Listopad" },
  { value: 12, label: "Grudzień" },
] as const;

type SettingsTab = "templates" | "users";
type VatMode = typeof VAT_OPTIONS[number]["value"];
type FrequencyMode = typeof FREQUENCY_OPTIONS[number]["value"];
type UserProfile = ProfileSummary & { id: string; role: string | null };
type ClientRow = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  forma_prawna: string | null;
  forma_opodatkowania: string | null;
  czynny_vat: boolean | null;
  opiekun_id: string | null;
};

type TemplateDraft = {
  id: string | null;
  tytul: string;
  opis: string;
  klient_ids: string[];
  clientSearch: string;
  formy_prawne: string[];
  formy_opodatkowania: string[];
  vatMode: VatMode;
  czestotliwosc: FrequencyMode;
  miesiac_roczny: string;
  dzien_miesiaca: string;
  aktywne: boolean;
};

const emptyDraft: TemplateDraft = {
  id: null,
  tytul: "",
  opis: "",
  klient_ids: [],
  clientSearch: "",
  formy_prawne: [],
  formy_opodatkowania: [],
  vatMode: "any",
  czestotliwosc: "miesieczne",
  miesiac_roczny: "3",
  dzien_miesiaca: "10",
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
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    const [templatesResult, clientsResult, usersResult] = await Promise.all([
      fetchRecurringTaskTemplates(),
      fetchClients(),
      supabase.from("profiles").select("id, full_name, email, role").order("full_name", { ascending: true }),
    ]);

    if (templatesResult.error) console.error("Błąd pobierania szablonów:", templatesResult.error);
    if (clientsResult.error) console.error("Błąd pobierania klientów:", clientsResult.error);
    if (usersResult.error) console.error("Błąd pobierania użytkowników:", usersResult.error);

    setTemplates((templatesResult.data || []) as RecurringTask[]);
    setClients((clientsResult.data || []) as ClientRow[]);
    setUsers((usersResult.data || []) as UserProfile[]);
    setLoading(false);
  }

  async function saveTemplate() {
    if (!draft.tytul.trim()) return alert("Wpisz nazwę zadania cyklicznego.");

    const day = Math.min(31, Math.max(1, Number(draft.dzien_miesiaca || 10)));
    const annualMonth = draft.czestotliwosc === "roczne" ? Math.min(12, Math.max(1, Number(draft.miesiac_roczny || 1))) : null;
    const hasClientSelection = draft.klient_ids.length > 0;
    const payload = {
      tytul: draft.tytul.trim(),
      opis: draft.opis.trim() || null,
      forma_prawna: !hasClientSelection && draft.formy_prawne.length === 1 ? draft.formy_prawne[0] : null,
      forma_opodatkowania: !hasClientSelection && draft.formy_opodatkowania.length === 1 ? draft.formy_opodatkowania[0] : null,
      formy_prawne: !hasClientSelection && draft.formy_prawne.length ? draft.formy_prawne : null,
      formy_opodatkowania: !hasClientSelection && draft.formy_opodatkowania.length ? draft.formy_opodatkowania : null,
      wymaga_czynnego_vat: hasClientSelection ? null : vatModeToValue(draft.vatMode),
      czestotliwosc: draft.czestotliwosc,
      miesiac_roczny: annualMonth,
      dzien_miesiaca: day,
      priorytet: "normalny" as const,
      osoba_id: null,
      aktywne: draft.aktywne,
    };

    setSaving(true);
    const result = draft.id
      ? await updateRecurringTask(draft.id, { ...payload, klient_id: draft.klient_ids[0] || null })
      : hasClientSelection
        ? await createRecurringTasks(draft.klient_ids.map((clientId) => ({ ...payload, klient_id: clientId })))
        : await createRecurringTask({ ...payload, klient_id: null });
    setSaving(false);

    if (result.error) {
      console.error("Błąd zapisu szablonu:", result.error);
      alert("Nie udało się zapisać szablonu.");
      return;
    }

    const savedRows = Array.isArray(result.data) ? result.data as RecurringTask[] : [result.data as RecurringTask];
    setTemplates((current) => draft.id ? current.map((item) => item.id === savedRows[0].id ? savedRows[0] : item) : [...savedRows, ...current]);
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

  function editTemplate(template: RecurringTask) {
    setDraft({
      id: template.id,
      tytul: template.tytul,
      opis: template.opis || "",
      klient_ids: template.klient_id ? [template.klient_id] : [],
      clientSearch: "",
      formy_prawne: template.formy_prawne?.length ? template.formy_prawne : template.forma_prawna ? [template.forma_prawna] : [],
      formy_opodatkowania: template.formy_opodatkowania?.length ? template.formy_opodatkowania : template.forma_opodatkowania ? [template.forma_opodatkowania] : [],
      vatMode: valueToVatMode(template.wymaga_czynnego_vat),
      czestotliwosc: template.czestotliwosc || "miesieczne",
      miesiac_roczny: String(template.miesiac_roczny || 3),
      dzien_miesiaca: String(template.dzien_miesiaca || 10),
      aktywne: template.aktywne,
    });
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

  const activeTemplates = templates.filter((template) => template.aktywne).length;

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Administracja</p>
          <h1 style={titleStyle}>Ustawienia</h1>
          <p style={subtitleStyle}>Szablony cykliczne i użytkownicy aplikacji.</p>
        </div>
        <div style={summaryGridStyle}>
          <Summary label="Szablony" value={templates.length} />
          <Summary label="Aktywne" value={activeTemplates} />
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

function TemplatesTab({ templates, clients, draft, loading, saving, setDraft, onSave, onEdit, onToggle, onRemove }: {
  templates: RecurringTask[];
  clients: ClientRow[];
  draft: TemplateDraft;
  loading: boolean;
  saving: boolean;
  setDraft: Dispatch<SetStateAction<TemplateDraft>>;
  onSave: () => void;
  onEdit: (template: RecurringTask) => void;
  onToggle: (template: RecurringTask) => void;
  onRemove: (template: RecurringTask) => void;
}) {
  const sortedTemplates = useMemo(() => [...templates].sort((a, b) => Number(b.aktywne) - Number(a.aktywne) || a.dzien_miesiaca - b.dzien_miesiaca), [templates]);
  const selectedClients = clients.filter((client) => draft.klient_ids.includes(client.id));
  const search = draft.clientSearch.trim().toLowerCase();
  const suggestions = search
    ? clients
        .filter((client) => !draft.klient_ids.includes(client.id))
        .filter((client) => [client.nazwa, client.nip].filter(Boolean).join(" ").toLowerCase().includes(search))
        .slice(0, 8)
    : [];

  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Szablony zadań cyklicznych</h2>
          <p style={hintStyle}>Dodawaj szablony tylko tutaj. Możesz przypisać je do konkretnych klientów albo zostawić warunki według formy prawnej, opodatkowania i VAT.</p>
        </div>
      </div>

      <div style={formGridStyle}>
        <Field label="Nazwa zadania"><input style={inputStyle} value={draft.tytul} onChange={(event) => setDraft((current) => ({ ...current, tytul: event.target.value }))} placeholder="np. Sprawdzenie kompletu dokumentów" /></Field>
        <Field label="Cykl"><select style={inputStyle} value={draft.czestotliwosc} onChange={(event) => setDraft((current) => ({ ...current, czestotliwosc: event.target.value as FrequencyMode }))}>{FREQUENCY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
        {draft.czestotliwosc === "roczne" && <Field label="Miesiąc"><select style={inputStyle} value={draft.miesiac_roczny} onChange={(event) => setDraft((current) => ({ ...current, miesiac_roczny: event.target.value }))}>{MONTH_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>}
        <Field label="Dzień miesiąca"><input style={inputStyle} type="number" min={1} max={31} value={draft.dzien_miesiaca} onChange={(event) => setDraft((current) => ({ ...current, dzien_miesiaca: event.target.value }))} /></Field>
        <Field label="Osoba odpowiedzialna"><div style={staticValueStyle}>Opiekun klienta</div></Field>

        <ClientPicker
          clients={clients}
          selectedClients={selectedClients}
          suggestions={suggestions}
          search={draft.clientSearch}
          onSearch={(clientSearch) => setDraft((current) => ({ ...current, clientSearch }))}
          onAdd={(clientId) => setDraft((current) => ({ ...current, klient_ids: [...current.klient_ids, clientId], clientSearch: "" }))}
          onRemove={(clientId) => setDraft((current) => ({ ...current, klient_ids: current.klient_ids.filter((id) => id !== clientId) }))}
        />

        <CheckboxGroup label="Forma prawna" disabled={draft.klient_ids.length > 0} options={LEGAL_FORM_OPTIONS} selected={draft.formy_prawne} onChange={(formy_prawne) => setDraft((current) => ({ ...current, formy_prawne }))} />
        <CheckboxGroup label="Forma opodatkowania" disabled={draft.klient_ids.length > 0} options={TAXATION_FORM_OPTIONS} selected={draft.formy_opodatkowania} onChange={(formy_opodatkowania) => setDraft((current) => ({ ...current, formy_opodatkowania }))} />
        <Field label="VAT"><select style={inputStyle} disabled={draft.klient_ids.length > 0} value={draft.vatMode} onChange={(event) => setDraft((current) => ({ ...current, vatMode: event.target.value as VatMode }))}>{VAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
        <label style={switchStyle}><input type="checkbox" checked={draft.aktywne} onChange={(event) => setDraft((current) => ({ ...current, aktywne: event.target.checked }))} /> Aktywny szablon</label>
        <Field label="Opis"><textarea style={textareaStyle} value={draft.opis} onChange={(event) => setDraft((current) => ({ ...current, opis: event.target.value }))} placeholder="Krótki opis czynności dla księgowości" /></Field>
      </div>

      <div style={buttonRowStyle}>
        <button style={primaryButtonStyle} disabled={saving} onClick={onSave}>{draft.id ? "Zapisz zmiany" : "Dodaj szablon"}</button>
        {draft.id && <button style={secondaryButtonStyle} onClick={() => setDraft(emptyDraft)}>Anuluj edycję</button>}
      </div>

      <div style={tableShellStyle}>
        <table style={tableStyle}>
          <thead><tr><Th>Zadanie</Th><Th>Zakres</Th><Th>Cykl</Th><Th>Termin</Th><Th>Obejmuje</Th><Th>Status</Th><Th>Akcje</Th></tr></thead>
          <tbody>
            {loading ? <tr><Td colSpan={7}>Ładowanie ustawień...</Td></tr> : sortedTemplates.length === 0 ? <tr><Td colSpan={7}>Brak szablonów cyklicznych.</Td></tr> : sortedTemplates.map((template) => (
              <tr key={template.id} style={rowStyle}>
                <Td strong>{template.tytul}<Small>{template.opis || "Brak opisu"}</Small></Td>
                <Td>{scopeLabel(template, clients)}</Td>
                <Td><Badge>{recurringFrequencyLabel(template)}</Badge></Td>
                <Td>{template.czestotliwosc === "roczne" ? `${monthLabel(template.miesiac_roczny)} · ${template.dzien_miesiaca}` : `Dzień ${template.dzien_miesiaca}`}</Td>
                <Td>{matchingClientsCount(template, clients)} klientów</Td>
                <Td><span style={template.aktywne ? activeBadgeStyle : inactiveBadgeStyle}>{template.aktywne ? "Aktywny" : "Wyłączony"}</span></Td>
                <Td><div style={actionsStyle}><button style={secondaryButtonStyle} onClick={() => onEdit(template)}>Edytuj</button><button style={secondaryButtonStyle} onClick={() => onToggle(template)}>{template.aktywne ? "Wyłącz" : "Włącz"}</button><button style={dangerButtonStyle} onClick={() => onRemove(template)}>Usuń</button></div></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClientPicker({ clients, selectedClients, suggestions, search, onSearch, onAdd, onRemove }: {
  clients: ClientRow[];
  selectedClients: ClientRow[];
  suggestions: ClientRow[];
  search: string;
  onSearch: (value: string) => void;
  onAdd: (clientId: string) => void;
  onRemove: (clientId: string) => void;
}) {
  return (
    <div style={clientPickerStyle}>
      <span style={labelStyle}>Klienci</span>
      <input style={inputStyle} value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Wyszukaj klienta po nazwie albo NIP" />
      {suggestions.length > 0 && <div style={suggestionsStyle}>{suggestions.map((client) => <button key={client.id} type="button" style={suggestionButtonStyle} onClick={() => onAdd(client.id)}><span>{client.nazwa || "Klient"}</span><small>{client.nip || "Brak NIP"}</small></button>)}</div>}
      {selectedClients.length > 0 ? <div style={selectedClientsStyle}>{selectedClients.map((client) => <span key={client.id} style={clientPillStyle}>{client.nazwa || "Klient"}<button type="button" onClick={() => onRemove(client.id)} style={pillRemoveStyle}>×</button></span>)}</div> : <small style={smallTextStyle}>Brak wyboru oznacza szablon według warunków poniżej.</small>}
      <small style={smallTextStyle}>{clients.length} klientów w bazie.</small>
    </div>
  );
}

function UsersTab({ users, loading, onRoleChange }: { users: UserProfile[]; loading: boolean; onRoleChange: (user: UserProfile, role: string) => void }) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}><div><h2 style={sectionTitleStyle}>Użytkownicy</h2><p style={hintStyle}>Lista osób z dostępem do aplikacji oraz ich role.</p></div></div>
      <div style={tableShellStyle}>
        <table style={tableStyle}>
          <thead><tr><Th>Użytkownik</Th><Th>Email</Th><Th>Rola</Th></tr></thead>
          <tbody>
            {loading ? <tr><Td colSpan={3}>Ładowanie użytkowników...</Td></tr> : users.map((user) => <tr key={user.id} style={rowStyle}><Td strong>{profileName(user)}</Td><Td>{user.email || "Brak emaila"}</Td><Td><select style={roleSelectStyle} value={user.role || "accountant"} onChange={(event) => onRoleChange(user, event.target.value)}>{ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></Td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CheckboxGroup({ label, options, selected, disabled, onChange }: { label: string; options: readonly { value: string; label: string }[]; selected: string[]; disabled?: boolean; onChange: (value: string[]) => void }) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }
  return <div style={checkboxGroupStyle}><span style={labelStyle}>{label}</span><div style={checkboxGridStyle}>{options.map((option) => <label key={option.value} style={checkboxOptionStyle}><input type="checkbox" disabled={disabled} checked={selected.includes(option.value)} onChange={() => toggle(option.value)} /><span>{option.label}</span></label>)}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={fieldStyle}><span style={labelStyle}>{label}</span>{children}</label>; }
function Summary({ label, value }: { label: string; value: string | number }) { return <div style={summaryStyle}><span>{label}</span><strong>{value}</strong></div>; }
function Th({ children }: { children: ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong, colSpan }: { children: ReactNode; strong?: boolean; colSpan?: number }) { return <td colSpan={colSpan} style={{ ...tdStyle, fontWeight: strong ? 800 : 600 }}>{children}</td>; }
function Badge({ children }: { children: ReactNode }) { return <span style={badgeStyle}>{children}</span>; }
function Small({ children }: { children: ReactNode }) { return <small style={smallTextStyle}>{children}</small>; }

function profileName(user: UserProfile | ProfileSummary) { return user.full_name || user.email || "Użytkownik"; }
function monthLabel(month: number | null | undefined) { return MONTH_OPTIONS.find((item) => item.value === month)?.label || "Rok"; }
function vatModeToValue(mode: VatMode) { return mode === "active" ? true : mode === "inactive" ? false : null; }
function valueToVatMode(value: boolean | null | undefined): VatMode { return value === true ? "active" : value === false ? "inactive" : "any"; }
function matchingClientsCount(template: RecurringTask, clients: ClientRow[]) { return clients.filter((client) => recurringTaskMatchesClient(template, client)).length; }
function scopeLabel(template: RecurringTask, clients: ClientRow[]) { return template.klient_id ? clients.find((client) => client.id === template.klient_id)?.nazwa || "Wybrany klient" : recurringScopeLabel(template); }

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
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(260px, 2fr) repeat(3, minmax(150px, 1fr))", gap: "12px", alignItems: "start", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", marginBottom: "14px" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "7px" };
const labelStyle: CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 850 };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "10px 12px", fontWeight: 700, minHeight: "42px", width: "100%" };
const staticValueStyle: CSSProperties = { ...inputStyle, display: "flex", alignItems: "center", color: colors.navy };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: "80px", resize: "vertical", gridColumn: "1 / -1", lineHeight: 1.5 };
const checkboxGroupStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "12px", gridColumn: "span 2" };
const checkboxGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" };
const checkboxOptionStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "8px", color: colors.text, fontWeight: 750, fontSize: "13px" };
const clientPickerStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "12px", gridColumn: "span 2" };
const suggestionsStyle: CSSProperties = { display: "grid", gap: "6px", maxHeight: "190px", overflowY: "auto" };
const suggestionButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "9px 10px", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: "10px", fontWeight: 800 };
const selectedClientsStyle: CSSProperties = { display: "flex", gap: "7px", flexWrap: "wrap" };
const clientPillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "7px", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 9px", fontWeight: 850, fontSize: "12px" };
const pillRemoveStyle: CSSProperties = { border: "none", background: "transparent", color: colors.navy, cursor: "pointer", fontWeight: 900, fontSize: "15px", lineHeight: 1 };
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
