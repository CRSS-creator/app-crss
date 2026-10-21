create table public.cfo_przeplywy_reczne (
  id uuid primary key default gen_random_uuid(),
  opis text not null check (length(btrim(opis)) > 0),
  kierunek text not null check (kierunek in ('wplyw','wydatek')),
  kwota numeric(14,2) not null check (kwota > 0),
  termin date not null,
  data_realizacji date,
  created_at timestamptz not null default now(),
  constraint cfo_manual_flow_past_realization check (data_realizacji is null or data_realizacji <= (now() at time zone 'Europe/Warsaw')::date)
);
alter table public.cfo_przeplywy_reczne enable row level security;
revoke all on public.cfo_przeplywy_reczne from anon, authenticated;
grant select,insert,update,delete on public.cfo_przeplywy_reczne to authenticated;
grant all on public.cfo_przeplywy_reczne to service_role;
create policy cfo_manual_flow_owner_all on public.cfo_przeplywy_reczne
for all to authenticated using (public.current_user_role()='owner')
with check (public.current_user_role()='owner');
