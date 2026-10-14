export type YearClosingClientPeriod = {
  status_klienta: string | null;
  pierwszy_okres_rozliczeniowy: string | null;
  ostatni_okres_rozliczeniowy: string | null;
};

export function isYearClosingClient(client: YearClosingClientPeriod, year: number) {
  const status = client.status_klienta?.trim().toLowerCase();
  if (status !== "aktywny" && status !== "onboarding") return false;
  const december = `${year}-12`;
  const first = client.pierwszy_okres_rozliczeniowy?.slice(0, 7);
  const last = client.ostatni_okres_rozliczeniowy?.slice(0, 7);
  return (!first || first <= december) && (!last || last >= december);
}
