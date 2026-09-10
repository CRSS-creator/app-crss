create table public.kadry_wakacje_skladkowe_powiadomienia (
  id uuid primary key default gen_random_uuid(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  rok integer not null check (rok between 2000 and 2100),
  sent_at timestamptz not null,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_by_name text not null check (length(trim(sent_by_name)) > 0)
);
create index contribution_holidays_notifications_client_year
  on public.kadry_wakacje_skladkowe_powiadomienia (klient_id, rok, sent_at desc);
alter table public.kadry_wakacje_skladkowe_powiadomienia enable row level security;
revoke all on public.kadry_wakacje_skladkowe_powiadomienia from anon, authenticated;
grant select on public.kadry_wakacje_skladkowe_powiadomienia to authenticated;
grant all on public.kadry_wakacje_skladkowe_powiadomienia to service_role;
create policy contribution_holidays_notifications_select
on public.kadry_wakacje_skladkowe_powiadomienia
for select to authenticated using (public.can_access_client(klient_id));
comment on table public.kadry_wakacje_skladkowe_powiadomienia is
'Potwierdzone wysylki powiadomien o wakacjach skladkowych. Wpis tworzy serwer po wyslaniu, nie po samym zleceniu wysylki.';
