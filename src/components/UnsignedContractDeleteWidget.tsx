"use client";

import { useMemo, useState } from "react";
import {
  createCrmContractSignedUrl,
  deleteUnsignedCrmContract,
  fetchCrmContracts,
  type CrmContract,
} from "@/lib/crmContractService";
import { colors, radius, shadow } from "@/app/design";

export default function UnsignedContractDeleteWidget() {
  const [open, setOpen] = useState(false);
  const [contracts, setContracts] = useState<CrmContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const removableContracts = useMemo(
    () => contracts.filter((contract) => contract.status !== "podpisana" && !contract.podpisany_pdf_path),
    [contracts]
  );

  const filteredRemovableContracts = useMemo(() => {
    const query = normalize(searchQuery);
    if (!query) return removableContracts;

    return removableContracts.filter((contract) =>
      [
        contract.numer_umowy,
        contract.nazwa_klienta,
        contract.wygenerowany_pdf_name,
        contract.typ_umowy,
        statusLabel(contract.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [removableContracts, searchQuery]);

  async function openPanel() {
    setOpen(true);
    setSearchQuery("");
    setLoading(true);
    const result = await fetchCrmContracts();
    setLoading(false);

    if (result.error) {
      console.error("Błąd pobierania umów do usunięcia:", result.error);
      alert("Nie udało się pobrać listy umów.");
      return;
    }

    setContracts((result.data || []) as CrmContract[]);
  }

  async function openPdf(path: string | null) {
    if (!path) return;
    const result = await createCrmContractSignedUrl(path);
    if (result.error || !result.data?.signedUrl) {
      alert("Nie udało się otworzyć PDF.");
      return;
    }

    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteContract(contract: CrmContract) {
    const confirmed = window.confirm("Usunąć tę umowę i wygenerowany PDF? Tej operacji nie można cofnąć.");
    if (!confirmed) return;

    setDeletingId(contract.id);
    const result = await deleteUnsignedCrmContract(contract);
    setDeletingId(null);

    if (result.error) {
      console.error("Błąd usuwania umowy:", result.error);
      alert("Nie udało się usunąć umowy.");
      return;
    }

    setContracts((current) => current.filter((item) => item.id !== contract.id));
    window.location.reload();
  }

  return (
    <>
      <button type="button" style={triggerStyle} onClick={openPanel}>Usuń umowę</button>

      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <aside style={panelStyle} onClick={(event) => event.stopPropagation()}>
            <div style={headerStyle}>
              <div>
                <p style={eyebrowStyle}>Umowy</p>
                <h2 style={titleStyle}>Usuń niepodpisaną umowę</h2>
                <p style={subtitleStyle}>Usuwane są tylko umowy bez podpisanego PDF i bez statusu „Podpisana”.</p>
              </div>
              <button type="button" style={closeStyle} onClick={() => setOpen(false)}>×</button>
            </div>

            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Szukaj po numerze, kliencie, statusie lub PDF"
              style={searchInputStyle}
            />

            {loading ? (
              <div style={emptyStyle}>Ładowanie umów...</div>
            ) : removableContracts.length === 0 ? (
              <div style={emptyStyle}>Brak umów możliwych do usunięcia.</div>
            ) : filteredRemovableContracts.length === 0 ? (
              <div style={emptyStyle}>Brak umów pasujących do wyszukiwania.</div>
            ) : (
              <div style={listStyle}>
                {filteredRemovableContracts.map((contract) => (
                  <div key={contract.id} style={itemStyle}>
                    <div>
                      <strong style={itemTitleStyle}>{contract.numer_umowy || contract.nazwa_klienta || "Umowa bez numeru"}</strong>
                      <p style={itemMetaStyle}>{contract.nazwa_klienta || "Bez klienta"} · {statusLabel(contract.status)}</p>
                      <p style={itemMetaStyle}>{contract.wygenerowany_pdf_name || "Brak wygenerowanego PDF"}</p>
                    </div>
                    <div style={actionsStyle}>
                      {contract.wygenerowany_pdf_path && (
                        <button type="button" style={secondaryStyle} onClick={() => openPdf(contract.wygenerowany_pdf_path)}>PDF</button>
                      )}
                      <button
                        type="button"
                        style={dangerStyle}
                        onClick={() => deleteContract(contract)}
                        disabled={deletingId === contract.id}
                      >
                        {deletingId === contract.id ? "Usuwanie..." : "Usuń"}
                      </button>
                    </div>
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

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function statusLabel(status: CrmContract["status"]) {
  const labels: Record<CrmContract["status"], string> = {
    szkic: "Szkic",
    wygenerowana: "Wygenerowana",
    wyslana_do_podpisu: "Wysłana do podpisu",
    podpisana: "Podpisana",
    anulowana: "Anulowana",
  };
  return labels[status] || status;
}

const triggerStyle: React.CSSProperties = {
  position: "fixed",
  right: "28px",
  bottom: "28px",
  zIndex: 40,
  border: "1px solid #fecdd3",
  borderRadius: radius.button,
  padding: "12px 16px",
  background: "#fff1f2",
  color: "#be123c",
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
const actionsStyle: React.CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" };
const secondaryStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "9px 12px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer" };
const dangerStyle: React.CSSProperties = { ...secondaryStyle, background: "#fff1f2", borderColor: "#fecdd3", color: "#be123c" };
