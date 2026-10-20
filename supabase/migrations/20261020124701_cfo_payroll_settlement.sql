-- A cost belongs to one monthly payroll settlement. Its accounting period stays unchanged.
-- Existing costs and confirmed dates are preserved; linking is an explicit user action.
alter table public.cfo_koszty
  add column rozliczenie_wynagrodzen_okres date,
  add constraint cfo_cost_payroll_month_check check (
    rozliczenie_wynagrodzen_okres is null or
    rozliczenie_wynagrodzen_okres = date_trunc('month', rozliczenie_wynagrodzen_okres)::date
  ),
  add constraint cfo_cost_payroll_not_annual_check check (
    rozliczenie_wynagrodzen_okres is null or harmonogram_id is null
  );

comment on column public.cfo_koszty.rozliczenie_wynagrodzen_okres is
  'Payroll settlement month (cfo_zobowiazania.okres, types wynagrodzenia_netto/zus/pit4). Linked documents remain accounting costs; only settlement payments enter cashflow and payment forecasts.';
