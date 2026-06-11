"use client";

import { useMemo, useState } from "react";
import {
  fetchCrmContracts,
  requestCrmContractGeneration,
  type CrmContract,
} from "@/lib/crmContractService";
import { colors, radius, shadow } from "@/app/design";

export default function ContractDocxGenerationWidget() {
  const [open, setOpen] = useState(false);
  const [contracts, setContracts] = useState<CrmContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const visibleContracts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return contracts
      .filter((contract) => contract.typ_umowy === "KH")
      .filter((contract) => {
        if (!query) return true;
        return [
          contract.numer_umowy,
          contract.nazwa_klienta,
          contract.nip,
          contract.email_klienta,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [contracts, searchQuery]);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    const result = await fetchCrmContracts();
    setLoading(false);

    if (result.error) {
      console.error("Błąd pobierania umów do generowania:", result.error);
      alert("Nie udało się pobrać listy umów.");
      return;
    }

    setContracts((result.data || []) as CrmContract[]);
  }

  async function generateContract(contract: CrmContract) {
    setGeneratingId(contract.id);
    const result = await requestCrmContractGeneration(contract);
    setGeneratingId(null);

    if (result.error) {
      console.error("Błąd generowania umowy z DOCX:", result.error);
      alert(result.error.message);
      return;
    }

    alert("Generowanie zostało uruchomione. Po zakończeniu n8n zapisze PDF w rejestrze tej umowy.");
  }

  return (
    <>
      <button type="button" style={triggerStyle} onClick={openPanel}>
        Generuj DOCX
      </button>

      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <aside style={panelStyle} onClick={(event) => event.stopPropagation()}>
            <div style={headerStyle}>
              <div>
                <p style={eyebrowStyle}>Umowy KH</p>
                <h2 style={titleStyle}>Generowanie z DOCX</h2>
                <p style={subtitleStyle}>
                  Wybierz zapisaną umowę KH. Aplikacja przekaże dane do n8n, a gotowy PDF wróci do rejestru.
                </p>
              </div>
              <button type="button" style={closeStyle} onClick={() => setOpen(false)}>×</button>
            </div>

            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Szukaj po numerze, kliencie, NIP lub emailu"
              style={searchInputStyle}
            />

            {loading ? (
              <div style={emptyStyle}>Ładowanie umów...</div>
            ) : visibleContracts.length === 0 ? (
              <div style={emptyStyle}>Brak zapisanych umów KH pasujących do wyszukiwania.</div>
            ) : (
              <div style={listStyle}>
                {visibleContracts.map((contract) => (
                  <div key={contract.id} style={itemStyle}>
                    <div>
                      <strong style={itemTitleStyle}>{contract.numer_umowy || "Umowa bez numeru"}</strong>
                      <p style={itemMetaStyle}>{contract.nazwa_klienta || "Bez klienta"}</p>
                      <p style={itemMetaStyle}>{contract.wygenerowany_pdf_name || "Brak wygenerowanego PDF"}</p>
                    </div>
                    <button
                      type="button"
                      style={primaryStyle}
                      onClick={() => generateContract(contract)}
                      disabled={generatingId === contract.id}
                    >
                      {generatingId === contract.id ? "Uruchamianie..." : "Generuj"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

const triggerStyle: React.CSSProperties = {
  position: "fixed",
  right: "28px",
  bottom: "86px",
  zIndex: 40,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  padding: "12px 16px",
  background: colors.navy,
  color: colors.white,
  fontWeight: 850,
  cursor: "pointer",
  boxShadow: shadow.soft,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 70,
  background: "rgba(15, 23, 42, 0.32)",
  display: "flex",
  justifyContent: "flex-end",
};

const panelStyle: React.CSSProperties = {
  width: "560px",
  maxWidth: "100%",
  minHeight: "100vh",
  background: colors.card,
  borderLeft: `1px solid ${colors.border}`,
  padding: "28px",
  boxShadow: "-12px 0 30px rgba(15, 23, 42, 0.12)",
  overflowY: "auto",
};

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", marginBottom: "22px" };
const eyebrowStyle: React.CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "28px", lineHeight: 1.15 };
const subtitleStyle: React.CSSProperties = { margin: "10px 0 0", color: colors.muted, lineHeight: 1.55 };
const closeStyle: React.CSSProperties = { width: "42px", height: "42px", borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontSize: "24px", cursor: "pointer" };
const searchInputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "12px 14px", marginBottom: "16px", background: colors.inputBackground, color: colors.text, fontWeight: 700, outline: "none" };
const emptyStyle: React.CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "18px", color: colors.muted, fontWeight: 750, textAlign: "center" };
const listStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "12px" };
const itemStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "14px", display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center", background: colors.white };
const itemTitleStyle: React.CSSProperties = { color: colors.navy, fontSize: "16px" };
const itemMetaStyle: React.CSSProperties = { margin: "6px 0 0", color: colors.muted, fontWeight: 650, lineHeight: 1.4 };
const primaryStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "10px 14px", background: colors.red, color: colors.white, fontWeight: 850, cursor: "pointer" };
