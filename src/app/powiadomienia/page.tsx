"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import {
  createDueNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sendPayrollNotificationClientEmail,
  type AppNotification,
} from "@/lib/notificationService";

type NotificationFilter = "unread" | "all" | "read";

type PayrollNotificationItem = {
  client_name?: string;
  client_nip?: string;
  employee_name?: string;
  contract_type?: string;
  contract_number?: string;
  date_kind?: string;
  due_date?: string;
  client_request?: string;
};

export default function NotificationsPage() {
  return (
    <AppLayout activePage="powiadomienia">
      <AccessGuard moduleName="powiadomienia">
        <NotificationsContent />
      </AccessGuard>
    </AppLayout>
  );
}

function NotificationsContent() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<NotificationFilter>("unread");
  const [expandedNotificationIds, setExpandedNotificationIds] = useState<string[]>([]);
  const [sendingPayrollEmailId, setSendingPayrollEmailId] = useState<string | null>(null);

  useEffect(() => {
    async function loadNotifications() {
      setLoading(true);
      const dueResult = await createDueNotifications();
      if (dueResult.error) console.error("Błąd tworzenia bieżących powiadomień:", dueResult.error);
      const { data, error } = await fetchNotifications();
      if (error) console.error("Błąd pobierania powiadomień:", error);
      else setNotifications((data || []) as AppNotification[]);
      setLoading(false);
    }

    void loadNotifications();
  }, []);

  async function markRead(notification: AppNotification) {
    if (notification.status === "read") return;
    await markNotificationRead(notification.id);
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, status: "read", read_at: new Date().toISOString() } : item));
  }

  async function markAllRead() {
    await markAllNotificationsRead();
    setNotifications((current) => current.map((item) => ({ ...item, status: "read", read_at: item.read_at || new Date().toISOString() })));
  }

  function toggleDetails(notificationId: string) {
    setExpandedNotificationIds((current) =>
      current.includes(notificationId)
        ? current.filter((id) => id !== notificationId)
        : [...current, notificationId]
    );
  }

  async function sendClientEmail(notification: AppNotification) {
    setSendingPayrollEmailId(notification.id);
    const result = await sendPayrollNotificationClientEmail(notification.id);
    setSendingPayrollEmailId(null);

    if (result.error) {
      window.alert(result.error.message);
      return;
    }

    const sentAt = typeof result.data?.sentAt === "string" ? result.data.sentAt : new Date().toISOString();
    const recipients = Array.isArray(result.data?.recipients) ? result.data.recipients : [];
    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id
          ? {
              ...item,
              metadata: {
                ...item.metadata,
                client_email_sent_at: sentAt,
                client_email_recipients: recipients,
              },
            }
          : item
      )
    );
    window.alert("Mail do klienta został przekazany do wysyłki.");
  }

  const unreadCount = notifications.filter((notification) => notification.status === "unread").length;
  const visibleNotifications = notifications.filter((notification) => {
    if (statusFilter === "unread") return notification.status === "unread";
    if (statusFilter === "read") return notification.status === "read";
    return true;
  });

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Aplikacja CRSS</p>
          <h1 style={titleStyle}>Powiadomienia</h1>
        </div>
        <button style={secondaryButtonStyle} onClick={markAllRead} disabled={unreadCount === 0}>Oznacz jako przeczytane</button>
      </section>

      <section style={summaryGridStyle}>
        <SummaryCard label="Nieprzeczytane" value={unreadCount} />
        <SummaryCard label="Wszystkie" value={notifications.length} />
      </section>

      <section style={cardStyle}>
        <div style={filterBarStyle}>
          <button type="button" style={filterButtonStyle(statusFilter === "unread")} onClick={() => setStatusFilter("unread")}>Nieprzeczytane</button>
          <button type="button" style={filterButtonStyle(statusFilter === "all")} onClick={() => setStatusFilter("all")}>Wszystkie</button>
          <button type="button" style={filterButtonStyle(statusFilter === "read")} onClick={() => setStatusFilter("read")}>Przeczytane</button>
        </div>

        {loading ? (
          <div style={emptyStyle}>Ładowanie powiadomień...</div>
        ) : visibleNotifications.length === 0 ? (
          <div style={emptyStyle}>{emptyMessage(statusFilter)}</div>
        ) : (
          <div style={listStyle}>
            {visibleNotifications.map((notification) => {
              const publicToken = getPublicToken(notification);
              const isTaskNotification = notification.type === "task_assigned" || notification.type === "task_due_today";
              const isCrmFollowUpNotification = notification.type === "crm_follow_up_due";
              const isRecurringTaskNotification = notification.type === "recurring_task_due_today";
              const isPayrollContractNotification = notification.type === "payroll_contract_expiry";
              const detailsExpanded = expandedNotificationIds.includes(notification.id);
              const clientEmailSent = isPayrollContractNotification && payrollClientEmailSent(notification);
              return (
                <article key={notification.id} style={notification.status === "unread" ? unreadItemStyle : itemStyle}>
                  <div style={itemHeaderStyle}>
                    <div>
                      <div style={itemTitleStyle}>{notification.title}</div>
                      {isPayrollContractNotification ? (
                        <p style={itemBodyStyle}>{payrollShortBody(notification)}</p>
                      ) : notification.body && <p style={itemBodyStyle}>{notification.body}</p>}
                    </div>
                    <div style={itemMetaStyle}>
                      <span style={priorityBadgeStyle(notification.priority)}>{priorityLabel(notification.priority)}</span>
                      <span>{formatDateTime(notification.created_at)}</span>
                    </div>
                  </div>
                  {isPayrollContractNotification && detailsExpanded && <PayrollContractNotificationTable notification={notification} />}
                  <div style={itemActionsStyle}>
                    {publicToken && (
                      <a style={secondaryButtonStyle} href={`/oferta/${publicToken}`} target="_blank" rel="noreferrer">Otwórz propozycję</a>
                    )}
                    {isTaskNotification && <a style={secondaryButtonStyle} href="/zadania">Otwórz zadania</a>}
                    {isCrmFollowUpNotification && <a style={secondaryButtonStyle} href="/crm">Otwórz CRM</a>}
                    {isRecurringTaskNotification && <a style={secondaryButtonStyle} href="/rozliczenia">Otwórz rozliczenia</a>}
                    {isPayrollContractNotification && (
                      <>
                        <button type="button" style={secondaryButtonStyle} onClick={() => toggleDetails(notification.id)}>
                          {detailsExpanded ? "Ukryj szczegóły" : "Szczegóły"}
                        </button>
                        <button
                          type="button"
                          style={clientEmailSent || !notification.related_id ? disabledButtonStyle : secondaryButtonStyle}
                          onClick={() => sendClientEmail(notification)}
                          disabled={clientEmailSent || !notification.related_id || sendingPayrollEmailId === notification.id}
                        >
                          {clientEmailSent ? "Mail wysłany" : sendingPayrollEmailId === notification.id ? "Wysyłanie..." : "Wyślij mail do klienta"}
                        </button>
                        <a style={secondaryButtonStyle} href="/kadry">Otwórz Kadry</a>
                      </>
                    )}
                    {notification.status === "unread" && <button style={primaryButtonStyle} onClick={() => markRead(notification)}>Przeczytane</button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return <div style={summaryCardStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function PayrollContractNotificationTable({ notification }: { notification: AppNotification }) {
  const metadata = notification.metadata || {};
  const items = getPayrollNotificationItems(metadata);
  const request = items.length === 1 ? stringMeta(items[0].client_request) : null;

  return (
    <div style={payrollNoticeBoxStyle}>
      <div style={payrollNoticeTitleStyle}>Szczegóły terminu</div>
      <div style={payrollTableWrapStyle}>
        <table style={payrollTableStyle}>
          <thead>
            <tr>
              <th style={payrollThStyle}>Czego dotyczy</th>
              <th style={payrollThStyle}>Pracownik / zleceniobiorca</th>
              <th style={payrollThStyle}>Numer umowy</th>
              <th style={payrollThStyle}>Data</th>
              <th style={payrollThStyle}>Informacja</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.date_kind || "term"}-${item.contract_number || index}`}>
                <td style={payrollTdStyle}>{payrollDateKindLabel(stringMeta(item.date_kind))}</td>
                <td style={payrollTdStyle}><strong>{stringMeta(item.employee_name) || ""}</strong></td>
                <td style={payrollTdStyle}>{stringMeta(item.contract_number) || ""}</td>
                <td style={payrollTdStyle}>{formatDateOnly(stringMeta(item.due_date))}</td>
                <td style={payrollTdStyle}>{stringMeta(item.client_request) || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {request && <p style={payrollRequestStyle}>Informacja do klienta: {request}</p>}
    </div>
  );
}

function payrollShortBody(notification: AppNotification) {
  const metadata = notification.metadata || {};
  const items = getPayrollNotificationItems(metadata);
  const itemCount = items.length;

  if (itemCount > 1) {
    const clientName = stringMeta(metadata.client_name) || stringMeta(items[0].client_name) || "klienta bez nazwy";
    return `U klienta ${clientName} kończy się ${itemCount} terminów kadrowych w ciągu najbliższych 3 dni roboczych. Lista jest w szczegółach.`;
  }

  const clientName = stringMeta(metadata.client_name) || "klienta bez nazwy";
  const employeeName = stringMeta(metadata.employee_name);
  const dateKind = payrollDateKindLabel(stringMeta(metadata.date_kind));
  const dueDate = formatDateOnly(stringMeta(metadata.due_date));
  const personPart = employeeName ? ` (${employeeName})` : "";
  const datePart = dueDate !== "-" ? ` Termin: ${dueDate}.` : "";

  if (dateKind === "-") return notification.body || `U klienta ${clientName} kończy się termin kadrowy.`;

  return `U klienta ${clientName} kończy się: ${dateKind.toLowerCase()}${personPart}.${datePart}`;
}

function payrollClientEmailSent(notification: AppNotification) {
  return Boolean(stringMeta(notification.metadata?.client_email_sent_at));
}

function getPayrollNotificationItems(metadata: Record<string, unknown>): PayrollNotificationItem[] {
  if (Array.isArray(metadata.expiring_items) && metadata.expiring_items.length > 0) {
    return metadata.expiring_items
      .filter((item): item is PayrollNotificationItem => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  }

  return [{
    client_name: stringMeta(metadata.client_name) || undefined,
    client_nip: stringMeta(metadata.client_nip) || undefined,
    employee_name: stringMeta(metadata.employee_name) || undefined,
    contract_type: stringMeta(metadata.contract_type) || undefined,
    contract_number: stringMeta(metadata.contract_number) || undefined,
    date_kind: stringMeta(metadata.date_kind) || undefined,
    due_date: stringMeta(metadata.due_date) || undefined,
    client_request: stringMeta(metadata.client_request) || undefined,
  }];
}

function stringMeta(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function payrollDateKindLabel(value: string | null) {
  if (value === "contract_end") return "Koniec umowy";
  if (value === "student_card_expiry") return "Koniec ważności legitymacji studenckiej";
  if (value === "medical_exam_expiry") return "Koniec ważności badań lekarskich";
  if (value === "bhp_training_expiry") return "Koniec ważności szkolenia BHP";
  return value || "-";
}

function formatDateOnly(value: string | null) {
  return value ? new Intl.DateTimeFormat("pl-PL").format(new Date(`${value}T12:00:00`)) : "-";
}

function getPublicToken(notification: AppNotification) {
  const token = notification.metadata?.public_token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

function emptyMessage(filter: NotificationFilter) {
  if (filter === "unread") return "Brak nieprzeczytanych powiadomień.";
  if (filter === "read") return "Brak przeczytanych powiadomień.";
  return "Brak powiadomień.";
}

function priorityLabel(priority: AppNotification["priority"]) {
  if (priority === "high") return "Pilne";
  if (priority === "low") return "Niskie";
  return "Normalne";
}

function priorityBadgeStyle(priority: AppNotification["priority"]): React.CSSProperties {
  if (priority === "high") return { ...badgeStyle, background: "rgba(220, 38, 38, 0.10)", color: colors.danger };
  if (priority === "low") return { ...badgeStyle, background: "rgba(67, 81, 106, 0.10)", color: colors.muted };
  return badgeStyle;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function filterButtonStyle(active: boolean): React.CSSProperties {
  return active ? activeFilterButtonStyle : inactiveFilterButtonStyle;
}

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "20px", alignItems: "flex-start", marginBottom: "28px" };
const eyebrowStyle: React.CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 800 };
const titleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.05 };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "18px", marginBottom: "24px" };
const summaryCardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", boxShadow: shadow.soft, display: "flex", flexDirection: "column", gap: "10px", color: colors.muted, fontWeight: 800 };
const cardStyle: React.CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "24px", boxShadow: shadow.soft };
const filterBarStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px" };
const inactiveFilterButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const activeFilterButtonStyle: React.CSSProperties = { ...inactiveFilterButtonStyle, background: colors.navy, borderColor: colors.navy, color: colors.white };
const emptyStyle: React.CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "22px", color: colors.muted, fontWeight: 800, textAlign: "center" };
const listStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "12px" };
const itemStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "16px" };
const unreadItemStyle: React.CSSProperties = { ...itemStyle, borderColor: colors.navy, background: "#f8fbff" };
const itemHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const itemTitleStyle: React.CSSProperties = { color: colors.navy, fontWeight: 850, fontSize: "17px" };
const itemBodyStyle: React.CSSProperties = { margin: "6px 0 0", color: colors.text, lineHeight: 1.6 };
const itemMetaStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end", color: colors.muted, fontSize: "13px", fontWeight: 700 };
const itemActionsStyle: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px", flexWrap: "wrap" };
const badgeStyle: React.CSSProperties = { display: "inline-flex", borderRadius: radius.badge, padding: "6px 10px", background: "rgba(23, 59, 115, 0.10)", color: colors.navy, fontWeight: 850, fontSize: "12px" };
const payrollNoticeBoxStyle: React.CSSProperties = { marginTop: "14px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, overflow: "hidden" };
const payrollNoticeTitleStyle: React.CSSProperties = { padding: "12px 14px", color: colors.navy, fontSize: "13px", fontWeight: 850, borderBottom: `1px solid ${colors.border}` };
const payrollTableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const payrollTableStyle: React.CSSProperties = { width: "100%", minWidth: "880px", borderCollapse: "collapse" };
const payrollThStyle: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontSize: "11px", color: colors.text, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const payrollTdStyle: React.CSSProperties = { padding: "12px", color: colors.text, borderBottom: `1px solid ${colors.border}`, verticalAlign: "top", fontSize: "13px" };
const payrollRequestStyle: React.CSSProperties = { margin: 0, padding: "12px 14px", color: colors.text, lineHeight: 1.55, fontSize: "13px", fontWeight: 750 };
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.red, color: colors.white, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center", textDecoration: "none" };
const disabledButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, color: colors.muted, background: colors.inputBackground, cursor: "not-allowed", opacity: 0.75 };
