import { shiftDateMonth } from "./cfoCashflow";

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

export function previousMonthCashflows(rows: ManualCashflow[], period: string): ManualCashflowInput[] {
  const previous = shiftDateMonth(period + "-01", -1).slice(0, 7);
  const key = (row: ManualCashflowInput) => JSON.stringify([row.opis, row.kierunek, Number(row.kwota).toFixed(2), row.termin]);
  const existing = new Map<string, number>();
  rows.filter(row => row.termin.slice(0, 7) === period).forEach(row => existing.set(key(row), (existing.get(key(row)) || 0) + 1));
  return rows.filter(row => row.termin.slice(0, 7) === previous).flatMap(row => {
    const copy: ManualCashflowInput = { opis: row.opis, kierunek: row.kierunek, kwota: Number(row.kwota),
      termin: shiftDateMonth(row.termin, 1), data_realizacji: null };
    const count = existing.get(key(copy)) || 0;
    if (count) { existing.set(key(copy), count - 1); return []; }
    return [copy];
  });
}
