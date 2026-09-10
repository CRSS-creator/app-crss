create table public.kadry_wakacje_skladkowe (
  klient_id uuid not null references public.klienci(id) on delete cascade,
  rok integer not null check (rok between 2000 and 2100),
  skorzystal boolean,
  moze_skorzystac boolean,
  primary key (klient_id, rok)
);
alter table public.kadry_wakacje_skladkowe enable row level security;
revoke all on public.kadry_wakacje_skladkowe from anon, authenticated;
grant select, insert, update on public.kadry_wakacje_skladkowe to authenticated;
grant all on public.kadry_wakacje_skladkowe to service_role;

create policy contribution_holidays_select on public.kadry_wakacje_skladkowe
for select to authenticated using (public.can_access_client(klient_id));
create policy contribution_holidays_insert on public.kadry_wakacje_skladkowe
for insert to authenticated with check (public.can_access_client(klient_id));
create policy contribution_holidays_update on public.kadry_wakacje_skladkowe
for update to authenticated using (public.can_access_client(klient_id))
with check (public.can_access_client(klient_id));

comment on table public.kadry_wakacje_skladkowe is 'Roczny rejestr wakacji skladkowych. NULL oznacza status nieustalony; statusy uzupelniane recznie.';
