"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { AppDateInput } from "@/components/AppDateInputs";
import { colors, radius, shadow } from "@/app/design";
import { normalizeContactList } from "@/lib/contactFields";
import { supabase } from "@/lib/supabaseClient";
import {
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
  przegrana_do_ponownego_kontaktu: boolean | null;
  przegrana_ponowny_kontakt_at: string | null;
  liczba_dokumentow: number | null;
  liczba_transakcji: number | null;
  czy_kadry: boolean | null;
  liczba_pracownikow: number | null;
  liczba_zleceniobiorcow: number | null;
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
  przegrana_do_ponownego_kontaktu: boolean;
  przegrana_ponowny_kontakt_at: string;
  liczba_dokumentow: string;
  liczba_transakcji: string;
  czy_kadry: boolean;
  liczba_pracownikow: string;
  liczba_zleceniobiorcow: string;
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

type CrmStatsPeriod = "all" | "month" | "year";

const EMPTY_FILTER = "Wszystkie";
const PIPELINE_STAGES = ["nowy_lead", "kontakt_proba_kontaktu", "rozmowa_online", "propozycja_wspolpracy_wyslana", "decyzja"];
const PIPELINE_LABELS: Record<string, string> = {
  nowy_lead: "Nowy lead",
  kontakt_proba_kontaktu: "Kontakt / próba kontaktu",
  rozmowa_online: "Rozmowa online",
  propozycja_wspolpracy_wyslana: "Propozycja współpracy wysłana",
  decyzja: "Decyzja",
};
const STATUSES = [
  { value: "otwarta", label: "Otwarta" },
  { value: "wygrana", label: "Wygrana" },
  { value: "przegrana", label: "Przegrana" },
];
const LEGAL_FORM_OPTIONS = [
  { value: "", label: "Wybierz" },
  { value: "JDG", label: "JDG" },
  { value: "sp. z o.o.", label: "sp. z o.o." },
  { value: "prosta spółka akcyjna", label: "prosta spółka akcyjna" },
  { value: "organizacja", label: "organizacja" },
];
const STAGE_FILTER_OPTIONS = [{ value: EMPTY_FILTER, label: "Etap" }, ...PIPELINE_STAGES.map((stage) => ({ value: stage, label: PIPELINE_LABELS[stage] }))];
const STATUS_FILTER_OPTIONS = [{ value: EMPTY_FILTER, label: "Status" }, ...STATUSES];
const PAYROLL_FILTER_OPTIONS = [{ value: EMPTY_FILTER, label: "Kadry" }, { value: "Tak", label: "Tak" }, { value: "Nie", label: "Nie" }];

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
  const [searchQuery, setSearchQuery] = useState("");
  const [openedLeadFromUrl, setOpenedLeadFromUrl] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState<CrmStatsPeriod>("all");

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (openedLeadFromUrl || loading || selectedLead || typeof window === "undefined") return;
    const leadId = new URLSearchParams(window.location.search).get("leadId");
    if (!leadId) return;
    const leadToOpen = leads.find((lead) => lead.id === leadId);
    if (leadToOpen) {
      setSelectedLead(leadToOpen);
      setOpenedLeadFromUrl(true);
    }
  }, [leads, loading, openedLeadFromUrl, selectedLead]);

  async function loadInitialData() {
    setLoading(true);
    const [leadsResult, tasksResult] = await Promise.all([fetchCrmLeads(), fetchCrmTasks()]);
    if (leadsResult.error) console.error("Błąd pobierania CRM:", leadsResult.error);
    else setLeads((leadsResult.data || []) as Lead[]);
    if (tasksResult.error) console.error("Błąd pobierania zadań CRM:", tasksResult.error);
    else setTasks((tasksResult.data || []) as CrmTask[]);
    setLoading(false);
  }

  async function refreshCrmTasks() {
    const tasksResult = await fetchCrmTasks();
    if (tasksResult.error) console.error("Błąd pobierania zadań CRM:", tasksResult.error);
    else setTasks((tasksResult.data || []) as CrmTask[]);
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
    await refreshCrmTasks();
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
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const searchableText = [
      lead.nazwa,
      lead.osoba_kontaktowa,
      lead.email,
      lead.telefon,
      lead.nip,
      lead.forma_prawna,
      lead.zrodlo_leada,
      lead.powod_kontaktu,
      lead.notatki,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesStage = stageFilter === EMPTY_FILTER || lead.etap === stageFilter;
    const matchesStatus = statusFilter === EMPTY_FILTER || lead.status === statusFilter;
    const matchesKadry = kadryFilter === EMPTY_FILTER || (kadryFilter === "Tak" && lead.czy_kadry) || (kadryFilter === "Nie" && !lead.czy_kadry);
    const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
    return matchesSearch && matchesStage && matchesStatus && matchesKadry;
  });
  const currentMonthStats = buildCrmStats(leads, "month");
  const crmStats = buildCrmStats(leads, statsPeriod);

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł zarządczy</p>
          <h1 style={titleStyle}>CRM</h1>
        </div>
        <div style={headerActionsStyle}>
          <Link href="/crm/oferty" style={secondaryButtonStyle}>Propozycje współpracy</Link>
          <button style={primaryButtonStyle} onClick={() => setCreatingLead(true)}>Dodaj szansę</button>
        </div>
      </section>

      <section style={summaryGridStyle}>
        <SummaryCard label="Aktywne szanse" value={currentMonthStats.activeCount} />
        <SummaryCard label="Szacowany MRR" value={`${currentMonthStats.activeMrr.toLocaleString("pl-PL")} zł`} />
        <SummaryCard label="Wygrane" value={currentMonthStats.wonCount} />
        <SummaryCard label="Przegrane" value={currentMonthStats.lostCount} />
      </section>

      <section style={cardStyle}>
        <div style={statsHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Statystyki sprzedaży</h2>
            <p style={statsHintStyle}>Lejek, MRR i skuteczność liczone dla wybranego zakresu szans.</p>
          </div>
          <button type="button" style={primaryButtonStyle} onClick={() => setStatsOpen((current) => !current)}>
            {statsOpen ? "Ukryj statystyki" : "Statystyki"}
          </button>
        </div>
        {statsOpen && (
          <div style={statsPanelStyle}>
            <div style={statsTabsStyle}>
              <button type="button" style={statsTabStyle(statsPeriod === "all")} onClick={() => setStatsPeriod("all")}>Wszystkie</button>
              <button type="button" style={statsTabStyle(statsPeriod === "month")} onClick={() => setStatsPeriod("month")}>Ten miesiąc</button>
              <button type="button" style={statsTabStyle(statsPeriod === "year")} onClick={() => setStatsPeriod("year")}>Ten rok</button>
            </div>
            <div style={statsKpiGridStyle}>
              <StatTile label="Skuteczność" value={formatPercent(crmStats.successRate)} hint={`${crmStats.wonCount} wygranych / ${crmStats.closedCount} zamkniętych`} />
              <StatTile label="MRR wygrany" value={formatMoney(crmStats.wonMrr)} hint="Suma miesięcznych abonamentów z wygranych szans" />
              <StatTile label="Skuteczność kwotowa" value={formatPercent(crmStats.valueSuccessRate)} hint={`${formatMoney(crmStats.wonMrr)} z ${formatMoney(crmStats.closedMrr)} zamkniętego MRR`} />
              {statsPeriod !== "month" && <StatTile label="Śr. miesięczny MRR" value={formatMoney(crmStats.averageMonthlyWonMrr)} hint={`Wygrany MRR / ${crmStats.averageMonthsCount} mies.`} />}
              <StatTile label="Śr. MRR na szansę" value={formatMoney(crmStats.averageMrrPerLead)} hint={`${crmStats.totalCount} szans w okresie`} />
              <StatTile label="Potencjał aktywny" value={formatMoney(crmStats.activeMrr)} hint={`${crmStats.activeCount} otwartych szans`} />
              <StatTile label="MRR utracony" value={formatMoney(crmStats.lostMrr)} hint={`${crmStats.lostCount} przegranych szans`} />
              <StatTile label="Kadry w szansach" value={formatPercent(crmStats.payrollShare)} hint={`${crmStats.payrollCount} z ${crmStats.totalCount} szans`} />
            </div>
            <div style={funnelStyle}>
              <div style={funnelTopRowStyle}>
                <strong style={funnelTitleStyle}>Przechodzenie przez etapy</strong>
                <span style={statsHintStyle}>{crmStats.periodLabel}</span>
              </div>
              {crmStats.stageRows.map((row) => (
                <div key={row.stage} style={funnelRowStyle}>
                  <div style={funnelLabelStyle}>
                    <strong>{row.label}</strong>
                  </div>
                  <div style={funnelBarStyle}>
                    {row.reachedCount > 0 && (
                      <div style={{ ...funnelSegmentStyle, ...funnelPassedSegmentStyle, flexGrow: row.reachedCount }}>
                        {row.reachedCount || ""}
                      </div>
                    )}
                    {row.dropCount > 0 && (
                      <div style={{ ...funnelSegmentStyle, ...funnelDroppedSegmentStyle, flexGrow: row.dropCount }}>
                        {row.dropCount || ""}
                      </div>
                    )}
                    {row.previousDropCount > 0 && (
                      <div style={{ ...funnelSegmentStyle, ...funnelPreviousDropSegmentStyle, flexGrow: row.previousDropCount }}>
                        {row.previousDropCount || ""}
                      </div>
                    )}
                  </div>
                  <span style={funnelPercentStyle}>{formatPercent(row.reachedRate)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
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
        <input
          style={searchInputStyle}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Szukaj po nazwie szansy, kontakcie, NIP lub notatce"
        />
        <div style={filtersStyle}>
          <AppSelect style={filterStyle} value={stageFilter} options={STAGE_FILTER_OPTIONS} onChange={setStageFilter} />
          <AppSelect style={filterStyle} value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} />
          <AppSelect style={filterStyle} value={kadryFilter} options={PAYROLL_FILTER_OPTIONS} onChange={setKadryFilter} />
        </div>
        {loading ? <div style={emptyStyle}>Ładowanie danych...</div> : filteredLeads.length === 0 ? <div style={emptyStyle}>Brak szans sprzedaży do wyświetlenia</div> : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead><tr><Th>Firma</Th><Th>Etap</Th><Th>Status</Th><Th>Kadry</Th><Th>MRR</Th><Th>Akcje</Th></tr></thead>
              <tbody>{filteredLeads.map((lead) => (
                <tr key={lead.id} style={rowStyle}>
                  <Td strong>{lead.nazwa || "—"}</Td>
                  <Td>{PIPELINE_LABELS[lead.etap || ""] || lead.etap || "—"}</Td>
                  <Td><Badge>{statusLabel(lead.status)}</Badge></Td>
                  <Td>{lead.czy_kadry ? "Tak" : "Nie"}</Td>
                  <Td>{lead.szacowany_mrr ? `${lead.szacowany_mrr.toLocaleString("pl-PL")} zł` : "—"}</Td>
                  <Td><button style={secondaryButtonStyle} onClick={() => setSelectedLead(lead)}>Szczegóły</button></Td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {creatingLead && <LeadDrawer mode="create" tasks={[]} onClose={() => setCreatingLead(false)} onCreated={(lead) => { setLeads((current) => [lead, ...current]); setCreatingLead(false); void loadInitialData(); }} />}
      {selectedLead && <LeadDrawer mode="edit" lead={selectedLead} tasks={tasks.filter((task) => task.crm_id === selectedLead.id)} onClose={() => setSelectedLead(null)} onSaved={(lead) => { setLeads((current) => current.map((item) => item.id === lead.id ? lead : item)); setSelectedLead(lead); void loadInitialData(); }} onDeleted={removeLead} onToggleTaskStatus={toggleTaskStatus} />}
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

  function updateDraft<K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const loadDocuments = useCallback(async () => {
    if (!lead) return;
    setDocumentsLoading(true);
    const { data, error } = await fetchCrmDocuments(lead.id);
    if (error) console.error("Błąd pobierania dokumentów CRM:", error);
    else setDocuments(data || []);
    setDocumentsLoading(false);
  }, [lead]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mode === "edit" && lead) void loadDocuments();
  }, [mode, lead, loadDocuments]);

  async function saveLead() {
    if (!draft.nazwa.trim()) {
      alert("Nazwa firmy jest wymagana.");
      return;
    }
    if (draft.status === "przegrana" && draft.przegrana_do_ponownego_kontaktu && !draft.przegrana_ponowny_kontakt_at) {
      alert("Wybierz datę ponownego kontaktu dla przegranej szansy.");
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
            <EditableInput label="Email" value={draft.email} placeholder="mail1@firma.pl; mail2@firma.pl" onChange={(value) => updateDraft("email", value)} />
            <EditableInput label="NIP" value={draft.nip} onChange={(value) => updateDraft("nip", value)} />
          </FormSection>

          <FormSection title="Sprzedaż">
            <EditableSelect label="Etap" value={draft.etap} onChange={(value) => updateDraft("etap", value)} options={PIPELINE_STAGES.map((stage) => ({ value: stage, label: PIPELINE_LABELS[stage] }))} />
            <EditableSelect label="Status" value={draft.status} onChange={(value) => updateDraft("status", value)} options={STATUSES} />
            {draft.status === "przegrana" && (
              <>
                <EditableCheckbox label="Do ponownego kontaktu" checked={draft.przegrana_do_ponownego_kontaktu} onChange={(value) => updateDraft("przegrana_do_ponownego_kontaktu", value)} />
                {draft.przegrana_do_ponownego_kontaktu && (
                  <EditableInput label="Data ponownego kontaktu" type="date" value={draft.przegrana_ponowny_kontakt_at} onChange={(value) => updateDraft("przegrana_ponowny_kontakt_at", value)} />
                )}
              </>
            )}
            <EditableInput label="Źródło leada" value={draft.zrodlo_leada} onChange={(value) => updateDraft("zrodlo_leada", value)} />
            <EditableInput label="Szacowany MRR" type="number" value={draft.szacowany_mrr} onChange={(value) => updateDraft("szacowany_mrr", value)} />
          </FormSection>

          <FormSection title="Zakres obsługi">
            <EditableSelect label="Forma prawna" value={draft.forma_prawna} onChange={(value) => updateDraft("forma_prawna", value)} options={LEGAL_FORM_OPTIONS} />
            <EditableInput label="Liczba dokumentów" type="number" value={draft.liczba_dokumentow} onChange={(value) => updateDraft("liczba_dokumentow", value)} />
            <EditableInput label="Liczba transakcji" type="number" value={draft.liczba_transakcji} onChange={(value) => updateDraft("liczba_transakcji", value)} />
            <EditableCheckbox label="Kadry" checked={draft.czy_kadry} onChange={(value) => updateDraft("czy_kadry", value)} />
            {draft.czy_kadry && <EditableInput label="Liczba pracowników" type="number" value={draft.liczba_pracownikow} onChange={(value) => updateDraft("liczba_pracownikow", value)} />}
            {draft.czy_kadry && <EditableInput label="Liczba zleceniobiorców" type="number" value={draft.liczba_zleceniobiorcow} onChange={(value) => updateDraft("liczba_zleceniobiorcow", value)} />}
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
                <Link href={`/crm/oferty?leadId=${lead?.id}`} style={proposalButtonStyle}>Przejdź do propozycji</Link>
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

          <TermsAndNotesSection>
            <div style={notesColumnStyle}>
              <EditableTextarea label="Powód kontaktu" value={draft.powod_kontaktu} onChange={(value) => updateDraft("powod_kontaktu", value)} rows={7} />
              <EditableTextarea label="Notatki" value={draft.notatki} onChange={(value) => updateDraft("notatki", value)} rows={16} />
            </div>
            <div style={datesColumnStyle}>
              <EditableInput label="Data telefonu" type="date" value={draft.data_telefonu} onChange={(value) => updateDraft("data_telefonu", value)} />
              <EditableInput label="Data spotkania" type="date" value={draft.data_spotkania_online} onChange={(value) => updateDraft("data_spotkania_online", value)} />
              <EditableInput label="Data wysłania propozycji" type="date" value={draft.data_wyslania_oferty} onChange={(value) => updateDraft("data_wyslania_oferty", value)} />
              <EditableInput label="Data follow-up" type="date" value={draft.data_follow_up} onChange={(value) => updateDraft("data_follow_up", value)} />
            </div>
          </TermsAndNotesSection>
        </div>
      </aside>
    </div>
  );
}

function createEmptyDraft(): LeadDraft {
  return { nazwa: "", osoba_kontaktowa: "", telefon: "", email: "", nip: "", forma_prawna: "", etap: "nowy_lead", status: "otwarta", zrodlo_leada: "", szacowany_mrr: "", data_telefonu: "", data_spotkania_online: "", data_wyslania_oferty: "", data_follow_up: "", powod_kontaktu: "", przegrana_do_ponownego_kontaktu: false, przegrana_ponowny_kontakt_at: "", liczba_dokumentow: "", liczba_transakcji: "", czy_kadry: false, liczba_pracownikow: "", liczba_zleceniobiorcow: "", powod_przegranej: "", notatki: "" };
}

function createDraft(lead: Lead): LeadDraft {
  return { nazwa: lead.nazwa || "", osoba_kontaktowa: lead.osoba_kontaktowa || "", telefon: lead.telefon || "", email: lead.email || "", nip: lead.nip || "", forma_prawna: lead.forma_prawna || "", etap: lead.etap || "nowy_lead", status: lead.status || "otwarta", zrodlo_leada: lead.zrodlo_leada || "", szacowany_mrr: lead.szacowany_mrr !== null && lead.szacowany_mrr !== undefined ? String(lead.szacowany_mrr) : "", data_telefonu: formatDateForInput(lead.data_telefonu), data_spotkania_online: formatDateForInput(lead.data_spotkania_online), data_wyslania_oferty: formatDateForInput(lead.data_wyslania_oferty), data_follow_up: formatDateForInput(lead.data_follow_up), powod_kontaktu: lead.powod_kontaktu || "", przegrana_do_ponownego_kontaktu: Boolean(lead.przegrana_do_ponownego_kontaktu), przegrana_ponowny_kontakt_at: formatDateForInput(lead.przegrana_ponowny_kontakt_at), liczba_dokumentow: lead.liczba_dokumentow !== null && lead.liczba_dokumentow !== undefined ? String(lead.liczba_dokumentow) : "", liczba_transakcji: lead.liczba_transakcji !== null && lead.liczba_transakcji !== undefined ? String(lead.liczba_transakcji) : "", czy_kadry: Boolean(lead.czy_kadry), liczba_pracownikow: lead.liczba_pracownikow !== null && lead.liczba_pracownikow !== undefined ? String(lead.liczba_pracownikow) : "", liczba_zleceniobiorcow: lead.liczba_zleceniobiorcow !== null && lead.liczba_zleceniobiorcow !== undefined ? String(lead.liczba_zleceniobiorcow) : "", powod_przegranej: lead.powod_przegranej || "", notatki: lead.notatki || "" };
}

function createLeadPayload(draft: LeadDraft) {
  const shouldRecontactLostLead = draft.status === "przegrana" && draft.przegrana_do_ponownego_kontaktu;
  return { nazwa: draft.nazwa.trim(), osoba_kontaktowa: draft.osoba_kontaktowa.trim() || null, telefon: normalizeContactList(draft.telefon), email: normalizeContactList(draft.email), nip: draft.nip.trim() || null, forma_prawna: draft.forma_prawna.trim() || null, etap: draft.etap, status: draft.status, zrodlo_leada: draft.zrodlo_leada.trim() || null, szacowany_mrr: draft.szacowany_mrr ? Number(draft.szacowany_mrr) : null, data_telefonu: draft.data_telefonu || null, data_spotkania_online: draft.data_spotkania_online || null, data_wyslania_oferty: draft.data_wyslania_oferty || null, data_follow_up: draft.data_follow_up || null, powod_kontaktu: draft.powod_kontaktu.trim() || null, przegrana_do_ponownego_kontaktu: shouldRecontactLostLead, przegrana_ponowny_kontakt_at: shouldRecontactLostLead ? draft.przegrana_ponowny_kontakt_at || null : null, liczba_dokumentow: draft.liczba_dokumentow ? Number(draft.liczba_dokumentow) : null, liczba_transakcji: draft.liczba_transakcji ? Number(draft.liczba_transakcji) : null, czy_kadry: draft.czy_kadry, liczba_pracownikow: draft.liczba_pracownikow ? Number(draft.liczba_pracownikow) : null, liczba_zleceniobiorcow: draft.liczba_zleceniobiorcow ? Number(draft.liczba_zleceniobiorcow) : null, powod_przegranej: draft.powod_przegranej.trim() || null, notatki: draft.notatki.trim() || null };
}

function formatDateForInput(value: string | null) { return value ? value.slice(0, 10) : ""; }
function formatFileSize(size: number | null) { if (!size) return "Brak rozmiaru"; return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function statusLabel(status: string | null) { return STATUSES.find((item) => item.value === status)?.label || status || "Brak"; }

function SummaryCard({ label, value }: { label: string; value: string | number }) { return <div style={summaryCardStyle}><span>{label}</span><strong>{value}</strong></div>; }
function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <section style={drawerSectionStyle}><h3>{title}</h3>{children}</section>; }
function TermsAndNotesSection({ children }: { children: React.ReactNode }) { return <section style={termsSectionStyle}><h3>Terminy i notatki</h3><div style={termsGridStyle}>{children}</div></section>; }
function EditableInput({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number" | "email" | "date"; placeholder?: string }) {
  return (
    <label style={editableRowStyle}>
      <span>{label}</span>
      {type === "date" ? (
        <AppDateInput value={value} onChange={onChange} style={inputStyle} />
      ) : (
        <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
      )}
    </label>
  );
}
function EditableSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <label style={editableRowStyle}><span>{label}</span><AppSelect value={value} onChange={onChange} style={inputStyle} options={options} /></label>; }
function EditableCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label style={editableRowStyle}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={editableCheckboxStyle} /></label>; }
function EditableTextarea({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) { return <label style={textareaRowStyle}><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} style={textareaStyle} rows={rows} /></label>; }
function Th({ children }: { children: React.ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>; }
function Badge({ children }: { children: React.ReactNode }) { return <span style={badgeStyle}>{children}</span>; }
function StatTile({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <div style={statTileStyle}><span>{label}</span><strong style={statTileValueStyle}>{value}</strong><small style={statTileHintStyle}>{hint}</small></div>;
}

function buildCrmStats(leads: Lead[], period: CrmStatsPeriod) {
  const { start, end, label } = currentStatsRange(period);
  const periodLeads = start && end ? leads.filter((lead) => isDateInRange(lead.created_at, start, end)) : leads;
  const totalCount = periodLeads.length;
  const activeLeads = periodLeads.filter((lead) => lead.status === "otwarta");
  const wonLeads = periodLeads.filter((lead) => lead.status === "wygrana");
  const lostLeads = periodLeads.filter((lead) => lead.status === "przegrana");
  const closedLeads = [...wonLeads, ...lostLeads];
  const totalMrr = sumMrr(periodLeads);
  const wonMrr = sumMrr(wonLeads);
  const lostMrr = sumMrr(lostLeads);
  const closedMrr = wonMrr + lostMrr;
  const activeMrr = sumMrr(activeLeads);
  const payrollCount = periodLeads.filter((lead) => Boolean(lead.czy_kadry)).length;
  const followUpCount = activeLeads.filter((lead) => Boolean(lead.data_follow_up)).length;
  const averageMonthsCount = countMonthsFromFirstLead(periodLeads);
  let previousStageLeads = periodLeads;
  const reachedCounts = PIPELINE_STAGES.map((stage, index) => {
    const candidates = index === 0 ? periodLeads : previousStageLeads;
    const reachedLeads = candidates.filter((lead) => didReachStage(lead, index));
    previousStageLeads = reachedLeads;
    return {
      stage,
      reachedLeads,
      reachedCount: reachedLeads.length,
    };
  });
  const stageRows = reachedCounts.map((stageResult, index) => {
    const { stage, reachedLeads, reachedCount } = stageResult;
    const previousReachedLeads = index === 0 ? periodLeads : reachedCounts[index - 1]?.reachedLeads || [];
    const previousCount = previousReachedLeads.length;
    const dropLeads = index === 0
      ? []
      : previousReachedLeads.filter((lead) => !reachedLeads.some((reachedLead) => reachedLead.id === lead.id));
    const dropCount = dropLeads.length;
    const previousDropCount = Math.max(0, totalCount - previousCount);
    const dropMrr = sumMrr(dropLeads);
    return {
      stage,
      label: PIPELINE_LABELS[stage],
      reachedCount,
      notReachedCount: Math.max(0, totalCount - reachedCount),
      reachedRate: totalCount ? Math.round((reachedCount / totalCount) * 100) : 0,
      stepRate: totalCount === 0 ? 0 : index === 0 ? 100 : previousCount ? Math.round((reachedCount / previousCount) * 100) : 0,
      dropCount,
      previousDropCount,
      dropRate: previousCount ? Math.round((dropCount / previousCount) * 100) : 0,
      dropMrr,
      reachedMrr: sumMrr(reachedLeads),
      notReachedMrr: Math.max(0, totalMrr - sumMrr(reachedLeads)),
    };
  });

  return {
    totalCount,
    activeCount: activeLeads.length,
    wonCount: wonLeads.length,
    lostCount: lostLeads.length,
    closedCount: closedLeads.length,
    successRate: closedLeads.length ? Math.round((wonLeads.length / closedLeads.length) * 100) : 0,
    valueSuccessRate: closedMrr ? Math.round((wonMrr / closedMrr) * 100) : 0,
    averageMonthlyWonMrr: averageMonthsCount ? wonMrr / averageMonthsCount : 0,
    averageMonthsCount,
    averageMrrPerLead: totalCount ? totalMrr / totalCount : 0,
    activeMrr,
    wonMrr,
    lostMrr,
    closedMrr,
    payrollCount,
    payrollShare: totalCount ? Math.round((payrollCount / totalCount) * 100) : 0,
    followUpCount,
    periodLabel: label,
    stageRows,
  };
}

function currentStatsRange(period: CrmStatsPeriod) {
  const now = new Date();
  if (period === "all") {
    return { start: null, end: null, label: "Wszystkie szanse" };
  }
  const start = period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), 0, 1);
  const end = period === "month" ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : new Date(now.getFullYear() + 1, 0, 1);
  const label = period === "month"
    ? `Ten miesiąc: ${start.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}`
    : `Ten rok: ${start.getFullYear()}`;
  return { start, end, label };
}

function countMonthsFromFirstLead(leads: Lead[]) {
  const validDates = leads
    .map((lead) => lead.created_at ? new Date(lead.created_at) : null)
    .filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()));
  if (validDates.length === 0) return 0;

  const firstDate = validDates.reduce((earliest, date) => date < earliest ? date : earliest, validDates[0]);
  const now = new Date();
  const startMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return Math.max(1, (currentMonth.getFullYear() - startMonth.getFullYear()) * 12 + currentMonth.getMonth() - startMonth.getMonth() + 1);
}

function isDateInRange(value: string | null, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start && date < end;
}

function didReachStage(lead: Lead, stageIndex: number) {
  if (stageIndex === 0) return true;

  const leadStageIndex = PIPELINE_STAGES.indexOf(lead.etap || "");
  const isClosed = lead.status === "wygrana" || lead.status === "przegrana" || lead.etap === "zamknieta";
  if (leadStageIndex >= stageIndex) return true;

  if (stageIndex === 1) {
    return Boolean(lead.data_telefonu || lead.data_spotkania_online || lead.data_wyslania_oferty || lead.data_follow_up || isClosed);
  }
  if (stageIndex === 2) {
    return Boolean(lead.data_spotkania_online || lead.data_wyslania_oferty || lead.data_follow_up || isClosed);
  }
  if (stageIndex === 3) {
    return Boolean(lead.data_wyslania_oferty);
  }
  if (stageIndex === 4) {
    return Boolean(lead.data_wyslania_oferty && isClosed);
  }

  return false;
}

function sumMrr(leads: Lead[]) {
  return leads.reduce((sum, lead) => sum + Number(lead.szacowany_mrr || 0), 0);
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("pl-PL")} zł`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "28px" };
const headerActionsStyle: React.CSSProperties = { display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "flex-end" };
const eyebrowStyle: React.CSSProperties = { color: colors.red, fontWeight: 800, margin: "0 0 8px" };
const titleStyle: React.CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "14px 18px", minHeight: "46px", background: colors.red, color: colors.white, fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const primarySmallButtonStyle: React.CSSProperties = { ...primaryButtonStyle, padding: "11px 15px", minHeight: "42px" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" };
const summaryCardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px", color: colors.muted, fontWeight: 800 };
const cardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "28px", boxShadow: shadow.soft, marginBottom: "24px" };
const statsHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const statsHintStyle: React.CSSProperties = { margin: "7px 0 0", color: colors.muted, fontSize: "13px", lineHeight: 1.45, fontWeight: 650 };
const statsPanelStyle: React.CSSProperties = { marginTop: "20px", display: "grid", gap: "18px" };
const statsTabsStyle: React.CSSProperties = { display: "inline-flex", width: "fit-content", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, padding: "4px", gap: "4px" };
const statsTabStyle = (active: boolean): React.CSSProperties => ({ border: "none", borderRadius: radius.button, background: active ? colors.navy : "transparent", color: active ? colors.white : colors.navy, padding: "9px 13px", fontWeight: 850, cursor: "pointer" });
const statsKpiGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" };
const statTileStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", display: "grid", gap: "6px", color: colors.muted, fontWeight: 750, minHeight: "112px" };
const statTileValueStyle: React.CSSProperties = { color: colors.navy, fontSize: "22px", lineHeight: 1.1 };
const statTileHintStyle: React.CSSProperties = { color: colors.muted, lineHeight: 1.35, fontSize: "12px", fontWeight: 650 };
const funnelStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "18px", display: "grid", gap: "14px" };
const funnelTopRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" };
const funnelTitleStyle: React.CSSProperties = { color: colors.navy, fontSize: "16px" };
const funnelRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "220px minmax(220px, 1fr) 56px", gap: "12px", alignItems: "center" };
const funnelLabelStyle: React.CSSProperties = { display: "grid", gap: "4px", color: colors.text, fontSize: "13px", fontWeight: 750 };
const funnelBarStyle: React.CSSProperties = { height: "34px", borderRadius: radius.badge, background: "#eef2f7", display: "flex", alignItems: "stretch", overflow: "hidden" };
const funnelSegmentStyle: React.CSSProperties = { flexBasis: 0, minWidth: 0, overflow: "hidden", color: colors.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 900 };
const funnelPassedSegmentStyle: React.CSSProperties = { background: colors.navy };
const funnelDroppedSegmentStyle: React.CSSProperties = { background: colors.red };
const funnelPreviousDropSegmentStyle: React.CSSProperties = { background: "#d8dee8", color: colors.navy };
const funnelPercentStyle: React.CSSProperties = { color: colors.navy, fontWeight: 900, textAlign: "right", fontSize: "13px" };
const tableHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const counterStyle: React.CSSProperties = { color: colors.muted, fontWeight: 700 };
const pipelineGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(220px, 1fr))", gap: "16px", overflowX: "auto" };
const pipelineColumnStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.inputBackground, padding: "16px", minHeight: "260px" };
const pipelineTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "15px", fontWeight: 850 };
const pipelineMetaStyle: React.CSSProperties = { margin: "6px 0 14px", color: colors.muted, fontSize: "13px", fontWeight: 700 };
const pipelineCardsStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
const pipelineCardStyle: React.CSSProperties = { background: colors.white, border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "14px", cursor: "grab", display: "flex", flexDirection: "column", gap: "5px", textAlign: "left", color: colors.text };
const searchInputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "13px 18px", fontSize: "14px", fontWeight: 600, marginBottom: "16px" };
const filtersStyle: React.CSSProperties = { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "18px" };
const filterStyle: React.CSSProperties = { width: "180px", flex: "0 0 180px", border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", background: colors.card, color: colors.text };
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
const termsSectionStyle: React.CSSProperties = { ...drawerSectionStyle, position: "relative" };
const termsGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(300px, 0.85fr)", gap: "18px 22px", alignItems: "start" };
const notesColumnStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "18px", minWidth: 0 };
const datesColumnStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "14px", minWidth: 0, position: "relative", zIndex: 1 };
const editableRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "180px 1fr", gap: "14px", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${colors.border}`, color: colors.muted, fontWeight: 700 };
const editableCheckboxStyle: React.CSSProperties = { width: 18, height: 18, margin: 0, justifySelf: "start", cursor: "pointer" };
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
