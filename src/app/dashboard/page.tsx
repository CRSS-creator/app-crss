"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients } from "@/lib/clientService";
import { canAccessModule, type UserRole } from "@/lib/permissions";
import { createDueNotifications, fetchNotifications, type AppNotification } from "@/lib/notificationService";
import { fetchOnboardingStages, type OnboardingStageRecord } from "@/lib/onboardingService";
import {
  ensureCurrentMonthSettlements,
  fetchMonthlySettlements,
  fetchSettlementTaskProgress,
  type MonthlySettlement,
  type SettlementProgress,
} from "@/lib/monthlySettlementsService";
import { fetchTaxObligations, type TaxObligation } from "@/lib/taxObligationService";
import { fetchTasks, type Task } from "@/lib/taskService";
import { fetchCrmLeads } from "@/lib/crmService";
import { supabase } from "@/lib/supabaseClient";

type ProfileSummary = {
  full_name: string | null;
  email: string | null;
  role?: string | null;
  aktywne?: boolean | null;
};

type Client = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  status_klienta: string | null;
  opiekun_id: string | null;
  profiles?: ProfileSummary | ProfileSummary[] | null;
};

type CrmLead = {
  id: string;
  nazwa?: string | null;
  etap?: string | null;
  wartosc_mrr?: number | null;
  data_follow_up?: string | null;
};

type DashboardState = {
  period: string;
  userId: string | null;
  clients: Client[];
  tasks: Task[];
  notifications: AppNotification[];
  settlements: MonthlySettlement[];
  progressRows: SettlementProgress[];
  taxObligations: TaxObligation[];
  onboardingStages: OnboardingStageRecord[];
  crmLeads: CrmLead[];
};

export default function DashboardPage() {
  return (
    <AppLayout activePage="dashboard">
      <AccessGuard moduleName="dashboard">
        {(role) => <DashboardContent role={role || ""} />}
      </AccessGuard>
    </AppLayout>
  );
}

function DashboardContent({ role }: { role: UserRole }) {
  const [data, setData] = useState<DashboardState>(() => ({
    period: currentSettlementPeriod(),
    userId: null,
    clients: [],
    tasks: [],
    notifications: [],
    settlements: [],
    progressRows: [],
    taxObligations: [],
    onboardingStages: [],
    crmLeads: [],
  }));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      setLoading(true);
      const period = currentSettlementPeriod();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id || null;

      await createDueNotifications();
      await ensureCurrentMonthSettlements(period);

      const crmPromise = canAccessModule(role, "crm")
        ? fetchCrmLeads()
        : Promise.resolve({ data: [] as CrmLead[], error: null });

      const [
        clientsResult,
        tasksResult,
        notificationsResult,
        settlementsResult,
        progressResult,
        taxResult,
        onboardingResult,
        crmResult,
      ] = await Promise.all([
        fetchClients(),
        fetchTasks(),
        fetchNotifications(),
        fetchMonthlySettlements(period),
        fetchSettlementTaskProgress(period),
        fetchTaxObligations(period),
        fetchOnboardingStages(),
        crmPromise,
      ]);

      if (clientsResult.error) console.error("Błąd pobierania klientów do dashboardu:", clientsResult.error);
      if (tasksResult.error) console.error("Błąd pobierania zadań do dashboardu:", tasksResult.error);
      if (notificationsResult.error) console.error("Błąd pobierania powiadomień do dashboardu:", notificationsResult.error);
      if (settlementsResult.error) console.error("Błąd pobierania rozliczeń do dashboardu:", settlementsResult.error);
      if (progressResult.error) console.error("Błąd pobierania postępu rozliczeń do dashboardu:", progressResult.error);
      if (taxResult.error) console.error("Błąd pobierania zobowiązań do dashboardu:", taxResult.error);
      if (onboardingResult.error) console.error("Błąd pobierania onboardingu do dashboardu:", onboardingResult.error);
      if (crmResult.error) console.error("Błąd pobierania CRM do dashboardu:", crmResult.error);

      if (!ignore) {
        setData({
          period,
          userId,
          clients: ((clientsResult.data || []) as Client[]).sort(compareClients),
          tasks: (tasksResult.data || []) as Task[],
          notifications: (notificationsResult.data || []) as AppNotification[],
          settlements: (settlementsResult.data || []) as MonthlySettlement[],
          progressRows: (progressResult.data || []) as SettlementProgress[],
          taxObligations: (taxResult.data || []) as TaxObligation[],
          onboardingStages: (onboardingResult.data || []) as OnboardingStageRecord[],
          crmLeads: (crmResult.data || []) as CrmLead[],
        });
        setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      ignore = true;
    };
  }, [role]);

  const view = useMemo(() => buildDashboardView(data, role), [data, role]);

  return (
    <section style={contentStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Aplikacja CRSS</p>
          <h1 style={titleStyle}>Dashboard</h1>
        </div>
        <div style={scopeBadgeStyle}>{role === "accountant" ? "Twoi klienci" : "Pełny widok"}</div>
      </header>

      <section style={cardsGridStyle}>
        <MetricCard title="Klienci aktywni" value={view.activeClientsCount} href="/klienci" />
        <MetricCard title="Rozliczenia do domknięcia" value={view.openSettlementsCount} href="/rozliczenia" />
        <MetricCard title="Zadania otwarte" value={view.openTasksCount} href="/zadania" />
        <MetricCard title="Powiadomienia" value={view.unreadNotificationsCount} href="/powiadomienia" />
      </section>

      <section style={mainGridStyle}>
        <Panel title="Najważniejsze teraz" href="/powiadomienia">
          {loading ? (
            <EmptyState>Ładowanie danych...</EmptyState>
          ) : view.priorityItems.length === 0 ? (
            <EmptyState>Brak pilnych spraw.</EmptyState>
          ) : (
            <div style={listStyle}>
              {view.priorityItems.map((item) => (
                <DashboardItem key={item.key} title={item.title} meta={item.meta} tone={item.tone} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={`Rozliczenia ${formatMonth(data.period)}`} href="/rozliczenia">
          <div style={statusGridStyle}>
            <SmallStat label="Czeka na dokumenty" value={view.settlementsWaitingForDocs} />
            <SmallStat label="W księgowaniu" value={view.settlementsInProgress} />
            <SmallStat label="Do sprawdzenia" value={view.settlementsToReview} />
            <SmallStat label="Zatwierdzone" value={view.settlementsClosed} />
          </div>
          <div style={progressBlockStyle}>
            <span>Średni postęp zadań cyklicznych</span>
            <strong>{view.averageSettlementProgress}%</strong>
          </div>
        </Panel>

        <Panel title="Zadania i terminy" href="/zadania">
          {view.upcomingTasks.length === 0 ? (
            <EmptyState>Brak otwartych zadań z terminem.</EmptyState>
          ) : (
            <div style={listStyle}>
              {view.upcomingTasks.map((task) => (
                <DashboardItem
                  key={task.id}
                  title={task.tytul}
                  meta={`${formatDate(task.termin)} · ${taskPriorityLabel(task.priorytet)}`}
                  tone={isOverdue(task.termin) ? "danger" : "neutral"}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Onboarding klientów" href="/onboarding">
          {view.onboardingClients.length === 0 ? (
            <EmptyState>Brak klientów w onboardingu.</EmptyState>
          ) : (
            <div style={listStyle}>
              {view.onboardingClients.slice(0, 5).map((client) => (
                <DashboardItem
                  key={client.id}
                  title={client.nazwa || "Klient"}
                  meta={`Postęp: ${view.onboardingProgressByClient[client.id] || 0}%`}
                  tone="neutral"
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Zobowiązania publicznoprawne" href="/rozliczenia">
          <div style={statusGridStyle}>
            <SmallStat label="Do uzupełnienia" value={view.taxMissingAmount} />
            <SmallStat label="Do wysłania" value={view.taxReadyToSend} />
            <SmallStat label="Wysłane e-mailem" value={view.taxSentEmail} />
            <SmallStat label="Wysłane SMS" value={view.taxSentSms} />
          </div>
        </Panel>

        {canAccessModule(role, "crm") && (
          <Panel title="CRM sprzedaż" href="/crm">
            <div style={statusGridStyle}>
              <SmallStat label="Otwarte szanse" value={view.openCrmLeadsCount} />
              <SmallStat label="Propozycje" value={view.crmProposalCount} />
              <SmallStat label="Decyzje" value={view.crmDecisionCount} />
              <SmallStat label="Follow-up dziś" value={view.crmFollowUpsToday} />
            </div>
          </Panel>
        )}
      </section>
    </section>
  );
}

function buildDashboardView(data: DashboardState, role: UserRole) {
  const visibleClients = getVisibleClients(data.clients, role, data.userId);
  const visibleClientIds = new Set(visibleClients.map((client) => client.id));
  const visibleSettlements = data.settlements.filter((settlement) => visibleClientIds.has(settlement.klient_id));
  const visibleTasks = getVisibleTasks(data.tasks, role, data.userId, visibleClientIds);
  const visibleNotifications = data.notifications.filter((notification) => {
    if (!notification.recipient_id) return role !== "accountant";
    return notification.recipient_id === data.userId;
  });
  const visibleTaxObligations = data.taxObligations.filter((obligation) => visibleClientIds.has(obligation.klient_id));
  const visibleOnboardingStages = data.onboardingStages.filter((stage) => visibleClientIds.has(stage.klient_id));
  const onboardingClientIds = new Set(visibleOnboardingStages.map((stage) => stage.klient_id));
  const onboardingClients = visibleClients.filter((client) => {
    return normalize(client.status_klienta) === "onboarding" || onboardingClientIds.has(client.id);
  });

  const unreadNotifications = visibleNotifications.filter((notification) => notification.status === "unread");
  const openTasks = visibleTasks.filter((task) => !["zrobione", "anulowane"].includes(task.status));
  const upcomingTasks = openTasks
    .filter((task) => task.termin)
    .sort((a, b) => String(a.termin).localeCompare(String(b.termin)))
    .slice(0, 6);

  const progressBySettlement = new Map(data.progressRows.map((row) => [row.rozliczenie_id, row.progress]));
  const averageSettlementProgress = visibleSettlements.length
    ? Math.round(
        visibleSettlements.reduce((sum, settlement) => sum + (progressBySettlement.get(settlement.id) || 0), 0) /
          visibleSettlements.length
      )
    : 0;

  const onboardingProgressByClient = visibleOnboardingStages.reduce<Record<string, number>>((acc, stage) => {
    const stages = visibleOnboardingStages.filter((entry) => entry.klient_id === stage.klient_id);
    const done = stages.filter((entry) => entry.status === "gotowe").length;
    acc[stage.klient_id] = stages.length ? Math.round((done / stages.length) * 100) : 0;
    return acc;
  }, {});

  const priorityItems = [
    ...unreadNotifications.slice(0, 4).map((notification) => ({
      key: `notification-${notification.id}`,
      title: notification.title,
      meta: notification.body || formatDateTime(notification.created_at),
      tone: notification.priority === "high" ? ("danger" as const) : ("warning" as const),
    })),
    ...openTasks
      .filter((task) => isOverdue(task.termin) || isToday(task.termin))
      .slice(0, 4)
      .map((task) => ({
        key: `task-${task.id}`,
        title: task.tytul,
        meta: isOverdue(task.termin) ? `Po terminie: ${formatDate(task.termin)}` : `Na dziś: ${formatDate(task.termin)}`,
        tone: isOverdue(task.termin) ? ("danger" as const) : ("warning" as const),
      })),
    ...visibleSettlements
      .filter((settlement) => settlement.status_ksiegowosci === "czeka_na_dokumenty")
      .slice(0, 4)
      .map((settlement) => ({
        key: `settlement-${settlement.id}`,
        title: getSettlementClientName(settlement),
        meta: "Rozliczenie czeka na dokumenty",
        tone: "neutral" as const,
      })),
  ].slice(0, 7);

  const crmLeads = canAccessModule(role, "crm") ? data.crmLeads : [];

  return {
    activeClientsCount: visibleClients.filter((client) => !["archiwalny", "zawieszony"].includes(normalize(client.status_klienta))).length,
    openSettlementsCount: visibleSettlements.filter((settlement) => !["sprawdzone_zatwierdzone", "podatki_wyslane"].includes(settlement.status_ksiegowosci)).length,
    openTasksCount: openTasks.length,
    unreadNotificationsCount: unreadNotifications.length,
    settlementsWaitingForDocs: visibleSettlements.filter((settlement) => settlement.status_ksiegowosci === "czeka_na_dokumenty").length,
    settlementsInProgress: visibleSettlements.filter((settlement) => settlement.status_ksiegowosci === "w_trakcie_ksiegowania").length,
    settlementsToReview: visibleSettlements.filter((settlement) => settlement.status_ksiegowosci === "do_sprawdzenia").length,
    settlementsClosed: visibleSettlements.filter((settlement) => ["sprawdzone_zatwierdzone", "podatki_wyslane"].includes(settlement.status_ksiegowosci)).length,
    averageSettlementProgress,
    priorityItems,
    upcomingTasks,
    onboardingClients,
    onboardingProgressByClient,
    taxMissingAmount: visibleTaxObligations.filter((obligation) => obligation.kwota === null || obligation.kwota === undefined).length,
    taxReadyToSend: visibleTaxObligations.filter((obligation) => obligation.kwota !== null && (obligation.status_email !== "wyslane" || obligation.status_sms !== "wyslane")).length,
    taxSentEmail: visibleTaxObligations.filter((obligation) => obligation.status_email === "wyslane").length,
    taxSentSms: visibleTaxObligations.filter((obligation) => obligation.status_sms === "wyslane").length,
    openCrmLeadsCount: crmLeads.filter((lead) => !["wygrana", "przegrana"].includes(normalize(lead.etap))).length,
    crmProposalCount: crmLeads.filter((lead) => normalize(lead.etap).includes("propozycja")).length,
    crmDecisionCount: crmLeads.filter((lead) => normalize(lead.etap).includes("decyzja")).length,
    crmFollowUpsToday: crmLeads.filter((lead) => isToday(lead.data_follow_up || null)).length,
  };
}

function getVisibleClients(clients: Client[], role: UserRole, userId: string | null) {
  if (role === "accountant") {
    return clients.filter((client) => client.opiekun_id === userId);
  }
  return clients;
}

function getVisibleTasks(tasks: Task[], role: UserRole, userId: string | null, visibleClientIds: Set<string>) {
  if (role === "accountant") {
    return tasks.filter((task) => task.osoba_id === userId || (task.klient_id ? visibleClientIds.has(task.klient_id) : false));
  }
  return tasks;
}

function MetricCard({ title, value, href }: { title: string; value: number; href: string }) {
  return (
    <Link href={href} style={metricCardStyle}>
      <span style={cardLabelStyle}>{title}</span>
      <strong style={cardValueStyle}>{value}</strong>
    </Link>
  );
}

function Panel({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <section style={panelStyle}>
      <header style={panelHeaderStyle}>
        <h2 style={panelTitleStyle}>{title}</h2>
        {href && (
          <Link href={href} style={panelLinkStyle}>
            Przejdź
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={smallStatStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardItem({ title, meta, tone }: { title: string; meta: string; tone: "neutral" | "warning" | "danger" }) {
  return (
    <article style={itemStyle}>
      <div>
        <strong style={itemTitleStyle}>{title}</strong>
        <p style={itemMetaStyle}>{meta}</p>
      </div>
      <span style={tone === "danger" ? dangerDotStyle : tone === "warning" ? warningDotStyle : neutralDotStyle} />
    </article>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div style={emptyStateStyle}>{children}</div>;
}

function currentSettlementPeriod() {
  const today = new Date();
  const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const month = today.getMonth() === 0 ? 12 : today.getMonth();
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function normalize(value: string | null | undefined) {
  return (value || "").toLowerCase().trim();
}

function formatMonth(value: string) {
  const month = value.length === 7 ? value : value.slice(0, 7);
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
}

function formatDate(value: string | null) {
  if (!value) return "Brak terminu";
  return new Intl.DateTimeFormat("pl-PL").format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isToday(value: string | null) {
  if (!value) return false;
  return value.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function isOverdue(value: string | null) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${value.slice(0, 10)}T12:00:00`) < today;
}

function taskPriorityLabel(priority: Task["priorytet"]) {
  if (priority === "pilne") return "Pilne";
  if (priority === "wysoki") return "Wysoki";
  if (priority === "niski") return "Niski";
  return "Normalny";
}

function getSettlementClientName(settlement: MonthlySettlement) {
  const client = Array.isArray(settlement.klienci) ? settlement.klienci[0] : settlement.klienci;
  return client?.nazwa || "Klient";
}

function compareClients(first: Client, second: Client) {
  return (first.nazwa || "").localeCompare(second.nazwa || "", "pl", { sensitivity: "base", numeric: true });
}

const contentStyle: CSSProperties = {
  padding: "34px",
};

const headerStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
  marginBottom: "28px",
};

const eyebrowStyle: CSSProperties = {
  color: colors.red,
  fontWeight: 800,
  margin: "0 0 6px",
};

const titleStyle: CSSProperties = {
  color: colors.navy,
  fontSize: "42px",
  lineHeight: 1.05,
  margin: 0,
};

const scopeBadgeStyle: CSSProperties = {
  background: "#e9eef7",
  borderRadius: radius.button,
  color: colors.navy,
  fontWeight: 800,
  padding: "12px 18px",
};

const cardsGridStyle: CSSProperties = {
  display: "grid",
  gap: "18px",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  marginBottom: "22px",
};

const metricCardStyle: CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  boxShadow: shadow.soft,
  color: colors.text,
  display: "block",
  padding: "22px",
  textDecoration: "none",
};

const cardLabelStyle: CSSProperties = {
  color: colors.muted,
  display: "block",
  fontWeight: 800,
  marginBottom: "12px",
};

const cardValueStyle: CSSProperties = {
  color: colors.navy,
  display: "block",
  fontSize: "30px",
  lineHeight: 1,
};

const mainGridStyle: CSSProperties = {
  display: "grid",
  gap: "22px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const panelStyle: CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  boxShadow: shadow.soft,
  minHeight: "220px",
  padding: "24px",
};

const panelHeaderStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
  marginBottom: "18px",
};

const panelTitleStyle: CSSProperties = {
  color: colors.navy,
  fontSize: "24px",
  fontWeight: 500,
  margin: 0,
};

const panelLinkStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.button,
  color: colors.navy,
  fontWeight: 800,
  padding: "10px 16px",
  textDecoration: "none",
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const itemStyle: CSSProperties = {
  alignItems: "center",
  background: colors.inputBackground,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  display: "flex",
  justifyContent: "space-between",
  padding: "14px 16px",
};

const itemTitleStyle: CSSProperties = {
  color: colors.text,
  display: "block",
  fontSize: "15px",
};

const itemMetaStyle: CSSProperties = {
  color: colors.muted,
  fontSize: "13px",
  fontWeight: 700,
  margin: "4px 0 0",
};

const dotBaseStyle: CSSProperties = {
  borderRadius: "999px",
  flex: "0 0 auto",
  height: "12px",
  width: "12px",
};

const dangerDotStyle: CSSProperties = {
  ...dotBaseStyle,
  background: colors.red,
};

const warningDotStyle: CSSProperties = {
  ...dotBaseStyle,
  background: "#facc15",
};

const neutralDotStyle: CSSProperties = {
  ...dotBaseStyle,
  background: colors.navy,
};

const statusGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const smallStatStyle: CSSProperties = {
  background: colors.inputBackground,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  color: colors.text,
  display: "grid",
  gap: "8px",
  padding: "16px",
};

const progressBlockStyle: CSSProperties = {
  alignItems: "center",
  background: "#e9eef7",
  borderRadius: radius.input,
  color: colors.navy,
  display: "flex",
  fontWeight: 800,
  justifyContent: "space-between",
  marginTop: "14px",
  padding: "16px",
};

const emptyStateStyle: CSSProperties = {
  background: colors.inputBackground,
  border: `1px dashed ${colors.border}`,
  borderRadius: radius.input,
  color: colors.muted,
  fontWeight: 800,
  padding: "18px",
  textAlign: "center",
};
