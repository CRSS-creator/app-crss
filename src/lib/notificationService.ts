import { supabase } from "@/lib/supabaseClient";

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  status: "unread" | "read";
  priority: "low" | "normal" | "high";
  related_table: string | null;
  related_id: string | null;
  recipient_id: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export async function fetchNotifications() {
  return supabase
    .from("powiadomienia")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
}

export async function fetchUnreadNotificationsCount() {
  return supabase
    .from("powiadomienia")
    .select("id", { count: "exact", head: true })
    .eq("status", "unread");
}

export async function createDueTaskNotifications() {
  return supabase.rpc("create_due_task_notifications");
}

export async function createDueCrmFollowUpNotifications() {
  return supabase.rpc("create_due_crm_follow_up_notifications");
}

export async function createDueRecurringTaskNotifications() {
  return supabase.rpc("create_due_recurring_task_notifications");
}

export async function createDueNotifications() {
  const [taskResult, crmFollowUpResult, recurringTaskResult] = await Promise.all([
    createDueTaskNotifications(),
    createDueCrmFollowUpNotifications(),
    createDueRecurringTaskNotifications(),
  ]);

  return {
    data: {
      taskNotifications: taskResult.data || 0,
      crmFollowUpNotifications: crmFollowUpResult.data || 0,
      recurringTaskNotifications: recurringTaskResult.data || 0,
    },
    error: taskResult.error || crmFollowUpResult.error || recurringTaskResult.error,
  };
}

export async function markNotificationRead(notificationId: string) {
  return supabase
    .from("powiadomienia")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", notificationId);
}

export async function markAllNotificationsRead() {
  return supabase
    .from("powiadomienia")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("status", "unread");
}
