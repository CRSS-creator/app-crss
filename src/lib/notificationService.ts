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
  // Fetch every page: the badge counts all unread rows, including older ones.
  const notifications: AppNotification[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("powiadomienia")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    notifications.push(...((data || []) as AppNotification[]));
    if (!data || data.length < pageSize) return { data: notifications, error: null };
  }
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

export async function createDueAmlNextVerificationNotifications() {
  return supabase.rpc("create_due_aml_next_verification_notifications");
}

let dueNotificationsInFlight: ReturnType<typeof generateDueNotifications> | null = null;

export function createDueNotifications() {
  // The layout, page and focus events can request generation at the same time.
  if (!dueNotificationsInFlight) {
    dueNotificationsInFlight = generateDueNotifications().finally(() => {
      dueNotificationsInFlight = null;
    });
  }
  return dueNotificationsInFlight;
}

async function generateDueNotifications() {
  const [taskResult, crmFollowUpResult, recurringTaskResult, clientCardResult, rodoReviewResult, onboardingCompletionResult, payrollContractResult, payrollA1Result, zusPreferentialRateResult, zusPreferenceExpiryResult, zusSmallPlusCheckResult, amlNextVerificationResult] = await Promise.all([
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
    createDueAmlNextVerificationNotifications(),
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
      amlNextVerificationNotifications: amlNextVerificationResult.data || 0,
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
      zusSmallPlusCheckResult.error ||
      amlNextVerificationResult.error,
  };
}

export async function markNotificationRead(notificationId: string) {
  const result = await supabase
    .from("powiadomienia")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (!result.error && typeof window !== "undefined") window.dispatchEvent(new Event("notifications-changed"));
  return result;
}

export async function markAllNotificationsRead() {
  const result = await supabase
    .from("powiadomienia")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("status", "unread");
  if (!result.error && typeof window !== "undefined") window.dispatchEvent(new Event("notifications-changed"));
  return result;
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
