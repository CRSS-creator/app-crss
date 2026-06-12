"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { fetchCrmLeads } from "@/lib/crmService";
import { fetchClients } from "@/lib/clientService";
import {
  createCrmContract,
  createCrmContractSignedUrl,
  fetchCrmContracts,
  updateCrmContract,
  uploadCrmContractPdf,
  type CrmContract,
  type CrmContractStatus,
  type CrmContractType,
} from "@/lib/crmContractService";
import { X } from "lucide-react";

type Lead = {
  id: string;
  nazwa: string | null;
  osoba_kontaktowa: string | null;
  email: string | null;
  nip: string | null;
  forma_prawna: string | null;
  status: string | null;
  szacowany_mrr: number | null;
  liczba_dokumentow: number | null;
  czy_kadry: boolean | null;
};

type Client = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  forma_prawna: string | null;
  forma_opodatkowania: string | null;
  obsluga_kadrowa: boolean | null;
  abonament: number | null;
  limit_dokumentow: number | null;
};

type ContractDraft = {
  crm_id: string;
  klient_id: string;
  typ_umowy: CrmContractType;
  status: CrmContractStatus;
  numer_umowy: string;
  pierwszy_okres: string;
  nazwa_klienta: string;
  siedziba: string;
  nip: string;
  reprezentant: string;
  email_klienta: string;
  abonament_netto: string;
  limit_dokumentow: string;
  obsluga_kadrowa: boolean;
  ustalenia_indywidualne: string;
};

const CONTRACT_TYPES = [
  { value: "KH", label: "Pełna księgowość / KH" },
  { value: "KU", label: "Uproszczona księgowość / KU" },
] as const;

const CONTRACT_STATUSES: { value: CrmContractStatus; label: string }[] = [
  { value: "szkic", label: "Szkic" },
  { value: "wygenerowana", label: "Wygenerowana" },
  { value: "wyslana_do_podpisu", label: "Wysłana do podpisu" },
  { value: "podpisana", label: "Podpisana" },
  { value: "anulowana", label: "Anulowana" },
];

export default function CrmContractsPage() {
  return (
    <AppLayout activePage="umowy">
      <AccessGuard moduleName="umowy">
        <CrmContractsContent />
      </AccessGuard>
    </AppLayout>
  );
}

function CrmContractsContent() {
  const [contracts, setContracts] = useState<CrmContract[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("Wszystkie");
  const [selectedContract, setSelectedContract] = useState<CrmContract | null>(null);
  const [creatingContract, setCreatingContract] = useState(false);

  useEffect(() => {
    void loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    const [contractsResult, leadsResult, clientsResult] = await Promise.all([
      fetchCrmContracts(),
      fetchCrmLeads(),
      fetchClients(),
    ]);

    if (contractsResult.error) console.error("Błąd pobierania umów:", contractsResult.error);
    else setContracts((contractsResult.data || []) as CrmContract[]);

    if (leadsResult.error) console.error("Błąd pobierania szans:", leadsResult.error);
    else setLeads((leadsResult.data || []) as Lead[]);

    if (clientsResult.error) console.error("Błąd pobierania klientów:", clientsResult.error);
    else setClients((clientsResult.data || []) as Client[]);

    setLoading(false);
  }

  const filteredContracts = contracts.filter((contract) => statusFilter === "Wszystkie" || contract.status === statusFilter);
  const signedCount = contracts.filter((contract) => contract.status === "podpisana").length;
  const pendingCount = contracts.filter((contract) => contract.status === "wygenerowana" || contract.status === "wyslana_do_podpisu").length;

  function handleSaved(contract: CrmContract) {
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
          <p style={eyebrowStyle}>CRM</p>
          <h1 style={titleStyle}>Umowy</h1>
          <p style={subtitleStyle}>Rejestr umów, dane do szablonów DOCX, pliki PDF i status podpisu.</p>
        </div>
        <div style={headerActionsStyle}>
          <button style={primaryButtonStyle} onClick={() => setCreatingContract(true)}>Dodaj umowę</button>
        </div>
      </section>

      <section style={summaryGridStyle}>
        <SummaryCard label="Wszystkie umowy" value={contracts.length} />
        <SummaryCard label="Podpisane" value={signedCount} />
        <SummaryCard label="Do podpisu" value={pendingCount} />
      </section>

      <section style={cardStyle}>
        <div style={tableHeaderStyle}>
          <h2 style={sectionTitleStyle}>Rejestr umów</h2>
          <select style={filterStyle} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="Wszystkie">Wszystkie statusy</option>
            {CONTRACT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </div>

        {loading ? <div style={emptyStyle}>Ładowanie umów...</div> : filteredContracts.length === 0 ? <div style={emptyStyle}>Brak umów do wyświetlenia.</div> : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Numer</Th>
                  <Th>Klient</Th>
                  <Th>Typ</Th>
                  <Th>Status</Th>
                  <Th>Abonament</Th>
                  <Th>Pliki</Th>
                  <Th>Akcje</Th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((contract) => (
                  <tr key={contract.id} style={rowStyle}>
                    <Td strong>{contract.numer_umowy || "Bez numeru"}</Td>
                    <Td>{contract.nazwa_klienta}</Td>
                    <Td>{contract.typ_umowy}</Td>
                    <Td><StatusBadge status={contract.status} /></Td>
                    <Td>{formatMoney(contract.abonament_netto)}</Td>
                    <Td>{contract.podpisany_pdf_path ? "Podpisana" : contract.wygenerowany_pdf_path ? "Wygenerowana" : "Brak PDF"}</Td>
                    <Td><button style={secondaryButtonStyle} onClick={() => setSelectedContract(contract)}>Szczegóły</button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(creatingContract || selectedContract) && (
        <ContractDrawer
          contract={selectedContract}
          leads={leads}
          clients={clients}
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

function ContractDrawer({ contract, leads, clients, onClose, onSaved }: { contract: CrmContract | null; leads: Lead[]; clients: Client[]; onClose: () => void; onSaved: (contract: CrmContract) => void }) {
  const generatedInputRef = useRef<HTMLInputElement | null>(null);
  const signedInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<ContractDraft>(() => contract ? createDraft(contract) : createEmptyDraft());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const wonLeads = useMemo(() => leads.filter((lead) => lead.status === "wygrana"), [leads]);

  function updateDraft<K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function fillFromLead(leadId: string) {
    updateDraft("crm_id", leadId);
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;

    setDraft((current) => ({
      ...current,
      crm_id: leadId,
      nazwa_klienta: lead.nazwa || current.nazwa_klienta,
      reprezentant: lead.osoba_kontaktowa || current.reprezentant,
      email_klienta: lead.email || current.email_klienta,
      nip: lead.nip || current.nip,
      abonament_netto: lead.szacowany_mrr ? String(lead.szacowany_mrr) : current.abonament_netto,
      limit_dokumentow: lead.liczba_dokumentow ? String(lead.liczba_dokumentow) : current.limit_dokumentow,
      obsluga_kadrowa: Boolean(lead.czy_kadry),
    }));
  }

  function fillFromClient(clientId: string) {
    updateDraft("klient_id", clientId);
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;

    setDraft((current) => ({
      ...current,
      klient_id: clientId,
      nazwa_klienta: client.nazwa || current.nazwa_klienta,
      email_klienta: client.email || current.email_klienta,
      nip: client.nip || current.nip,
      abonament_netto: client.abonament ? String(client.abonament) : current.abonament_netto,
      limit_dokumentow: client.limit_dokumentow ? String(client.limit_dokumentow) : current.limit_dokumentow,
      obsluga_kadrowa: Boolean(client.obsluga_kadrowa),
      typ_umowy: client.forma_opodatkowania === "CIT" || client.forma_prawna?.toLowerCase().includes("sp.") ? "KH" : current.typ_umowy,
    }));
  }

  async function saveContract(nextStatus?: CrmContractStatus) {
    if (!draft.nazwa_klienta.trim()) {
      alert("Uzupełnij nazwę klienta.");
      return null;
    }

    setSaving(true);
    const payload = {
      crm_id: draft.crm_id || null,
      klient_id: draft.klient_id || null,
      typ_umowy: draft.typ_umowy,
      status: nextStatus || draft.status,
      numer_umowy: emptyToNull(draft.numer_umowy),
      data_zawarcia: null,
      miejsce_zawarcia: null,
      pierwszy_okres: emptyToNull(draft.pierwszy_okres),
      nazwa_klienta: draft.nazwa_klienta.trim(),
      siedziba: emptyToNull(draft.siedziba),
      rejestr: null,
      krs: null,
      nip: emptyToNull(draft.nip),
      reprezentant: emptyToNull(draft.reprezentant),
      email_klienta: emptyToNull(draft.email_klienta),
      abonament_netto: draft.abonament_netto ? Number(draft.abonament_netto) : null,
      limit_dokumentow: draft.limit_dokumentow ? Number(draft.limit_dokumentow) : null,
      obsluga_kadrowa: draft.obsluga_kadrowa,
      ustalenia_indywidualne: emptyToNull(draft.ustalenia_indywidualne),
    };

    const result = contract ? await updateCrmContract(contract.id, payload) : await createCrmContract(payload);
    setSaving(false);

    if (result.error || !result.data) {
      console.error("Błąd zapisu umowy:", result.error);
      alert("Nie udało się zapisać umowy.");
      return null;
    }

    const savedContract = result.data as CrmContract;
    onSaved(savedContract);
    return savedContract;
  }

  async function uploadPdf(file: File, field: "generated" | "signed") {
    if (!contract) {
      alert("Najpierw zapisz umowę, potem dodaj PDF.");
      return;
    }

    setUploading(true);
    const result = await uploadCrmContractPdf(contract.id, file, field);
    setUploading(false);

    if (result.error || !result.data) {
      console.error("Błąd uploadu umowy:", result.error);
      alert("Nie udało się dodać PDF.");
      return;
    }

    onSaved(result.data as CrmContract);
  }

  async function openStoredPdf(path: string | null) {
    if (!path) return;
    const { data, error } = await createCrmContractSignedUrl(path);
    if (error || !data?.signedUrl) {
      alert("Nie udało się otworzyć PDF.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function downloadStoredPdf(path: string | null, fileName: string | null) {
    if (!path) return;
    const { data, error } = await createCrmContractSignedUrl(path);
    if (error || !data?.signedUrl) {
      alert("Nie udało się pobrać PDF.");
      return;
    }

    try {
      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error("Nie udało się pobrać pliku.");

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName || "umowa.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Błąd pobierania PDF:", error);
      alert("Nie udało się pobrać PDF.");
    }
  }

  return (
    <div style={drawerOverlayStyle} onClick={onClose}>
      <aside style={drawerStyle} onClick={(event) => event.stopPropagation()}>
        <div style={drawerHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>{contract ? "Szczegóły umowy" : "Nowa umowa"}</p>
            <h2 style={drawerTitleStyle}>{draft.numer_umowy || draft.nazwa_klienta || "Umowa"}</h2>
          </div>
          <button style={closeButtonStyle} onClick={onClose}><X size={20} /></button>
        </div>

        <div style={drawerActionsStyle}>
          <button style={primarySmallButtonStyle} onClick={() => saveContract()} disabled={saving}>{saving ? "Zapisywanie..." : "Zapisz"}</button>
        </div>

        <div style={drawerContentStyle}>
          <FormSection title="Powiązanie">
            <SearchableLeadSelect label="Szansa CRM" value={draft.crm_id} leads={wonLeads} onChange={fillFromLead} />
            <EditableSelect label="Klient" value={draft.klient_id} onChange={fillFromClient} options={[{ value: "", label: "Bez klienta" }, ...clients.map((client) => ({ value: client.id, label: client.nazwa || "Bez nazwy" }))]} />
            <EditableSelect label="Typ umowy" value={draft.typ_umowy} onChange={(value) => updateDraft("typ_umowy", value as CrmContractType)} options={CONTRACT_TYPES.map((item) => ({ value: item.value, label: item.label }))} />
            <EditableSelect label="Status" value={draft.status} onChange={(value) => updateDraft("status", value as CrmContractStatus)} options={CONTRACT_STATUSES} />
          </FormSection>

          <FormSection title="Dane umowy">
            <EditableInput label="Numer umowy" value={draft.numer_umowy} onChange={(value) => updateDraft("numer_umowy", value)} />
            <EditableInput label="Pierwszy okres" value={draft.pierwszy_okres} onChange={(value) => updateDraft("pierwszy_okres", value)} />
          </FormSection>

          <FormSection title="Dane klienta">
            <EditableInput label="Nazwa klienta" value={draft.nazwa_klienta} onChange={(value) => updateDraft("nazwa_klienta", value)} />
            <EditableInput label="Siedziba" value={draft.siedziba} onChange={(value) => updateDraft("siedziba", value)} />
            <EditableInput label="NIP" value={draft.nip} onChange={(value) => updateDraft("nip", value)} />
            <EditableInput label="Reprezentant" value={draft.reprezentant} onChange={(value) => updateDraft("reprezentant", value)} />
            <EditableInput label="Email klienta" type="email" value={draft.email_klienta} onChange={(value) => updateDraft("email_klienta", value)} />
          </FormSection>

          <FormSection title="Warunki finansowe">
            <EditableInput label="Abonament netto" type="number" value={draft.abonament_netto} onChange={(value) => updateDraft("abonament_netto", value)} />
            <EditableInput label={draft.typ_umowy === "KH" ? "Limit dokumentów" : "Limit pozycji"} type="number" value={draft.limit_dokumentow} onChange={(value) => updateDraft("limit_dokumentow", value)} />
            <EditableCheckbox label="Obsługa kadr" checked={draft.obsluga_kadrowa} onChange={(value) => updateDraft("obsluga_kadrowa", value)} />
            <EditableTextarea label="Ustalenia indywidualne" value={draft.ustalenia_indywidualne} onChange={(value) => updateDraft("ustalenia_indywidualne", value)} />
          </FormSection>

          <FormSection title="Pliki PDF">
            <input ref={generatedInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPdf(file, "generated"); }} />
            <input ref={signedInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPdf(file, "signed"); }} />
            <div style={fileActionsPanelStyle}>
              <button style={secondaryButtonStyle} onClick={() => generatedInputRef.current?.click()} disabled={uploading || !contract}>{uploading ? "Dodawanie..." : "Dodaj wygenerowany PDF"}</button>
              <button style={primarySmallButtonStyle} onClick={() => signedInputRef.current?.click()} disabled={uploading || !contract}>{uploading ? "Dodawanie..." : "Dodaj podpisany PDF"}</button>
            </div>
            {contract?.wygenerowany_pdf_path && (
              <FileRow
                label="Wygenerowany PDF"
                name={contract.wygenerowany_pdf_name}
                onOpen={() => openStoredPdf(contract.wygenerowany_pdf_path)}
                onDownload={() => downloadStoredPdf(contract.wygenerowany_pdf_path, buildContractDownloadFileName(contract))}
              />
            )}
            {contract?.podpisany_pdf_path && (
              <FileRow
                label="Podpisany PDF"
                name={contract.podpisany_pdf_name}
                onOpen={() => openStoredPdf(contract.podpisany_pdf_path)}
                onDownload={() => downloadStoredPdf(contract.podpisany_pdf_path, contract.podpisany_pdf_name || buildContractDownloadFileName(contract))}
              />
            )}
            {!contract && <p style={hintStyle}>Najpierw zapisz umowę, aby dodać pliki PDF do rejestru.</p>}
          </FormSection>
        </div>
      </aside>
    </div>
  );
}

function createEmptyDraft(): ContractDraft {
  return {
    crm_id: "",
    klient_id: "",
    typ_umowy: "KH",
    status: "szkic",
    numer_umowy: `...../KH/...../${new Date().getFullYear()}`,
    pierwszy_okres: "",
    nazwa_klienta: "",
    siedziba: "",
    nip: "",
    reprezentant: "",
    email_klienta: "",
    abonament_netto: "",
    limit_dokumentow: "",
    obsluga_kadrowa: false,
    ustalenia_indywidualne: "",
  };
}

function createDraft(contract: CrmContract): ContractDraft {
  return {
    crm_id: contract.crm_id || "",
    klient_id: contract.klient_id || "",
    typ_umowy: contract.typ_umowy,
    status: contract.status,
    numer_umowy: contract.numer_umowy || "",
    pierwszy_okres: contract.pierwszy_okres || "",
    nazwa_klienta: contract.nazwa_klienta || "",
    siedziba: contract.siedziba || "",
    nip: contract.nip || "",
    reprezentant: contract.reprezentant || "",
    email_klienta: contract.email_klienta || "",
    abonament_netto: contract.abonament_netto ? String(contract.abonament_netto) : "",
    limit_dokumentow: contract.limit_dokumentow ? String(contract.limit_dokumentow) : "",
    obsluga_kadrowa: Boolean(contract.obsluga_kadrowa),
    ustalenia_indywidualne: contract.ustalenia_indywidualne || "",
  };
}

function emptyToNull(value: string) {
  return value.trim() ? value.trim() : null;
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString("pl-PL")} zł`;
}

function statusLabel(status: CrmContractStatus) {
  return CONTRACT_STATUSES.find((item) => item.value === status)?.label || status;
}

function buildContractDownloadFileName(contract: CrmContract) {
  const numberPart = sanitizeFileNamePart(contract.numer_umowy || "bez-numeru");
  const contractorPart = sanitizeFileNamePart(contract.nazwa_klienta || "kontrahent");
  return `umowa_${numberPart}_${contractorPart}.pdf`;
}

function sanitizeFileNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "brak";
}

function StatusBadge({ status }: { status: CrmContractStatus }) {
  const palette: Record<CrmContractStatus, React.CSSProperties> = {
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

function EditableInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number" | "email" }) {
  return <label style={editableRowStyle}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} /></label>;
}

function EditableSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label style={editableRowStyle}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function SearchableLeadSelect({ label, value, leads, onChange }: { label: string; value: string; leads: Lead[]; onChange: (value: string) => void }) {
  const selectedLead = leads.find((lead) => lead.id === value) || null;
  const [query, setQuery] = useState(selectedLead?.nazwa || "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedLead?.nazwa || "");
  }, [selectedLead?.id, selectedLead?.nazwa]);

  const visibleLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? leads.filter((lead) => [lead.nazwa, lead.osoba_kontaktowa, lead.email, lead.nip].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery))
      : leads;
    return filtered.slice(0, 8);
  }, [leads, query]);

  return (
    <div style={editableRowStyle}>
      <span>{label}</span>
      <div style={comboWrapStyle}>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (value) onChange("");
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Wpisz nazwę wygranej szansy"
          style={{ ...inputStyle, paddingRight: query ? "88px" : inputStyle.padding }}
        />
        {query && <button type="button" style={clearComboButtonStyle} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setOpen(false); onChange(""); }}>Wyczyść</button>}
        {open && (
          <div style={comboListStyle}>
            {visibleLeads.length === 0 ? <div style={comboEmptyStyle}>Brak wygranych szans pasujących do wpisanego tekstu.</div> : visibleLeads.map((lead) => (
              <button key={lead.id} type="button" style={comboOptionStyle} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(lead.nazwa || "Bez nazwy"); setOpen(false); onChange(lead.id); }}>
                <strong>{lead.nazwa || "Bez nazwy"}</strong>
                <span>{[lead.osoba_kontaktowa, lead.email, lead.nip].filter(Boolean).join(" · ") || "Wygrana szansa"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditableCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label style={editableRowStyle}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function EditableTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label style={textareaRowStyle}><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} style={textareaStyle} rows={4} /></label>;
}

function FileRow({ label, name, onOpen, onDownload }: { label: string; name: string | null; onOpen: () => void; onDownload: () => void }) {
  return (
    <div style={fileRowStyle}>
      <div>
        <strong>{label}</strong>
        <span>{name || "PDF"}</span>
      </div>
      <div style={fileRowActionsStyle}>
        <button style={secondaryButtonStyle} onClick={onOpen}>Otwórz</button>
        <button style={primarySmallButtonStyle} onClick={onDownload}>Pobierz</button>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>; }

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "28px" };
const headerActionsStyle: React.CSSProperties = { display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "flex-end" };
const eyebrowStyle: React.CSSProperties = { color: colors.red, fontWeight: 800, margin: "0 0 8px" };
const titleStyle: React.CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const subtitleStyle: React.CSSProperties = { maxWidth: "780px", fontSize: "17px", lineHeight: 1.7, color: colors.muted, marginTop: "14px" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "14px 18px", minHeight: "46px", background: colors.red, color: colors.white, fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const primarySmallButtonStyle: React.CSSProperties = { ...primaryButtonStyle, padding: "11px 15px", minHeight: "42px" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" };
const summaryCardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px", color: colors.muted, fontWeight: 800 };
const cardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "28px", boxShadow: shadow.soft, marginBottom: "24px" };
const tableHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "18px" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const filterStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", background: colors.card, color: colors.text, minWidth: "190px", fontWeight: 700 };
const tableWrapperStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "14px 16px", color: colors.muted, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}` };
const rowStyle: React.CSSProperties = { borderBottom: `1px solid ${colors.border}` };
const tdStyle: React.CSSProperties = { padding: "16px", color: colors.text, verticalAlign: "middle" };
const badgeStyle: React.CSSProperties = { display: "inline-flex", borderRadius: radius.badge, padding: "7px 12px", fontWeight: 850, fontSize: "13px" };
const emptyStyle: React.CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "18px", color: colors.muted, fontWeight: 700, textAlign: "center" };
const drawerOverlayStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 50, background: "rgba(15, 23, 42, 0.32)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "flex-end" };
const drawerStyle: React.CSSProperties = { width: "680px", maxWidth: "100%", height: "100vh", background: colors.card, borderLeft: `1px solid ${colors.border}`, boxShadow: "-12px 0 30px rgba(15, 23, 42, 0.12)", padding: "28px", overflowY: "auto" };
const drawerHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", marginBottom: "16px" };
const drawerActionsStyle: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: "10px", marginBottom: "24px", flexWrap: "wrap" };
const drawerTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "28px", lineHeight: 1.15 };
const closeButtonStyle: React.CSSProperties = { width: "40px", height: "40px", borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const drawerContentStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "18px" };
const drawerSectionStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "20px", background: colors.white };
const formSectionTitleStyle: React.CSSProperties = { margin: "0 0 12px", color: colors.navy, fontSize: "18px", fontWeight: 500 };
const editableRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "190px 1fr", gap: "14px", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${colors.border}`, color: colors.muted, fontWeight: 700 };
const textareaRowStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 700 };
const inputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", background: colors.inputBackground, color: colors.text, fontWeight: 650, outline: "none" };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: "vertical", minHeight: "96px", lineHeight: 1.6 };
const comboWrapStyle: React.CSSProperties = { position: "relative" };
const clearComboButtonStyle: React.CSSProperties = { position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", border: "none", borderRadius: radius.badge, padding: "6px 10px", background: "#eef2f7", color: colors.navy, fontWeight: 800, cursor: "pointer" };
const comboListStyle: React.CSSProperties = { position: "absolute", zIndex: 80, top: "calc(100% + 6px)", left: 0, right: 0, maxHeight: "260px", overflowY: "auto", background: colors.white, border: `1px solid ${colors.border}`, borderRadius: radius.input, boxShadow: shadow.soft, padding: "6px" };
const comboOptionStyle: React.CSSProperties = { width: "100%", border: "none", borderRadius: radius.input, padding: "10px 12px", background: "transparent", color: colors.text, cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: "4px", fontWeight: 700 };
const comboEmptyStyle: React.CSSProperties = { padding: "12px", color: colors.muted, fontWeight: 700, lineHeight: 1.5 };
const fileActionsPanelStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" };
const fileRowStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "12px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginTop: "10px" };
const fileRowActionsStyle: React.CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" };
const hintStyle: React.CSSProperties = { color: colors.muted, fontSize: "13px", lineHeight: 1.6 };
