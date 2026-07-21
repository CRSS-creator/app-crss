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

export async function fetchPayrollNotificationsForClient(clientId: string) {
  return supabase
    .from("powiadomienia")
    .select("*")
    .eq("type", "payroll_contract_expiry")
    .eq("metadata->>client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(100);
}

export async function fetchUnreadNotificationsCount() {
  return supabase
    .from("powiadomienia")
    .select("id", { count: "exact", head: true })
    .eq("status", "unread");
}

export async function fetchUnreadNotifications(limit = 10) {
  return supabase
    .from("powiadomienia")
    .select("*")
    .eq("status", "unread")
    .order("created_at", { ascending: false })
    .limit(limit);
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

export async function createDueClientCardNotifications() {
  return supabase.rpc("create_due_client_card_notifications");
}

export async function createDueRodoReviewNotifications() {
  return supabase.rpc("create_due_rodo_review_notifications");
}

export async function createDueOnboardingCompletionNotifications() {
  return supabase.rpc("create_due_onboarding_completion_notifications");
}

export async function createDuePayrollContractNotifications() {
  return supabase.rpc("create_due_payroll_contract_notifications");
}

export async function createDuePayrollA1Notifications() {
  return supabase.rpc("create_due_payroll_a1_notifications");
}

export async function createDueZusPreferentialRateNotifications() {
  return supabase.rpc("create_due_zus_preferential_rate_notifications");
}

export async function createDueZusPreferenceExpiryNotifications() {
  return supabase.rpc("create_due_zus_preference_expiry_notifications");
}

export async function createDueZusSmallPlusCheckNotifications() {
  return supabase.rpc("create_due_zus_small_plus_check_notifications");
}

export async function createDueNotifications() {
  const [taskResult, crmFollowUpResult, recurringTaskResult, clientCardResult, rodoReviewResult, onboardingCompletionResult, payrollContractResult, payrollA1Result, zusPreferentialRateResult, zusPreferenceExpiryResult, zusSmallPlusCheckResult] = await Promise.all([
    createDueTaskNotifications(),
    createDueCrmFollowUpNotifications(),
    createDueRecurringTaskNotifications(),
    createDueClientCardNotifications(),
    createDueRodoReviewNotifications(),
    createDueOnboardingCompletionNotifications(),
    createDuePayrollContractNotifications(),
    createDuePayrollA1Notifications(),
    createDueZusPreferentialRateNotifications(),
    createDueZusPreferenceExpiryNotifications(),
    createDueZusSmallPlusCheckNotifications(),
  ]);

  return {
    data: {
      taskNotifications: taskResult.data || 0,
      crmFollowUpNotifications: crmFollowUpResult.data || 0,
      recurringTaskNotifications: recurringTaskResult.data || 0,
      clientCardNotifications: clientCardResult.data || 0,
      rodoReviewNotifications: rodoReviewResult.data || 0,
      onboardingCompletionNotifications: onboardingCompletionResult.data || 0,
      payrollContractNotifications: payrollContractResult.data || 0,
      payrollA1Notifications: payrollA1Result.data || 0,
      zusPreferentialRateNotifications: zusPreferentialRateResult.data || 0,
      zusPreferenceExpiryNotifications: zusPreferenceExpiryResult.data || 0,
      zusSmallPlusCheckNotifications: zusSmallPlusCheckResult.data || 0,
    },
    error:
      taskResult.error ||
      crmFollowUpResult.error ||
      recurringTaskResult.error ||
      clientCardResult.error ||
      rodoReviewResult.error ||
      onboardingCompletionResult.error ||
      payrollContractResult.error ||
      payrollA1Result.error ||
      zusPreferentialRateResult.error ||
      zusPreferenceExpiryResult.error ||
      zusSmallPlusCheckResult.error,
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

export async function sendPayrollNotificationClientEmail(notificationId: string) {
  const sessionResult = await supabase.auth.getSession();
  const token = sessionResult.data.session?.access_token;

  if (!token) {
    return { data: null, error: new Error("Brak aktywnej sesji.") };
  }

  try {
    const response = await fetch("/api/kadry/notifications/send-client-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notificationId }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { data: null, error: new Error(payload?.error || "Nie udało się wysłać maila do klienta.") };
    }

    return { data: payload, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Nie udało się połączyć z wysyłką maila."),
    };
  }
}
