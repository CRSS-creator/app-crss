alter table public.cfo_budget_payment_plans
  add column cel_platnosci boolean not null default true,
  add column cel_wyniku_netto numeric(14,2) check (cel_wyniku_netto >= 0);
alter table public.cfo_budget_payment_plans
  add constraint cfo_budget_target_net_only check (rodzaj = 'target' or cel_wyniku_netto is null),
  add constraint cfo_budget_schedule_cash_required check (rodzaj = 'target' or cel_platnosci);
comment on column public.cfo_budget_payment_plans.cel_wyniku_netto is 'Absolute forecast assumption for net result; distinct from a cash payment goal.';
