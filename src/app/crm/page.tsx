"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
import {
  createCrmTasks,
  deleteCrmLead,
  fetchCrmLeads,
  fetchCrmTasks,
  updateCrmLeadStage,
  updateCrmTaskStatus,
} from "@/lib/crmService";
import {
  createCrmDocumentSignedUrl,
  deleteCrmDocument,
  fetchCrmDocuments,
  uploadCrmDocument,
  type CrmDocument,
} from "@/lib/crmDocumentsService";
import { X } from "lucide-react";

type Lead = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  nazwa: string | null;
  osoba_kontaktowa: string | null;
  telefon: string | null;
  email: string | null;
  nip: string | null;
  forma_prawna: string | null;
  etap: string | null;
  status: string | null;
  zrodlo_leada: string | null;
  szacowany_mrr: number | null;
  data_telefonu: string | null;
  data_spotkania_online: string | null;
  data_wyslania_oferty: string | null;
  data_follow_up: string | null;
  powod_kontaktu: string | null;
  powod_zmiany_biura: string | null;
  liczba_dokumentow: number | null;
  liczba_transakcji: number | null;
  czy_kadry: boolean | null;
  liczba_pracownikow: number | null;
  powod_przegranej: string | null;
  notatki: string | null;
};

type LeadDraft = {
  nazwa: string;
  osoba_kontaktowa: string;
  telefon: string;
  email: string;
  nip: string;
  forma_prawna: string;
  etap: string;
  status: string;
  zrodlo_leada: string;
  szacowany_mrr: string;
  data_telefonu: string;
  data_spotkania_online: string;
  data_wyslania_oferty: string;
  data_follow_up: string;
  powod_kontaktu: string;
  powod_zmiany_biura: string;
  liczba_dokumentow: string;
  liczba_transakcji: string;
  czy_kadry: boolean;
  liczba_pracownikow: string;
  powod_przegranej: string;
  notatki: string;
};

type CrmTask = {
  id: string;
  crm_id: string;
  etap: string;
  tytul: string;
  opis: string | null;
  status: "do_zrobienia" | "w_trakcie" | "zrobione";
  termin: string | null;
};

const EMPTY_FILTER = "Wszystkie";
const PIPELINE_STAGES = ["nowy_lead", "kontakt_proba_kontaktu", "rozmowa_online", "propozycja_wspolpracy_wyslana", "decyzja"];
const PIPELINE_LABELS: Record<string, string> = {
  nowy_lead: "Nowy lead",
  kontakt_proba_kontaktu: "Kontakt / próba kontaktu",
  rozmowa_online: "Rozmowa online",
  propozycja_wspolpracy_wyslana: "Propozycja współpracy wysłana",
  decyzja: "Decyzja",
};
const DEFAULT_TASKS_BY_STAGE: Record<string, string[]> = {
  nowy_lead: ["Uzupełnij źródło leada", "Skontaktuj się z leadem do 30 minut"],
  kontakt_proba_kontaktu: ["Zadzwoń lub odpisz i zaproponuj termin rozmowy online", "Jeśli brak odpowiedzi, ustaw kolejne zadanie follow-up", "Zapisz wynik kontaktu"],
  rozmowa_online: ["Zapisz powód kontaktu", "Zbierz minimum danych do wyceny", "Zapisz, czy przygotowujemy propozycję"],
  propozycja_wspolpracy_wyslana: ["Zapisz datę wysłania propozycji", "Ustaw follow-up D+2", "Ustaw follow-up D+5"],
  decyzja: ["Zamknij szansę jako wygrana albo przegrana", "Jeśli przegrana, zapisz powód"],
};
const STATUSES = [
  { value: "otwarta", label: "Otwarta" },
  { value: "wygrana", label: "Wygrana" },
  { value: "przegrana", label: "Przegrana" },
];

export default function CrmPage() {
  return (
    <AppLayout activePage="crm">
      <AccessGuard moduleName="crm">
        <CrmContent />
      </AccessGuard>
    </AppLayout>
  );
}

function CrmContent() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingLead, setCreatingLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState(EMPTY_FILTER);
  const [statusFilter, setStatusFilter] = useState(EMPTY_FILTER);
  const [kadryFilter, setKadryFilter] = useState(EMPTY_FILTER);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    const [leadsResult, tasksResult] = await Promise.all([fetchCrmLeads(), fetchCrmTasks()]);
    if (leadsResult.error) console.error("Błąd pobierania CRM:", leadsResult.error);
    else setLeads((leadsResult.data || []) as Lead[]);
    if (tasksResult.error) console.error("Błąd pobierania zadań CRM:", tasksResult.error);
    else setTasks((tasksResult.data || []) as CrmTask[]);
    setLoading(false);
  }

  async function moveLeadToStage(leadId: string, newStage: string) {
    const previousLeads = leads;
    setLeads((current) => current.map((lead) => lead.id === leadId ? { ...lead, etap: newStage } : lead));
    const { error } = await updateCrmLeadStage(leadId, newStage);
    if (error) {
      console.error("Błąd zmiany etapu:", error);
      setLeads(previousLeads);
      alert("Nie udało się zmienić etapu.");
      return;
    }
    await createDefaultTasksForStage(leadId, newStage);
  }

  async function createDefaultTasksForStage(leadId: string, stage: string) {
    const defaults = DEFAULT_TASKS_BY_STAGE[stage] || [];
    const existing = tasks.filter((task) => task.crm_id === leadId && task.etap === stage);
    const toCreate = defaults
      .filter((title) => !existing.some((task) => task.tytul === title))
      .map((title) => ({ crm_id: leadId, etap: stage, tytul: title, status: "do_zrobienia" as const }));
    if (toCreate.length === 0) return;
    const { data, error } = await createCrmTasks(toCreate);
    if (error) console.error("Błąd tworzenia zadań CRM:", error);
    else setTasks((current) => [...current, ...((data || []) as CrmTask[])]);
  }

  async function toggleTaskStatus(taskId: string) {
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) return;
    const newStatus = currentTask.status === "zrobione" ? "do_zrobienia" : "zrobione";
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: newStatus } : task));
    const { error } = await updateCrmTaskStatus(taskId, newStatus);
    if (error) {
      console.error("Błąd zmiany statusu zadania CRM:", error);
      setTasks((current) => current.map((task) => task.id === taskId ? currentTask : task));
      alert("Nie udało się zmienić statusu zadania.");
    }
  }

  async function removeLead(lead: Lead) {
    const confirmed = window.confirm(`Usunąć szansę sprzedaży "${lead.nazwa || "Bez nazwy"}"?\n\nUsunięte zostaną też jej zadania, pliki i propozycje współpracy.`);
    if (!confirmed) return false;

    const { error } = await deleteCrmLead(lead.id);
    if (error) {
      console.error("Błąd usuwania szansy:", error);
      alert("Nie udało się usunąć szansy sprzedaży.");
      return false;
    }

    setLeads((current) => current.filter((item) => item.id !== lead.id));
    setTasks((current) => current.filter((task) => task.crm_id !== lead.id));
    setSelectedLead(null);
    return true;
  }

  const filteredLeads = leads.filter((lead) => {
    const matchesStage = stageFilter === EMPTY_FILTER || lead.etap === stageFilter;
    const matchesStatus = statusFilter === EMPTY_FILTER || lead.status === statusFilter;
    const matchesKadry = kadryFilter === EMPTY_FILTER || (kadryFilter === "Tak" && lead.czy_kadry) || (kadryFilter === "Nie" && !lead.czy_kadry);
    return matchesStage && matchesStatus && matchesKadry;
  });
  const activeLeads = leads.filter((lead) => lead.status === "otwarta");
  const totalMrr = activeLeads.reduce((sum, lead) => sum + Number(lead.szacowany_mrr || 0), 0);

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł zarządczy</p>
          <h1 style={titleStyle}>CRM</h1>
          <p style={subtitleStyle}>Szanse sprzedaży, pipeline, zadania, pliki i propozycje współpracy.</p>
        </div>
        <div style={headerActionsStyle}>
          <Link href="/crm/oferty" style={secondaryButtonStyle}>Propozycje współpracy</Link>
          <button style={primaryButtonStyle} onClick={() => setCreatingLead(true)}>Dodaj szansę</button>
        </div>
      </section>

      <section style={summaryGridStyle}>
        <SummaryCard label="Aktywne szanse" value={activeLeads.length} />
        <SummaryCard label="Szacowany MRR" value={`${totalMrr.toLocaleString("pl-PL")} zł`} />
        <SummaryCard label="Wygrane" value={leads.filter((lead) => lead.status === "wygrana").length} />
        <SummaryCard label="Przegrane" value={leads.filter((lead) => lead.status === "przegrana").length} />
      </section>

      <section style={cardStyle}>
        <div style={tableHeaderStyle}>
          <h2 style={sectionTitleStyle}>Pipeline sprzedaży</h2>
        </div>
        <div style={pipelineGridStyle}>
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = leads.filter((lead) => lead.etap === stage);
            const stageMrr = stageLeads.reduce((sum, lead) => sum + Number(lead.szacowany_mrr || 0), 0);
            return (
              <div key={stage} style={pipelineColumnStyle} onDragOver={(event) => event.preventDefault()} onDrop={() => {
                if (draggedLeadId) {
                  moveLeadToStage(draggedLeadId, stage);
                  setDraggedLeadId(null);
                }
              }}>
                <h3 style={pipelineTitleStyle}>{PIPELINE_LABELS[stage]}</h3>
                <p style={pipelineMetaStyle}>{stageLeads.length} szans · {stageMrr.toLocaleString("pl-PL")} zł</p>
                <div style={pipelineCardsStyle}>
                  {stageLeads.map((lead) => (
                    <button key={lead.id} style={pipelineCardStyle} draggable onDragStart={() => setDraggedLeadId(lead.id)} onDragEnd={() => setDraggedLeadId(null)} onClick={() => setSelectedLead(lead)}>
                      <strong>{lead.nazwa || "—"}</strong>
                      <span>{lead.osoba_kontaktowa || lead.email || "Brak kontaktu"}</span>
                      <span>{lead.szacowany_mrr ? `${lead.szacowany_mrr.toLocaleString("pl-PL")} zł` : "Brak MRR"}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={cardStyle}>
        <div style={tableHeaderStyle}>
          <h2 style={sectionTitleStyle}>Lista szans sprzedaży</h2>
          <span style={counterStyle}>{loading ? "Ładowanie..." : `${filteredLeads.length} pozycji`}</span>
        </div>
        <div style={filtersStyle}>
          <select style={filterStyle} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value={EMPTY_FILTER}>Etap</option>
            {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{PIPELINE_LABELS[stage]}</option>)}
          </select>
          <select style={filterStyle} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value={EMPTY_FILTER}>Status</option>
            {STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <select style={filterStyle} value={kadryFilter} onChange={(event) => setKadryFilter(event.target.value)}>
            <option value={EMPTY_FILTER}>Kadry</option>
            <option value="Tak">Tak</option>
            <option value="Nie">Nie</option>
          </select>
        </div>
        {loading ? <div style={emptyStyle}>Ładowanie danych...</div> : filteredLeads.length === 0 ? <div style={emptyStyle}>Brak szans sprzedaży do wyświetlenia</div> : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead><tr><Th>Firma</Th><Th>Etap</Th><Th>Status</Th><Th>Kadry</Th><Th>MRR</Th><Th>Status CTA</Th><Th>Akcje</Th></tr></thead>
              <tbody>{filteredLeads.map((lead) => (
                <tr key={lead.id} style={rowStyle}>
                  <Td strong>{lead.nazwa || "—"}</Td>
                  <Td>{PIPELINE_LABELS[lead.etap || ""] || lead.etap || "—"}</Td>
                  <Td><Badge>{statusLabel(lead.status)}</Badge></Td>
                  <Td>{lead.czy_kadry ? "Tak" : "Nie"}</Td>
                  <Td>{lead.szacowany_mrr ? `${lead.szacowany_mrr.toLocaleString("pl-PL")} zł` : "—"}</Td>
                  <Td><Badge>W propozycjach</Badge></Td>
                  <Td><button style={secondaryButtonStyle} onClick={() => setSelectedLead(lead)}>Szczegóły</button></Td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {creatingLead && <LeadDrawer mode="create" tasks={[]} onClose={() => setCreatingLead(false)} onCreated={(lead) => { setLeads((current) => [lead, ...current]); setCreatingLead(false); }} />}
      {selectedLead && <LeadDrawer mode="edit" lead={selectedLead} tasks={tasks.filter((task) => task.crm_id === selectedLead.id)} onClose={() => setSelectedLead(null)} onSaved={(lead) => { setLeads((current) => current.map((item) => item.id === lead.id ? lead : item)); setSelectedLead(lead); }} onDeleted={removeLead} onToggleTaskStatus={toggleTaskStatus} />}
    </>
  );
}

function LeadDrawer({ mode, lead, tasks, onClose, onCreated, onSaved, onDeleted, onToggleTaskStatus }: { mode: "create" | "edit"; lead?: Lead; tasks: CrmTask[]; onClose: () => void; onCreated?: (lead: Lead) => void; onSaved?: (lead: Lead) => void; onDeleted?: (lead: Lead) => Promise<boolean>; onToggleTaskStatus?: (taskId: string) => void | Promise<void>; }) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState<LeadDraft>(() => lead ? createDraft(lead) : createEmptyDraft());
  const [documents, setDocuments] = useState<CrmDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(mode === "edit");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === "edit" && lead) loadDocuments();
  }, [mode, lead?.id]);

  function updateDraft<K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function loadDocuments() {
    if (!lead) return;
    setDocumentsLoading(true);
    const { data, error } = await fetchCrmDocuments(lead.id);
    if (error) console.error("Błąd pobierania dokumentów CRM:", error);
    else setDocuments(data || []);
    setDocumentsLoading(false);
  }

  async function saveLead() {
    if (!draft.nazwa.trim()) {
      alert("Nazwa firmy jest wymagana.");
      return;
    }
    setSaving(true);
    const payload = createLeadPayload(draft);
    const result = mode === "create"
      ? await supabase.from("crm_szanse_sprzedazy").insert(payload).select("*").single()
      : await supabase.from("crm_szanse_sprzedazy").update(payload).eq("id", lead?.id).select("*").single();
    setSaving(false);
    if (result.error) {
      console.error("Błąd zapisu szansy:", result.error);
      alert("Nie udało się zapisać szansy.");
      return;
    }
    if (mode === "create") onCreated?.(result.data as Lead);
    else onSaved?.(result.data as Lead);
  }

  async function deleteLead() {
    if (!lead || !onDeleted) return;
    setDeleting(true);
    const deleted = await onDeleted(lead);
    setDeleting(false);
    if (deleted) onClose();
  }

  async function handleDocumentUpload(files: FileList | File[]) {
    if (!lead) return alert("Najpierw zapisz szansę, a potem dodaj pliki.");
    const filesToUpload = Array.from(files);
    if (filesToUpload.length === 0) return;
    setUploadingDocument(true);
    for (const file of filesToUpload) {
      const { data, error } = await uploadCrmDocument(lead.id, file);
      if (error) alert(`Nie udało się dodać pliku: ${file.name}`);
      else if (data) setDocuments((current) => [data, ...current]);
    }
    setUploadingDocument(false);
  }

  async function openDocument(document: CrmDocument) {
    const { data, error } = await createCrmDocumentSignedUrl(document.sciezka);
    if (error || !data?.signedUrl) return alert("Nie udało się otworzyć dokumentu.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removeDocument(document: CrmDocument) {
    if (!window.confirm(`Usunąć dokument "${document.nazwa}"?`)) return;
    const { error } = await deleteCrmDocument(document);
    if (error) alert("Nie udało się usunąć dokumentu.");
    else setDocuments((current) => current.filter((item) => item.id !== document.id));
  }

  return (
    <div style={drawerOverlayStyle} onClick={onClose}>
      <aside style={drawerStyle} onClick={(event) => event.stopPropagation()}>
        <div style={drawerHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>{mode === "create" ? "Nowa szansa sprzedaży" : "Szczegóły szansy"}</p>
            <h2 style={drawerTitleStyle}>{mode === "create" ? "Dodaj szansę" : draft.nazwa || "Szansa"}</h2>
          </div>
          <button style={closeButtonStyle} onClick={onClose}><X size={20} /></button>
        </div>
        <div style={drawerActionsStyle}>
          {mode === "edit" && onDeleted && <button style={dangerButtonStyle} onClick={deleteLead} disabled={saving || deleting}>{deleting ? "Usuwanie..." : "Usuń szansę"}</button>}
          <button style={secondaryButtonStyle} onClick={onClose}>Anuluj</button>
          <button style={primarySmallButtonStyle} onClick={saveLead} disabled={saving || deleting}>{saving ? "Zapisywanie..." : "Zapisz"}</button>
        </div>

        <div style={drawerContentStyle}>
          <FormSection title="Dane podstawowe">
            <EditableInput label="Nazwa firmy" value={draft.nazwa} onChange={(value) => updateDraft("nazwa", value)} />
            <EditableInput label="Osoba kontaktowa" value={draft.osoba_kontaktowa} onChange={(value) => updateDraft("osoba_kontaktowa", value)} />
            <EditableInput label="Telefon" value={draft.telefon} onChange={(value) => updateDraft("telefon", value)} />
            <EditableInput label="Email" type="email" value={draft.email} onChange={(value) => updateDraft("email", value)} />
            <EditableInput label="NIP" value={draft.nip} onChange={(value) => updateDraft("nip", value)} />
          </FormSection>

          <FormSection title="Sprzedaż">
            <EditableSelect label="Etap" value={draft.etap} onChange={(value) => updateDraft("etap", value)} options={PIPELINE_STAGES.map((stage) => ({ value: stage, label: PIPELINE_LABELS[stage] }))} />
            <EditableSelect label="Status" value={draft.status} onChange={(value) => updateDraft("status", value)} options={STATUSES} />
            <EditableInput label="Źródło leada" value={draft.zrodlo_leada} onChange={(value) => updateDraft("zrodlo_leada", value)} />
            <EditableInput label="Szacowany MRR" type="number" value={draft.szacowany_mrr} onChange={(value) => updateDraft("szacowany_mrr", value)} />
          </FormSection>

          <FormSection title="Zakres obsługi">
            <EditableInput label="Forma prawna" value={draft.forma_prawna} onChange={(value) => updateDraft("forma_prawna", value)} />
            <EditableInput label="Liczba dokumentów" type="number" value={draft.liczba_dokumentow} onChange={(value) => updateDraft("liczba_dokumentow", value)} />
            <EditableInput label="Liczba transakcji" type="number" value={draft.liczba_transakcji} onChange={(value) => updateDraft("liczba_transakcji", value)} />
            <EditableCheckbox label="Kadry" checked={draft.czy_kadry} onChange={(value) => updateDraft("czy_kadry", value)} />
            {draft.czy_kadry && <EditableInput label="Liczba pracowników" type="number" value={draft.liczba_pracownikow} onChange={(value) => updateDraft("liczba_pracownikow", value)} />}
          </FormSection>

          <FormSection title="Zadania sprzedażowe">
            <div style={taskListStyle}>
              {tasks.length === 0 ? <div style={emptyStyle}>Brak zadań dla tej szansy.</div> : tasks.map((task) => {
                const isDone = task.status === "zrobione";
                return (
                  <div key={task.id} style={{ ...taskItemStyle, background: isDone ? "#ecfdf5" : "#f8fafc", borderColor: isDone ? "#bbf7d0" : "#cbd5e1" }}>
                    <label style={taskCheckLabelStyle}>
                      <input type="checkbox" checked={isDone} onChange={() => onToggleTaskStatus?.(task.id)} style={taskCheckboxStyle} />
                      <div>
                        <div style={{ ...taskTitleStyle, color: isDone ? "#047857" : "#1e293b", textDecoration: isDone ? "line-through" : "none" }}>{task.tytul}</div>
                        <div style={{ ...taskMetaStyle, color: isDone ? "#059669" : "#475569" }}>{PIPELINE_LABELS[task.etap] || task.etap}{task.termin ? ` · termin: ${task.termin}` : ""}</div>
                      </div>
                    </label>
                    <button type="button" onClick={() => onToggleTaskStatus?.(task.id)} style={{ ...taskStatusButtonStyle, background: isDone ? "#bbf7d0" : "#e2e8f0", color: isDone ? "#047857" : "#0f172a" }}>{isDone ? "Zrobione" : "Do zrobienia"}</button>
                  </div>
                );
              })}
            </div>
          </FormSection>

          <FormSection title="Propozycja współpracy">
            {mode === "create" ? <div style={emptyStyle}>Najpierw zapisz szansę, a potem przygotuj propozycję współpracy.</div> : (
              <div style={offerLinkPanelStyle}>
                <Link href="/crm/oferty" style={proposalButtonStyle}>Przejdź do propozycji</Link>
              </div>
            )}
          </FormSection>

          <FormSection title="Pliki">
            {mode === "create" ? <div style={emptyStyle}>Najpierw zapisz szansę, a potem dodaj pliki.</div> : (
              <>
                <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(event) => { if (event.target.files) handleDocumentUpload(event.target.files); }} />
                <div style={fileDropzoneStyle}>
                  <div>
                    <strong>Dokumenty szansy</strong>
                    <p>Notatki, pliki klienta i materiały robocze.</p>
                  </div>
                  <button style={secondaryButtonStyle} onClick={() => fileInputRef.current?.click()} disabled={uploadingDocument}>{uploadingDocument ? "Dodawanie..." : "Dodaj pliki"}</button>
                </div>
                {documentsLoading ? <p style={hintStyle}>Ładowanie dokumentów...</p> : documents.length === 0 ? <p style={hintStyle}>Brak dokumentów.</p> : documents.map((document) => (
                  <div key={document.id} style={fileItemStyle}>
                    <div><strong>{document.nazwa}</strong><span>{formatFileSize(document.rozmiar)}</span></div>
                    <div style={fileActionsStyle}>
                      <button style={secondaryButtonStyle} onClick={() => openDocument(document)}>Otwórz</button>
                      <button style={dangerButtonStyle} onClick={() => removeDocument(document)}>Usuń</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </FormSection>

          <FormSection title="Terminy i notatki">
            <EditableInput label="Data telefonu" type="date" value={draft.data_telefonu} onChange={(value) => updateDraft("data_telefonu", value)} />
            <EditableInput label="Data spotkania online" type="date" value={draft.data_spotkania_online} onChange={(value) => updateDraft("data_spotkania_online", value)} />
            <EditableInput label="Data wysłania propozycji" type="date" value={draft.data_wyslania_oferty} onChange={(value) => updateDraft("data_wyslania_oferty", value)} />
            <EditableInput label="Data follow-up" type="date" value={draft.data_follow_up} onChange={(value) => updateDraft("data_follow_up", value)} />
            <EditableTextarea label="Powód kontaktu" value={draft.powod_kontaktu} onChange={(value) => updateDraft("powod_kontaktu", value)} />
            <EditableTextarea label="Powód zmiany biura" value={draft.powod_zmiany_biura} onChange={(value) => updateDraft("powod_zmiany_biura", value)} />
            <EditableTextarea label="Powód przegranej" value={draft.powod_przegranej} onChange={(value) => updateDraft("powod_przegranej", value)} />
            <EditableTextarea label="Notatki" value={draft.notatki} onChange={(value) => updateDraft("notatki", value)} />
          </FormSection>
        </div>
      </aside>
    </div>
  );
}

function createEmptyDraft(): LeadDraft {
  return { nazwa: "", osoba_kontaktowa: "", telefon: "", email: "", nip: "", forma_prawna: "", etap: "nowy_lead", status: "otwarta", zrodlo_leada: "", szacowany_mrr: "", data_telefonu: "", data_spotkania_online: "", data_wyslania_oferty: "", data_follow_up: "", powod_kontaktu: "", powod_zmiany_biura: "", liczba_dokumentow: "", liczba_transakcji: "", czy_kadry: false, liczba_pracownikow: "", powod_przegranej: "", notatki: "" };
}

function createDraft(lead: Lead): LeadDraft {
  return { nazwa: lead.nazwa || "", osoba_kontaktowa: lead.osoba_kontaktowa || "", telefon: lead.telefon || "", email: lead.email || "", nip: lead.nip || "", forma_prawna: lead.forma_prawna || "", etap: lead.etap || "nowy_lead", status: lead.status || "otwarta", zrodlo_leada: lead.zrodlo_leada || "", szacowany_mrr: lead.szacowany_mrr !== null && lead.szacowany_mrr !== undefined ? String(lead.szacowany_mrr) : "", data_telefonu: formatDateForInput(lead.data_telefonu), data_spotkania_online: formatDateForInput(lead.data_spotkania_online), data_wyslania_oferty: formatDateForInput(lead.data_wyslania_oferty), data_follow_up: formatDateForInput(lead.data_follow_up), powod_kontaktu: lead.powod_kontaktu || "", powod_zmiany_biura: lead.powod_zmiany_biura || "", liczba_dokumentow: lead.liczba_dokumentow !== null && lead.liczba_dokumentow !== undefined ? String(lead.liczba_dokumentow) : "", liczba_transakcji: lead.liczba_transakcji !== null && lead.liczba_transakcji !== undefined ? String(lead.liczba_transakcji) : "", czy_kadry: Boolean(lead.czy_kadry), liczba_pracownikow: lead.liczba_pracownikow !== null && lead.liczba_pracownikow !== undefined ? String(lead.liczba_pracownikow) : "", powod_przegranej: lead.powod_przegranej || "", notatki: lead.notatki || "" };
}

function createLeadPayload(draft: LeadDraft) {
  return { nazwa: draft.nazwa.trim(), osoba_kontaktowa: draft.osoba_kontaktowa.trim() || null, telefon: draft.telefon.trim() || null, email: draft.email.trim() || null, nip: draft.nip.trim() || null, forma_prawna: draft.forma_prawna.trim() || null, etap: draft.etap, status: draft.status, zrodlo_leada: draft.zrodlo_leada.trim() || null, szacowany_mrr: draft.szacowany_mrr ? Number(draft.szacowany_mrr) : null, data_telefonu: draft.data_telefonu || null, data_spotkania_online: draft.data_spotkania_online || null, data_wyslania_oferty: draft.data_wyslania_oferty || null, data_follow_up: draft.data_follow_up || null, powod_kontaktu: draft.powod_kontaktu.trim() || null, powod_zmiany_biura: draft.powod_zmiany_biura.trim() || null, liczba_dokumentow: draft.liczba_dokumentow ? Number(draft.liczba_dokumentow) : null, liczba_transakcji: draft.liczba_transakcji ? Number(draft.liczba_transakcji) : null, czy_kadry: draft.czy_kadry, liczba_pracownikow: draft.liczba_pracownikow ? Number(draft.liczba_pracownikow) : null, powod_przegranej: draft.powod_przegranej.trim() || null, notatki: draft.notatki.trim() || null };
}

function formatDateForInput(value: string | null) { return value ? value.slice(0, 10) : ""; }
function formatFileSize(size: number | null) { if (!size) return "Brak rozmiaru"; return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function statusLabel(status: string | null) { return STATUSES.find((item) => item.value === status)?.label || status || "Brak"; }

function SummaryCard({ label, value }: { label: string; value: string | number }) { return <div style={summaryCardStyle}><span>{label}</span><strong>{value}</strong></div>; }
function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <section style={drawerSectionStyle}><h3>{title}</h3>{children}</section>; }
function EditableInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number" | "email" | "date" }) { return <label style={editableRowStyle}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} /></label>; }
function EditableSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <label style={editableRowStyle}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function EditableCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label style={editableRowStyle}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>; }
function EditableTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label style={textareaRowStyle}><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} style={textareaStyle} rows={4} /></label>; }
function Th({ children }: { children: React.ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>; }
function Badge({ children }: { children: React.ReactNode }) { return <span style={badgeStyle}>{children}</span>; }

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "28px" };
const headerActionsStyle: React.CSSProperties = { display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "flex-end" };
const eyebrowStyle: React.CSSProperties = { color: colors.red, fontWeight: 800, margin: "0 0 8px" };
const titleStyle: React.CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const subtitleStyle: React.CSSProperties = { maxWidth: "780px", fontSize: "17px", lineHeight: 1.7, color: colors.muted, marginTop: "14px" };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "14px 18px", minHeight: "46px", background: colors.red, color: colors.white, fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const primarySmallButtonStyle: React.CSSProperties = { ...primaryButtonStyle, padding: "11px 15px", minHeight: "42px" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" };
const summaryCardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px", color: colors.muted, fontWeight: 800 };
const cardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "28px", boxShadow: shadow.soft, marginBottom: "24px" };
const tableHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const counterStyle: React.CSSProperties = { color: colors.muted, fontWeight: 700 };
const pipelineGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(220px, 1fr))", gap: "16px", overflowX: "auto" };
const pipelineColumnStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.inputBackground, padding: "16px", minHeight: "260px" };
const pipelineTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "15px", fontWeight: 850 };
const pipelineMetaStyle: React.CSSProperties = { margin: "6px 0 14px", color: colors.muted, fontSize: "13px", fontWeight: 700 };
const pipelineCardsStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
const pipelineCardStyle: React.CSSProperties = { background: colors.white, border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "14px", cursor: "grab", display: "flex", flexDirection: "column", gap: "5px", textAlign: "left", color: colors.text };
const filtersStyle: React.CSSProperties = { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "18px" };
const filterStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", background: colors.card, color: colors.text, minWidth: "160px" };
const tableWrapperStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "14px 16px", color: colors.muted, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}` };
const rowStyle: React.CSSProperties = { borderBottom: `1px solid ${colors.border}` };
const tdStyle: React.CSSProperties = { padding: "16px", color: colors.text, verticalAlign: "middle" };
const badgeStyle: React.CSSProperties = { display: "inline-flex", borderRadius: radius.badge, padding: "7px 12px", background: "rgba(23, 59, 115, 0.10)", color: colors.navy, fontWeight: 800, fontSize: "13px" };
const emptyStyle: React.CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "18px", color: colors.muted, fontWeight: 700, textAlign: "center" };
const drawerOverlayStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 50, background: "rgba(15, 23, 42, 0.32)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "flex-end" };
const drawerStyle: React.CSSProperties = { width: "560px", maxWidth: "100%", height: "100vh", background: colors.card, borderLeft: `1px solid ${colors.border}`, boxShadow: "-12px 0 30px rgba(15, 23, 42, 0.12)", padding: "28px", overflowY: "auto" };
const drawerHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", marginBottom: "16px" };
const drawerActionsStyle: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: "10px", marginBottom: "24px", flexWrap: "wrap" };
const drawerTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "28px", lineHeight: 1.15 };
const closeButtonStyle: React.CSSProperties = { width: "40px", height: "40px", borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const drawerContentStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "18px" };
const drawerSectionStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "20px", background: colors.white };
const editableRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "180px 1fr", gap: "14px", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${colors.border}`, color: colors.muted, fontWeight: 700 };
const textareaRowStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 700 };
const inputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", background: colors.inputBackground, color: colors.text, fontWeight: 650, outline: "none" };
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: "vertical", minHeight: "96px", lineHeight: 1.6 };
const taskListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
const taskItemStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "14px", background: colors.inputBackground, display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center" };
const taskCheckLabelStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 12, flex: 1, cursor: "pointer" };
const taskCheckboxStyle: React.CSSProperties = { width: 18, height: 18, marginTop: 4, cursor: "pointer" };
const taskTitleStyle: React.CSSProperties = { fontWeight: 850, color: colors.text, marginBottom: "5px" };
const taskMetaStyle: React.CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 650 };
const taskStatusButtonStyle: React.CSSProperties = { width: 118, minWidth: 118, height: 44, borderRadius: 999, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13 };
const offerLinkPanelStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "16px", background: colors.inputBackground, display: "flex", justifyContent: "center" };
const proposalButtonStyle: React.CSSProperties = { ...primaryButtonStyle, minHeight: "54px", width: "100%", fontSize: "16px" };
const fileDropzoneStyle: React.CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "18px", background: colors.inputBackground, display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center" };
const fileItemStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "12px 14px", background: colors.white, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginTop: "10px" };
const fileActionsStyle: React.CSSProperties = { display: "flex", gap: "8px" };
const dangerButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "8px 12px", background: "rgba(220, 38, 38, 0.10)", color: colors.danger, fontWeight: 800, cursor: "pointer" };
const hintStyle: React.CSSProperties = { color: colors.muted, fontSize: "13px", lineHeight: 1.6 };
