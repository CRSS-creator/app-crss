type ContributionHolidayEligibility = {
  forma_prawna: string | null;
  schemat_zus: string | null;
  status_klienta?: string | null;
  pierwszy_okres_rozliczeniowy?: string | null;
  ostatni_okres_rozliczeniowy?: string | null;
};

export function isContributionHolidayClient(client: ContributionHolidayEligibility) {
  const legalForm = (client.forma_prawna || "").trim().toLowerCase();
  const scheme = (client.schemat_zus || "").trim().toLowerCase().replace(/\s+/g, " ");
  const status = (client.status_klienta || "").trim().toLowerCase();
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric", month: "2-digit", timeZone: "Europe/Warsaw",
  }).formatToParts(now);
  const currentMonth = `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`;
  const firstMonth = client.pierwszy_okres_rozliczeniowy?.slice(0, 7);
  const lastMonth = client.ostatni_okres_rozliczeniowy?.slice(0, 7);
  return (status === "aktywny" || status === "onboarding")
    && (!firstMonth || firstMonth <= currentMonth)
    && (!lastMonth || lastMonth >= currentMonth)
    && (legalForm === "jdg" || legalForm.includes("jednoosob"))
    && scheme !== "ulga na start" && scheme !== "brak zus";
}
