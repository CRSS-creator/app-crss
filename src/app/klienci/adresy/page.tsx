"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients, updateClient } from "@/lib/clientService";

type Client = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  adres_dzialalnosci: string | null;
};

export default function ClientAddressesPage() {
  return (
    <AppLayout activePage="klienci">
      <AccessGuard moduleName="klienci">
        <ClientAddressesContent />
      </AccessGuard>
    </AppLayout>
  );
}

function ClientAddressesContent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadClients();
  }, []);

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return clients.filter((client) => {
      const text = [client.nazwa, client.nip, client.adres_dzialalnosci].filter(Boolean).join(" ").toLowerCase();
      return !normalized || text.includes(normalized);
    });
  }, [clients, query]);

  async function loadClients() {
    setLoading(true);
    const result = await fetchClients();
    if (result.error) {
      console.error("Blad pobierania klientow:", result.error);
      alert("Nie udalo sie pobrac klientow.");
    } else {
      setClients((result.data || []) as Client[]);
    }
    setLoading(false);
  }

  async function saveAddress(client: Client, address: string) {
    setSavingId(client.id);
    const result = await updateClient(client.id, { adres_dzialalnosci: address.trim() || null });
    setSavingId(null);

    if (result.error) {
      console.error("Blad zapisu adresu:", result.error);
      alert("Nie udalo sie zapisac adresu.");
      return;
    }

    setClients((current) =>
      current.map((item) =>
        item.id === client.id ? { ...item, adres_dzialalnosci: address.trim() || null } : item
      )
    );
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Klienci</p>
          <h1 style={titleStyle}>Adresy do wFirmy</h1>
        </div>
      </section>

      <section style={panelStyle}>
        <input
          type="search"
          style={searchStyle}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Szukaj po nazwie albo NIP"
        />

        <div style={listStyle}>
          {loading ? (
            <div style={emptyStyle}>Ladowanie klientow...</div>
          ) : filteredClients.length === 0 ? (
            <div style={emptyStyle}>Brak klientow.</div>
          ) : (
            filteredClients.map((client) => (
              <AddressRow
                key={client.id}
                client={client}
                saving={savingId === client.id}
                onSave={saveAddress}
              />
            ))
          )}
        </div>
      </section>
    </>
  );
}

function AddressRow({
  client,
  saving,
  onSave,
}: {
  client: Client;
  saving: boolean;
  onSave: (client: Client, address: string) => void;
}) {
  const [address, setAddress] = useState(client.adres_dzialalnosci || "");

  useEffect(() => {
    setAddress(client.adres_dzialalnosci || "");
  }, [client.adres_dzialalnosci]);

  const changed = address.trim() !== (client.adres_dzialalnosci || "").trim();

  return (
    <div style={rowStyle}>
      <div style={clientStyle}>
        <strong>{client.nazwa || "Bez nazwy"}</strong>
        <span>NIP: {client.nip || "brak"}</span>
      </div>
      <input
        style={inputStyle}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder="ul. Przykładowa 1, 63-100 Śrem"
      />
      <button
        type="button"
        style={changed ? primaryButtonStyle : disabledButtonStyle}
        disabled={!changed || saving}
        onClick={() => onSave(client, address)}
      >
        {saving ? "Zapisywanie..." : "Zapisz"}
      </button>
    </div>
  );
}

const headerStyle: React.CSSProperties = { marginBottom: "24px" };
const eyebrowStyle: React.CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: React.CSSProperties = { color: colors.navy, fontSize: "42px", lineHeight: 1.05, margin: 0 };
const panelStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, boxShadow: shadow.soft, padding: "22px" };
const searchStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "12px 14px", fontWeight: 700, marginBottom: "16px", boxSizing: "border-box" };
const listStyle: React.CSSProperties = { display: "grid", gap: "10px" };
const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 320px) minmax(260px, 1fr) 120px", gap: "12px", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "12px" };
const clientStyle: React.CSSProperties = { display: "grid", gap: "4px", color: colors.text };
const inputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", color: colors.text, fontWeight: 650, boxSizing: "border-box" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, padding: "11px 14px", fontWeight: 850, cursor: "pointer" };
const disabledButtonStyle: React.CSSProperties = { ...primaryButtonStyle, opacity: 0.45, cursor: "not-allowed" };
const emptyStyle: React.CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "18px", color: colors.muted, fontWeight: 750, textAlign: "center" };
