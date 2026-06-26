"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients } from "@/lib/clientService";
import { fetchCrmContracts, type CrmContract } from "@/lib/crmContractService";
import { supabase } from "@/lib/supabaseClient";
import {
  createRodoProcessingContract,
  createRodoProcessingContractSignedUrl,
  deleteGeneratedRodoProcessingContractPdf,
  fetchRodoProcessingContracts,
  requestRodoProcessingContractGeneration,
  updateRodoProcessingContract,
  uploadSignedRodoProcessingContractPdf,
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

type SearchOption = {
  value: string;
  label: string;
  description?: string;
};

type UserProfile = {
  id: string;
  full_name: string | null;
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
const STATUS_FILTER_OPTIONS = [{ value: "Wszystkie", label: "Wszystkie statusy" }, ...STATUS_OPTIONS];

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
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("Wszystkie");
  const [selectedContract, setSelectedContract] = useState<RodoProcessingContract | null>(null);
  const [creatingContract, setCreatingContract] = useState(false);

  useEffect(() => {
    void loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    const [contractsResult, clientsResult, accountingContractsResult, profilesResult] = await Promise.all([
      fetchRodoProcessingContracts(),
      fetchClients(),
      fetchCrmContracts(),
      fetchRodoProfiles(),
    ]);

    if (!contractsResult.error) setContracts((contractsResult.data || []) as RodoProcessingContract[]);
    else console.error("Błąd pobierania umów RODO:", contractsResult.error);

    if (!clientsResult.error) setClients((clientsResult.data || []) as Client[]);
    else console.error("Błąd pobierania klientów:", clientsResult.error);

    if (!accountingContractsResult.error) setAccountingContracts((accountingContractsResult.data || []) as CrmContract[]);
    else console.error("Błąd pobierania umów księgowych:", accountingContractsResult.error);

    if (!profilesResult.error) setProfiles((profilesResult.data || []) as UserProfile[]);
    else console.error("Błąd pobierania użytkowników:", profilesResult.error);

    setLoading(false);
  }

  const filteredContracts = useMemo(() => {
    return contracts
      .filter((contract) => statusFilter === "Wszystkie" || contract.status === statusFilter)
      .sort(compareContractNumbersDesc);
  }, [contracts, statusFilter]);
  const signedCount = contracts.filter((contract) => contract.status === "podpisana").length;
  const pendingCount = contracts.filter((contract) => contract.status === "wygenerowana" || contract.status === "wyslana_do_podpisu").length;

  function handleSaved(contract: RodoProcessingContract) {
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
          <h2 style={sectionTitleStyle}>Rejestr umów powierzenia przetwarzania danych osobowych</h2>
          <div style={tableActionsStyle}>
            <button style={secondaryButtonStyle} type="button" onClick={() => window.print()}>Drukuj rejestr</button>
            <AppSelect style={filterStyle} value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} />
          </div>
        </div>

        {loading ? <div style={emptyStyle}>Ładowanie umów...</div> : filteredContracts.length === 0 ? <div style={emptyStyle}>Brak umów powierzenia do wyświetlenia.</div> : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Numer</Th>
                  <Th>Klient</Th>
                  <Th>NIP</Th>
                  <Th>Siedziba klienta</Th>
                  <Th>Umowa główna</Th>
                  <Th>Zakres</Th>
                  <Th>Status umowy</Th>
                  <Th>Szczegóły</Th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((contract) => (
                  <tr key={contract.id} style={rowStyle}>
                    <Td strong>{contract.numer_umowy || "Bez numeru"}</Td>
                    <Td>{contract.nazwa_klienta}</Td>
                    <Td>{contract.nip || "-"}</Td>
                    <Td>{contract.siedziba || "-"}</Td>
                    <Td>{contract.crm_umowy?.numer_umowy || "Brak powiązania"}</Td>
                    <Td>{contract.zakres_powierzenia || "zgodnie z zawartą umową główną"}</Td>
                    <Td><StatusBadge status={contract.status} /></Td>
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
          profiles={profiles}
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

function RodoDrawer({ contract, clients, accountingContracts, profiles, onClose, onSaved }: { contract: RodoProcessingContract | null; clients: Client[]; accountingContracts: CrmContract[]; profiles: UserProfile[]; onClose: () => void; onSaved: (contract: RodoProcessingContract) => void }) {
  const signedPdfInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<RodoDraft>(() => contract ? createDraft(contract) : createEmptyDraft());
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deletingPdf, setDeletingPdf] = useState(false);
  const [uploadingSignedPdf, setUploadingSignedPdf] = useState(false);
  const [accountingSearch, setAccountingSearch] = useState(() => selectedAccountingContractLabel(contract, accountingContracts));
  const [clientSearch, setClientSearch] = useState(() => selectedClientLabel(contract, clients));

  const signedAccountingContracts = useMemo(() => {
    return accountingContracts.filter((item) => item.status === "podpisana" || item.podpisany_pdf_path);
  }, [accountingContracts]);

  const accountingOptions = useMemo<SearchOption[]>(() => {
    return signedAccountingContracts.map((item) => ({
      value: item.id,
      label: `${item.numer_umowy || "Bez numeru"} - ${item.nazwa_klienta || "Bez klienta"}`,
      description: [item.nip, item.email_klienta].filter(Boolean).join(" · "),
    }));
  }, [signedAccountingContracts]);

  const clientOptions = useMemo<SearchOption[]>(() => {
    return clients.map((client) => ({
      value: client.id,
      label: client.nazwa || "Bez nazwy",
      description: [client.nip, client.email].filter(Boolean).join(" · "),
    }));
  }, [clients]);

  function updateDraft<K extends keyof RodoDraft>(key: K, value: RodoDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function clearAccountingContract() {
    updateDraft("umowa_ksiegowa_id", "");
    setAccountingSearch("");
  }

  function fillFromAccountingContract(contractId: string) {
    const accountingContract = accountingContracts.find((item) => item.id === contractId);
    if (!accountingContract) {
      clearAccountingContract();
      return;
    }

    setAccountingSearch(`${accountingContract.numer_umowy || "Bez numeru"} - ${accountingContract.nazwa_klienta || "Bez klienta"}`);
    const matchedClient = accountingContract.klient_id ? clients.find((item) => item.id === accountingContract.klient_id) : null;
    if (matchedClient) setClientSearch(clientLabel(matchedClient));

    setDraft((current) => ({
      ...current,
      umowa_ksiegowa_id: contractId,
      klient_id: accountingContract.klient_id || current.klient_id,
      nazwa_klienta: accountingContract.nazwa_klienta || current.nazwa_klienta,
      siedziba: accountingContract.siedziba || current.siedziba,
      nip: accountingContract.nip || current.nip,
      reprezentant: accountingContract.reprezentant || current.reprezentant,
      numer_umowy: current.numer_umowy || buildDefaultRodoNumber(accountingContract.numer_umowy),
    }));
  }

  function clearClient() {
    updateDraft("klient_id", "");
    setClientSearch("");
  }

  function fillFromClient(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    if (!client) {
      clearClient();
      return;
    }

    setClientSearch(clientLabel(client));
    setDraft((current) => ({
      ...current,
      klient_id: clientId,
      nazwa_klienta: client.nazwa || current.nazwa_klienta,
      nip: client.nip || current.nip,
    }));
  }

  async function persistContract() {
    if (!draft.nazwa_klienta.trim()) {
      alert("Uzupełnij nazwę klienta.");
      return null;
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
      zakres_powierzenia: emptyToNull(draft.zakres_powierzenia),
      uwagi: emptyToNull(draft.uwagi),
      podpisana_at: draft.status === "podpisana" ? new Date().toISOString() : null,
    };

    const result = contract ? await updateRodoProcessingContract(contract.id, payload) : await createRodoProcessingContract(payload);
    setSaving(false);

    if (result.error || !result.data) {
      console.error("Błąd zapisu umowy RODO:", result.error);
      alert("Nie udało się zapisać umowy powierzenia.");
      return null;
    }

    return result.data as RodoProcessingContract;
  }

  async function saveContract() {
    const savedContract = await persistContract();
    if (savedContract) onSaved(savedContract);
  }

  async function generateContract() {
    const savedContract = await persistContract();
    if (!savedContract) return;

    setGenerating(true);
    const result = await requestRodoProcessingContractGeneration(savedContract);
    setGenerating(false);

    if (result.error || !result.data?.contract) {
      console.error("Błąd generowania umowy RODO:", result.error);
      alert(result.error || "Nie udało się wygenerować umowy powierzenia.");
      return;
    }

    onSaved(result.data.contract as RodoProcessingContract);
  }

  async function openPdf(storagePath: string | null) {
    if (!storagePath) return;
    const result = await createRodoProcessingContractSignedUrl(storagePath);
    if (result.error || !result.data?.signedUrl) {
      console.error("Błąd otwierania PDF RODO:", result.error);
      alert("Nie udało się otworzyć pliku PDF.");
      return;
    }
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteGeneratedPdf() {
    if (!contract?.wygenerowany_pdf_path) return;
    const confirmed = window.confirm("Czy na pewno usunąć wygenerowany PDF tej umowy?");
    if (!confirmed) return;

    setDeletingPdf(true);
    const result = await deleteGeneratedRodoProcessingContractPdf(contract);
    setDeletingPdf(false);

    if (result.error || !result.data) {
      console.error("Błąd usuwania wygenerowanego PDF RODO:", result.error);
      alert("Nie udało się usunąć wygenerowanego PDF.");
      return;
    }

    onSaved(result.data as RodoProcessingContract);
  }

  async function uploadSignedPdf(file: File | null | undefined) {
    if (!file) return;
    if (file.type && file.type !== "application/pdf") {
      alert("Wybierz plik PDF.");
      return;
    }

    const savedContract = contract || await persistContract();
    if (!savedContract?.id) return;

    setUploadingSignedPdf(true);
    const result = await uploadSignedRodoProcessingContractPdf(savedContract.id, file);
    setUploadingSignedPdf(false);
    if (signedPdfInputRef.current) signedPdfInputRef.current.value = "";

    if (result.error || !result.data) {
      console.error("Błąd wgrywania podpisanego PDF RODO:", result.error);
      alert("Nie udało się dodać podpisanego PDF.");
      return;
    }

    onSaved(result.data as RodoProcessingContract);
  }

  const busy = saving || generating || deletingPdf || uploadingSignedPdf;

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
          <button style={secondaryButtonStyle} onClick={generateContract} disabled={busy}>{generating ? "Generowanie..." : "Generuj"}</button>
          <button style={primarySmallButtonStyle} onClick={saveContract} disabled={busy}>{saving ? "Zapisywanie..." : "Zapisz"}</button>
        </div>

        <div style={drawerContentStyle}>
          <FormSection title="Powiązania">
            <SearchablePicker
              label="Umowa księgowa"
              value={accountingSearch}
              placeholder="Wpisz numer umowy lub klienta"
              options={accountingOptions}
              onInputChange={(value) => {
                setAccountingSearch(value);
                if (!value.trim()) updateDraft("umowa_ksiegowa_id", "");
              }}
              onSelect={fillFromAccountingContract}
              onClear={clearAccountingContract}
            />
            <SearchablePicker
              label="Klient"
              value={clientSearch}
              placeholder="Wpisz nazwę klienta, NIP lub email"
              options={clientOptions}
              onInputChange={(value) => {
                setClientSearch(value);
                if (!value.trim()) updateDraft("klient_id", "");
              }}
              onSelect={fillFromClient}
              onClear={clearClient}
            />
            <EditableSelect label="Status" value={draft.status} onChange={(value) => updateDraft("status", value as RodoProcessingContractStatus)} options={STATUS_OPTIONS} />
          </FormSection>

          <FormSection title="Dane umowy">
            <EditableInput label="Numer umowy" value={draft.numer_umowy} onChange={(value) => updateDraft("numer_umowy", value)} />
            <EditableInput label="Nazwa klienta" value={draft.nazwa_klienta} onChange={(value) => updateDraft("nazwa_klienta", value)} />
            <EditableInput label="Siedziba" value={draft.siedziba} onChange={(value) => updateDraft("siedziba", value)} />
            <EditableInput label="NIP" value={draft.nip} onChange={(value) => updateDraft("nip", value)} />
            <EditableInput label="Reprezentant" value={draft.reprezentant} onChange={(value) => updateDraft("reprezentant", value)} />
          </FormSection>

          <FormSection title="Zakres powierzenia">
            <EditableTextarea label="Zakres" value={draft.zakres_powierzenia} onChange={(value) => updateDraft("zakres_powierzenia", value)} />
            <EditableTextarea label="Uwagi" value={draft.uwagi} onChange={(value) => updateDraft("uwagi", value)} />
          </FormSection>

          {contract && (
            <FormSection title="Historia">
              <div style={auditBoxStyle}>{contractAuditDescription(contract, profiles)}</div>
              <div style={auditMetaStyle}>
                <span>Utworzono: {formatDateTime(contract.created_at)}</span>
                <span>Ostatnia zmiana: {formatDateTime(contract.updated_at)}</span>
              </div>
            </FormSection>
          )}

          <FormSection title="Pliki PDF">
            <div style={uploadRowStyle}>
              <input
                ref={signedPdfInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={(event) => void uploadSignedPdf(event.target.files?.[0])}
              />
              <button style={primarySmallButtonStyle} type="button" onClick={() => signedPdfInputRef.current?.click()} disabled={busy}>
                {uploadingSignedPdf ? "Wgrywanie..." : "Dodaj podpisany PDF"}
              </button>
            </div>
            {contract?.wygenerowany_pdf_path ? (
              <FileRow
                label="Wygenerowany PDF"
                fileName={contract.wygenerowany_pdf_name || "Umowa powierzenia.pdf"}
                onOpen={() => void openPdf(contract.wygenerowany_pdf_path)}
                onDelete={() => void deleteGeneratedPdf()}
                deleting={deletingPdf}
              />
            ) : <div style={emptyStyle}>Brak wygenerowanego PDF.</div>}
            {contract?.podpisany_pdf_path && (
              <FileRow label="Podpisany PDF" fileName={contract.podpisany_pdf_name || "Podpisana umowa powierzenia.pdf"} onOpen={() => void openPdf(contract.podpisany_pdf_path)} />
            )}
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
    zakres_powierzenia: contract.zakres_powierzenia || "",
    uwagi: contract.uwagi || "",
  };
}

function selectedAccountingContractLabel(contract: RodoProcessingContract | null, accountingContracts: CrmContract[]) {
  if (!contract?.umowa_ksiegowa_id) return "";
  const accountingContract = accountingContracts.find((item) => item.id === contract.umowa_ksiegowa_id);
  return accountingContract ? `${accountingContract.numer_umowy || "Bez numeru"} - ${accountingContract.nazwa_klienta || "Bez klienta"}` : contract.crm_umowy?.numer_umowy || "";
}

function selectedClientLabel(contract: RodoProcessingContract | null, clients: Client[]) {
  if (!contract?.klient_id) return "";
  const client = clients.find((item) => item.id === contract.klient_id);
  return client ? clientLabel(client) : contract.klienci?.nazwa || contract.nazwa_klienta || "";
}

function clientLabel(client: Client) {
  return [client.nazwa, client.nip].filter(Boolean).join(" - ") || "Bez nazwy";
}

function buildDefaultRodoNumber(accountingNumber: string | null) {
  if (!accountingNumber) return `...../RODO/...../${new Date().getFullYear()}`;
  return accountingNumber.replace("/KH/", "/RODO/").replace("/KU/", "/RODO/");
}

function fetchRodoProfiles() {
  return supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name", { ascending: true });
}

function compareContractNumbersDesc(a: RodoProcessingContract, b: RodoProcessingContract) {
  const aNumber = extractLeadingNumber(a.numer_umowy);
  const bNumber = extractLeadingNumber(b.numer_umowy);
  if (aNumber !== bNumber) return bNumber - aNumber;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function extractLeadingNumber(value: string | null) {
  const match = value?.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function emptyToNull(value: string) {
  return value.trim() ? value.trim() : null;
}

function statusLabel(status: RodoProcessingContractStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function contractAuditDescription(contract: RodoProcessingContract, profiles: UserProfile[]) {
  const userName = profileName(contract.created_by, profiles);
  return `Użytkownik ${userName} dodał umowę w dniu ${formatDate(contract.created_at)} o godzinie ${formatTime(contract.created_at)}.`;
}

function profileName(profileId: string | null, profiles: UserProfile[]) {
  if (!profileId) return "brak zapisanego autora";
  const profile = profiles.find((item) => item.id === profileId);
  return profile?.full_name || profile?.email || profileId;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function matchesSearch(option: SearchOption, search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;
  return `${option.label} ${option.description || ""}`.toLowerCase().includes(normalizedSearch);
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

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <section style={drawerSectionStyle}><h3 style={formSectionTitleStyle}>{title}</h3>{children}</section>;
}

function FileRow({ label, fileName, onOpen, onDelete, deleting }: { label: string; fileName: string; onOpen: () => void; onDelete?: () => void; deleting?: boolean }) {
  return (
    <div style={fileRowStyle}>
      <div style={fileInfoStyle}>
        <strong>{label}</strong>
        <span>{fileName}</span>
      </div>
      <div style={fileActionsStyle}>
        <button style={secondaryButtonStyle} type="button" onClick={onOpen}>Otwórz</button>
        {onDelete && <button style={dangerButtonStyle} type="button" onClick={onDelete} disabled={deleting}>{deleting ? "Usuwanie..." : "Usuń"}</button>}
      </div>
    </div>
  );
}

function EditableInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "email" }) {
  return <label style={editableRowStyle}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} /></label>;
}

function EditableSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label style={editableRowStyle}><span>{label}</span><AppSelect value={value} onChange={onChange} style={inputStyle} options={options} /></label>;
}

function SearchablePicker({ label, value, placeholder, options, onInputChange, onSelect, onClear }: { label: string; value: string; placeholder: string; options: SearchOption[]; onInputChange: (value: string) => void; onSelect: (value: string) => void; onClear: () => void }) {
  const [focused, setFocused] = useState(false);
  const visibleOptions = options.filter((option) => matchesSearch(option, value)).slice(0, 8);

  return (
    <label style={searchRowStyle}>
      <span>{label}</span>
      <div style={searchBoxStyle}>
        <input
          value={value}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onChange={(event) => onInputChange(event.target.value)}
          style={inputStyle}
        />
        {value && <button type="button" style={clearButtonStyle} onClick={onClear}>Wyczyść</button>}
        {focused && value.trim() && (
          <div style={suggestionsStyle} onMouseDown={(event) => event.preventDefault()}>
            {visibleOptions.length === 0 ? <div style={suggestionEmptyStyle}>Brak wyników.</div> : visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                style={suggestionButtonStyle}
                onClick={() => {
                  onSelect(option.value);
                  setFocused(false);
                }}
              >
                <strong>{option.label}</strong>
                {option.description && <small>{option.description}</small>}
              </button>
            ))}
          </div>
        )}
      </div>
    </label>
  );
}

function EditableTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label style={textareaRowStyle}><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} style={textareaStyle} rows={4} /></label>;
}

function Th({ children }: { children: ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong }: { children: ReactNode; strong?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>; }

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "28px" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 800, margin: "0 0 8px" };
const titleStyle: CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const subtitleStyle: CSSProperties = { maxWidth: "780px", fontSize: "17px", lineHeight: 1.7, color: colors.muted, marginTop: "14px" };
const primaryButtonStyle: CSSProperties = { border: "none", borderRadius: radius.button, padding: "14px 18px", minHeight: "46px", background: colors.red, color: colors.white, fontWeight: 800, cursor: "pointer", textAlign: "center" };
const primarySmallButtonStyle: CSSProperties = { ...primaryButtonStyle, padding: "11px 15px", minHeight: "42px" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", textAlign: "center" };
const dangerButtonStyle: CSSProperties = { border: `1px solid #fecaca`, borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: "#fff1f2", color: "#b91c1c", fontWeight: 800, cursor: "pointer", textAlign: "center" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" };
const summaryCardStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px", color: colors.muted, fontWeight: 800 };
const cardStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "28px", boxShadow: shadow.soft, marginBottom: "24px" };
const tableHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "18px" };
const tableActionsStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" };
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
const searchRowStyle: CSSProperties = { ...editableRowStyle, alignItems: "start" };
const searchBoxStyle: CSSProperties = { position: "relative", display: "flex", gap: "8px", alignItems: "center" };
const suggestionsStyle: CSSProperties = { position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20, border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, boxShadow: shadow.soft, padding: "6px", display: "flex", flexDirection: "column", gap: "4px" };
const suggestionButtonStyle: CSSProperties = { border: "none", background: "transparent", borderRadius: "10px", padding: "9px 10px", color: colors.text, cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: "3px", fontWeight: 750 };
const suggestionEmptyStyle: CSSProperties = { padding: "10px", color: colors.muted, fontWeight: 700 };
const clearButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "9px 11px", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
const textareaRowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 700 };
const inputStyle: CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", background: colors.inputBackground, color: colors.text, fontWeight: 650, outline: "none" };
const textareaStyle: CSSProperties = { ...inputStyle, resize: "vertical", minHeight: "96px", lineHeight: 1.6 };
const fileRowStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "12px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginTop: "10px" };
const fileInfoStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "baseline", minWidth: 0 };
const fileActionsStyle: CSSProperties = { display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 };
const uploadRowStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", marginBottom: "10px" };
const auditBoxStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "13px 14px", color: colors.text, fontWeight: 750, lineHeight: 1.55 };
const auditMetaStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px", color: colors.muted, fontSize: "13px", fontWeight: 700 };
