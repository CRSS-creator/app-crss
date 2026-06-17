"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients } from "@/lib/clientService";
import { fetchCrmContracts, type CrmContract } from "@/lib/crmContractService";
import {
  createRodoProcessingContract,
  fetchRodoProcessingContracts,
  updateRodoProcessingContract,
  type RodoProcessingContract,
  type RodoProcessingContractStatus,
} from "@/lib/rodoProcessingContractService";
import { X } from "lucide-react";

type Client = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
};

type RodoDraft = {
  klient_id: string;
  umowa_ksiegowa_id: string;
  status: RodoProcessingContractStatus;
  numer_umowy: string;
  nazwa_klienta: string;
  siedziba: string;
  nip: string;
  reprezentant: string;
  email_klienta: string;
  zakres_powierzenia: string;
  uwagi: string;
};

const STATUS_OPTIONS: { value: RodoProcessingContractStatus; label: string }[] = [
  { value: "szkic", label: "Szkic" },
  { value: "wygenerowana", label: "Wygenerowana" },
  { value: "wyslana_do_podpisu", label: "Wysłana do podpisu" },
  { value: "podpisana", label: "Podpisana" },
  { value: "anulowana", label: "Anulowana" },
];

export default function RodoPage() {
  return (
    <AppLayout activePage="rodo">
      <AccessGuard moduleName="rodo">
        <RodoContent />
      </AccessGuard>
    </AppLayout>
  );
}

function RodoContent() {
  const [contracts, setContracts] = useState<RodoProcessingContract[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [accountingContracts, setAccountingContracts] = useState<CrmContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("Wszystkie");
  const [selectedContract, setSelectedContract] = useState<RodoProcessingContract | null>(null);
  const [creatingContract, setCreatingContract] = useState(false);

  useEffect(() => {
    void loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    const [contractsResult, clientsResult, accountingContractsResult] = await Promise.all([
      fetchRodoProcessingContracts(),
      fetchClients(),
      fetchCrmContracts(),
    ]);

    if (contractsResult.error) console.error("Błąd pobierania umów RODO:", contractsResult.error);
    else setContracts((contractsResult.data || []) as RodoProcessingContract[]);

    if (clientsResult.error) console.error("Błąd pobierania klientów:", clientsResult.error);
    else setClients((clientsResult.data || []) as Client[]);

    if (accountingContractsResult.error) console.error("Błąd pobierania umów księgowych:", accountingContractsResult.error);
    else setAccountingContracts((accountingContractsResult.data || []) as CrmContract[]);

    setLoading(false);
  }

  const filteredContracts = contracts.filter((contract) => statusFilter === "Wszystkie" || contract.status === statusFilter);
  const signedCount = contracts.filter((contract) => contract.status === "podpisana").length;
  const pendingCount = contracts.filter((contract) => contract.status === "wygenerowana" || contract.status === "wyslana_do_podpisu").length;

  function handleSaved(contract: RodoProcessingContract) {
    setContracts((current) => {
      const exists = current.some((item) => item.id === contract.id);
      return exists ? current.map((item) => item.id === contract.id ? contract : item) : [contract, ...current];
    });
    setCreatingContract(false);
    setSelectedContract(contract);
    void loadInitialData();
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>RODO</p>
          <h1 style={titleStyle}>Umowy powierzenia</h1>
          <p style={subtitleStyle}>Rejestr umów powierzenia przetwarzania danych osobowych, powiązany z klientami i umowami księgowymi.</p>
        </div>
        <button style={primaryButtonStyle} onClick={() => setCreatingContract(true)}>Dodaj umowę</button>
      </section>

      <section style={summaryGridStyle}>
        <SummaryCard label="Wszystkie umowy" value={contracts.length} />
        <SummaryCard label="Podpisane" value={signedCount} />
        <SummaryCard label="Do podpisu" value={pendingCount} />
      </section>

      <section style={cardStyle}>
        <div style={tableHeaderStyle}>
          <h2 style={sectionTitleStyle}>Rejestr RODO</h2>
          <select style={filterStyle} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="Wszystkie">Wszystkie statusy</option>
            {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </div>

        {loading ? <div style={emptyStyle}>Ładowanie umów...</div> : filteredContracts.length === 0 ? <div style={emptyStyle}>Brak umów powierzenia do wyświetlenia.</div> : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Numer</Th>
                  <Th>Klient</Th>
                  <Th>Umowa księgowa</Th>
                  <Th>Status</Th>
                  <Th>NIP</Th>
                  <Th>Akcje</Th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((contract) => (
                  <tr key={contract.id} style={rowStyle}>
                    <Td strong>{contract.numer_umowy || "Bez numeru"}</Td>
                    <Td>{contract.nazwa_klienta}</Td>
                    <Td>{contract.crm_umowy?.numer_umowy || "Brak powiązania"}</Td>
                    <Td><StatusBadge status={contract.status} /></Td>
                    <Td>{contract.nip || "—"}</Td>
                    <Td><button style={secondaryButtonStyle} onClick={() => setSelectedContract(contract)}>Szczegóły</button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(creatingContract || selectedContract) && (
        <RodoDrawer
          contract={selectedContract}
          clients={clients}
          accountingContracts={accountingContracts}
          onClose={() => {
            setCreatingContract(false);
            setSelectedContract(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

function RodoDrawer({ contract, clients, accountingContracts, onClose, onSaved }: { contract: RodoProcessingContract | null; clients: Client[]; accountingContracts: CrmContract[]; onClose: () => void; onSaved: (contract: RodoProcessingContract) => void }) {
  const [draft, setDraft] = useState<RodoDraft>(() => contract ? createDraft(contract) : createEmptyDraft());
  const [saving, setSaving] = useState(false);

  const signedAccountingContracts = useMemo(() => {
    return accountingContracts.filter((item) => item.status === "podpisana" || item.podpisany_pdf_path);
  }, [accountingContracts]);

  function updateDraft<K extends keyof RodoDraft>(key: K, value: RodoDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function fillFromAccountingContract(contractId: string) {
    const accountingContract = accountingContracts.find((item) => item.id === contractId);
    if (!accountingContract) {
      updateDraft("umowa_ksiegowa_id", "");
      return;
    }

    setDraft((current) => ({
      ...current,
      umowa_ksiegowa_id: contractId,
      klient_id: accountingContract.klient_id || current.klient_id,
      nazwa_klienta: accountingContract.nazwa_klienta || current.nazwa_klienta,
      siedziba: accountingContract.siedziba || current.siedziba,
      nip: accountingContract.nip || current.nip,
      reprezentant: accountingContract.reprezentant || current.reprezentant,
      email_klienta: accountingContract.email_klienta || current.email_klienta,
      numer_umowy: current.numer_umowy || buildDefaultRodoNumber(accountingContract.numer_umowy),
    }));
  }

  function fillFromClient(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    if (!client) {
      updateDraft("klient_id", "");
      return;
    }

    setDraft((current) => ({
      ...current,
      klient_id: clientId,
      nazwa_klienta: client.nazwa || current.nazwa_klienta,
      nip: client.nip || current.nip,
      email_klienta: client.email || current.email_klienta,
    }));
  }

  async function saveContract() {
    if (!draft.nazwa_klienta.trim()) {
      alert("Uzupełnij nazwę klienta.");
      return;
    }

    setSaving(true);

    const payload = {
      klient_id: draft.klient_id || null,
      umowa_ksiegowa_id: draft.umowa_ksiegowa_id || null,
      status: draft.status,
      numer_umowy: emptyToNull(draft.numer_umowy),
      nazwa_klienta: draft.nazwa_klienta.trim(),
      siedziba: emptyToNull(draft.siedziba),
      nip: emptyToNull(draft.nip),
      reprezentant: emptyToNull(draft.reprezentant),
      email_klienta: emptyToNull(draft.email_klienta),
      zakres_powierzenia: emptyToNull(draft.zakres_powierzenia),
      uwagi: emptyToNull(draft.uwagi),
      podpisana_at: draft.status === "podpisana" ? new Date().toISOString() : null,
    };

    const result = contract ? await updateRodoProcessingContract(contract.id, payload) : await createRodoProcessingContract(payload);
    setSaving(false);

    if (result.error || !result.data) {
      console.error("Błąd zapisu umowy RODO:", result.error);
      alert("Nie udało się zapisać umowy powierzenia.");
      return;
    }

    onSaved(result.data as RodoProcessingContract);
  }

  return (
    <div style={drawerOverlayStyle} onClick={onClose}>
      <aside style={drawerStyle} onClick={(event) => event.stopPropagation()}>
        <div style={drawerHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>{contract ? "Szczegóły umowy" : "Nowa umowa"}</p>
            <h2 style={drawerTitleStyle}>{draft.numer_umowy || draft.nazwa_klienta || "Umowa powierzenia"}</h2>
          </div>
          <button style={closeButtonStyle} onClick={onClose}><X size={20} /></button>
        </div>

        <div style={drawerActionsStyle}>
          <button style={primarySmallButtonStyle} onClick={saveContract} disabled={saving}>{saving ? "Zapisywanie..." : "Zapisz"}</button>
        </div>

        <div style={drawerContentStyle}>
          <FormSection title="Powiązania">
            <EditableSelect label="Umowa księgowa" value={draft.umowa_ksiegowa_id} onChange={fillFromAccountingContract} options={[{ value: "", label: "Bez powiązania" }, ...signedAccountingContracts.map((item) => ({ value: item.id, label: `${item.numer_umowy || "Bez numeru"} · ${item.nazwa_klienta}` }))]} />
            <EditableSelect label="Klient" value={draft.klient_id} onChange={fillFromClient} options={[{ value: "", label: "Bez klienta" }, ...clients.map((client) => ({ value: client.id, label: client.nazwa || "Bez nazwy" }))]} />
            <EditableSelect label="Status" value={draft.status} onChange={(value) => updateDraft("status", value as RodoProcessingContractStatus)} options={STATUS_OPTIONS} />
          </FormSection>

          <FormSection title="Dane umowy">
            <EditableInput label="Numer umowy" value={draft.numer_umowy} onChange={(value) => updateDraft("numer_umowy", value)} />
            <EditableInput label="Nazwa klienta" value={draft.nazwa_klienta} onChange={(value) => updateDraft("nazwa_klienta", value)} />
            <EditableInput label="Siedziba" value={draft.siedziba} onChange={(value) => updateDraft("siedziba", value)} />
            <EditableInput label="NIP" value={draft.nip} onChange={(value) => updateDraft("nip", value)} />
            <EditableInput label="Reprezentant" value={draft.reprezentant} onChange={(value) => updateDraft("reprezentant", value)} />
            <EditableInput label="Email klienta" type="email" value={draft.email_klienta} onChange={(value) => updateDraft("email_klienta", value)} />
          </FormSection>

          <FormSection title="Zakres powierzenia">
            <EditableTextarea label="Zakres" value={draft.zakres_powierzenia} onChange={(value) => updateDraft("zakres_powierzenia", value)} />
            <EditableTextarea label="Uwagi" value={draft.uwagi} onChange={(value) => updateDraft("uwagi", value)} />
          </FormSection>
        </div>
      </aside>
    </div>
  );
}

function createEmptyDraft(): RodoDraft {
  return {
    klient_id: "",
    umowa_ksiegowa_id: "",
    status: "szkic",
    numer_umowy: `...../RODO/...../${new Date().getFullYear()}`,
    nazwa_klienta: "",
    siedziba: "",
    nip: "",
    reprezentant: "",
    email_klienta: "",
    zakres_powierzenia: "Przetwarzanie danych osobowych w zakresie niezbędnym do świadczenia usług księgowych, podatkowych oraz kadrowo-płacowych.",
    uwagi: "",
  };
}

function createDraft(contract: RodoProcessingContract): RodoDraft {
  return {
    klient_id: contract.klient_id || "",
    umowa_ksiegowa_id: contract.umowa_ksiegowa_id || "",
    status: contract.status,
    numer_umowy: contract.numer_umowy || "",
    nazwa_klienta: contract.nazwa_klienta || "",
    siedziba: contract.siedziba || "",
    nip: contract.nip || "",
    reprezentant: contract.reprezentant || "",
    email_klienta: contract.email_klienta || "",
    zakres_powierzenia: contract.zakres_powierzenia || "",
    uwagi: contract.uwagi || "",
  };
}

function buildDefaultRodoNumber(accountingNumber: string | null) {
  if (!accountingNumber) return `...../RODO/...../${new Date().getFullYear()}`;
  return accountingNumber.replace("/KH/", "/RODO/").replace("/KU/", "/RODO/");
}

function emptyToNull(value: string) {
  return value.trim() ? value.trim() : null;
}

function statusLabel(status: RodoProcessingContractStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function StatusBadge({ status }: { status: RodoProcessingContractStatus }) {
  const palette: Record<RodoProcessingContractStatus, CSSProperties> = {
    szkic: { background: "#eef2f7", color: colors.navy },
    wygenerowana: { background: "#dbeafe", color: "#1d4ed8" },
    wyslana_do_podpisu: { background: "#fef3c7", color: "#92400e" },
    podpisana: { background: "#dcfce7", color: "#15803d" },
    anulowana: { background: "#fee2e2", color: "#b91c1c" },
  };
  return <span style={{ ...badgeStyle, ...palette[status] }}>{statusLabel(status)}</span>;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return <div style={summaryCardStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={drawerSectionStyle}><h3 style={formSectionTitleStyle}>{title}</h3>{children}</section>;
}

function EditableInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "email" }) {
  return <label style={editableRowStyle}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} /></label>;
}

function EditableSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label style={editableRowStyle}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>{options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}</select></label>;
}

function EditableTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label style={textareaRowStyle}><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} style={textareaStyle} rows={4} /></label>;
}

function Th({ children }: { children: React.ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>; }

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "28px" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 800, margin: "0 0 8px" };
const titleStyle: CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const subtitleStyle: CSSProperties = { maxWidth: "780px", fontSize: "17px", lineHeight: 1.7, color: colors.muted, marginTop: "14px" };
const primaryButtonStyle: CSSProperties = { border: "none", borderRadius: radius.button, padding: "14px 18px", minHeight: "46px", background: colors.red, color: colors.white, fontWeight: 800, cursor: "pointer", textAlign: "center" };
const primarySmallButtonStyle: CSSProperties = { ...primaryButtonStyle, padding: "11px 15px", minHeight: "42px" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", textAlign: "center" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" };
const summaryCardStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px", color: colors.muted, fontWeight: 800 };
const cardStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "28px", boxShadow: shadow.soft, marginBottom: "24px" };
const tableHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "18px" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const filterStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", background: colors.card, color: colors.text, minWidth: "190px", fontWeight: 700 };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", padding: "14px 16px", color: colors.muted, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}` };
const rowStyle: CSSProperties = { borderBottom: `1px solid ${colors.border}` };
const tdStyle: CSSProperties = { padding: "16px", color: colors.text, verticalAlign: "middle" };
const badgeStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, padding: "7px 12px", fontWeight: 850, fontSize: "13px" };
const emptyStyle: CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "18px", color: colors.muted, fontWeight: 700, textAlign: "center" };
const drawerOverlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 50, background: "rgba(15, 23, 42, 0.32)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "flex-end" };
const drawerStyle: CSSProperties = { width: "680px", maxWidth: "100%", height: "100vh", background: colors.card, borderLeft: `1px solid ${colors.border}`, boxShadow: "-12px 0 30px rgba(15, 23, 42, 0.12)", padding: "28px", overflowY: "auto" };
const drawerHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", marginBottom: "16px" };
const drawerActionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: "10px", marginBottom: "24px", flexWrap: "wrap" };
const drawerTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "28px", lineHeight: 1.15 };
const closeButtonStyle: CSSProperties = { width: "40px", height: "40px", borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const drawerContentStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "18px" };
const drawerSectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "20px", background: colors.white };
const formSectionTitleStyle: CSSProperties = { margin: "0 0 12px", color: colors.navy, fontSize: "18px", fontWeight: 500 };
const editableRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "190px 1fr", gap: "14px", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${colors.border}`, color: colors.muted, fontWeight: 700 };
const textareaRowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 700 };
const inputStyle: CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", background: colors.inputBackground, color: colors.text, fontWeight: 650, outline: "none" };
const textareaStyle: CSSProperties = { ...inputStyle, resize: "vertical", minHeight: "96px", lineHeight: 1.6 };
