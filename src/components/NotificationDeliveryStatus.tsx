import { MailCheck, MessageSquare } from "lucide-react";
import { colors } from "@/app/design";

export default function NotificationDeliveryStatus({ sentAt, sender, channel = "email" }: {
  sentAt?: string | null; sender?: string | null; channel?: "email" | "sms";
}) {
  if (!sentAt) return <span style={{ background: "#eceef1", borderRadius: 20, padding: "7px 10px", fontSize: 12, fontWeight: 700, color: colors.muted }}>Nie wysłano</span>;
  const date = new Date(sentAt);
  const label = Number.isNaN(date.getTime()) ? "Brak daty" : new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(date);
  const Icon = channel === "sms" ? MessageSquare : MailCheck;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
    <span title={channel === "sms" ? "SMS wysłany" : "Powiadomienie wysłane"} style={{ display: "inline-flex", padding: 8, background: "#e9f7ef", borderRadius: 10, color: colors.success, flexShrink: 0 }}><Icon size={20} aria-label="Wysłano" /></span>
    <span style={{ display: "grid", gap: 3, fontSize: 12, lineHeight: 1.4 }}>
      <span style={{ color: colors.text, overflowWrap: "anywhere" }}>{sender || "Brak danych o nadawcy"}</span>
      <time dateTime={sentAt} style={{ color: colors.muted }}>{label}</time>
    </span>
  </span>;
}
