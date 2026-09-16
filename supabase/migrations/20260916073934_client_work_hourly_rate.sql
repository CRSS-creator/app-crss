alter table public.profiles
  add column client_work_hourly_rate numeric(10,2)
  check (client_work_hourly_rate >= 0);

comment on column public.profiles.client_work_hourly_rate is
  'Optional hourly labor cost in PLN used only for client profitability; does not create payroll or general team costs.';

update public.profiles
set client_work_hourly_rate = 50
where email = 'biuro@crss.com.pl' and full_name = 'Mateusz Marcinkowski' and role = 'owner';
