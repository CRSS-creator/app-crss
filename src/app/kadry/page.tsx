"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients, updateClient } from "@/lib/clientService";

type PayrollTab = "kadry" | "a1" | "zus_przedsiebiorcy";

type PayrollTabDefinition = {
  value: PayrollTab;
  label: string;
};

type PayrollClient = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  telefon: string | null;
  obsluga_kadrowa: boolean | null;
  kadry_umowy_o_prace: boolean | null;
  kadry_umowy_cywilnoprawne: boolean | null;
  kadry_studenci: boolean | null;
  opiekun_id: string | null;
  profiles?: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

const PAYROLL_TABS: PayrollTabDefinition[] = [
  { value: "kadry", label: "Kadry" },
  { value: "a1", label: "A1" },
  { value: "zus_przedsiebiorcy", label: "ZUS Przedsiębiorcy" },
];

export default function PayrollPage() {
  return (
    <AppLayout activePage="kadry">
      <AccessGuard moduleName="kadry">
        <PayrollContent />
      </AccessGuard>
    </AppLayout>
  );
}

function PayrollContent() {
  const [activeTab, setActiveTab] = useState<PayrollTab>("kadry");
  const [clients, setClients] = useState<PayrollClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<PayrollClient | null>(null);

  useEffect(() => {
    async function loadClients() {
      setLoading(true);
      const result = await fetchClients();
      if (result.error) {
        console.error("Błąd pobierania klientów kadrowych:", result.error);
        setClients([]);
      } else {
        setClients((result.data || []) as unknown as PayrollClient[]);
      }
      setLoading(false);
    }

    void loadClients();
  }, []);

  const payrollClients = useMemo(
    () => clients.filter((client) => client.obsluga_kadrowa),
    [clients]
  );
  const filteredClients = useMemo(
    () => filterClients(payrollClients, searchTerm),
    [payrollClients, searchTerm]
  );
  const tab = PAYROLL_TABS.find((item) => item.value === activeTab) || PAYROLL_TABS[0];

  function handleSaved(client: PayrollClient) {
    setClients((current) => current.map((item) => (item.id === client.id ? { ...item, ...client } : item)));
    setSelectedClient((current) => current && current.id === client.id ? { ...current, ...client } : current);
  }

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Kadry i ZUS</p>
          <h1 style={titleStyle}>Kadry i ZUS</h1>
        </div>
      </header>

      <nav style={tabsStyle} aria-label="Kadry i ZUS">
        {PAYROLL_TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setActiveTab(item.value)}
            style={activeTab === item.value ? activeTabStyle : tabStyle}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>{tab.label}</h2>
            <p style={sectionHintStyle}>{tabHint(activeTab)}</p>
          </div>
          {activeTab === "kadry" && (
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Szukaj klienta, NIP, opiekuna"
              style={searchInputStyle}
            />
          )}
        </div>

        {activeTab === "kadry" ? (
          <PayrollClientsTable clients={filteredClients} loading={loading} onDetails={setSelectedClient} />
        ) : (
          <div style={emptyStateStyle}>
            <strong>{tab.label}</strong>
            <span>Widok gotowy do uzupełnienia.</span>
          </div>
        )}
      </section>

      {selectedClient && (
        <PayrollDetailsDrawer
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function PayrollClientsTable({
  clients,
  loading,
  onDetails,
}: {
  clients: PayrollClient[];
  loading: boolean;
  onDetails: (client: PayrollClient) => void;
}) {
  if (loading) return <p style={emptyStyle}>Ładowanie klientów kadrowych...</p>;
  if (clients.length === 0) return <p style={emptyStyle}>Brak klientów z zaznaczoną obsługą kadrową.</p>;

  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Klient</Th>
            <Th>Opiekun</Th>
            <Th>Umowy o pracę</Th>
            <Th>Umowy cywilnoprawne</Th>
            <Th>Studenci</Th>
            <Th>Szczegóły</Th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id}>
              <Td>
                <strong style={clientNameStyle}>{client.nazwa || "Klient bez nazwy"}</strong>
                <span style={clientMetaStyle}>{client.nip || "Brak NIP"}</span>
              </Td>
              <Td>{caregiverLabel(client)}</Td>
              <Td><YesNoBadge value={client.kadry_umowy_o_prace} /></Td>
              <Td><YesNoBadge value={client.kadry_umowy_cywilnoprawne} /></Td>
              <Td><YesNoBadge value={client.kadry_studenci} /></Td>
              <Td>
                <button type="button" style={detailsButtonStyle} onClick={() => onDetails(client)}>
                  Szczegóły
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayrollDetailsDrawer({
  client,
  onClose,
  onSaved,
}: {
  client: PayrollClient;
  onClose: () => void;
  onSaved: (client: PayrollClient) => void;
}) {
  const [draft, setDraft] = useState({
    kadry_umowy_o_prace: Boolean(client.kadry_umowy_o_prace),
    kadry_umowy_cywilnoprawne: Boolean(client.kadry_umowy_cywilnoprawne),
    kadry_studenci: Boolean(client.kadry_studenci),
  });
  const [saving, setSaving] = useState(false);

  async function saveDetails() {
    setSaving(true);
    const result = await updateClient(client.id, draft);
    if (result.error) {
      console.error("Błąd zapisu szczegółów kadrowych:", result.error);
      alert("Nie udało się zapisać szczegółów kadrowych.");
      setSaving(false);
      return;
    }

    onSaved({ ...client, ...draft });
    setSaving(false);
    onClose();
  }

  return (
    <div style={drawerOverlayStyle} onClick={onClose}>
      <aside style={drawerStyle} onClick={(event) => event.stopPropagation()}>
        <div style={drawerHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Szczegóły kadrowe</p>
            <h2 style={drawerTitleStyle}>{client.nazwa || "Klient bez nazwy"}</h2>
            <p style={drawerSubtitleStyle}>NIP: {client.nip || "Brak"}</p>
          </div>
          <button type="button" style={iconButtonStyle} onClick={onClose} aria-label="Zamknij">
            <X size={20} />
          </button>
        </div>

        <div style={drawerContentStyle}>
          <section style={detailsSectionStyle}>
            <h3 style={detailsSectionTitleStyle}>Kadry</h3>
            <EditableCheckbox
              label="Umowy o pracę"
              checked={draft.kadry_umowy_o_prace}
              onChange={(value) => setDraft((current) => ({ ...current, kadry_umowy_o_prace: value }))}
            />
            <EditableCheckbox
              label="Umowy cywilnoprawne"
              checked={draft.kadry_umowy_cywilnoprawne}
              onChange={(value) => setDraft((current) => ({ ...current, kadry_umowy_cywilnoprawne: value }))}
            />
            <EditableCheckbox
              label="Studenci"
              checked={draft.kadry_studenci}
              onChange={(value) => setDraft((current) => ({ ...current, kadry_studenci: value }))}
            />
          </section>
        </div>

        <div style={drawerActionsStyle}>
          <button type="button" style={secondaryButtonStyle} onClick={onClose}>Anuluj</button>
          <button type="button" style={primaryButtonStyle} onClick={saveDetails} disabled={saving}>
            {saving ? "Zapisywanie..." : "Zapisz"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function EditableCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label style={checkboxRowStyle}>
      <span>{label}</span>
      <span style={checkboxControlStyle}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          style={checkboxInputStyle}
        />
        {checked ? "Tak" : "Nie"}
      </span>
    </label>
  );
}

function YesNoBadge({ value }: { value: boolean | null }) {
  const active = Boolean(value);
  return <span style={active ? yesBadgeStyle : noBadgeStyle}>{active ? "tak" : "nie"}</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={tdStyle}>{children}</td>;
}

function filterClients(clients: PayrollClient[], searchTerm: string) {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) return clients;

  return clients.filter((client) => [
    client.nazwa,
    client.nip,
    client.email,
    caregiverLabel(client),
  ].some((value) => String(value || "").toLowerCase().includes(normalized)));
}

function caregiverLabel(client: PayrollClient) {
  const profile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  return profile?.full_name || profile?.email || "Brak opiekuna";
}

function tabHint(tab: PayrollTab) {
  if (tab === "kadry") return "Klienci z zaznaczoną obsługą kadrową.";
  if (tab === "a1") return "Obsługa zaświadczeń A1.";
  return "ZUS przedsiębiorcy i powiązane terminy.";
}

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "22px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start" };
const eyebrowStyle: CSSProperties = { margin: "0 0 8px", fontSize: "13px", fontWeight: 850, letterSpacing: "0.08em", color: colors.red, textTransform: "uppercase" };
const titleStyle: CSSProperties = { margin: 0, fontSize: "34px", lineHeight: 1.15, color: colors.navy };
const tabsStyle: CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap" };
const tabStyle: CSSProperties = { minHeight: "42px", padding: "0 18px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.card, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const activeTabStyle: CSSProperties = { ...tabStyle, background: colors.navy, color: colors.white, borderColor: colors.navy };
const cardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, boxShadow: shadow.card, overflow: "hidden" };
const sectionHeaderStyle: CSSProperties = { padding: "22px 24px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: "22px", color: colors.navy };
const sectionHintStyle: CSSProperties = { margin: "6px 0 0", color: colors.muted, fontSize: "14px" };
const searchInputStyle: CSSProperties = { width: "min(360px, 100%)", minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.text, padding: "0 14px", fontSize: "14px", fontWeight: 750, outline: "none" };
const emptyStateStyle: CSSProperties = { minHeight: "220px", padding: "28px 24px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "8px", color: colors.muted, fontWeight: 750, textAlign: "center" };
const emptyStyle: CSSProperties = { margin: 0, padding: "28px 24px", color: colors.muted, fontWeight: 750 };
const tableWrapStyle: CSSProperties = { width: "100%", overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", minWidth: "980px", borderCollapse: "collapse" };
const thStyle: CSSProperties = { padding: "14px 18px", textAlign: "left", fontSize: "12px", color: colors.text, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "16px 18px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle", fontSize: "14px" };
const clientNameStyle: CSSProperties = { display: "block", color: colors.navy, fontSize: "15px", lineHeight: 1.35 };
const clientMetaStyle: CSSProperties = { display: "block", marginTop: "4px", color: colors.muted, fontSize: "12px", fontWeight: 750 };
const yesBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "28px", minWidth: "48px", padding: "4px 10px", borderRadius: radius.badge, background: "rgba(22, 163, 74, 0.12)", color: colors.success, fontSize: "12px", fontWeight: 900, textTransform: "uppercase" };
const noBadgeStyle: CSSProperties = { ...yesBadgeStyle, background: "rgba(239, 68, 68, 0.12)", color: colors.red };
const detailsButtonStyle: CSSProperties = { minHeight: "38px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const drawerOverlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: "rgba(15, 23, 42, 0.35)", display: "flex", justifyContent: "flex-end" };
const drawerStyle: CSSProperties = { width: "min(520px, 100vw)", height: "100%", background: colors.white, borderLeft: `1px solid ${colors.border}`, boxShadow: "-22px 0 70px rgba(15, 23, 42, 0.22)", display: "flex", flexDirection: "column" };
const drawerHeaderStyle: CSSProperties = { padding: "24px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const drawerTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px", lineHeight: 1.2 };
const drawerSubtitleStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, fontSize: "13px", fontWeight: 750 };
const iconButtonStyle: CSSProperties = { width: "42px", height: "42px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const drawerContentStyle: CSSProperties = { flex: 1, overflowY: "auto", padding: "22px 24px" };
const detailsSectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, overflow: "hidden" };
const detailsSectionTitleStyle: CSSProperties = { margin: 0, padding: "16px 18px", borderBottom: `1px solid ${colors.border}`, color: colors.navy, fontSize: "18px" };
const checkboxRowStyle: CSSProperties = { minHeight: "58px", padding: "0 18px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "center", color: colors.text, fontWeight: 850 };
const checkboxControlStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "8px", color: colors.navy, fontWeight: 850 };
const checkboxInputStyle: CSSProperties = { width: "16px", height: "16px", accentColor: colors.navy };
const drawerActionsStyle: CSSProperties = { padding: "16px 24px", borderTop: `1px solid ${colors.border}`, display: "flex", justifyContent: "flex-end", gap: "10px" };
const primaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 16px", border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, fontWeight: 850, cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
