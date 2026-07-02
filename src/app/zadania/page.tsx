"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
import type { UserRole } from "@/lib/permissions";
import {
  createTask,
  fetchActiveTaskTimers,
  fetchTaskAssignees,
  fetchTaskClients,
  fetchTasks,
  fetchTaskTimeEntries,
  startTaskTimer,
  stopTaskTimer,
  updateTask,
  updateTaskStatus,
  type ClientSummary,
  type ProfileSummary,
  type Task,
  type TaskPayload,
  type TaskPriority,
  type TaskStatus,
  type TimeEntry,
} from "@/lib/taskService";
import {
  createTaskDocumentSignedUrl,
  deleteTaskDocument,
  fetchTaskDocuments,
  type TaskDocument,
  uploadTaskDocument,
} from "@/lib/taskDocumentsService";
import { Paperclip, Play, Plus, Square, X } from "lucide-react";

type Profile = { id: string; full_name: string | null; email: string | null; role: UserRole | null };
type Client = { id: string; nazwa: string | null; nip: string | null };

type TaskDraft = {
  tytul: string;
  opis: string;
  status: TaskStatus;
  priorytet: TaskPriority;
  termin: string;
  osoba_id: string;
  klient_id: string;
  czy_wewnetrzne: boolean;
  notatki: string;
};

const EMPTY_FILTER = "Wszystkie";
const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "do_zrobienia", label: "Do zrobienia" },
  { value: "w_trakcie", label: "W trakcie" },
  { value: "zrobione", label: "Zrobione" },
  { value: "anulowane", label: "Anulowane" },
];
const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "niski", label: "Niski" },
  { value: "normalny", label: "Normalny" },
  { value: "wysoki", label: "Wysoki" },
  { value: "pilne", label: "Pilne" },
];
const STATUS_FILTER_OPTIONS = [{ value: EMPTY_FILTER, label: "Status" }, ...STATUS_OPTIONS];

export default function TasksPage() {
  return (
    <AppLayout activePage="zadania">
      <AccessGuard moduleName="zadania">
        {(currentRole) => <TasksContent currentRole={currentRole} />}
      </AccessGuard>
    </AppLayout>
  );
}

function TasksContent({ currentRole }: { currentRole: UserRole | null }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTimers, setActiveTimers] = useState<TimeEntry[]>([]);
  const [assignees, setAssignees] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [statusFilter, setStatusFilter] = useState(EMPTY_FILTER);
  const [assigneeFilter, setAssigneeFilter] = useState(EMPTY_FILTER);
  const [clientFilter, setClientFilter] = useState(EMPTY_FILTER);
  const [searchQuery, setSearchQuery] = useState("");

  const visibleAssignees = useMemo(() => filterAssignableProfiles(assignees), [assignees]);

  const filteredTasks = tasks
    .filter((task) => {
      const assigneeName = formatProfileName(getProfile(task.profiles));
      const clientName = task.czy_wewnetrzne ? "Wewnętrzne" : formatClientName(getClient(task.klienci));
      const text = [task.tytul, task.opis, task.notatki, assigneeName, clientName].filter(Boolean).join(" ").toLowerCase();
      const query = searchQuery.trim().toLowerCase();

      return (
        (statusFilter === EMPTY_FILTER || task.status === statusFilter) &&
        (assigneeFilter === EMPTY_FILTER || task.osoba_id === assigneeFilter) &&
        (clientFilter === EMPTY_FILTER || (clientFilter === "internal" && task.czy_wewnetrzne) || task.klient_id === clientFilter) &&
        (!query || text.includes(query))
      );
    })
    .sort(compareTasksByUrgency);

  const openTasks = tasks.filter((task) => !["zrobione", "anulowane"].includes(task.status));
  const overdueTasks = openTasks.filter((task) => task.termin && new Date(task.termin) < startOfToday());
  const todayTasks = openTasks.filter((task) => task.termin && isSameDay(new Date(task.termin), new Date()));

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    setCurrentUserId(userId);

    const [tasksResult, timersResult, assigneesResult, clientsResult] = await Promise.all([
      fetchTasks(),
      userId ? fetchActiveTaskTimers(userId) : Promise.resolve({ data: [], error: null }),
      fetchTaskAssignees(),
      fetchTaskClients(),
    ]);

    if (tasksResult.error) console.error("Błąd pobierania zadań:", tasksResult.error);
    if (timersResult.error) console.error("Błąd pobierania liczników:", timersResult.error);
    if (assigneesResult.error) console.error("Błąd pobierania osób:", assigneesResult.error);
    if (clientsResult.error) console.error("Błąd pobierania klientów:", clientsResult.error);

    setTasks((tasksResult.data || []) as Task[]);
    setActiveTimers((timersResult.data || []) as TimeEntry[]);
    setAssignees((assigneesResult.data || []) as Profile[]);
    setClients((clientsResult.data || []) as Client[]);
    setLoading(false);
  }

  function handleTaskCreated(task: Task) {
    setTasks((current) => [task, ...current]);
    setSelectedTask(task);
    setCreatingTask(false);
  }

  function handleTaskSaved(task: Task) {
    setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
    setSelectedTask(task);
  }

  async function toggleRowTimer(task: Task) {
    if (!currentUserId) return;
    const activeTimer = activeTimers.find((entry) => entry.zadanie_id === task.id);

    if (activeTimer) {
      const result = await stopTaskTimer(activeTimer.id);
      if (result.error) {
        console.error("Błąd zatrzymywania licznika:", result.error);
        alert("Nie udało się zatrzymać licznika.");
        return;
      }
      setActiveTimers((current) => current.filter((entry) => entry.id !== activeTimer.id));
      return;
    }

    const result = await startTaskTimer(task.id, currentUserId);
    if (result.error) {
      console.error("Błąd uruchamiania licznika:", result.error);
      alert("Nie udało się uruchomić licznika.");
      return;
    }
    setActiveTimers((current) => [result.data as TimeEntry, ...current]);

    if (task.status === "do_zrobienia") {
      const statusResult = await updateTaskStatus(task.id, "w_trakcie");
      if (!statusResult.error) handleTaskSaved(statusResult.data as Task);
    }
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł operacyjny</p>
          <h1 style={titleStyle}>Zadania</h1>
        </div>
        <button style={primaryButtonStyle} onClick={() => setCreatingTask(true)}>
          <Plus size={18} />
          Dodaj zadanie
        </button>
      </section>

      <section style={summaryGridStyle}>
        <SummaryCard label="Otwarte" value={openTasks.length} />
        <SummaryCard label="Na dziś" value={todayTasks.length} />
        <SummaryCard label="Po terminie" value={overdueTasks.length} />
      </section>

      <section style={cardStyle}>
        <div style={tableHeaderStyle}>
          <h2 style={sectionTitleStyle}>Lista zadań</h2>
          <span style={counterStyle}>{loading ? "Ładowanie..." : `${filteredTasks.length} pozycji`}</span>
        </div>

        <input style={searchInputStyle} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Szukaj po zadaniu, kliencie, osobie lub notatce" />

        <div style={compactFiltersRowStyle}>
          <span style={filtersLabelStyle}>Filtry:</span>
          <AppSelect style={compactFilterStyle} value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} />
          <AppSelect style={compactFilterStyle} value={assigneeFilter} options={[{ value: EMPTY_FILTER, label: "Osoba" }, ...assignees.map((assignee) => ({ value: assignee.id, label: formatProfileName(assignee) }))]} onChange={setAssigneeFilter} />
          <AppSelect style={compactFilterStyle} value={clientFilter} options={[{ value: EMPTY_FILTER, label: "Klient" }, { value: "internal", label: "Wewnętrzne" }, ...clients.map((client) => ({ value: client.id, label: formatClientName(client) }))]} onChange={setClientFilter} />
        </div>

        {loading ? (
          <div style={emptyStateStyle}>Ładowanie danych...</div>
        ) : filteredTasks.length === 0 ? (
          <div style={emptyStateStyle}>Brak zadań do wyświetlenia</div>
        ) : (
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th width="27%">Zadanie</Th>
                  <Th width="12%">Status</Th>
                  <Th width="11%">Priorytet</Th>
                  <Th width="12%">Termin</Th>
                  <Th width="14%">Osoba</Th>
                  <Th width="14%">Klient</Th>
                  <Th width="10%">Akcje</Th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const hasActiveTimer = activeTimers.some((entry) => entry.zadanie_id === task.id);

                  return (
                    <tr key={task.id} style={rowStyle}>
                      <Td strong>{task.tytul}</Td>
                      <Td><StatusBadge status={task.status} /></Td>
                      <Td><PriorityBadge priority={task.priorytet} /></Td>
                      <Td>{formatDate(task.termin)}</Td>
                      <Td>{formatProfileName(getProfile(task.profiles))}</Td>
                      <Td>{task.czy_wewnetrzne ? "Wewnętrzne" : formatClientName(getClient(task.klienci))}</Td>
                      <Td>
                        <div style={actionsCellStyle}>
                          <button style={hasActiveTimer ? stopTinyButtonStyle : timerTinyButtonStyle} onClick={() => toggleRowTimer(task)} aria-label={hasActiveTimer ? "Zatrzymaj licznik" : "Uruchom licznik"}>
                            {hasActiveTimer ? <Square size={15} /> : <Play size={15} />}
                          </button>
                          <button style={detailsButtonStyle} onClick={() => setSelectedTask(task)}>Szczegóły</button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creatingTask && <TaskDrawer mode="create" task={null} currentUserId={currentUserId} currentRole={currentRole} assignees={visibleAssignees} clients={clients} onClose={() => setCreatingTask(false)} onCreated={handleTaskCreated} onSaved={handleTaskSaved} />}
      {selectedTask && <TaskDrawer mode="edit" task={selectedTask} currentUserId={currentUserId} currentRole={currentRole} assignees={visibleAssignees} clients={clients} onClose={() => setSelectedTask(null)} onCreated={handleTaskCreated} onSaved={handleTaskSaved} />}
    </>
  );
}

function TaskDrawer({ mode, task, currentUserId, assignees, clients, onClose, onCreated, onSaved }: {
  mode: "create" | "edit";
  task: Task | null;
  currentUserId: string | null;
  currentRole: UserRole | null;
  assignees: Profile[];
  clients: Client[];
  onClose: () => void;
  onCreated: (task: Task) => void;
  onSaved: (task: Task) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => createDraft(task, currentUserId));
  const [saving, setSaving] = useState(false);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [documents, setDocuments] = useState<TaskDocument[]>([]);
  const [timerNote, setTimerNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [clientSearch, setClientSearch] = useState(() => getInitialClientSearch(task));

  const activeTimeEntry = timeEntries.find((entry) => entry.osoba_id === currentUserId && !entry.ended_at);
  const totalSeconds = timeEntries.reduce((sum, entry) => sum + Number(entry.duration_seconds || 0), 0);
  const canUseTimer = mode === "edit" && task && currentUserId;
  const matchingClients = clients
    .filter((client) => normalizeClientSearch(client).includes(clientSearch.trim().toLowerCase()))
    .slice(0, 20);

  useEffect(() => {
    setDraft(createDraft(task, currentUserId));
    setClientSearch(getInitialClientSearch(task));
  }, [task?.id, currentUserId]);

  useEffect(() => {
    if (!task?.id) return;
    loadDetails(task.id);
  }, [task?.id]);

  async function loadDetails(taskId: string) {
    const [timeResult, documentsResult] = await Promise.all([fetchTaskTimeEntries(taskId), fetchTaskDocuments(taskId)]);
    if (timeResult.error) console.error("Błąd pobierania czasu pracy:", timeResult.error);
    if (documentsResult.error) console.error("Błąd pobierania dokumentów zadania:", documentsResult.error);
    setTimeEntries((timeResult.data || []) as TimeEntry[]);
    setDocuments((documentsResult.data || []) as TaskDocument[]);
  }

  function updateDraft<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectClient(client: Client) {
    updateDraft("klient_id", client.id);
    updateDraft("czy_wewnetrzne", false);
    setClientSearch(formatClientName(client));
  }

  async function saveTask() {
    if (!draft.tytul.trim()) return alert("Tytuł zadania jest wymagany.");
    if (!draft.osoba_id) return alert("Wybierz osobę odpowiedzialną.");
    if (!draft.czy_wewnetrzne && !draft.klient_id) return alert("Wybierz klienta albo oznacz zadanie jako wewnętrzne.");

    setSaving(true);
    const payload: TaskPayload = {
      tytul: draft.tytul.trim(),
      opis: draft.opis.trim() || null,
      status: draft.status,
      priorytet: draft.priorytet,
      termin: draft.termin ? new Date(`${draft.termin}T12:00:00`).toISOString() : null,
      osoba_id: draft.osoba_id,
      klient_id: draft.czy_wewnetrzne ? null : draft.klient_id,
      czy_wewnetrzne: draft.czy_wewnetrzne,
      notatki: draft.notatki.trim() || null,
    };
    const result = mode === "create" || !task ? await createTask(payload) : await updateTask(task.id, payload);
    setSaving(false);

    if (result.error) {
      console.error("Błąd zapisu zadania:", result.error);
      alert("Nie udało się zapisać zadania.");
      return;
    }
    mode === "create" ? onCreated(result.data as Task) : onSaved(result.data as Task);
  }

  async function startTimer() {
    if (!task || !currentUserId || activeTimeEntry) return;
    const result = await startTaskTimer(task.id, currentUserId);
    if (result.error) {
      console.error("Błąd uruchamiania licznika:", result.error);
      alert("Nie udało się uruchomić licznika.");
      return;
    }
    setTimeEntries((current) => [result.data as TimeEntry, ...current]);
    if (task.status === "do_zrobienia") {
      const statusResult = await updateTaskStatus(task.id, "w_trakcie");
      if (!statusResult.error) onSaved(statusResult.data as Task);
    }
  }

  async function stopTimer() {
    if (!activeTimeEntry) return;
    const result = await stopTaskTimer(activeTimeEntry.id, timerNote);
    if (result.error) {
      console.error("Błąd zatrzymywania licznika:", result.error);
      alert("Nie udało się zatrzymać licznika.");
      return;
    }
    setTimeEntries((current) => current.map((entry) => (entry.id === activeTimeEntry.id ? (result.data as TimeEntry) : entry)));
    setTimerNote("");
  }

  async function uploadDocument(file: File | null) {
    if (!task || !file) return;
    setUploading(true);
    const result = await uploadTaskDocument(task.id, file);
    setUploading(false);
    if (result.error) {
      console.error("Błąd dodawania dokumentu:", result.error);
      alert("Nie udało się dodać dokumentu.");
      return;
    }
    setDocuments((current) => [result.data as TaskDocument, ...current]);
  }

  async function openDocument(document: TaskDocument) {
    const result = await createTaskDocumentSignedUrl(document.sciezka);
    if (result.error || !result.data?.signedUrl) return alert("Nie udało się otworzyć dokumentu.");
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removeDocument(document: TaskDocument) {
    const result = await deleteTaskDocument(document);
    if (result.error) return alert("Nie udało się usunąć dokumentu.");
    setDocuments((current) => current.filter((item) => item.id !== document.id));
  }

  return (
    <div style={drawerOverlayStyle}>
      <aside style={drawerStyle}>
        <header style={drawerHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>{mode === "create" ? "Nowe zadanie" : "Szczegóły zadania"}</p>
            <h2 style={drawerTitleStyle}>{mode === "create" ? "Dodaj zadanie" : task?.tytul}</h2>
          </div>
          <button style={closeButtonStyle} onClick={onClose} aria-label="Zamknij"><X size={20} /></button>
        </header>

        <div style={drawerContentStyle}>
          <section style={drawerSectionStyle}>
            <h3 style={drawerSectionTitleStyle}>Dane zadania</h3>
            <EditableRow label="Tytuł"><input style={inputStyle} value={draft.tytul} onChange={(event) => updateDraft("tytul", event.target.value)} /></EditableRow>
            <EditableRow label="Opis"><textarea style={textareaStyle} value={draft.opis} onChange={(event) => updateDraft("opis", event.target.value)} /></EditableRow>
            <div style={twoColumnsStyle}>
              <EditableRow label="Status">
                <AppSelect style={inputStyle} value={draft.status} options={STATUS_OPTIONS} onChange={(value) => updateDraft("status", value as TaskStatus)} />
              </EditableRow>
              <EditableRow label="Priorytet">
                <AppSelect style={inputStyle} value={draft.priorytet} options={PRIORITY_OPTIONS} onChange={(value) => updateDraft("priorytet", value as TaskPriority)} />
              </EditableRow>
            </div>
            <EditableRow label="Termin"><input style={inputStyle} type="date" value={draft.termin} onChange={(event) => updateDraft("termin", event.target.value)} /></EditableRow>
            <EditableRow label="Osoba odpowiedzialna">
              <AppSelect style={inputStyle} value={draft.osoba_id} options={[{ value: "", label: "Wybierz osobę" }, ...assignees.map((assignee) => ({ value: assignee.id, label: formatProfileName(assignee) }))]} onChange={(value) => updateDraft("osoba_id", value)} />
            </EditableRow>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={draft.czy_wewnetrzne}
                onChange={(event) => {
                  updateDraft("czy_wewnetrzne", event.target.checked);
                  if (event.target.checked) {
                    updateDraft("klient_id", "");
                    setClientSearch("");
                  }
                }}
              />
              Zadanie wewnętrzne
            </label>
            {!draft.czy_wewnetrzne && (
              <EditableRow label="Klient">
                <div style={clientSearchBoxStyle}>
                  <input
                    style={inputStyle}
                    value={clientSearch}
                    onChange={(event) => {
                      setClientSearch(event.target.value);
                      updateDraft("klient_id", "");
                    }}
                    placeholder="Szukaj po nazwie lub NIP"
                  />
                  {clientSearch.trim() && !draft.klient_id && (
                    <div style={clientResultsStyle}>
                      {matchingClients.length === 0 ? (
                        <div style={clientResultEmptyStyle}>Brak pasujących klientów</div>
                      ) : (
                        matchingClients.map((client) => (
                          <button key={client.id} type="button" style={clientResultStyle} onClick={() => selectClient(client)}>
                            <strong>{client.nazwa || "Klient"}</strong>
                            <span>{client.nip || "Brak NIP"}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </EditableRow>
            )}
            <EditableRow label="Notatki"><textarea style={textareaStyle} value={draft.notatki} onChange={(event) => updateDraft("notatki", event.target.value)} /></EditableRow>
            <button style={primarySmallButtonStyle} onClick={saveTask} disabled={saving}>{saving ? "Zapisywanie..." : "Zapisz zadanie"}</button>
          </section>

          {mode === "edit" && task && (
            <>
              <section style={drawerSectionStyle}>
                <h3 style={drawerSectionTitleStyle}>Czas pracy</h3>
                <div style={timerBoxStyle}>
                  <div><p style={timerLabelStyle}>Łącznie</p><strong style={timerValueStyle}>{formatDuration(totalSeconds)}</strong></div>
                  <button style={activeTimeEntry ? stopButtonStyle : timerButtonStyle} onClick={activeTimeEntry ? stopTimer : startTimer} disabled={!canUseTimer}>
                    {activeTimeEntry ? <Square size={17} /> : <Play size={17} />}
                    {activeTimeEntry ? "Zatrzymaj" : "Start"}
                  </button>
                </div>
                {activeTimeEntry && <textarea style={textareaStyle} value={timerNote} onChange={(event) => setTimerNote(event.target.value)} placeholder="Krótki opis wykonanej pracy" />}
                <div style={timeListStyle}>
                  {timeEntries.length === 0 ? <div style={emptyTaskStyle}>Brak wpisów czasu</div> : timeEntries.map((entry) => (
                    <div key={entry.id} style={timeItemStyle}>
                      <div><strong>{formatDate(entry.started_at)}</strong><p style={taskMetaStyle}>{entry.opis || "Bez opisu"}</p></div>
                      <span style={counterStyle}>{entry.ended_at ? formatDuration(entry.duration_seconds || 0) : "W toku"}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section style={drawerSectionStyle}>
                <div style={documentsHeaderStyle}>
                  <h3 style={drawerSectionTitleStyle}>Dokumenty</h3>
                  <label style={uploadButtonStyle}>
                    <Paperclip size={17} />
                    {uploading ? "Dodawanie..." : "Dodaj dokument"}
                    <input type="file" style={{ display: "none" }} onChange={(event) => uploadDocument(event.target.files?.[0] || null)} />
                  </label>
                </div>
                <div style={documentsListStyle}>
                  {documents.length === 0 ? <div style={emptyTaskStyle}>Brak dokumentów</div> : documents.map((document) => (
                    <div key={document.id} style={documentItemStyle}>
                      <div>
                        <button style={documentNameButtonStyle} onClick={() => openDocument(document)}>{document.nazwa}</button>
                        <p style={taskMetaStyle}>{formatFileSize(document.rozmiar)}</p>
                      </div>
                      <button style={secondaryButtonStyle} onClick={() => removeDocument(document)}>Usuń</button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) { return <div style={summaryCardStyle}><p style={summaryLabelStyle}>{label}</p><strong style={summaryValueStyle}>{value}</strong></div>; }
function EditableRow({ label, children }: { label: string; children: React.ReactNode }) { return <label style={editableRowStyle}><span style={infoLabelStyle}>{label}</span>{children}</label>; }
function Th({ children, width }: { children: React.ReactNode; width?: string }) { return <th style={{ ...thStyle, width }}>{children}</th>; }
function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>; }
function StatusBadge({ status }: { status: TaskStatus }) { return <span style={{ ...badgeStyle, ...statusBadgeStyle(status) }}>{statusLabel(status)}</span>; }
function PriorityBadge({ priority }: { priority: TaskPriority }) { return <span style={{ ...badgeStyle, ...priorityBadgeStyle(priority) }}>{priorityLabel(priority)}</span>; }

function createDraft(task: Task | null, currentUserId: string | null): TaskDraft {
  return {
    tytul: task?.tytul || "",
    opis: task?.opis || "",
    status: task?.status || "do_zrobienia",
    priorytet: task?.priorytet || "normalny",
    termin: task?.termin ? toDateInput(task.termin) : "",
    osoba_id: task?.osoba_id || currentUserId || "",
    klient_id: task?.klient_id || "",
    czy_wewnetrzne: task?.czy_wewnetrzne ?? false,
    notatki: task?.notatki || "",
  };
}
function getInitialClientSearch(task: Task | null) {
  if (!task || task.czy_wewnetrzne || !task.klient_id) return "";
  return formatClientName(getClient(task.klienci));
}
function compareTasksByUrgency(first: Task, second: Task) {
  const firstDone = ["zrobione", "anulowane"].includes(first.status) ? 1 : 0;
  const secondDone = ["zrobione", "anulowane"].includes(second.status) ? 1 : 0;
  if (firstDone !== secondDone) return firstDone - secondDone;

  const firstTime = first.termin ? new Date(first.termin).getTime() : Number.MAX_SAFE_INTEGER;
  const secondTime = second.termin ? new Date(second.termin).getTime() : Number.MAX_SAFE_INTEGER;
  if (firstTime !== secondTime) return firstTime - secondTime;

  return priorityWeight(second.priorytet) - priorityWeight(first.priorytet);
}
function priorityWeight(priority: TaskPriority) {
  if (priority === "pilne") return 4;
  if (priority === "wysoki") return 3;
  if (priority === "normalny") return 2;
  return 1;
}
function filterAssignableProfiles(profiles: Profile[]) {
  return profiles;
}
function getProfile(profile: ProfileSummary | ProfileSummary[] | null | undefined) { return Array.isArray(profile) ? profile[0] : profile; }
function getClient(client: ClientSummary | ClientSummary[] | null | undefined) { return Array.isArray(client) ? client[0] : client; }
function formatProfileName(profile: ProfileSummary | Profile | null | undefined) { return profile?.full_name || profile?.email || "Brak osoby"; }
function formatClientName(client: ClientSummary | Client | null | undefined) { return client?.nip ? `${client.nazwa || "Klient"} · ${client.nip}` : client?.nazwa || "Klient"; }
function normalizeClientSearch(client: Client) { return [client.nazwa, client.nip].filter(Boolean).join(" ").toLowerCase(); }
function statusLabel(status: TaskStatus) { return STATUS_OPTIONS.find((item) => item.value === status)?.label || status; }
function priorityLabel(priority: TaskPriority) { return PRIORITY_OPTIONS.find((item) => item.value === priority)?.label || priority; }
function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}
function formatFileSize(size: number | null) {
  if (!size) return "Rozmiar nieznany";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function toDateInput(value: string) {
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}
function startOfToday() { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }
function isSameDay(first: Date, second: Date) { return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate(); }
function statusBadgeStyle(status: TaskStatus): React.CSSProperties {
  if (status === "zrobione") return { background: "#e7f6ec", color: "#16a34a", borderColor: "transparent" };
  if (status === "w_trakcie") return { background: "#e8eef8", color: colors.navy, borderColor: "transparent" };
  if (status === "anulowane") return { background: "#f1f5f9", color: "#64748b", borderColor: "transparent" };
  return { background: "#f3f5f9", color: colors.navy, borderColor: "transparent" };
}
function priorityBadgeStyle(priority: TaskPriority): React.CSSProperties {
  if (priority === "pilne") return { background: "#fde8ea", color: colors.red, borderColor: "transparent" };
  if (priority === "wysoki") return { background: "#fff3df", color: "#b45309", borderColor: "transparent" };
  if (priority === "niski") return { background: "#e7f6ec", color: "#16a34a", borderColor: "transparent" };
  return { background: "#e8eef8", color: colors.navy, borderColor: "transparent" };
}

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "30px" };
const eyebrowStyle: React.CSSProperties = { color: colors.red, fontWeight: 800, margin: "0 0 8px" };
const titleStyle: React.CSSProperties = { fontSize: "42px", lineHeight: 1.05, margin: 0, color: colors.navy };
const subtitleStyle: React.CSSProperties = { maxWidth: "760px", fontSize: "17px", lineHeight: 1.7, color: colors.muted, marginTop: "14px" };
const primaryButtonStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "9px", border: "none", borderRadius: radius.button, padding: "15px 20px", background: colors.red, color: colors.white, fontWeight: 800, cursor: "pointer", boxShadow: "none" };
const primarySmallButtonStyle: React.CSSProperties = { ...primaryButtonStyle, justifyContent: "center" };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" };
const summaryCardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "24px", boxShadow: shadow.soft };
const summaryLabelStyle: React.CSSProperties = { margin: 0, color: colors.muted, fontWeight: 700 };
const summaryValueStyle: React.CSSProperties = { display: "block", marginTop: "10px", fontSize: "30px", color: colors.navy };
const cardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "28px", boxShadow: shadow.soft };
const tableHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "18px", marginBottom: "18px" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const counterStyle: React.CSSProperties = { color: colors.muted, fontWeight: 800 };
const searchInputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "13px 18px", fontSize: "14px", fontWeight: 600, marginBottom: "16px" };
const compactFiltersRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "26px" };
const filtersLabelStyle: React.CSSProperties = { color: colors.muted, fontWeight: 800, fontSize: "14px" };
const compactFilterStyle: React.CSSProperties = { width: "180px", flex: "0 0 180px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "10px 38px 10px 14px", fontSize: "14px", fontWeight: 500 };
const tableWrapperStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "13px 12px", color: colors.muted, fontSize: "13px", borderBottom: `1px solid ${colors.border}` };
const rowStyle: React.CSSProperties = { borderBottom: `1px solid ${colors.border}` };
const tdStyle: React.CSSProperties = { padding: "15px 12px", color: colors.text, verticalAlign: "middle" };
const badgeStyle: React.CSSProperties = { display: "inline-flex", borderRadius: radius.badge, padding: "6px 10px", background: colors.inputBackground, border: `1px solid ${colors.border}`, color: colors.text, fontSize: "12px", fontWeight: 800 };
const actionsCellStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };
const timerTinyButtonStyle: React.CSSProperties = { width: "38px", height: "38px", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: radius.button, background: colors.success, color: colors.white, cursor: "pointer" };
const stopTinyButtonStyle: React.CSSProperties = { ...timerTinyButtonStyle, background: colors.red };
const detailsButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", background: colors.card, color: colors.navy, fontWeight: 800, cursor: "pointer" };
const emptyStateStyle: React.CSSProperties = { padding: "24px", borderRadius: radius.input, background: colors.inputBackground, border: `1px dashed ${colors.border}`, color: colors.muted, textAlign: "center" };
const drawerOverlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.32)", display: "flex", justifyContent: "flex-end", zIndex: 50 };
const drawerStyle: React.CSSProperties = { width: "min(720px, 100%)", height: "100vh", background: colors.card, borderLeft: `1px solid ${colors.border}`, boxShadow: shadow.card, display: "flex", flexDirection: "column" };
const drawerHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", padding: "28px", borderBottom: `1px solid ${colors.border}` };
const drawerTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "26px" };
const closeButtonStyle: React.CSSProperties = { width: "42px", height: "42px", display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, color: colors.text, cursor: "pointer" };
const drawerContentStyle: React.CSSProperties = { padding: "24px 28px 34px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" };
const drawerSectionStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", background: colors.card };
const drawerSectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "20px" };
const editableRowStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" };
const twoColumnsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" };
const infoLabelStyle: React.CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 800 };
const inputStyle: React.CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "13px 42px 13px 14px", fontSize: "15px" };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: "96px", resize: "vertical" };
const checkboxLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px", color: colors.text, fontWeight: 800, margin: "4px 0 14px" };
const clientSearchBoxStyle: React.CSSProperties = { position: "relative" };
const clientResultsStyle: React.CSSProperties = { position: "absolute", zIndex: 5, left: 0, right: 0, top: "calc(100% + 6px)", maxHeight: "260px", overflowY: "auto", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.input, boxShadow: shadow.soft, padding: "6px" };
const clientResultStyle: React.CSSProperties = { width: "100%", display: "flex", justifyContent: "space-between", gap: "12px", border: "none", background: "transparent", color: colors.text, padding: "11px 12px", borderRadius: "10px", cursor: "pointer", textAlign: "left" };
const clientResultEmptyStyle: React.CSSProperties = { padding: "12px", color: colors.muted };
const timerBoxStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", padding: "16px", borderRadius: radius.input, border: `1px solid ${colors.border}`, background: colors.inputBackground, marginBottom: "14px" };
const timerLabelStyle: React.CSSProperties = { margin: 0, color: colors.muted, fontWeight: 800 };
const timerValueStyle: React.CSSProperties = { display: "block", marginTop: "5px", color: colors.navy, fontSize: "24px" };
const timerButtonStyle: React.CSSProperties = { ...primarySmallButtonStyle, background: colors.success };
const stopButtonStyle: React.CSSProperties = { ...primarySmallButtonStyle, background: colors.red };
const timeListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
const timeItemStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "13px", borderRadius: radius.input, border: `1px solid ${colors.border}`, background: colors.inputBackground };
const taskMetaStyle: React.CSSProperties = { margin: "5px 0 0", color: colors.muted };
const emptyTaskStyle: React.CSSProperties = { padding: "14px", borderRadius: radius.input, border: `1px dashed ${colors.border}`, color: colors.muted, textAlign: "center" };
const documentsHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "14px" };
const uploadButtonStyle: React.CSSProperties = { ...primarySmallButtonStyle, width: "fit-content", padding: "11px 14px" };
const documentsListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
const documentItemStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "13px", borderRadius: radius.input, border: `1px solid ${colors.border}`, background: colors.inputBackground };
const documentNameButtonStyle: React.CSSProperties = { border: "none", background: "transparent", color: colors.navy, fontWeight: 800, cursor: "pointer", padding: 0, textAlign: "left" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "9px 12px", background: colors.card, color: colors.text, fontWeight: 800, cursor: "pointer" };
