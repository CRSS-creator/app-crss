"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";
import type { UserRole } from "@/lib/permissions";
import {
  createTask,
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
};

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
  const [assignees, setAssignees] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [statusFilter, setStatusFilter] = useState(EMPTY_FILTER);
  const [assigneeFilter, setAssigneeFilter] = useState(EMPTY_FILTER);
  const [clientFilter, setClientFilter] = useState(EMPTY_FILTER);
  const [searchQuery, setSearchQuery] = useState("");

  const visibleAssignees = useMemo(
    () => filterAssignableProfiles(assignees, currentRole, currentUserId),
    [assignees, currentRole, currentUserId]
  );

  const filteredTasks = tasks.filter((task) => {
    const assigneeName = formatProfileName(getProfile(task.profiles));
    const clientName = task.czy_wewnetrzne ? "Wewnętrzne" : formatClientName(getClient(task.klienci));
    const matchesStatus = statusFilter === EMPTY_FILTER || task.status === statusFilter;
    const matchesAssignee = assigneeFilter === EMPTY_FILTER || task.osoba_id === assigneeFilter;
    const matchesClient =
      clientFilter === EMPTY_FILTER ||
      (clientFilter === "internal" && task.czy_wewnetrzne) ||
      task.klient_id === clientFilter;
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const searchableText = [task.tytul, task.opis, task.notatki, assigneeName, clientName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return matchesStatus && matchesAssignee && matchesClient && (!normalizedSearch || searchableText.includes(normalizedSearch));
  });

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

    const [tasksResult, assigneesResult, clientsResult] = await Promise.all([
      fetchTasks(),
      fetchTaskAssignees(),
      fetchTaskClients(),
    ]);

    if (tasksResult.error) console.error("Błąd pobierania zadań:", tasksResult.error);
    if (assigneesResult.error) console.error("Błąd pobierania osób:", assigneesResult.error);
    if (clientsResult.error) console.error("Błąd pobierania klientów:", clientsResult.error);

    setTasks((tasksResult.data || []) as Task[]);
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

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł operacyjny</p>
          <h1 style={titleStyle}>Zadania</h1>
          <p style={subtitleStyle}>
            Zadania zespołu, terminy, notatki, dokumenty i rejestr czasu pracy przypisany do klienta albo spraw wewnętrznych.
          </p>
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
        <SummaryCard label="Wszystkie" value={tasks.length} />
      </section>

      <section style={cardStyle}>
        <div style={tableHeaderStyle}>
          <h2 style={sectionTitleStyle}>Lista zadań</h2>
          <span style={counterStyle}>{loading ? "Ładowanie..." : `${filteredTasks.length} pozycji`}</span>
        </div>

        <div style={filtersRowStyle}>
          <input
            style={{ ...filterStyle, minWidth: "240px" }}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Szukaj zadania"
          />
          <select style={filterStyle} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value={EMPTY_FILTER}>Status</option>
            {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <select style={filterStyle} value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
            <option value={EMPTY_FILTER}>Osoba</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{formatProfileName(assignee)}</option>)}
          </select>
          <select style={filterStyle} value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
            <option value={EMPTY_FILTER}>Klient</option>
            <option value="internal">Wewnętrzne</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{formatClientName(client)}</option>)}
          </select>
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
                  <Th width="30%">Zadanie</Th>
                  <Th width="13%">Status</Th>
                  <Th width="12%">Priorytet</Th>
                  <Th width="15%">Termin</Th>
                  <Th width="15%">Osoba</Th>
                  <Th width="15%">Klient</Th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr key={task.id} style={rowStyle} onClick={() => setSelectedTask(task)}>
                    <Td strong>{task.tytul}</Td>
                    <Td><Badge>{statusLabel(task.status)}</Badge></Td>
                    <Td><Badge>{priorityLabel(task.priorytet)}</Badge></Td>
                    <Td>{formatDate(task.termin)}</Td>
                    <Td>{formatProfileName(getProfile(task.profiles))}</Td>
                    <Td>{task.czy_wewnetrzne ? "Wewnętrzne" : formatClientName(getClient(task.klienci))}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creatingTask && (
        <TaskDrawer
          mode="create"
          task={null}
          currentUserId={currentUserId}
          currentRole={currentRole}
          assignees={visibleAssignees}
          clients={clients}
          onClose={() => setCreatingTask(false)}
          onCreated={handleTaskCreated}
          onSaved={handleTaskSaved}
        />
      )}

      {selectedTask && (
        <TaskDrawer
          mode="edit"
          task={selectedTask}
          currentUserId={currentUserId}
          currentRole={currentRole}
          assignees={visibleAssignees}
          clients={clients}
          onClose={() => setSelectedTask(null)}
          onCreated={handleTaskCreated}
          onSaved={handleTaskSaved}
        />
      )}
    </>
  );
}

function TaskDrawer({
  mode,
  task,
  currentUserId,
  currentRole,
  assignees,
  clients,
  onClose,
  onCreated,
  onSaved,
}: {
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

  const activeTimeEntry = timeEntries.find((entry) => entry.osoba_id === currentUserId && !entry.ended_at);
  const totalSeconds = timeEntries.reduce((sum, entry) => sum + Number(entry.duration_seconds || 0), 0);
  const canUseTimer = mode === "edit" && task && currentUserId;

  useEffect(() => {
    setDraft(createDraft(task, currentUserId));
  }, [task?.id, currentUserId]);

  useEffect(() => {
    if (!task?.id) return;
    loadDetails(task.id);
  }, [task?.id]);

  async function loadDetails(taskId: string) {
    const [timeResult, documentsResult] = await Promise.all([
      fetchTaskTimeEntries(taskId),
      fetchTaskDocuments(taskId),
    ]);
    if (timeResult.error) console.error("Błąd pobierania czasu pracy:", timeResult.error);
    if (documentsResult.error) console.error("Błąd pobierania dokumentów zadania:", documentsResult.error);
    setTimeEntries((timeResult.data || []) as TimeEntry[]);
    setDocuments((documentsResult.data || []) as TaskDocument[]);
  }

  function updateDraft<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveTask() {
    if (!draft.tytul.trim()) {
      alert("Tytuł zadania jest wymagany.");
      return;
    }
    if (!draft.osoba_id) {
      alert("Wybierz osobę odpowiedzialną.");
      return;
    }
    if (!draft.czy_wewnetrzne && !draft.klient_id) {
      alert("Wybierz klienta albo oznacz zadanie jako wewnętrzne.");
      return;
    }

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
    if (result.error || !result.data?.signedUrl) {
      alert("Nie udało się otworzyć dokumentu.");
      return;
    }
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removeDocument(document: TaskDocument) {
    const result = await deleteTaskDocument(document);
    if (result.error) {
      console.error("Błąd usuwania dokumentu:", result.error);
      alert("Nie udało się usunąć dokumentu.");
      return;
    }
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
          <button style={closeButtonStyle} onClick={onClose} aria-label="Zamknij">
            <X size={20} />
          </button>
        </header>

        <div style={drawerContentStyle}>
          <section style={drawerSectionStyle}>
            <h3 style={drawerSectionTitleStyle}>Dane zadania</h3>
            <EditableRow label="Tytuł">
              <input style={inputStyle} value={draft.tytul} onChange={(event) => updateDraft("tytul", event.target.value)} />
            </EditableRow>
            <EditableRow label="Opis">
              <textarea style={textareaStyle} value={draft.opis} onChange={(event) => updateDraft("opis", event.target.value)} />
            </EditableRow>
            <div style={twoColumnsStyle}>
              <EditableRow label="Status">
                <select style={inputStyle} value={draft.status} onChange={(event) => updateDraft("status", event.target.value as TaskStatus)}>
                  {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </EditableRow>
              <EditableRow label="Priorytet">
                <select style={inputStyle} value={draft.priorytet} onChange={(event) => updateDraft("priorytet", event.target.value as TaskPriority)}>
                  {PRIORITY_OPTIONS.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                </select>
              </EditableRow>
            </div>
            <EditableRow label="Termin">
              <input style={inputStyle} type="date" value={draft.termin} onChange={(event) => updateDraft("termin", event.target.value)} />
            </EditableRow>
            <EditableRow label="Osoba odpowiedzialna">
              <select style={inputStyle} value={draft.osoba_id} onChange={(event) => updateDraft("osoba_id", event.target.value)}>
                <option value="">Wybierz osobę</option>
                {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{formatProfileName(assignee)}</option>)}
              </select>
            </EditableRow>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={draft.czy_wewnetrzne}
                onChange={(event) => {
                  updateDraft("czy_wewnetrzne", event.target.checked);
                  if (event.target.checked) updateDraft("klient_id", "");
                }}
              />
              Zadanie wewnętrzne
            </label>
            {!draft.czy_wewnetrzne && (
              <EditableRow label="Klient">
                <select style={inputStyle} value={draft.klient_id} onChange={(event) => updateDraft("klient_id", event.target.value)}>
                  <option value="">Wybierz klienta</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{formatClientName(client)}</option>)}
                </select>
              </EditableRow>
            )}
            <EditableRow label="Notatki">
              <textarea style={textareaStyle} value={draft.notatki} onChange={(event) => updateDraft("notatki", event.target.value)} />
            </EditableRow>
            <button style={primarySmallButtonStyle} onClick={saveTask} disabled={saving}>
              {saving ? "Zapisywanie..." : "Zapisz zadanie"}
            </button>
          </section>

          {mode === "edit" && task && (
            <>
              <section style={drawerSectionStyle}>
                <h3 style={drawerSectionTitleStyle}>Czas pracy</h3>
                <div style={timerBoxStyle}>
                  <div>
                    <p style={timerLabelStyle}>Łącznie</p>
                    <strong style={timerValueStyle}>{formatDuration(totalSeconds)}</strong>
                  </div>
                  <button style={activeTimeEntry ? stopButtonStyle : timerButtonStyle} onClick={activeTimeEntry ? stopTimer : startTimer} disabled={!canUseTimer}>
                    {activeTimeEntry ? <Square size={17} /> : <Play size={17} />}
                    {activeTimeEntry ? "Zatrzymaj" : "Start"}
                  </button>
                </div>
                {activeTimeEntry && (
                  <textarea
                    style={textareaStyle}
                    value={timerNote}
                    onChange={(event) => setTimerNote(event.target.value)}
                    placeholder="Krótki opis wykonanej pracy"
                  />
                )}
                <div style={timeListStyle}>
                  {timeEntries.length === 0 ? (
                    <div style={emptyTaskStyle}>Brak wpisów czasu</div>
                  ) : (
                    timeEntries.map((entry) => (
                      <div key={entry.id} style={timeItemStyle}>
                        <div>
                          <strong>{formatDate(entry.started_at)}</strong>
                          <p style={taskMetaStyle}>{entry.opis || "Bez opisu"}</p>
                        </div>
                        <span style={counterStyle}>{entry.ended_at ? formatDuration(entry.duration_seconds || 0) : "W toku"}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section style={drawerSectionStyle}>
                <h3 style={drawerSectionTitleStyle}>Dokumenty</h3>
                <label style={uploadButtonStyle}>
                  <Paperclip size={17} />
                  {uploading ? "Dodawanie..." : "Dodaj dokument"}
                  <input type="file" style={{ display: "none" }} onChange={(event) => uploadDocument(event.target.files?.[0] || null)} />
                </label>
                <div style={timeListStyle}>
                  {documents.length === 0 ? (
                    <div style={emptyTaskStyle}>Brak dokumentów</div>
                  ) : (
                    documents.map((document) => (
                      <div key={document.id} style={timeItemStyle}>
                        <button style={linkButtonStyle} onClick={() => openDocument(document)}>{document.nazwa}</button>
                        <button style={secondaryButtonStyle} onClick={() => removeDocument(document)}>Usuń</button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={summaryCardStyle}>
      <p style={summaryLabelStyle}>{label}</p>
      <strong style={summaryValueStyle}>{value}</strong>
    </div>
  );
}

function EditableRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={editableRowStyle}>
      <span style={infoLabelStyle}>{label}</span>
      {children}
    </label>
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

function filterAssignableProfiles(profiles: Profile[], role: UserRole | null, userId: string | null) {
  if (role === "owner") return profiles;
  if (role === "manager") return profiles.filter((profile) => profile.role !== "owner");
  return profiles.filter((profile) => profile.id === userId);
}

function getProfile(profile: ProfileSummary | ProfileSummary[] | null | undefined) {
  return Array.isArray(profile) ? profile[0] : profile;
}

function getClient(client: ClientSummary | ClientSummary[] | null | undefined) {
  return Array.isArray(client) ? client[0] : client;
}

function formatProfileName(profile: ProfileSummary | Profile | null | undefined) {
  return profile?.full_name || profile?.email || "Brak osoby";
}

function formatClientName(client: ClientSummary | Client | null | undefined) {
  if (!client) return "Brak klienta";
  return client.nip ? `${client.nazwa || "Klient"} · ${client.nip}` : client.nazwa || "Klient";
}

function statusLabel(status: TaskStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function priorityLabel(priority: TaskPriority) {
  return PRIORITY_OPTIONS.find((item) => item.value === priority)?.label || priority;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function toDateInput(value: string) {
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "24px",
  alignItems: "flex-start",
  marginBottom: "30px",
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
  display: "inline-flex",
  alignItems: "center",
  gap: "9px",
  border: "none",
  borderRadius: radius.button,
  padding: "15px 20px",
  background: colors.red,
  color: colors.white,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "none",
};

const primarySmallButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  justifyContent: "center",
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
  padding: "24px",
  boxShadow: shadow.soft,
};

const summaryLabelStyle: React.CSSProperties = {
  margin: 0,
  color: colors.muted,
  fontWeight: 700,
};

const summaryValueStyle: React.CSSProperties = {
  display: "block",
  marginTop: "10px",
  fontSize: "30px",
  color: colors.navy,
};

const cardStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "28px",
  boxShadow: shadow.soft,
};

const tableHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "18px",
  marginBottom: "18px",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: colors.navy,
  fontSize: "24px",
};

const counterStyle: React.CSSProperties = {
  color: colors.muted,
  fontWeight: 800,
};

const filtersRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const filterStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  background: colors.inputBackground,
  color: colors.text,
  padding: "12px 42px 12px 14px",
  fontWeight: 650,
};

const tableWrapperStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "13px 12px",
  color: colors.muted,
  fontSize: "13px",
  borderBottom: `1px solid ${colors.border}`,
};

const rowStyle: React.CSSProperties = {
  cursor: "pointer",
  borderBottom: `1px solid ${colors.border}`,
};

const tdStyle: React.CSSProperties = {
  padding: "15px 12px",
  color: colors.text,
  verticalAlign: "top",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  borderRadius: radius.badge,
  padding: "6px 10px",
  background: colors.inputBackground,
  border: `1px solid ${colors.border}`,
  color: colors.text,
  fontSize: "12px",
  fontWeight: 800,
};

const emptyStateStyle: React.CSSProperties = {
  padding: "24px",
  borderRadius: radius.input,
  background: colors.inputBackground,
  border: `1px dashed ${colors.border}`,
  color: colors.muted,
  textAlign: "center",
};

const drawerOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.32)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 50,
};

const drawerStyle: React.CSSProperties = {
  width: "min(720px, 100%)",
  height: "100vh",
  background: colors.card,
  borderLeft: `1px solid ${colors.border}`,
  boxShadow: shadow.card,
  display: "flex",
  flexDirection: "column",
};

const drawerHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "18px",
  padding: "28px",
  borderBottom: `1px solid ${colors.border}`,
};

const drawerTitleStyle: React.CSSProperties = {
  margin: 0,
  color: colors.navy,
  fontSize: "26px",
};

const closeButtonStyle: React.CSSProperties = {
  width: "42px",
  height: "42px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  background: colors.inputBackground,
  color: colors.text,
  cursor: "pointer",
};

const drawerContentStyle: React.CSSProperties = {
  padding: "24px 28px 34px",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "20px",
};

const drawerSectionStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "22px",
  background: colors.card,
};

const drawerSectionTitleStyle: React.CSSProperties = {
  margin: "0 0 16px",
  color: colors.navy,
  fontSize: "20px",
};

const editableRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  marginBottom: "14px",
};

const twoColumnsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "14px",
};

const infoLabelStyle: React.CSSProperties = {
  color: colors.muted,
  fontSize: "13px",
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  background: colors.inputBackground,
  color: colors.text,
  padding: "13px 42px 13px 14px",
  fontSize: "15px",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: "96px",
  resize: "vertical",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  color: colors.text,
  fontWeight: 800,
  margin: "4px 0 14px",
};

const timerBoxStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  padding: "16px",
  borderRadius: radius.input,
  border: `1px solid ${colors.border}`,
  background: colors.inputBackground,
  marginBottom: "14px",
};

const timerLabelStyle: React.CSSProperties = { margin: 0, color: colors.muted, fontWeight: 800 };
const timerValueStyle: React.CSSProperties = { display: "block", marginTop: "5px", color: colors.navy, fontSize: "24px" };
const timerButtonStyle: React.CSSProperties = { ...primarySmallButtonStyle, background: colors.success };
const stopButtonStyle: React.CSSProperties = { ...primarySmallButtonStyle, background: colors.red };
const timeListStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };

const timeItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  padding: "13px",
  borderRadius: radius.input,
  border: `1px solid ${colors.border}`,
  background: colors.inputBackground,
};

const taskMetaStyle: React.CSSProperties = { margin: "5px 0 0", color: colors.muted };

const emptyTaskStyle: React.CSSProperties = {
  padding: "14px",
  borderRadius: radius.input,
  border: `1px dashed ${colors.border}`,
  color: colors.muted,
  textAlign: "center",
};

const uploadButtonStyle: React.CSSProperties = {
  ...primarySmallButtonStyle,
  width: "fit-content",
  marginBottom: "14px",
};

const linkButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: colors.navy,
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  padding: "9px 12px",
  background: colors.card,
  color: colors.text,
  fontWeight: 800,
  cursor: "pointer",
};
