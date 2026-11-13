"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { BookOpen, Download, Plus } from "lucide-react";
import { colors, radius } from "@/app/design";
import {
  downloadProcedureDocument, fetchProcedureDocuments, uploadProcedureDocument,
  MAX_PROCEDURE_FILE_SIZE, type ProcedureDocument,
} from "@/lib/procedureDocumentsService";

export default function ProceduresPage() {
  return <AppLayout activePage="procedury"><AccessGuard moduleName="procedury"><ProceduresContent /></AccessGuard></AppLayout>;
}

function ProceduresContent() {
  const { role } = useCurrentUserRole();
  const isOwner = role === "owner";
  const [documents, setDocuments] = useState<ProcedureDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await fetchProcedureDocuments();
      if (result.error) throw result.error;
      setDocuments((result.data || []) as ProcedureDocument[]);
    } catch {
      setLoadError("Nie udało się wczytać materiałów.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOwner || savingRef.current) return;
    setActionError("");
    if (!file) { setActionError("Wybierz plik do dodania."); return; }
    if (file.size > MAX_PROCEDURE_FILE_SIZE) { setActionError("Plik może mieć maksymalnie 25 MB."); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await uploadProcedureDocument(name, file);
      setDocuments(current => [saved, ...current]);
      setName("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setFormOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Nie udało się dodać materiału.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function download(item: ProcedureDocument) {
    setActionError("");
    setDownloading(current => [...current, item.id]);
    try {
      const blob = await downloadProcedureDocument(item);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.nazwa_pliku;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Nie udało się pobrać pliku.");
    } finally {
      setDownloading(current => current.filter(id => id !== item.id));
    }
  }

  return <>
    <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 28 }}>
      <div>
        <h1 style={{ margin: 0, color: colors.navy, fontSize: 42, lineHeight: 1.15 }}>Procedury/wzory</h1>
        <p style={{ margin: "12px 0 0", color: colors.muted, lineHeight: 1.6 }}>Procedury biura i wzory dokumentów w jednym miejscu.</p>
      </div>
      {isOwner && <button type="button" style={primaryButton} disabled={saving} aria-expanded={formOpen} aria-controls="procedure-upload-form"
        onClick={() => { setFormOpen(true); setActionError(""); }}><Plus size={18} aria-hidden="true" />Dodaj</button>}
    </header>

    {isOwner && formOpen && <form id="procedure-upload-form" onSubmit={save} style={{ ...panel, display: "grid", gap: 18, marginBottom: 24 }}>
      <h2 style={{ margin: 0, color: colors.navy, fontSize: 22 }}>Dodaj procedurę lub wzór</h2>
      <label style={label}>Nazwa pliku
        <input autoFocus required maxLength={200} value={name} disabled={saving} onChange={event => setName(event.target.value)} style={input} placeholder="Np. Procedura przyjęcia nowego klienta" />
      </label>
      <label style={label}>Plik
        <input ref={fileInput} type="file" required disabled={saving} style={input} onChange={event => {
          const selected = event.target.files?.[0] || null;
          setFile(selected);
          if (!name.trim() && selected) setName(selected.name.slice(0, 200));
        }} />
        <span style={{ fontSize: 13, color: colors.muted }}>Maksymalny rozmiar: 25 MB.</span>
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving} style={{ ...primaryButton, opacity: saving ? 0.65 : 1 }}>{saving ? "Dodawanie…" : "Dodaj plik"}</button>
        <button type="button" disabled={saving} style={secondaryButton} onClick={() => { setFormOpen(false); setActionError(""); }}>Anuluj</button>
      </div>
    </form>}

    {actionError && <p role="alert" style={{ color: colors.danger }}>{actionError}</p>}
    <section aria-label="Procedury i wzory dokumentów" style={panel}>
      {loading ? <p role="status" style={{ color: colors.muted }}>Ładowanie materiałów…</p>
        : loadError ? <div role="alert"><p style={{ color: colors.danger }}>{loadError}</p><button type="button" style={secondaryButton} onClick={() => void loadDocuments()}>Spróbuj ponownie</button></div>
        : documents.length === 0 ? <div style={{ padding: "24px 0", textAlign: "center" }}>
          <BookOpen size={40} strokeWidth={1.5} color={colors.navy} aria-hidden="true" style={{ display: "inline-block" }} />
          <h2 style={{ margin: "18px 0 10px", color: colors.navy, fontSize: 22 }}>Brak materiałów</h2>
          <p style={{ margin: 0, color: colors.muted, lineHeight: 1.6 }}>Nie dodano jeszcze procedur ani wzorów dokumentów.</p>
        </div> : <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "grid", gap: 12 }}>
          {documents.map(item => <li key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, padding: "16px 18px", border: `1px solid ${colors.border}`, borderRadius: radius.input }}>
            <span style={{ color: colors.navy, overflowWrap: "anywhere", minWidth: 0, flex: "1 1 200px" }}>{item.nazwa}</span>
            <button type="button" style={secondaryButton} disabled={downloading.includes(item.id)} aria-label={`Pobierz: ${item.nazwa}`}
              onClick={() => void download(item)}><Download size={16} aria-hidden="true" />{downloading.includes(item.id) ? "Pobieranie…" : "Pobierz"}</button>
          </li>)}
        </ul>}
    </section>
  </>;
}

const panel: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: 24 };
const primaryButton: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, padding: "14px 20px", fontWeight: 700, cursor: "pointer", minHeight: 46 };
const secondaryButton: CSSProperties = { ...primaryButton, background: colors.white, color: colors.navy, border: `1px solid ${colors.border}`, padding: "10px 16px" };
const label: CSSProperties = { display: "grid", gap: 8, color: colors.navy };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", background: colors.white, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: radius.input };
