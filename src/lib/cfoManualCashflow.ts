export type ManualCashflow = {
  id: string;
  opis: string;
  kierunek: "wplyw" | "wydatek";
  kwota: number;
  termin: string;
  data_realizacji: string | null;
};
export type ManualCashflowInput = Omit<ManualCashflow, "id"> & { id?: string };

export function manualCashflowAmount(row: ManualCashflow) {
  return (row.kierunek === "wplyw" ? 1 : -1) * Number(row.kwota);
}

export function manualCashflowForecast(period: string, rows: ManualCashflow[], asOf: string) {
  return rows.reduce((sum, row) => {
    const date = row.data_realizacji || (row.termin < asOf ? asOf : row.termin);
    return date.slice(0, 7) === period ? sum + manualCashflowAmount(row) : sum;
  }, 0);
}
