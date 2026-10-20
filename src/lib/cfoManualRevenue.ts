import type { CfoInvoiceLine } from "./cfoService";

export type ManualRevenue = {
  id: string;
  opis: string;
  zrodlo: string;
  rodzaj: "dotacja" | "pozostale";
  okres: string;
  data_dokumentu: string;
  numer_dokumentu: string | null;
  kwota_netto: number;
  kwota_brutto: number;
  termin_wplywu: string | null;
  data_wplywu: string | null;
};
export type ManualRevenueInput = Omit<ManualRevenue, "id"> & { id?: string };
export const MANUAL_REVENUE_SOURCE = "cfo_manual_revenue";

// Reporting rows only: these are never stored as invoices or sent to wFirma.
export function manualRevenueLines(rows: ManualRevenue[]): CfoInvoiceLine[] {
  return rows.map(row => ({
    id: `manual:${row.id}`, nazwa: row.opis, source_key: MANUAL_REVENUE_SOURCE,
    kwota_netto: Number(row.kwota_netto), cfo_przychod_kategoria: "pozostale", rozliczenie_oplata_id: null,
    faktury: { id: `manual:${row.id}`, numer: row.numer_dokumentu || "Wpis ręczny", okres: row.okres,
      typ: "reczny", kategoria: row.rodzaj, status: row.data_wplywu ? "oplacona" : "wystawiona",
      data_wystawienia: row.data_dokumentu, termin_platnosci: row.termin_wplywu, data_zaplaty: row.data_wplywu,
      klient_id: null, kontrahent_nazwa: row.zrodlo, kwota_brutto: Number(row.kwota_brutto) },
  }));
}

export function manualRevenueCashflow(period: string, rows: ManualRevenue[], asOf: string) {
  return rows.reduce((sum, row) => {
    const date = row.data_wplywu || (row.termin_wplywu && row.termin_wplywu < asOf ? asOf : row.termin_wplywu);
    return sum + (date?.slice(0, 7) === period ? Number(row.kwota_brutto) : 0);
  }, 0);
}
