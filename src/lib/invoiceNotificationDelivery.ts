// Each webhook request represents one recipient in one channel. Singleton
// arrays also support automations that read the plural recipient fields.
export async function sendInvoiceNotificationTargets(
  webhookUrl: string,
  payload: Record<string, unknown>,
  emails: string[],
  phones: string[]
) {
  const failures: string[] = [];
  for (const channel of ["email", "sms"] as const) {
    const targets = channel === "email" ? emails : phones;
    for (const target of targets) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            channel,
            recipientEmail: channel === "email" ? target : null,
            recipientEmails: channel === "email" ? [target] : [],
            recipientPhone: channel === "sms" ? target : null,
            recipientPhones: channel === "sms" ? [target] : [],
          }),
        });
        if (!response.ok) {
          const details = await response.text().catch(() => "");
          failures.push(`${channel} ${target}: ${response.status}${details ? ` ${details}` : ""}`);
        }
      } catch (error) {
        failures.push(`${channel} ${target}: ${error instanceof Error ? error.message : "Błąd połączenia"}`);
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`Automatyzacja nie przyjęła wysyłki: ${failures.join("; ")}`);
  }
}
