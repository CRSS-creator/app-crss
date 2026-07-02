
"use client";

import { useEffect, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import {
  createClient as createClientRecord,
  fetchClientCaregivers,
  fetchClients,
  updateClient,
} from "@/lib/clientService";
import {
  createClientDocumentSignedUrl,
  deleteClientDocument,
  fetchClientDocuments,
  type ClientDocument,
  uploadClientDocument,
} from "@/lib/clientDocumentsService";
import { colors, radius, shadow } from "@/app/design";
import {
  canEditClientAdministrative,
  canManageClients as canManageClientsPermission,
  type UserRole,
} from "@/lib/permissions";
import { X } from "lucide-react";


type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole | null;
};

type ClientCaregiver = {
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type Client = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  telefon: string | null;
  email: string | null;
  osoba_kontaktowa: string | null;
  forma_prawna: string | null;
  forma_opodatkowania: string | null;
  obsluga_kadrowa: boolean | null;
  status_klienta: string | null;
  abonament: number | null;
  model_fakturowania: string | null;
  czynny_vat: boolean | null;
  vat_ue: boolean | null;
  schemat_zus: string | null;
  limit_dokumentow: number | null;
  koszt_dodatkowego_dokumentu: number | null;
  pierwszy_okres_rozliczeniowy: string | null;
  ostatni_okres_rozliczeniowy: string | null;
  koszt_obslugi_pracownika: number | null;
  koszt_obslugi_zleceniobiorcy: number | null;
  dodatkowe_uslugi: string | null;
  notatki: string | null;
  opiekun_id: string | null;
  profiles?: ClientCaregiver | ClientCaregiver[] | null;
};

type ClientDraft = {
  nazwa: string;
  nip: string;
  telefon: string;
  email: string;
  osoba_kontaktowa: string;
  forma_prawna: string;
  forma_opodatkowania: string;
  obsluga_kadrowa: boolean;
  status_klienta: string;
  abonament: string;
  model_fakturowania: string;
  opiekun_id: string;
  czynny_vat: boolean;
  vat_ue: boolean;
  schemat_zus: string;
  limit_dokumentow: string;
  koszt_dodatkowego_dokumentu: string;
  pierwszy_okres_rozliczeniowy: string;
  ostatni_okres_rozliczeniowy: string;
  koszt_obslugi_pracownika: string;
  koszt_obslugi_zleceniobiorcy: string;
  dodatkowe_uslugi: string;
  notatki: string;
};

const CLIENT_STATUSES = [
  "Aktywny",
  "Onboarding",
  "Zawieszony",
  "Do zamknięcia",
  "Archiwalny",
];

const CLIENT_STATUS_OPTIONS = CLIENT_STATUSES.map((status) => ({
  value: status,
  label: status,
}));

const LEGAL_FORM_OPTIONS = [
  { value: "", label: "Wybierz" },
  { value: "JDG", label: "JDG" },
  { value: "sp. z o.o.", label: "sp. z o.o." },
  { value: "prosta spółka akcyjna", label: "prosta spółka akcyjna" },
  { value: "organizacja", label: "organizacja" },
];

const TAXATION_FORM_OPTIONS = [
  { value: "", label: "Wybierz" },
  { value: "Skala podatkowa", label: "Skala podatkowa" },
  { value: "Podatek liniowy", label: "Podatek liniowy" },
  { value: "Ryczałt", label: "Ryczałt" },
  { value: "CIT", label: "CIT" },
];

const EMPTY_FILTER = "Wszystkie";
const STATUS_FILTER_OPTIONS = [{ value: EMPTY_FILTER, label: "Status" }, ...CLIENT_STATUS_OPTIONS];
const LEGAL_FORM_FILTER_OPTIONS = [
  { value: EMPTY_FILTER, label: "Forma prawna" },
  ...LEGAL_FORM_OPTIONS.filter((option) => option.value),
];
const TAXATION_FORM_FILTER_OPTIONS = [
  { value: EMPTY_FILTER, label: "Opodatkowanie" },
  ...TAXATION_FORM_OPTIONS.filter((option) => option.value),
];
const PAYROLL_FILTER_OPTIONS = [
  { value: EMPTY_FILTER, label: "Kadry" },
  { value: "Tak", label: "Tak" },
  { value: "Nie", label: "Nie" },
];

const BILLING_MODEL_OPTIONS = [
  { value: "z_dolu", label: "Z dołu" },
  { value: "z_gory", label: "Z góry" },
];

function formatClientsCount(count: number) {
  if (count === 1) return "1 klient";

  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14)) {
    return `${count} klientów`;
  }

  return `${count} klientów`;
}

function sortClientsByName(first: Client, second: Client) {
  return (first.nazwa || "").localeCompare(second.nazwa || "", "pl", {
    sensitivity: "base",
    numeric: true,
  });
}

function getClientCaregiver(client: Client) {
  return Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
}

function getClientCaregiverName(client: Client) {
  const caregiver = getClientCaregiver(client);
  return caregiver?.full_name || caregiver?.email || "Brak opiekuna";
}

export default function ClientsPage() {
  return (
    <AppLayout activePage="klienci">
      <AccessGuard moduleName="klienci">
        {(currentRole) => <ClientsContent currentRole={currentRole} />}
      </AccessGuard>
    </AppLayout>
  );
}

function ClientsContent({ currentRole }: { currentRole: UserRole | null }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [opiekunowie, setOpiekunowie] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const [statusFilter, setStatusFilter] = useState(EMPTY_FILTER);
  const [opiekunFilter, setOpiekunFilter] = useState(EMPTY_FILTER);
  const [formaPrawnaFilter, setFormaPrawnaFilter] = useState(EMPTY_FILTER);
  const [opodatkowanieFilter, setOpodatkowanieFilter] = useState(EMPTY_FILTER);
  const [kadryFilter, setKadryFilter] = useState(EMPTY_FILTER);
  const [searchQuery, setSearchQuery] = useState("");

  const canManageClients = canManageClientsPermission(currentRole);
  const hasActiveFilters =
    searchQuery.trim() ||
    statusFilter !== EMPTY_FILTER ||
    opiekunFilter !== EMPTY_FILTER ||
    formaPrawnaFilter !== EMPTY_FILTER ||
    opodatkowanieFilter !== EMPTY_FILTER ||
    kadryFilter !== EMPTY_FILTER;

const filteredClients = [...clients].filter((client) => {
  const opiekunName = getClientCaregiverName(client);

  const matchesStatus =
    statusFilter === EMPTY_FILTER || client.status_klienta === statusFilter;

  const matchesOpiekun =
    opiekunFilter === EMPTY_FILTER || opiekunName === opiekunFilter;

  const matchesFormaPrawna =
    formaPrawnaFilter === EMPTY_FILTER ||
    client.forma_prawna === formaPrawnaFilter;

  const matchesOpodatkowanie =
    opodatkowanieFilter === EMPTY_FILTER ||
    client.forma_opodatkowania === opodatkowanieFilter;

  const matchesKadry =
    kadryFilter === EMPTY_FILTER ||
    (kadryFilter === "Tak" && client.obsluga_kadrowa) ||
    (kadryFilter === "Nie" && !client.obsluga_kadrowa);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchableText = [
    client.nazwa,
    client.nip,
    client.telefon,
    client.email,
    client.osoba_kontaktowa,
    client.forma_prawna,
    client.forma_opodatkowania,
    client.status_klienta,
    opiekunName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matchesSearch =
    !normalizedSearch || searchableText.includes(normalizedSearch);

  return (
    matchesSearch &&
    matchesStatus &&
    matchesOpiekun &&
    matchesFormaPrawna &&
    matchesOpodatkowanie &&
    matchesKadry
  );
}).sort(sortClientsByName);
  
useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    await Promise.all([loadOpiekunowie(), loadClients()]);
    setLoading(false);
  }

  async function loadOpiekunowie() {
    const { data, error } = await fetchClientCaregivers();

    if (error) {
      console.error("Błąd pobierania opiekunów:", error);
      return;
    }

    setOpiekunowie(data || []);
  }

  async function loadClients() {
    const { data, error } = await fetchClients();

    if (error) {
      console.error("Błąd pobierania klientów:", error);
      return;
    }

    setClients(data || []);
  }

  function handleClientSaved(updatedClient: Client) {
    setClients((current) =>
      current.map((client) =>
        client.id === updatedClient.id ? updatedClient : client
      )
    );

    setSelectedClient(updatedClient);
  }
  
  function handleClientCreated(newClient: Client) {
    setClients((current) => [...current, newClient]);
    setCreatingClient(false);
  }

  function clearClientFilters() {
    setSearchQuery("");
    setStatusFilter(EMPTY_FILTER);
    setOpiekunFilter(EMPTY_FILTER);
    setFormaPrawnaFilter(EMPTY_FILTER);
    setOpodatkowanieFilter(EMPTY_FILTER);
    setKadryFilter(EMPTY_FILTER);
  }
  
return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł operacyjny</p>
          <h1 style={titleStyle}>Klienci</h1>
        </div>

{canManageClients && (
  <button
    style={primaryButtonStyle}
    onClick={() => setCreatingClient(true)}
  >
    Dodaj klienta
  </button>
)}        
      </section>

      <section style={cardStyle}>
        <div style={tableHeaderStyle}>
          <h2 style={sectionTitleStyle}>Baza klientów</h2>
          <span style={counterStyle}>
            {loading ? "Ładowanie..." : formatClientsCount(filteredClients.length)}
          </span>
        </div>

<div style={searchRowStyle}>
  <input
    type="search"
    style={searchInputStyle}
    placeholder="Szukaj po nazwie, NIP, emailu, telefonie lub opiekunie"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
  />

  {searchQuery && (
    <button
      type="button"
      style={clearSearchButtonStyle}
      onClick={() => setSearchQuery("")}
    >
      Wyczyść
    </button>
  )}
</div>

<div style={compactFiltersRowStyle}>
  <span style={filtersLabelStyle}>Filtry:</span>

  <AppSelect style={compactFilterStyle} value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} />

  <AppSelect
    style={compactFilterStyle}
    value={opiekunFilter}
    options={[
      { value: EMPTY_FILTER, label: "Opiekun" },
      ...opiekunowie.map((opiekun) => {
        const label = opiekun.full_name || opiekun.email || "Brak opiekuna";
        return { value: label, label };
      }),
    ]}
    onChange={setOpiekunFilter}
  />

  <AppSelect style={compactFilterStyle} value={formaPrawnaFilter} options={LEGAL_FORM_FILTER_OPTIONS} onChange={setFormaPrawnaFilter} />

  <AppSelect style={compactFilterStyle} value={opodatkowanieFilter} options={TAXATION_FORM_FILTER_OPTIONS} onChange={setOpodatkowanieFilter} />

  <AppSelect style={compactFilterStyle} value={kadryFilter} options={PAYROLL_FILTER_OPTIONS} onChange={setKadryFilter} />
</div>

        {loading ? (
          <div style={emptyStateStyle}>Ładowanie danych...</div>
        ) : clients.length === 0 ? (
          <div style={emptyStateStyle}>Brak klientów do wyświetlenia</div>
        ) : filteredClients.length === 0 ? (
          <div style={emptyStateStyle}>
            <p style={emptyStateTitleStyle}>Brak klientów pasujących do wyszukiwania lub filtrów</p>
            {hasActiveFilters && (
              <button
                type="button"
                style={emptyStateActionStyle}
                onClick={clearClientFilters}
              >
                Wyczyść wyszukiwanie i filtry
              </button>
            )}
          </div>
        ) : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th width="32%">Klient</Th>
                  <Th width="12%">NIP</Th>
                  <Th width="9%">Forma prawna</Th>
                  <Th width="9%">Opodatkowanie</Th>
                  <Th width="16%">Opiekun</Th>
                  <Th width="7%">Kadry</Th>
                  <Th width="8%">Status</Th>
                  <Th width="7%">Akcje</Th>
                </tr>
              </thead>

              <tbody>
                {filteredClients.map((client) => (
                  <tr key={client.id} style={rowStyle}>
                    <Td strong>{client.nazwa || "—"}</Td>
                    <Td>{client.nip || "—"}</Td>
                    <Td>{client.forma_prawna || "—"}</Td>
                    <Td>{client.forma_opodatkowania || "—"}</Td>
                    <Td>
                      {getClientCaregiverName(client)}
                    </Td>
                    <Td>
                      <Badge variant={client.obsluga_kadrowa ? "yes" : "no"}>
                        {client.obsluga_kadrowa ? "Tak" : "Nie"}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge variant="status">
                        {client.status_klienta || "Brak"}
                      </Badge>
                    </Td>
                    <Td>
                      <button
                        style={secondaryButtonStyle}
                        onClick={() => setSelectedClient(client)}
                      >
                        Szczegóły
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedClient && (
        <ClientDrawer
          client={selectedClient}
          role={currentRole}
          opiekunowie={opiekunowie}
          onClose={() => setSelectedClient(null)}
          onSaved={handleClientSaved}
        />
      )}
 
      {creatingClient && (
        <CreateClientDrawer
          opiekunowie={opiekunowie}
          onClose={() => setCreatingClient(false)}
          onCreated={handleClientCreated}
         /> 
       )}   
</>
  );
}

function ClientDrawer({
  client,
  role,
  opiekunowie,
  onClose,
  onSaved,
}: {
  client: Client;
  role: UserRole | null;
  opiekunowie: Profile[];
  onClose: () => void;
  onSaved: (client: Client) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [draft, setDraft] = useState<ClientDraft>(() => createDraft(client));

  const canEditAdministrative = canEditClientAdministrative(role);
  const isDraftJdg = isJdgLegalForm(draft.forma_prawna);
  const isClientJdg = isJdgLegalForm(client.forma_prawna || "");

  useEffect(() => {
    setDraft(createDraft(client));
    setEditing(false);
    loadDocuments();
  }, [client.id]);

  function updateDraft<K extends keyof ClientDraft>(
    key: K,
    value: ClientDraft[K]
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function loadDocuments() {
    setDocumentsLoading(true);

    const { data, error } = await fetchClientDocuments(client.id);

    if (error) {
      console.error("Błąd pobierania dokumentów klienta:", error);
      setDocumentsLoading(false);
      return;
    }

    setDocuments(data || []);
    setDocumentsLoading(false);
  }

  async function handleDocumentUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploadingDocument(true);

    for (const file of Array.from(files)) {
      const { data, error } = await uploadClientDocument(client.id, file);

      if (error) {
        console.error("Błąd dodawania dokumentu klienta:", error);
        alert(`Nie udało się dodać pliku: ${file.name}`);
        continue;
      }

      if (data) {
        setDocuments((current) => [data, ...current]);
      }
    }

    setUploadingDocument(false);
  }

  async function openDocument(document: ClientDocument) {
    const { data, error } = await createClientDocumentSignedUrl(document.sciezka);

    if (error || !data?.signedUrl) {
      console.error("Błąd otwierania dokumentu klienta:", error);
      alert("Nie udało się otworzyć dokumentu.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removeDocument(document: ClientDocument) {
    const confirmed = window.confirm(`Usunąć dokument "${document.nazwa}"?`);
    if (!confirmed) return;

    const { error } = await deleteClientDocument(document);

    if (error) {
      console.error("Błąd usuwania dokumentu klienta:", error);
      alert("Nie udało się usunąć dokumentu.");
      return;
    }

    setDocuments((current) => current.filter((item) => item.id !== document.id));
  }

  function formatDocumentSize(size: number | null) {
    if (!size) return "—";

    if (size < 1024 * 1024) {
      return `${Math.max(1, Math.round(size / 1024))} KB`;
    }

    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function cancelEditing() {
    setDraft(createDraft(client));
    setEditing(false);
  }

  async function saveChanges() {
    setSaving(true);

    const operationalPayload = {
      telefon: draft.telefon.trim() || null,
      email: draft.email.trim() || null,
      osoba_kontaktowa: draft.osoba_kontaktowa.trim() || null,
      czynny_vat: draft.czynny_vat,
      vat_ue: draft.vat_ue,
      schemat_zus: isDraftJdg ? draft.schemat_zus.trim() || null : null,
      limit_dokumentow: draft.limit_dokumentow
        ? Number(draft.limit_dokumentow)
        : null,
      dodatkowe_uslugi: draft.dodatkowe_uslugi.trim() || null,
      notatki: draft.notatki.trim() || null,
    };

    const administrativePayload = canEditAdministrative
      ? {
          nazwa: draft.nazwa.trim() || null,
          nip: draft.nip.trim() || null,
          forma_prawna: draft.forma_prawna.trim() || null,
          forma_opodatkowania: draft.forma_opodatkowania.trim() || null,
          obsluga_kadrowa: draft.obsluga_kadrowa,
          status_klienta: draft.status_klienta.trim() || null,
          abonament: draft.abonament ? Number(draft.abonament) : null,
          model_fakturowania: draft.model_fakturowania || "z_dolu",
          pierwszy_okres_rozliczeniowy: normalizeMonthInput(
            draft.pierwszy_okres_rozliczeniowy
          ),
          ostatni_okres_rozliczeniowy: normalizeMonthInput(
            draft.ostatni_okres_rozliczeniowy
          ),
          koszt_obslugi_pracownika: draft.koszt_obslugi_pracownika
            ? Number(draft.koszt_obslugi_pracownika)
            : null,
          koszt_obslugi_zleceniobiorcy: draft.koszt_obslugi_zleceniobiorcy
            ? Number(draft.koszt_obslugi_zleceniobiorcy)
            : null,
          koszt_dodatkowego_dokumentu: draft.koszt_dodatkowego_dokumentu
            ? Number(draft.koszt_dodatkowego_dokumentu)
            : null,
          opiekun_id: draft.opiekun_id || null,
        }
      : {};

    const payload = {
      ...operationalPayload,
      ...administrativePayload,
    };

    const { data, error } = await updateClient(client.id, payload);

    if (error) {
      console.error("Błąd zapisu klienta:", error);
      alert("Nie udało się zapisać zmian.");
      setSaving(false);
      return;
    }

    const updatedClient = data as Client;

    onSaved(updatedClient);
    setEditing(false);
    setSaving(false);
  }

  return (
    <div style={drawerOverlayStyle} onClick={onClose}>
      <aside style={drawerStyle} onClick={(event) => event.stopPropagation()}>
        <div style={drawerHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Szczegóły klienta</p>
            <h2 style={drawerTitleStyle}>{client.nazwa || "Brak nazwy"}</h2>
            <p style={drawerSubtitleStyle}>NIP: {client.nip || "—"}</p>
          </div>

          <button style={closeButtonStyle} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={drawerActionsStyle}>
          {editing ? (
            <>
              <button style={secondaryButtonStyle} onClick={cancelEditing}>
                Anuluj
              </button>
              <button
                style={primarySmallButtonStyle}
                onClick={saveChanges}
                disabled={saving}
              >
                {saving ? "Zapisywanie..." : "Zapisz zmiany"}
              </button>
            </>
          ) : (
            <button style={primarySmallButtonStyle} onClick={() => setEditing(true)}>
              Edytuj dane
            </button>
          )}
        </div>

        <div style={drawerContentStyle}>
          <InfoSection title="Informacje podstawowe">
            {editing && canEditAdministrative ? (
              <>
                <EditableInput
                  label="Nazwa"
                  value={draft.nazwa}
                  onChange={(value) => updateDraft("nazwa", value)}
                />
                <EditableInput
                  label="NIP"
                  value={draft.nip}
                  onChange={(value) => updateDraft("nip", value)}
                />
              </>
            ) : (
              <>
                <InfoRow label="Nazwa" value={client.nazwa} />
                <InfoRow label="NIP" value={client.nip} />
              </>
            )}

            {editing ? (
              <>
                <EditableInput
                  label="Telefon"
                  value={draft.telefon}
                  onChange={(value) => updateDraft("telefon", value)}
                />
                <EditableInput
                  label="Email"
                  type="email"
                  value={draft.email}
                  onChange={(value) => updateDraft("email", value)}
                />
                <EditableInput
                  label="Osoba kontaktowa"
                  value={draft.osoba_kontaktowa}
                  onChange={(value) => updateDraft("osoba_kontaktowa", value)}
                />
              </>
            ) : (
              <>
                <InfoRow label="Telefon" value={client.telefon} />
                <InfoRow label="Email" value={client.email} />
                <InfoRow label="Osoba kontaktowa" value={client.osoba_kontaktowa} />
              </>
            )}

            {editing && canEditAdministrative ? (
              <>
                <EditableSelect
                  label="Opiekun"
                  value={draft.opiekun_id}
                  onChange={(value) => updateDraft("opiekun_id", value)}
                  options={[
                    { value: "", label: "Brak opiekuna" },
                    ...opiekunowie.map((opiekun) => ({
                      value: opiekun.id,
                      label:
                        opiekun.full_name ||
                        opiekun.email ||
                        "Użytkownik bez nazwy",
                    })),
                  ]}
                />
                <EditableSelect
                  label="Status"
                  value={draft.status_klienta}
                  onChange={(value) => updateDraft("status_klienta", value)}
                  options={CLIENT_STATUS_OPTIONS}
                />
              </>
            ) : (
              <>
                <InfoRow
                  label="Opiekun"
                  value={getClientCaregiverName(client)}
                />
                <InfoRow label="Status" value={client.status_klienta} />
              </>
            )}
          </InfoSection>

          <InfoSection title="Podatki i ZUS">
            {editing && canEditAdministrative ? (
              <>
                <EditableSelect
                  label="Forma prawna"
                  value={draft.forma_prawna}
                  onChange={(value) => {
                    updateDraft("forma_prawna", value);
                    if (!isJdgLegalForm(value)) updateDraft("schemat_zus", "");
                  }}
                  options={LEGAL_FORM_OPTIONS}
                />
                <EditableSelect
                  label="Forma opodatkowania"
                  value={draft.forma_opodatkowania}
                  onChange={(value) =>
                    updateDraft("forma_opodatkowania", value)
                  }
                  options={TAXATION_FORM_OPTIONS}
                />
              </>
            ) : (
              <>
                <InfoRow label="Forma prawna" value={client.forma_prawna} />
                <InfoRow
                  label="Forma opodatkowania"
                  value={client.forma_opodatkowania}
                />
              </>
            )}

            {editing ? (
              <>
                <EditableCheckbox
                  label="Czynny VAT"
                  checked={draft.czynny_vat}
                  onChange={(value) => updateDraft("czynny_vat", value)}
                />
                <EditableCheckbox
                  label="VAT UE"
                  checked={draft.vat_ue}
                  onChange={(value) => updateDraft("vat_ue", value)}
                />
                {isDraftJdg && (
                  <EditableSelect
                    label="Schemat ZUS"
                    value={draft.schemat_zus}
                    onChange={(value) => updateDraft("schemat_zus", value)}
                    options={[
                      { value: "", label: "Wybierz" },
                      { value: "Duży ZUS", label: "Duży ZUS" },
                      { value: "Preferencyjny ZUS", label: "Preferencyjny ZUS" },
                      { value: "Mały ZUS Plus", label: "Mały ZUS Plus" },
                      { value: "Ulga na start", label: "Ulga na start" },
                      { value: "Brak ZUS", label: "Brak ZUS" },
                      { value: "Inny", label: "Inny" },
                    ]}
                  />
                )}
              </>
            ) : (
              <>
                <InfoRow
                  label="Czynny VAT"
                  value={client.czynny_vat ? "Tak" : "Nie"}
                />
                <InfoRow label="VAT UE" value={client.vat_ue ? "Tak" : "Nie"} />
                {isClientJdg && <InfoRow label="Schemat ZUS" value={client.schemat_zus} />}
              </>
            )}

            {editing && canEditAdministrative ? (
              <EditableCheckbox
                label="Obsługa kadrowa"
                checked={draft.obsluga_kadrowa}
                onChange={(value) => updateDraft("obsluga_kadrowa", value)}
              />
            ) : (
              <InfoRow
                label="Obsługa kadrowa"
                value={client.obsluga_kadrowa ? "Tak" : "Nie"}
              />
            )}
          </InfoSection>

          <InfoSection title="Abonament i limity">
            {editing && canEditAdministrative ? (
              <>
                <EditableInput
                  label="Abonament"
                  type="number"
                  value={draft.abonament}
                  onChange={(value) => updateDraft("abonament", value)}
                />
                <EditableSelect
                  label="Schemat płatności faktury"
                  value={draft.model_fakturowania}
                  onChange={(value) => updateDraft("model_fakturowania", value)}
                  options={BILLING_MODEL_OPTIONS}
                />
                <EditableInput
                  label="Pierwszy okres rozliczeniowy"
                  type="month"
                  value={draft.pierwszy_okres_rozliczeniowy}
                  onChange={(value) =>
                    updateDraft("pierwszy_okres_rozliczeniowy", value)
                  }
                />
                <EditableInput
                  label="Ostatni okres rozliczeniowy"
                  type="month"
                  value={draft.ostatni_okres_rozliczeniowy}
                  onChange={(value) =>
                    updateDraft("ostatni_okres_rozliczeniowy", value)
                  }
                />
                <EditableInput
                  label="Koszt obsługi pracownika"
                  type="number"
                  value={draft.koszt_obslugi_pracownika}
                  onChange={(value) =>
                    updateDraft("koszt_obslugi_pracownika", value)
                  }
                />
                <EditableInput
                  label="Koszt obsługi zleceniobiorcy"
                  type="number"
                  value={draft.koszt_obslugi_zleceniobiorcy}
                  onChange={(value) =>
                    updateDraft("koszt_obslugi_zleceniobiorcy", value)
                  }
                />
                <EditableInput
                  label="Koszt dodatkowego dokumentu"
                  type="number"
                  value={draft.koszt_dodatkowego_dokumentu}
                  onChange={(value) =>
                    updateDraft("koszt_dodatkowego_dokumentu", value)
                  }
                />
              </>
            ) : (
              <>
                <InfoRow
                  label="Abonament"
                  value={
                    client.abonament !== null
                      ? `${client.abonament.toLocaleString("pl-PL")} zł`
                    : null
                  }
                />
                <InfoRow
                  label="Schemat płatności faktury"
                  value={billingModelLabel(client.model_fakturowania)}
                />
                <InfoRow
                  label="Pierwszy okres rozliczeniowy"
                  value={formatSettlementPeriod(
                    client.pierwszy_okres_rozliczeniowy
                  )}
                />
                <InfoRow
                  label="Ostatni okres rozliczeniowy"
                  value={formatSettlementPeriod(
                    client.ostatni_okres_rozliczeniowy
                  )}
                />
                <InfoRow
                  label="Koszt obsługi pracownika"
                  value={formatMoney(client.koszt_obslugi_pracownika)}
                />
                <InfoRow
                  label="Koszt obsługi zleceniobiorcy"
                  value={formatMoney(client.koszt_obslugi_zleceniobiorcy)}
                />
                <InfoRow
                  label="Koszt dodatkowego dokumentu"
                  value={formatMoney(client.koszt_dodatkowego_dokumentu)}
                />
              </>
            )}

            {editing ? (
              <>
                <EditableInput
                  label="Limit dokumentów"
                  type="number"
                  value={draft.limit_dokumentow}
                  onChange={(value) => updateDraft("limit_dokumentow", value)}
                />
                <EditableTextarea
                  label="Dodatkowe usługi"
                  value={draft.dodatkowe_uslugi}
                  onChange={(value) => updateDraft("dodatkowe_uslugi", value)}
                />
              </>
            ) : (
              <>
                <InfoRow
                  label="Limit dokumentów"
                  value={
                    client.limit_dokumentow !== null
                      ? `${client.limit_dokumentow} dokumentów`
                      : null
                  }
                />
                <InfoRow
                  label="Dodatkowe usługi"
                  value={client.dodatkowe_uslugi}
                />
              </>
            )}
          </InfoSection>

          <InfoSection title="Notatki">
            {editing ? (
              <EditableTextarea
                label="Notatki wewnętrzne"
                value={draft.notatki}
                onChange={(value) => updateDraft("notatki", value)}
              />
            ) : (
              <p style={notesStyle}>{client.notatki || "Brak notatek."}</p>
            )}
          </InfoSection>

          <InfoSection title="Dokumenty klienta">
            <div
              style={documentsPlaceholderStyle}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleDocumentUpload(event.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(event) => {
                  handleDocumentUpload(event.target.files);
                  event.target.value = "";
                }}
              />

              <p style={documentsTitleStyle}>
                Dodaj umowy, pełnomocnictwa, dokumenty rejestrowe albo inne pliki klienta.
              </p>

              <button
                type="button"
                style={secondaryButtonStyle}
                disabled={uploadingDocument}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingDocument ? "Dodawanie..." : "Dodaj dokument"}
              </button>
            </div>

            {documentsLoading ? (
              <div style={documentsEmptyStyle}>Ładowanie dokumentów...</div>
            ) : documents.length === 0 ? (
              <div style={documentsEmptyStyle}>Brak dokumentów dla tego klienta.</div>
            ) : (
              <div style={documentsListStyle}>
                {documents.map((document) => (
                  <div key={document.id} style={documentsItemStyle}>
                    <div>
                      <div style={documentsNameStyle}>{document.nazwa}</div>
                      <div style={documentsMetaStyle}>
                        {formatDocumentSize(document.rozmiar)}
                      </div>
                    </div>

                    <div style={documentsActionsStyle}>
                      <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={() => openDocument(document)}
                      >
                        Otwórz
                      </button>
                      <button
                        type="button"
                        style={documentDeleteButtonStyle}
                        onClick={() => removeDocument(document)}
                      >
                        Usuń
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </InfoSection>

        </div>
      </aside>
    </div>
  );
}

function CreateClientDrawer({
  opiekunowie,
  onClose,
  onCreated,
}: {
  opiekunowie: Profile[];
  onClose: () => void;
  onCreated: (client: Client) => void;
}) {
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<ClientDraft>({
    nazwa: "",
    nip: "",
    telefon: "",
    email: "",
    osoba_kontaktowa: "",
    forma_prawna: "",
    forma_opodatkowania: "",
    obsluga_kadrowa: false,
    status_klienta: "Aktywny",
    abonament: "",
    model_fakturowania: "z_dolu",
    opiekun_id: "",
    czynny_vat: false,
    vat_ue: false,
    schemat_zus: "",
    limit_dokumentow: "",
    koszt_dodatkowego_dokumentu: "",
    pierwszy_okres_rozliczeniowy: "",
    ostatni_okres_rozliczeniowy: "",
    koszt_obslugi_pracownika: "",
    koszt_obslugi_zleceniobiorcy: "",
    dodatkowe_uslugi: "",
    notatki: "",
  });

  const isJdg =
    draft.forma_prawna.toLowerCase().includes("jdg") ||
    draft.forma_prawna.toLowerCase().includes("jednoosob");

  function updateDraft<K extends keyof ClientDraft>(
    key: K,
    value: ClientDraft[K]
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function createClient() {
    if (!draft.nazwa.trim() || !draft.nip.trim()) {
      alert("Nazwa i NIP są wymagane.");
      return;
    }

    setSaving(true);

    const payload = {
      nazwa: draft.nazwa.trim(),
      nip: draft.nip.trim(),
      telefon: draft.telefon.trim() || null,
      email: draft.email.trim() || null,
      osoba_kontaktowa: draft.osoba_kontaktowa.trim() || null,
      forma_prawna: draft.forma_prawna.trim() || null,
      forma_opodatkowania: draft.forma_opodatkowania.trim() || null,
      obsluga_kadrowa: draft.obsluga_kadrowa,
      status_klienta: draft.status_klienta.trim() || "Aktywny",
      abonament: draft.abonament ? Number(draft.abonament) : null,
      model_fakturowania: draft.model_fakturowania || "z_dolu",
      pierwszy_okres_rozliczeniowy: normalizeMonthInput(
        draft.pierwszy_okres_rozliczeniowy
      ),
      ostatni_okres_rozliczeniowy: normalizeMonthInput(
        draft.ostatni_okres_rozliczeniowy
      ),
      koszt_obslugi_pracownika: draft.koszt_obslugi_pracownika
        ? Number(draft.koszt_obslugi_pracownika)
        : null,
      koszt_obslugi_zleceniobiorcy: draft.koszt_obslugi_zleceniobiorcy
        ? Number(draft.koszt_obslugi_zleceniobiorcy)
        : null,
      koszt_dodatkowego_dokumentu: draft.koszt_dodatkowego_dokumentu
        ? Number(draft.koszt_dodatkowego_dokumentu)
        : null,
      opiekun_id: draft.opiekun_id || null,
      czynny_vat: draft.czynny_vat,
      vat_ue: draft.vat_ue,
      schemat_zus: isJdg ? draft.schemat_zus.trim() || null : null,
      limit_dokumentow: draft.limit_dokumentow
        ? Number(draft.limit_dokumentow)
        : null,
      dodatkowe_uslugi: draft.dodatkowe_uslugi.trim() || null,
      notatki: draft.notatki.trim() || null,
    };

    const { data, error } = await createClientRecord(payload);

    if (error) {
      console.error("Błąd dodawania klienta:", error);
      alert("Nie udało się dodać klienta.");
      setSaving(false);
      return;
    }

    const selectedOpiekun = opiekunowie.find(
      (opiekun) => opiekun.id === payload.opiekun_id
    );

    onCreated({
      ...data,
      profiles: selectedOpiekun
        ? [
            {
              full_name: selectedOpiekun.full_name,
              email: selectedOpiekun.email,
              role: selectedOpiekun.role,
            },
          ]
        : null,
    });

    setSaving(false);
  }

  return (
    <div style={drawerOverlayStyle} onClick={onClose}>
      <aside style={drawerStyle} onClick={(event) => event.stopPropagation()}>
        <div style={drawerHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Nowy klient</p>
            <h2 style={drawerTitleStyle}>Dodaj klienta</h2>
          </div>

          <button style={closeButtonStyle} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={drawerActionsStyle}>
          <button style={secondaryButtonStyle} onClick={onClose}>
            Anuluj
          </button>

          <button
            style={primarySmallButtonStyle}
            onClick={createClient}
            disabled={saving}
          >
            {saving ? "Zapisywanie..." : "Dodaj klienta"}
          </button>
        </div>

        <div style={drawerContentStyle}>
          <InfoSection title="Informacje podstawowe">
            <EditableInput
              label="Nazwa"
              value={draft.nazwa}
              onChange={(v) => updateDraft("nazwa", v)}
            />

            <EditableInput
              label="NIP"
              value={draft.nip}
              onChange={(v) => updateDraft("nip", v)}
            />

            <EditableInput
              label="Telefon"
              value={draft.telefon}
              onChange={(v) => updateDraft("telefon", v)}
            />

            <EditableInput
              label="Email"
              type="email"
              value={draft.email}
              onChange={(v) => updateDraft("email", v)}
            />

            <EditableInput
              label="Osoba kontaktowa"
              value={draft.osoba_kontaktowa}
              onChange={(v) => updateDraft("osoba_kontaktowa", v)}
            />
          </InfoSection>
<InfoSection title="Organizacja">
  <EditableSelect
    label="Opiekun"
    value={draft.opiekun_id}
    onChange={(v) => updateDraft("opiekun_id", v)}
    options={[
      { value: "", label: "Brak opiekuna" },
      ...opiekunowie.map((opiekun) => ({
        value: opiekun.id,
        label: opiekun.full_name || opiekun.email || "Użytkownik",
      })),
    ]}
  />

  <EditableInput
    label="Status"
    value={draft.status_klienta}
    onChange={(v) => updateDraft("status_klienta", v)}
  />
</InfoSection>

<InfoSection title="Podatki i ZUS">
  <EditableSelect
    label="Forma prawna"
    value={draft.forma_prawna}
    onChange={(v) => {
      updateDraft("forma_prawna", v);
      if (
        !v.toLowerCase().includes("jdg") &&
        !v.toLowerCase().includes("jednoosob")
      ) {
        updateDraft("schemat_zus", "");
      }
    }}
    options={[
      { value: "", label: "Wybierz" },
      { value: "JDG", label: "JDG" },
      { value: "sp. z o.o.", label: "sp. z o.o." },
      { value: "prosta spółka akcyjna", label: "prosta spółka akcyjna" },
      { value: "organizacja", label: "organizacja" },
    ]}
  />

  <EditableSelect
    label="Forma opodatkowania"
    value={draft.forma_opodatkowania}
    onChange={(v) => updateDraft("forma_opodatkowania", v)}
    options={[
      { value: "", label: "Wybierz" },
      { value: "Skala podatkowa", label: "Skala podatkowa" },
      { value: "Podatek liniowy", label: "Podatek liniowy" },
      { value: "Ryczałt", label: "Ryczałt" },
      { value: "CIT", label: "CIT" },
    ]}
  />

  <EditableCheckbox
    label="Czynny VAT"
    checked={draft.czynny_vat}
    onChange={(v) => updateDraft("czynny_vat", v)}
  />

  <EditableCheckbox
    label="VAT UE"
    checked={draft.vat_ue}
    onChange={(v) => updateDraft("vat_ue", v)}
  />

  {isJdg && (
    <EditableSelect
      label="Schemat ZUS"
      value={draft.schemat_zus}
      onChange={(v) => updateDraft("schemat_zus", v)}
      options={[
        { value: "", label: "Wybierz" },
        { value: "Duży ZUS", label: "Duży ZUS" },
        { value: "Preferencyjny ZUS", label: "Preferencyjny ZUS" },
        { value: "Mały ZUS Plus", label: "Mały ZUS Plus" },
        { value: "Ulga na start", label: "Ulga na start" },
        { value: "Brak ZUS", label: "Brak ZUS" },
        { value: "Inny", label: "Inny" },
      ]}
    />
  )}

  <EditableCheckbox
    label="Obsługa kadrowa"
    checked={draft.obsluga_kadrowa}
    onChange={(v) => updateDraft("obsluga_kadrowa", v)}
  />
</InfoSection>

<InfoSection title="Abonament i limity">
  <EditableInput
    label="Abonament"
    type="number"
    value={draft.abonament}
    onChange={(v) => updateDraft("abonament", v)}
  />

  <EditableSelect
    label="Schemat płatności faktury"
    value={draft.model_fakturowania}
    onChange={(v) => updateDraft("model_fakturowania", v)}
    options={BILLING_MODEL_OPTIONS}
  />

  <EditableInput
    label="Pierwszy okres rozliczeniowy"
    type="month"
    value={draft.pierwszy_okres_rozliczeniowy}
    onChange={(v) => updateDraft("pierwszy_okres_rozliczeniowy", v)}
  />

  <EditableInput
    label="Ostatni okres rozliczeniowy"
    type="month"
    value={draft.ostatni_okres_rozliczeniowy}
    onChange={(v) => updateDraft("ostatni_okres_rozliczeniowy", v)}
  />

  <EditableInput
    label="Koszt obsługi pracownika"
    type="number"
    value={draft.koszt_obslugi_pracownika}
    onChange={(v) => updateDraft("koszt_obslugi_pracownika", v)}
  />

  <EditableInput
    label="Koszt obsługi zleceniobiorcy"
    type="number"
    value={draft.koszt_obslugi_zleceniobiorcy}
    onChange={(v) => updateDraft("koszt_obslugi_zleceniobiorcy", v)}
  />

  <EditableInput
    label="Koszt dodatkowego dokumentu"
    type="number"
    value={draft.koszt_dodatkowego_dokumentu}
    onChange={(v) => updateDraft("koszt_dodatkowego_dokumentu", v)}
  />

  <EditableInput
    label="Limit dokumentów"
    type="number"
    value={draft.limit_dokumentow}
    onChange={(v) => updateDraft("limit_dokumentow", v)}
  />

  <EditableTextarea
    label="Dodatkowe usługi"
    value={draft.dodatkowe_uslugi}
    onChange={(v) => updateDraft("dodatkowe_uslugi", v)}
  />
</InfoSection>

<InfoSection title="Notatki">
  <EditableTextarea
    label="Notatki wewnętrzne"
    value={draft.notatki}
    onChange={(v) => updateDraft("notatki", v)}
  />
</InfoSection>
        </div>
      </aside>
    </div>
  );
}

function createDraft(client: Client): ClientDraft {
  return {
    nazwa: client.nazwa || "",
    nip: client.nip || "",
    telefon: client.telefon || "",
    email: client.email || "",
    osoba_kontaktowa: client.osoba_kontaktowa || "",
    forma_prawna: client.forma_prawna || "",
    forma_opodatkowania: client.forma_opodatkowania || "",
    obsluga_kadrowa: Boolean(client.obsluga_kadrowa),
    status_klienta: client.status_klienta || "",
    abonament:
      client.abonament !== null && client.abonament !== undefined
        ? String(client.abonament)
        : "",
    model_fakturowania: client.model_fakturowania || "z_dolu",
    opiekun_id: client.opiekun_id || "",
    czynny_vat: Boolean(client.czynny_vat),
    vat_ue: Boolean(client.vat_ue),
    schemat_zus: client.schemat_zus || "",
    limit_dokumentow:
      client.limit_dokumentow !== null && client.limit_dokumentow !== undefined
        ? String(client.limit_dokumentow)
        : "",
    koszt_dodatkowego_dokumentu:
      client.koszt_dodatkowego_dokumentu !== null &&
      client.koszt_dodatkowego_dokumentu !== undefined
        ? String(client.koszt_dodatkowego_dokumentu)
        : "",
    pierwszy_okres_rozliczeniowy: toMonthInputValue(
      client.pierwszy_okres_rozliczeniowy
    ),
    ostatni_okres_rozliczeniowy: toMonthInputValue(
      client.ostatni_okres_rozliczeniowy
    ),
    koszt_obslugi_pracownika:
      client.koszt_obslugi_pracownika !== null &&
      client.koszt_obslugi_pracownika !== undefined
        ? String(client.koszt_obslugi_pracownika)
        : "",
    koszt_obslugi_zleceniobiorcy:
      client.koszt_obslugi_zleceniobiorcy !== null &&
      client.koszt_obslugi_zleceniobiorcy !== undefined
        ? String(client.koszt_obslugi_zleceniobiorcy)
        : "",
    dodatkowe_uslugi: client.dodatkowe_uslugi || "",
    notatki: client.notatki || "",
  };
}

function toMonthInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "";
}

function normalizeMonthInput(value: string) {
  return value ? `${value}-01` : null;
}

function formatSettlementPeriod(value: string | null | undefined) {
  if (!value) return null;

  const [year, month] = value.slice(0, 7).split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });
}

function formatMoney(value: number | null | undefined) {
  return value !== null && value !== undefined
    ? `${value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
    : null;
}

function billingModelLabel(value: string | null | undefined) {
  return (
    BILLING_MODEL_OPTIONS.find((option) => option.value === value)?.label ||
    "Z dołu"
  );
}

function isJdgLegalForm(value: string) {
  const normalized = value.toLowerCase();
  return normalized.includes("jdg") || normalized.includes("jednoosob");
}

function EditableInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "email" | "month";
}) {
  return (
    <div style={editableRowStyle}>
      <label style={infoLabelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

function EditableSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={editableRowStyle}>
      <label style={infoLabelStyle}>{label}</label>
      <AppSelect value={value} onChange={onChange} style={inputStyle} options={options} />
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
    <div style={editableRowStyle}>
      <span style={infoLabelStyle}>{label}</span>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{checked ? "Tak" : "Nie"}</span>
      </label>
    </div>
  );
}

function EditableTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={textareaRowStyle}>
      <label style={infoLabelStyle}>{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={textareaStyle}
        rows={4}
      />
    </div>
  );
}

function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={drawerSectionStyle}>
      <h3 style={drawerSectionTitleStyle}>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div style={infoRowStyle}>
      <span style={infoLabelStyle}>{label}</span>
      <span style={infoValueStyle}>{value || "—"}</span>
    </div>
  );
}

function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return <th style={{ ...thStyle, width }}>{children}</th>;
}

function Td({
  children,
  strong,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>
      {children}
    </td>
  );
}

function Badge({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "yes" | "no" | "status";
}) {
  const style =
    variant === "yes"
      ? badgeSuccessStyle
      : variant === "no"
      ? badgeNeutralStyle
      : badgeStatusStyle;

  return <span style={style}>{children}</span>;
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "24px",
  marginBottom: "32px",
};

const eyebrowStyle: React.CSSProperties = {
  color: colors.red,
  fontWeight: 800,
  margin: "0 0 8px",
};

const titleStyle: React.CSSProperties = {
  fontSize: "42px",
  lineHeight: 1.05,
  margin: 0,
  color: colors.navy,
};

const subtitleStyle: React.CSSProperties = {
  maxWidth: "760px",
  fontSize: "17px",
  lineHeight: 1.7,
  color: colors.muted,
  marginTop: "14px",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: radius.button,
  padding: "16px 22px",
  background: colors.red,
  color: colors.white,
  fontWeight: 800,
  cursor: "pointer",
};

const primarySmallButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: radius.button,
  padding: "11px 15px",
  background: colors.red,
  color: colors.white,
  fontWeight: 800,
  cursor: "pointer",
};

const cardStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "30px",
  boxShadow: shadow.soft,
};

const tableHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "22px",
};

const searchRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "16px",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  padding: "13px 16px",
  background: colors.inputBackground,
  color: colors.text,
  fontSize: "15px",
  fontWeight: 650,
  outline: "none",
};

const clearSearchButtonStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  padding: "12px 14px",
  background: colors.white,
  color: colors.navy,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const compactFiltersRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "22px",
  flexWrap: "wrap",
};

const filtersLabelStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: colors.muted,
};

const compactFilterStyle: React.CSSProperties = {
  width: "180px",
  flex: "0 0 180px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  padding: "10px 14px",
  background: colors.card,
  color: colors.text,
  fontSize: "14px",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: colors.navy,
  fontSize: "24px",
};

const counterStyle: React.CSSProperties = {
  color: colors.muted,
  fontWeight: 700,
};

const tableWrapperStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  color: colors.muted,
  fontSize: "13px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: `1px solid ${colors.border}`,
};

const rowStyle: React.CSSProperties = {
  borderBottom: `1px solid ${colors.border}`,
};

const tdStyle: React.CSSProperties = {
  padding: "18px 16px",
  color: colors.text,
  verticalAlign: "middle",
};

const badgeSuccessStyle: React.CSSProperties = {
  display: "inline-flex",
  borderRadius: radius.badge,
  padding: "7px 12px",
  background: "rgba(22, 163, 74, 0.10)",
  color: colors.success,
  fontWeight: 800,
  fontSize: "13px",
};

const badgeNeutralStyle: React.CSSProperties = {
  display: "inline-flex",
  borderRadius: radius.badge,
  padding: "7px 12px",
  background: "rgba(67, 81, 106, 0.10)",
  color: colors.muted,
  fontWeight: 800,
  fontSize: "13px",
};

const badgeStatusStyle: React.CSSProperties = {
  display: "inline-flex",
  borderRadius: radius.badge,
  padding: "7px 12px",
  background: "rgba(23, 59, 115, 0.10)",
  color: colors.navy,
  fontWeight: 800,
  fontSize: "13px",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  padding: "10px 14px",
  background: colors.white,
  color: colors.navy,
  fontWeight: 800,
  cursor: "pointer",
};

const emptyStateStyle: React.CSSProperties = {
  padding: "28px",
  borderRadius: radius.input,
  background: colors.inputBackground,
  border: `1px dashed ${colors.border}`,
  color: colors.muted,
  textAlign: "center",
};

const emptyStateTitleStyle: React.CSSProperties = {
  margin: "0 0 14px",
  color: colors.muted,
  fontWeight: 750,
};

const emptyStateActionStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  padding: "10px 14px",
  background: colors.white,
  color: colors.navy,
  fontWeight: 800,
  cursor: "pointer",
};

const drawerOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  background: "rgba(15, 23, 42, 0.32)",
  backdropFilter: "blur(3px)",
  display: "flex",
  justifyContent: "flex-end",
};

const drawerStyle: React.CSSProperties = {
  width: "min(960px, calc(100vw - 280px))",
  minWidth: "680px",
  maxWidth: "100%",
  height: "100vh",
  background: colors.card,
  borderLeft: `1px solid ${colors.border}`,
  boxShadow: "-12px 0 30px rgba(15, 23, 42, 0.12)",
  padding: "28px",
  overflowY: "auto",
};

const drawerHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "18px",
  marginBottom: "16px",
};

const drawerActionsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  marginBottom: "24px",
};

const drawerTitleStyle: React.CSSProperties = {
  margin: 0,
  color: colors.navy,
  fontSize: "28px",
  lineHeight: 1.15,
};

const drawerSubtitleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: colors.muted,
  fontWeight: 600,
};

const closeButtonStyle: React.CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "999px",
  border: `1px solid ${colors.border}`,
  background: colors.white,
  color: colors.navy,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const drawerContentStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "18px",
};

const drawerSectionStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "20px",
  background: colors.white,
};

const drawerSectionTitleStyle: React.CSSProperties = {
  margin: "0 0 14px",
  color: colors.navy,
  fontSize: "18px",
};

const infoRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  gap: "18px",
  padding: "11px 0",
  borderBottom: `1px solid ${colors.border}`,
};

const editableRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  gap: "18px",
  alignItems: "center",
  padding: "10px 0",
  borderBottom: `1px solid ${colors.border}`,
};

const textareaRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const infoLabelStyle: React.CSSProperties = {
  color: colors.muted,
  fontWeight: 700,
  fontSize: "14px",
};

const infoValueStyle: React.CSSProperties = {
  color: colors.text,
  fontWeight: 700,
  fontSize: "14px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  padding: "10px 12px",
  background: colors.inputBackground,
  color: colors.text,
  fontWeight: 650,
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: "96px",
  lineHeight: 1.6,
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "9px",
  color: colors.text,
  fontWeight: 750,
};

const notesStyle: React.CSSProperties = {
  margin: 0,
  color: colors.text,
  lineHeight: 1.7,
};

const documentsPlaceholderStyle: React.CSSProperties = {
  border: `1px dashed ${colors.border}`,
  borderRadius: radius.card,
  padding: "22px",
  background: colors.card,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
};

const documentsTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  color: colors.muted,
  lineHeight: 1.6,
};

const documentsEmptyStyle: React.CSSProperties = {
  marginTop: "12px",
  border: `1px dashed ${colors.border}`,
  borderRadius: radius.input,
  padding: "16px",
  color: colors.muted,
  fontWeight: 700,
  textAlign: "center",
};

const documentsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  marginTop: "14px",
};

const documentsItemStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  padding: "12px 14px",
  background: colors.white,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
};

const documentsNameStyle: React.CSSProperties = {
  color: colors.text,
  fontWeight: 800,
  wordBreak: "break-word",
};

const documentsMetaStyle: React.CSSProperties = {
  marginTop: "3px",
  color: colors.muted,
  fontSize: "13px",
  fontWeight: 650,
};

const documentsActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexShrink: 0,
};

const documentDeleteButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: radius.button,
  padding: "10px 14px",
  background: "rgba(220, 38, 38, 0.10)",
  color: colors.danger,
  fontWeight: 800,
  cursor: "pointer",
};
