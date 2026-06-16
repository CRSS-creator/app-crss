"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notificationService";

type NotificationFilter = "unread" | "all" | "read";

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

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    setLoading(true);
    const { data, error } = await fetchNotifications();
    if (error) console.error("Błąd pobierania powiadomień:", error);
    else setNotifications((data || []) as AppNotification[]);
    setLoading(false);
  }

  async function markRead(notification: AppNotification) {
    if (notification.status === "read") return;
    await markNotificationRead(notification.id);
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, status: "read", read_at: new Date().toISOString() } : item));
  }

  async function markAllRead() {
    await markAllNotificationsRead();
    setNotifications((current) => current.map((item) => ({ ...item, status: "read", read_at: item.read_at || new Date().toISOString() })));
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
          <p style={subtitleStyle}>Najważniejsze komunikaty z CRM i pracy operacyjnej.</p>
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
              return (
                <article key={notification.id} style={notification.status === "unread" ? unreadItemStyle : itemStyle}>
                  <div style={itemHeaderStyle}>
                    <div>
                      <div style={itemTitleStyle}>{notification.title}</div>
                      {notification.body && <p style={itemBodyStyle}>{notification.body}</p>}
                    </div>
                    <div style={itemMetaStyle}>
                      <span style={priorityBadgeStyle(notification.priority)}>{priorityLabel(notification.priority)}</span>
                      <span>{formatDateTime(notification.created_at)}</span>
                    </div>
                  </div>
                  <div style={itemActionsStyle}>
                    {publicToken && (
                      <a style={secondaryButtonStyle} href={`/oferta/${publicToken}`} target="_blank" rel="noreferrer">Otwórz propozycję</a>
                    )}
                    {isTaskNotification && <a style={secondaryButtonStyle} href="/zadania">Otwórz zadania</a>}
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
const subtitleStyle: React.CSSProperties = { maxWidth: "760px", color: colors.muted, fontSize: "17px", lineHeight: 1.7 };
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
const primaryButtonStyle: React.CSSProperties = { border: "none", borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.red, color: colors.white, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" };
const secondaryButtonStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "10px 14px", minHeight: "42px", background: colors.white, color: colors.navy, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center", textDecoration: "none" };
