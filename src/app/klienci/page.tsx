
"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { supabase } from "@/lib/supabaseClient";
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

type Client = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  telefon: string | null;
  email: string | null;
  forma_prawna: string | null;
  forma_opodatkowania: string | null;
  obsluga_kadrowa: boolean | null;
  status_klienta: string | null;
  abonament: number | null;
  czynny_vat: boolean | null;
  vat_ue: boolean | null;
  schemat_zus: string | null;
  limit_dokumentow: number | null;
  dodatkowe_uslugi: string | null;
  notatki: string | null;
  opiekun_id: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
    role: string | null;
  }[] | null;
};

type ClientDraft = {
  nazwa: string;
  nip: string;
  telefon: string;
  email: string;
  forma_prawna: string;
  forma_opodatkowania: string;
  obsluga_kadrowa: boolean;
  status_klienta: string;
  abonament: string;
  opiekun_id: string;
  czynny_vat: boolean;
  vat_ue: boolean;
  schemat_zus: string;
  limit_dokumentow: string;
  dodatkowe_uslugi: string;
  notatki: string;
};

const CLIENT_STATUSES = [
  "Aktywny",
  "W onboarding",
  "Zawieszony",
  "Do zamknięcia",
  "Archiwalny",
];

const EMPTY_FILTER = "Wszystkie";

function formatClientsCount(count: number) {
  if (count === 1) return "1 klient";

  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14)) {
    return `${count} klientów`;
  }

  return `${count} klientów`;
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

const filteredClients = clients.filter((client) => {
  const opiekunName =
    client.profiles?.[0]?.full_name ||
    client.profiles?.[0]?.email ||
    "Brak opiekuna";

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
});
  
useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    await Promise.all([loadOpiekunowie(), loadClients()]);
    setLoading(false);
  }

  async function loadOpiekunowie() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["owner", "manager", "admin", "accountant"])
      .order("full_name", { ascending: true });

    if (error) {
      console.error("Błąd pobierania opiekunów:", error);
      return;
    }

    setOpiekunowie(data || []);
  }

  async function loadClients() {
    const { data, error } = await supabase
      .from("klienci")
      .select(`
        id,
        nazwa,
        nip,
        telefon,
        email,
        forma_prawna,
        forma_opodatkowania,
        obsluga_kadrowa,
        status_klienta,
        abonament,
        czynny_vat,
        vat_ue,
        schemat_zus,
        limit_dokumentow,
        dodatkowe_uslugi,
        notatki,
        opiekun_id,
        profiles!klienci_opiekun_id_fkey (
          full_name,
          email,
          role
        )
      `)
      .order("nazwa", { ascending: true });

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
  
return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł operacyjny</p>
          <h1 style={titleStyle}>Klienci</h1>
          <p style={subtitleStyle}>
            Lista klientów biura wraz z przypisanym opiekunem, formą prawną,
            opodatkowaniem i obsługą kadrową.
          </p>
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

  <select
    style={compactFilterStyle}
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
  >
    <option value={EMPTY_FILTER}>Status</option>

    {CLIENT_STATUSES.map((status) => (
      <option key={status} value={status}>
        {status}
      </option>
    ))}
  </select>

  <select
    style={compactFilterStyle}
    value={opiekunFilter}
    onChange={(e) => setOpiekunFilter(e.target.value)}
  >
    <option value={EMPTY_FILTER}>Opiekun</option>

    {opiekunowie.map((opiekun) => {
      const label =
        opiekun.full_name ||
        opiekun.email ||
        "Brak opiekuna";

      return (
        <option key={opiekun.id} value={label}>
          {label}
        </option>
      );
    })}
  </select>

  <select
    style={compactFilterStyle}
    value={formaPrawnaFilter}
    onChange={(e) => setFormaPrawnaFilter(e.target.value)}
  >
    <option value={EMPTY_FILTER}>Forma prawna</option>
    <option value="JDG">JDG</option>
    <option value="sp. z o.o.">sp. z o.o.</option>
    <option value="spółka cywilna">spółka cywilna</option>
    <option value="inna">inna</option>
  </select>

  <select
    style={compactFilterStyle}
    value={opodatkowanieFilter}
    onChange={(e) => setOpodatkowanieFilter(e.target.value)}
  >
    <option value={EMPTY_FILTER}>Opodatkowanie</option>
    <option value="Skala podatkowa">Skala podatkowa</option>
    <option value="Podatek liniowy">Podatek liniowy</option>
    <option value="Ryczałt">Ryczałt</option>
    <option value="CIT">CIT</option>
  </select>

  <select
    style={compactFilterStyle}
    value={kadryFilter}
    onChange={(e) => setKadryFilter(e.target.value)}
  >
    <option value={EMPTY_FILTER}>Kadry</option>
    <option value="Tak">Tak</option>
    <option value="Nie">Nie</option>
  </select>
</div>

        {loading ? (
          <div style={emptyStateStyle}>Ładowanie danych...</div>
        ) : clients.length === 0 ? (
          <div style={emptyStateStyle}>Brak klientów do wyświetlenia</div>
        ) : filteredClients.length === 0 ? (
          <div style={emptyStateStyle}>Brak klientów pasujących do wyszukiwania lub filtrów</div>
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
                      {client.profiles?.[0]?.full_name ||
                        client.profiles?.[0]?.email ||
                        "Brak opiekuna"}
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
  const [draft, setDraft] = useState<ClientDraft>(() => createDraft(client));

  const canEditAdministrative = canEditClientAdministrative(role);

  useEffect(() => {
    setDraft(createDraft(client));
    setEditing(false);
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

  function cancelEditing() {
    setDraft(createDraft(client));
    setEditing(false);
  }

  async function saveChanges() {
    setSaving(true);

    const operationalPayload = {
      telefon: draft.telefon.trim() || null,
      email: draft.email.trim() || null,
      czynny_vat: draft.czynny_vat,
      vat_ue: draft.vat_ue,
      schemat_zus: draft.schemat_zus.trim() || null,
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
          opiekun_id: draft.opiekun_id || null,
        }
      : {};

    const payload = {
      ...operationalPayload,
      ...administrativePayload,
    };

    const { error } = await supabase
      .from("klienci")
      .update(payload)
      .eq("id", client.id);

    if (error) {
      console.error("Błąd zapisu klienta:", error);
      alert("Nie udało się zapisać zmian.");
      setSaving(false);
      return;
    }

    const selectedOpiekun = opiekunowie.find(
      (opiekun) => opiekun.id === draft.opiekun_id
    );

    const updatedClient: Client = {
      ...client,
      ...payload,
      profiles: selectedOpiekun
        ? [
            {
              full_name: selectedOpiekun.full_name,
              email: selectedOpiekun.email,
              role: selectedOpiekun.role,
            },
          ]
        : client.profiles,
    };

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
              </>
            ) : (
              <>
                <InfoRow label="Telefon" value={client.telefon} />
                <InfoRow label="Email" value={client.email} />
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
                <EditableInput
                  label="Status"
                  value={draft.status_klienta}
                  onChange={(value) => updateDraft("status_klienta", value)}
                />
              </>
            ) : (
              <>
                <InfoRow
                  label="Opiekun"
                  value={
                    client.profiles?.[0]?.full_name ||
                    client.profiles?.[0]?.email ||
                    "Brak opiekuna"
                  }
                />
                <InfoRow label="Status" value={client.status_klienta} />
              </>
            )}
          </InfoSection>

          <InfoSection title="Podatki i ZUS">
            {editing && canEditAdministrative ? (
              <>
                <EditableInput
                  label="Forma prawna"
                  value={draft.forma_prawna}
                  onChange={(value) => updateDraft("forma_prawna", value)}
                />
                <EditableInput
                  label="Forma opodatkowania"
                  value={draft.forma_opodatkowania}
                  onChange={(value) =>
                    updateDraft("forma_opodatkowania", value)
                  }
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
              </>
            ) : (
              <>
                <InfoRow
                  label="Czynny VAT"
                  value={client.czynny_vat ? "Tak" : "Nie"}
                />
                <InfoRow label="VAT UE" value={client.vat_ue ? "Tak" : "Nie"} />
                <InfoRow label="Schemat ZUS" value={client.schemat_zus} />
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
              <EditableInput
                label="Abonament"
                type="number"
                value={draft.abonament}
                onChange={(value) => updateDraft("abonament", value)}
              />
            ) : (
              <InfoRow
                label="Abonament"
                value={
                  client.abonament !== null
                    ? `${client.abonament.toLocaleString("pl-PL")} zł`
                    : null
                }
              />
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
            <div style={documentsPlaceholderStyle}>
            <p style={documentsTitleStyle}>
            Tutaj będzie można dodawać pliki oraz opisy dokumentów klienta.
            </p>

            <button style={secondaryButtonStyle}>
             Dodaj dokument
            </button>
            </div>
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
    forma_prawna: "",
    forma_opodatkowania: "",
    obsluga_kadrowa: false,
    status_klienta: "Aktywny",
    abonament: "",
    opiekun_id: "",
    czynny_vat: false,
    vat_ue: false,
    schemat_zus: "",
    limit_dokumentow: "",
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
      forma_prawna: draft.forma_prawna.trim() || null,
      forma_opodatkowania: draft.forma_opodatkowania.trim() || null,
      obsluga_kadrowa: draft.obsluga_kadrowa,
      status_klienta: draft.status_klienta.trim() || "Aktywny",
      abonament: draft.abonament ? Number(draft.abonament) : null,
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

    const { data, error } = await supabase
      .from("klienci")
      .insert(payload)
      .select("*")
      .single();

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
      { value: "spółka cywilna", label: "spółka cywilna" },
      { value: "inna", label: "inna" },
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
      { value: "Karta podatkowa", label: "Karta podatkowa" },
      { value: "Inne", label: "Inne" },
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
    forma_prawna: client.forma_prawna || "",
    forma_opodatkowania: client.forma_opodatkowania || "",
    obsluga_kadrowa: Boolean(client.obsluga_kadrowa),
    status_klienta: client.status_klienta || "",
    abonament:
      client.abonament !== null && client.abonament !== undefined
        ? String(client.abonament)
        : "",
    opiekun_id: client.opiekun_id || "",
    czynny_vat: Boolean(client.czynny_vat),
    vat_ue: Boolean(client.vat_ue),
    schemat_zus: client.schemat_zus || "",
    limit_dokumentow:
      client.limit_dokumentow !== null && client.limit_dokumentow !== undefined
        ? String(client.limit_dokumentow)
        : "",
    dodatkowe_uslugi: client.dodatkowe_uslugi || "",
    notatki: client.notatki || "",
  };
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
  type?: "text" | "number" | "email";
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
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value || "empty"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  padding: "10px 14px",
  background: colors.card,
  color: colors.text,
  fontSize: "14px",
  minWidth: "160px",
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
  width: "560px",
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
  gridTemplateColumns: "180px 1fr",
  gap: "14px",
  padding: "11px 0",
  borderBottom: `1px solid ${colors.border}`,
};

const editableRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "180px 1fr",
  gap: "14px",
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
