"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius, shadow } from "@/app/design";
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
  created_at: string | null;
  updated_at: string | null;
};

const EMPTY_FILTER = "Wszystkie";

const PIPELINE_STAGES = [
  "nowy_lead",
  "kontakt_proba_kontaktu",
  "rozmowa_online",
  "propozycja_wspolpracy_wyslana",
  "decyzja",
];

const PIPELINE_LABELS: Record<string, string> = {
  nowy_lead: "Nowy lead",
  kontakt_proba_kontaktu: "Kontakt / próba kontaktu",
  rozmowa_online: "Rozmowa online",
  propozycja_wspolpracy_wyslana: "Propozycja współpracy wysłana",
  decyzja: "Decyzja",
};

const DEFAULT_TASKS_BY_STAGE: Record<string, string[]> = {
  nowy_lead: [
    "Uzupełnij źródło leada",
    "Skontaktuj się z leadem do 30 minut",
  ],

  kontakt_proba_kontaktu: [
    "Zadzwoń lub odpisz i zaproponuj termin rozmowy online",
    "Jeśli brak odpowiedzi, ustaw kolejne zadanie follow-up",
    "Zapisz wynik kontaktu",
  ],

  rozmowa_online: [
    "Zapisz powód kontaktu",
    "Zbierz minimum danych do wyceny",
    "Zapisz, czy przygotowujemy ofertę",
  ],

  propozycja_wspolpracy_wyslana: [
    "Zapisz datę wysłania propozycji",
    "Ustaw follow-up D+2",
    "Ustaw follow-up D+5",
  ],

  decyzja: [
    "Zamknij szansę jako wygrana albo przegrana",
    "Jeśli przegrana, zapisz powód",
  ],
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
  const [loading, setLoading] = useState(true);
  const [creatingLead, setCreatingLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const toggleTaskStatus = (taskId: string) => {
  setTasks((prevTasks) =>
    prevTasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: task.status === "zrobione" ? "do_zrobienia" : "zrobione",
          }
        : task
    )
  );
};

  const [stageFilter, setStageFilter] = useState(EMPTY_FILTER);
  const [statusFilter, setStatusFilter] = useState(EMPTY_FILTER);
  const [kadryFilter, setKadryFilter] = useState(EMPTY_FILTER);


  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    await loadLeads();
    await loadTasks();
    setLoading(false);
  }

  async function loadLeads() {
    const { data, error } = await supabase
      .from("crm_szanse_sprzedazy")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Błąd pobierania CRM:", error);
      return;
    }

    setLeads(data || []);
  }

async function loadTasks() {
  const { data, error } = await supabase
    .from("crm_zadania")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Błąd pobierania zadań CRM:", error);
    return;
  }

  setTasks(data || []);
}

async function createDefaultTasksForStage(
  leadId: string,
  stage: string
) {
  const defaultTasks = DEFAULT_TASKS_BY_STAGE[stage] || [];

  if (defaultTasks.length === 0) return;

  const existingTasks = tasks.filter(
    (task) =>
      task.crm_id === leadId &&
      task.etap === stage
  );

  const tasksToCreate = defaultTasks
    .filter(
      (title) =>
        !existingTasks.some(
          (task) => task.tytul === title
        )
    )
    .map((title) => ({
      crm_id: leadId,
      etap: stage,
      tytul: title,
      status: "do_zrobienia",
    }));

  if (tasksToCreate.length === 0) return;

  const { data, error } = await supabase
    .from("crm_zadania")
    .insert(tasksToCreate)
    .select("*");

  if (error) {
    console.error(
      "Błąd tworzenia zadań CRM:",
      error
    );
    return;
  }

  setTasks((current) => [
    ...current,
    ...(data || []),
  ]);
}

  async function moveLeadToStage(leadId: string, newStage: string) {
    const previousLeads = leads;

    setLeads((current) =>
      current.map((lead) =>        lead.id === leadId ? { ...lead, etap: newStage } : lead
      )
    );

    const { error } = await supabase
      .from("crm_szanse_sprzedazy")
      .update({ etap: newStage })
      .eq("id", leadId);

    if (error) {
      console.error("Błąd zmiany etapu:", error);
      setLeads(previousLeads);
      alert("Nie udało się zmienić etapu.");
    }

    await createDefaultTasksForStage(
      leadId,
      newStage
     );  
    }

  function handleLeadCreated(newLead: Lead) {
    setLeads((current) => [newLead, ...current]);
    setCreatingLead(false);
  }

  function handleLeadSaved(updatedLead: Lead) {
    setLeads((current) =>
      current.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead))
    );
    setSelectedLead(updatedLead);
  }

  const filteredLeads = leads.filter((lead) => {
    const matchesStage = stageFilter === EMPTY_FILTER || lead.etap === stageFilter;
    const matchesStatus =
      statusFilter === EMPTY_FILTER || lead.status === statusFilter;
    const matchesKadry =
      kadryFilter === EMPTY_FILTER ||
      (kadryFilter === "Tak" && lead.czy_kadry) ||
      (kadryFilter === "Nie" && !lead.czy_kadry);

    return matchesStage && matchesStatus && matchesKadry;
  });

  const activeLeads = leads.filter((lead) => lead.status === "otwarta");
  const totalMrr = activeLeads.reduce(
    (sum, lead) => sum + Number(lead.szacowany_mrr || 0),
    0
  );


  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł zarządczy</p>
          <h1 style={titleStyle}>CRM</h1>
          <p style={subtitleStyle}>
            Szanse sprzedaży, pipeline, statusy rozmów i prognozowany miesięczny
            przychód.
          </p>
        </div>

        <button style={primaryButtonStyle} onClick={() => setCreatingLead(true)}>
          Dodaj szansę
        </button>
      </section>

      <section style={summaryGridStyle}>
        <SummaryCard label="Aktywne szanse" value={activeLeads.length} />
        <SummaryCard
          label="Szacowany MRR"
          value={`${totalMrr.toLocaleString("pl-PL")} zł`}
        />
        <SummaryCard
          label="Wygrane"
          value={leads.filter((lead) => lead.status === "wygrana").length}
        />
        <SummaryCard
          label="Przegrane"
          value={leads.filter((lead) => lead.status === "przegrana").length}
        />
      </section>

      <section style={pipelineSectionStyle}>
        <div style={tableHeaderStyle}>
          <h2 style={sectionTitleStyle}>Pipeline sprzedaży</h2>
        </div>

        <div style={pipelineGridStyle}>
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = leads.filter((lead) => lead.etap === stage);
            const stageMrr = stageLeads.reduce(
              (sum, lead) => sum + Number(lead.szacowany_mrr || 0),
              0
            );

            return (
              <div
                key={stage}
                style={pipelineColumnStyle}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedLeadId) {
                    moveLeadToStage(draggedLeadId, stage);
                    setDraggedLeadId(null);
                  }
                }}
              >
                <h3 style={pipelineTitleStyle}>{PIPELINE_LABELS[stage]}</h3>
                <p style={pipelineMetaStyle}>
                  {stageLeads.length} szans · {stageMrr.toLocaleString("pl-PL")} zł
                </p>

                <div style={pipelineCardsStyle}>
                  {stageLeads.length === 0 ? (
                    <div style={pipelineEmptyStyle}>Brak szans</div>
                  ) : (
                    stageLeads.map((lead) => (
                      <div
                        key={lead.id}
                        style={pipelineCardStyle}
                        draggable
                        onDragStart={() => setDraggedLeadId(lead.id)}
                        onDragEnd={() => setDraggedLeadId(null)}
                        onClick={() => setSelectedLead(lead)}
                      >
                        <div style={pipelineCardTitleStyle}>
                          {lead.nazwa || "—"}
                        </div>
                        <div style={pipelineCardMetaStyle}>
                          {lead.status || "Brak statusu"}
                        </div>
                        <div style={pipelineCardFooterStyle}>
                          <span>{lead.czy_kadry ? "Kadry" : "Bez kadr"}</span>
                          <strong>
                            {lead.szacowany_mrr
                              ? `${lead.szacowany_mrr.toLocaleString("pl-PL")} zł`
                              : "—"}
                          </strong>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={cardStyle}>
        <div style={tableHeaderStyle}>
          <h2 style={sectionTitleStyle}>Lista szans sprzedaży</h2>
          <span style={counterStyle}>
            {loading ? "Ładowanie..." : `${filteredLeads.length} pozycji`}
          </span>
        </div>

        <div style={compactFiltersRowStyle}>
          <span style={filtersLabelStyle}>Filtry:</span>

          <select
            style={compactFilterStyle}
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
          >
            <option value={EMPTY_FILTER}>Etap</option>
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {PIPELINE_LABELS[stage]}
              </option>
            ))}
          </select>

          <select
            style={compactFilterStyle}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value={EMPTY_FILTER}>Status</option>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
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
        ) : filteredLeads.length === 0 ? (
          <div style={emptyStateStyle}>Brak szans sprzedaży do wyświetlenia</div>
        ) : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th width="35%">Firma</Th>
                  <Th width="20%">Etap</Th>
                  <Th width="15%">Status</Th>
                  <Th width="10%">Kadry</Th>
                  <Th width="10%">MRR</Th>
                  <Th width="10%">Akcje</Th>
                </tr>
              </thead>

              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} style={rowStyle}>
                    <Td strong>{lead.nazwa || "—"}</Td>
                    <Td>{PIPELINE_LABELS[lead.etap || ""] || lead.etap || "—"}</Td>
                    <Td>
                      <Badge>{lead.status || "Brak"}</Badge>
                    </Td>
                    <Td>
                      <Badge>{lead.czy_kadry ? "Tak" : "Nie"}</Badge>
                    </Td>
                    <Td>
                      {lead.szacowany_mrr !== null
                        ? `${lead.szacowany_mrr.toLocaleString("pl-PL")} zł`
                        : "—"}
                    </Td>
                    <Td>
                      <button
                        style={secondaryButtonStyle}
                        onClick={() => setSelectedLead(lead)}
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

      {creatingLead && (
        <LeadDrawer
          mode="create"
          onClose={() => setCreatingLead(false)}
          onCreated={handleLeadCreated}
        />
      )}

      {selectedLead && (
        <LeadDrawer
          mode="edit"
          lead={selectedLead}
          tasks={tasks.filter((task) => task.crm_id === selectedLead.id)}
          onClose={() => setSelectedLead(null)}
          onSaved={handleLeadSaved}
          onToggleTaskStatus={toggleTaskStatus}
        />
      )}
    </>
  );
}

function LeadDrawer({
  mode,
  lead,
  tasks,
  onClose,
  onCreated,
  onSaved,
  onToggleTaskStatus,
}: {
  mode: "create" | "edit";
  lead?: Lead;
  tasks?: CrmTask[];
  onClose: () => void;
  onCreated?: (lead: Lead) => void;
  onSaved?: (lead: Lead) => void;
  onToggleTaskStatus?: (taskId: string) => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<LeadDraft>(() =>
    lead ? createDraft(lead) : createEmptyDraft()
  );

  function updateDraft<K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveLead() {
    if (!draft.nazwa.trim()) {
      alert("Nazwa firmy jest wymagana.");
      return;
    }

    setSaving(true);

    const payload = {
      nazwa: draft.nazwa.trim(),
      osoba_kontaktowa: draft.osoba_kontaktowa.trim() || null,
      telefon: draft.telefon.trim() || null,
      email: draft.email.trim() || null,
      nip: draft.nip.trim() || null,
      forma_prawna: draft.forma_prawna.trim() || null,
      etap: draft.etap,
      status: draft.status,
      zrodlo_leada: draft.zrodlo_leada.trim() || null,
      szacowany_mrr: draft.szacowany_mrr ? Number(draft.szacowany_mrr) : null,
      data_telefonu: draft.data_telefonu || null,
      data_spotkania_online: draft.data_spotkania_online || null,
      data_wyslania_oferty: draft.data_wyslania_oferty || null,
      data_follow_up: draft.data_follow_up || null,
      powod_kontaktu: draft.powod_kontaktu.trim() || null,
      powod_zmiany_biura: draft.powod_zmiany_biura.trim() || null,
      liczba_dokumentow: draft.liczba_dokumentow
        ? Number(draft.liczba_dokumentow)
        : null,
      liczba_transakcji: draft.liczba_transakcji
        ? Number(draft.liczba_transakcji)
        : null,
      czy_kadry: draft.czy_kadry,
      liczba_pracownikow: draft.liczba_pracownikow
        ? Number(draft.liczba_pracownikow)
        : null,
      powod_przegranej: draft.powod_przegranej.trim() || null,
      notatki: draft.notatki.trim() || null,
    };

    if (mode === "create") {
      const { data, error } = await supabase
        .from("crm_szanse_sprzedazy")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        console.error("Błąd dodawania szansy:", error);
        alert("Nie udało się dodać szansy sprzedaży.");
        setSaving(false);
        return;
      }

      onCreated?.(data);
      
      setSaving(false);
      return;
    }

    if (!lead) return;

    const { data, error } = await supabase
      .from("crm_szanse_sprzedazy")
      .update(payload)
      .eq("id", lead.id)
      .select("*")
      .single();

    if (error) {
      console.error("Błąd edycji szansy:", error);
      alert("Nie udało się zapisać zmian.");
      setSaving(false);
      return;
    }

    onSaved?.(data);
    setSaving(false);
  }

  return (
    <div style={drawerOverlayStyle} onClick={onClose}>
      <aside style={drawerStyle} onClick={(event) => event.stopPropagation()}>
        <div style={drawerHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>
              {mode === "create" ? "Nowa szansa sprzedaży" : "Szczegóły szansy"}
            </p>
            <h2 style={drawerTitleStyle}>
              {mode === "create" ? "Dodaj szansę" : draft.nazwa || "Szansa"}
            </h2>
          </div>

          <button style={closeButtonStyle} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={drawerActionsStyle}>
          <button style={secondaryButtonStyle} onClick={onClose}>
            Anuluj
          </button>

          <button style={primarySmallButtonStyle} onClick={saveLead} disabled={saving}>
            {saving ? "Zapisywanie..." : mode === "create" ? "Dodaj szansę" : "Zapisz zmiany"}
          </button>
        </div>

        <div style={drawerContentStyle}>
          <FormSection title="Dane podstawowe">
            <EditableInput label="Nazwa firmy" value={draft.nazwa} onChange={(v) => updateDraft("nazwa", v)} />
            <EditableInput label="Osoba kontaktowa" value={draft.osoba_kontaktowa} onChange={(v) => updateDraft("osoba_kontaktowa", v)} />
            <EditableInput label="Telefon" value={draft.telefon} onChange={(v) => updateDraft("telefon", v)} />
            <EditableInput label="Email" type="email" value={draft.email} onChange={(v) => updateDraft("email", v)} />
            <EditableInput label="NIP" value={draft.nip} onChange={(v) => updateDraft("nip", v)} />
          </FormSection>

          <FormSection title="Sprzedaż">
            <EditableSelect
              label="Etap"
              value={draft.etap}
              onChange={(v) => updateDraft("etap", v)}
              options={PIPELINE_STAGES.map((stage) => ({
                value: stage,
                label: PIPELINE_LABELS[stage],
              }))}
            />
            <EditableSelect
              label="Status"
              value={draft.status}
              onChange={(v) => updateDraft("status", v)}
              options={STATUSES}
            />
            <EditableInput label="Źródło leada" value={draft.zrodlo_leada} onChange={(v) => updateDraft("zrodlo_leada", v)} />
            <EditableInput label="Szacowany MRR" type="number" value={draft.szacowany_mrr} onChange={(v) => updateDraft("szacowany_mrr", v)} />
          </FormSection>

          <FormSection title="Zakres obsługi">
            <EditableSelect
               label="Forma prawna"
               value={draft.forma_prawna}
               onChange={(v) => updateDraft("forma_prawna", v)}
               options={[
               { value: "", label: "Wybierz" },
               { value: "JDG", label: "JDG" },
               { value: "Spółka z o.o.", label: "Spółka z o.o." },
               { value: "Fundacja", label: "Fundacja" },
               { value: "Stowarzyszenie", label: "Stowarzyszenie" },
               { value: "Spółka cywilna", label: "Spółka cywilna" },
               { value: "Inna", label: "Inna" },
               ]}
            />
            <EditableInput label="Liczba dokumentów" type="number" value={draft.liczba_dokumentow} onChange={(v) => updateDraft("liczba_dokumentow", v)} />
            <EditableInput label="Liczba transakcji" type="number" value={draft.liczba_transakcji} onChange={(v) => updateDraft("liczba_transakcji", v)} />
            <EditableCheckbox label="Kadry" checked={draft.czy_kadry} onChange={(v) => updateDraft("czy_kadry", v)} />
            {draft.czy_kadry && (
              <EditableInput label="Liczba pracowników" type="number" value={draft.liczba_pracownikow} onChange={(v) => updateDraft("liczba_pracownikow", v)} />
            )}
          </FormSection>

          <FormSection title="Zadania sprzedażowe">
  <div style={taskListStyle}>
    {(tasks || []).length === 0 ? (
      <div style={emptyTaskStyle}>Brak zadań dla tej szansy.</div>
    ) : (
      (tasks || []).map((task) => {
        const isDone = task.status === "zrobione";

        return (
          <div
            key={task.id}
            style={{
              ...taskItemStyle,
              background: isDone ? "#ecfdf5" : "#f8fafc",
              borderColor: isDone ? "#bbf7d0" : "#cbd5e1",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                flex: 1,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={isDone}
                onChange={() => onToggleTaskStatus?.(task.id)}
                style={{
                  width: 18,
                  height: 18,
                  marginTop: 4,
                  cursor: "pointer",
                }}
              />

              <div>
                <div
                  style={{
                    ...taskTitleStyle,
                    color: isDone ? "#047857" : "#1e293b",
                    textDecoration: isDone ? "line-through" : "none",
                  }}
                >
                  {task.tytul}
                </div>

                <div
                  style={{
                    ...taskMetaStyle,
                    color: isDone ? "#059669" : "#475569",
                  }}
                >
                  {PIPELINE_LABELS[task.etap] || task.etap}
                  {task.termin ? ` · termin: ${task.termin}` : ""}
                </div>
              </div>
            </label>

            <button
              type="button"
onClick={() => onToggleTaskStatus?.(task.id)}
              style={{
                width: 118,
                minWidth: 118,
                height: 44,
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 13,
                background: isDone ? "#bbf7d0" : "#e2e8f0",
                color: isDone ? "#047857" : "#0f172a",
              }}
            >
              {isDone ? "Zrobione" : "Do zrobienia"}
            </button>
          </div>
        );
      })
    )}
  </div>
</FormSection>

          <FormSection title="Terminy i notatki">
            <EditableInput label="Data telefonu" type="date" value={draft.data_telefonu} onChange={(v) => updateDraft("data_telefonu", v)} />
            <EditableInput label="Data spotkania online" type="date" value={draft.data_spotkania_online} onChange={(v) => updateDraft("data_spotkania_online", v)} />
            <EditableInput label="Data wysłania oferty" type="date" value={draft.data_wyslania_oferty} onChange={(v) => updateDraft("data_wyslania_oferty", v)} />
            <EditableInput label="Data follow-up" type="date" value={draft.data_follow_up} onChange={(v) => updateDraft("data_follow_up", v)} />
            <EditableTextarea label="Powód kontaktu" value={draft.powod_kontaktu} onChange={(v) => updateDraft("powod_kontaktu", v)} />
            <EditableTextarea label="Powód zmiany biura" value={draft.powod_zmiany_biura} onChange={(v) => updateDraft("powod_zmiany_biura", v)} />
            <EditableTextarea label="Powód przegranej" value={draft.powod_przegranej} onChange={(v) => updateDraft("powod_przegranej", v)} />
            <EditableTextarea label="Notatki" value={draft.notatki} onChange={(v) => updateDraft("notatki", v)} />
          </FormSection>
        </div>
      </aside>
    </div>
  );
}

function createEmptyDraft(): LeadDraft {
  return {
    nazwa: "",
    osoba_kontaktowa: "",
    telefon: "",
    email: "",
    nip: "",
    forma_prawna: "",
    etap: "nowy_lead",
    status: "otwarta",
    zrodlo_leada: "",
    szacowany_mrr: "",
    data_telefonu: "",
    data_spotkania_online: "",
    data_wyslania_oferty: "",
    data_follow_up: "",
    powod_kontaktu: "",
    powod_zmiany_biura: "",
    liczba_dokumentow: "",
    liczba_transakcji: "",
    czy_kadry: false,
    liczba_pracownikow: "",
    powod_przegranej: "",
    notatki: "",
  };
}

function createDraft(lead: Lead): LeadDraft {
  return {
    nazwa: lead.nazwa || "",
    osoba_kontaktowa: lead.osoba_kontaktowa || "",
    telefon: lead.telefon || "",
    email: lead.email || "",
    nip: lead.nip || "",
    forma_prawna: lead.forma_prawna || "",
    etap: lead.etap || "nowy_lead",
    status: lead.status || "otwarta",
    zrodlo_leada: lead.zrodlo_leada || "",
    szacowany_mrr:
      lead.szacowany_mrr !== null && lead.szacowany_mrr !== undefined
        ? String(lead.szacowany_mrr)
        : "",
    data_telefonu: formatDateForInput(lead.data_telefonu),
    data_spotkania_online: formatDateForInput(lead.data_spotkania_online),
    data_wyslania_oferty: formatDateForInput(lead.data_wyslania_oferty),
    data_follow_up: formatDateForInput(lead.data_follow_up),
    powod_kontaktu: lead.powod_kontaktu || "",
    powod_zmiany_biura: lead.powod_zmiany_biura || "",
    liczba_dokumentow:
      lead.liczba_dokumentow !== null && lead.liczba_dokumentow !== undefined
        ? String(lead.liczba_dokumentow)
        : "",
    liczba_transakcji:
      lead.liczba_transakcji !== null && lead.liczba_transakcji !== undefined
        ? String(lead.liczba_transakcji)
        : "",
    czy_kadry: Boolean(lead.czy_kadry),
    liczba_pracownikow:
      lead.liczba_pracownikow !== null && lead.liczba_pracownikow !== undefined
        ? String(lead.liczba_pracownikow)
        : "",
    powod_przegranej: lead.powod_przegranej || "",
    notatki: lead.notatki || "",
  };
}

function formatDateForInput(value: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={drawerSectionStyle}>
      <h3 style={drawerSectionTitleStyle}>{title}</h3>
      <div>{children}</div>
    </section>
  );
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
  type?: "text" | "number" | "email" | "datetime-local" | "date";
}) {
  return (
    <div style={editableRowStyle}>
      <label style={infoLabelStyle}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
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
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
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
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
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
      <textarea value={value} onChange={(e) => onChange(e.target.value)} style={textareaStyle} rows={4} />
    </div>
  );
}

function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return <th style={{ ...thStyle, width }}>{children}</th>;
}

function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span style={badgeStyle}>{children}</span>;
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "24px",
  marginBottom: "28px",
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
  maxWidth: "780px",
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

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "18px",
  marginBottom: "24px",
};

const summaryCardStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "22px",
  boxShadow: shadow.soft,
};

const summaryLabelStyle: React.CSSProperties = {
  color: colors.muted,
  fontWeight: 700,
  marginBottom: "14px",
};

const summaryValueStyle: React.CSSProperties = {
  color: colors.navy,
  fontSize: "28px",
  fontWeight: 850,
};

const pipelineSectionStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "30px",
  boxShadow: shadow.soft,
  marginBottom: "24px",
};

const pipelineGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(220px, 1fr))",
  gap: "16px",
  overflowX: "auto",
};

const pipelineColumnStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  background: colors.inputBackground,
  padding: "16px",
  minHeight: "260px",
};

const pipelineTitleStyle: React.CSSProperties = {
  margin: 0,
  color: colors.navy,
  fontSize: "15px",
  fontWeight: 850,
};

const pipelineMetaStyle: React.CSSProperties = {
  margin: "6px 0 14px",
  color: colors.muted,
  fontSize: "13px",
  fontWeight: 700,
};

const pipelineCardsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const pipelineCardStyle: React.CSSProperties = {
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  padding: "14px",
  cursor: "grab",
};

const pipelineCardTitleStyle: React.CSSProperties = {
  color: colors.text,
  fontWeight: 850,
  marginBottom: "5px",
};

const pipelineCardMetaStyle: React.CSSProperties = {
  color: colors.muted,
  fontSize: "13px",
  fontWeight: 650,
};

const pipelineCardFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  marginTop: "14px",
  color: colors.muted,
  fontSize: "13px",
};

const pipelineEmptyStyle: React.CSSProperties = {
  border: `1px dashed ${colors.border}`,
  borderRadius: radius.input,
  padding: "18px",
  textAlign: "center",
  color: colors.muted,
  fontWeight: 700,
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

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: colors.navy,
  fontSize: "24px",
};

const counterStyle: React.CSSProperties = {
  color: colors.muted,
  fontWeight: 700,
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

const badgeStyle: React.CSSProperties = {
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

const taskListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const taskItemStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  padding: "14px",
  background: colors.inputBackground,
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
};

const taskTitleStyle: React.CSSProperties = {
  fontWeight: 850,
  color: colors.text,
  marginBottom: "5px",
};

const taskMetaStyle: React.CSSProperties = {
  color: colors.muted,
  fontSize: "13px",
  fontWeight: 650,
};

const emptyTaskStyle: React.CSSProperties = {
  border: `1px dashed ${colors.border}`,
  borderRadius: radius.input,
  padding: "18px",
  color: colors.muted,
  fontWeight: 700,
  textAlign: "center",
};
