import type { CfoCostCategory, CfoCostItem } from "./cfoService";
import { shiftDateMonth } from "./cfoCashflow";

export type AnnualCostSchedule = {
  id: string;
  nazwa: string;
  kontrahent: string;
  kategoria: CfoCostCategory;
  podkategoria: string | null;
  kwota_netto: number;
  kwota_brutto: number;
  pierwszy_okres: string;
  data_faktury: string;
  termin_platnosci: string;
  aktywny: boolean;
};
export type AnnualCostInput = Omit<AnnualCostSchedule, "id"> & { id?: string };

export function nextAnnualRenewal(schedule: AnnualCostSchedule, costs: CfoCostItem[], asOf: string) {
  const lastCycle = Math.max(0, Number(asOf.slice(0, 4)) - Number(schedule.pierwszy_okres.slice(0, 4)) + 2);
  for (let cycle = 0; cycle <= lastCycle; cycle++) {
    const start = shiftDateMonth(schedule.pierwszy_okres, cycle * 12);
    if (costs.some(c => !c.ignoruj && c.harmonogram_id === schedule.id && c.okres_start === start)) continue;
    return { start, issue: shiftDateMonth(schedule.data_faktury, cycle * 12), due: shiftDateMonth(schedule.termin_platnosci, cycle * 12) };
  }
  return null;
}

// Known linked documents supply the amount and dates; the schedule fills only missing cycles.
export function annualCostForecast(period: string, schedules: AnnualCostSchedule[], costs: CfoCostItem[], forecastFloor: string) {
  const groups: { category: CfoCostCategory; subcategory: string | null; net: number }[] = [];
  let cash = 0;
  for (const schedule of schedules.filter(s => s.aktywny)) {
    const firstYear = Number(schedule.pierwszy_okres.slice(0, 4));
    const periodYear = Number(period.slice(0, 4));
    // Include older unpaid cycles, but never invent a cycle before the schedule starts.
    const lastCycle = Math.max(0, periodYear - firstYear + 2);
    for (let cycle = 0; cycle <= lastCycle; cycle++) {
      const start = shiftDateMonth(schedule.pierwszy_okres, cycle * 12);
      const end = shiftDateMonth(start, 12);
      const linked = costs.some(c => !c.ignoruj && c.harmonogram_id === schedule.id && c.okres_start === start);
      if (linked) continue;
      if (period >= start.slice(0, 7) && period < end.slice(0, 7)) {
        groups.push({ category: schedule.kategoria, subcategory: schedule.podkategoria, net: Number(schedule.kwota_netto) / 12 });
      }
      const due = shiftDateMonth(schedule.termin_platnosci, cycle * 12);
      if ((due < forecastFloor ? forecastFloor : due).slice(0, 7) === period) cash += Number(schedule.kwota_brutto);
    }
  }
  return { groups, cash };
}
