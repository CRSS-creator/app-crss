alter table public.kadry_a1 add column rozliczona_at timestamptz;
alter table public.kadry_a1 drop constraint kadry_a1_client_unique;
create unique index kadry_a1_active_client_unique on public.kadry_a1(klient_id)
  where rozliczona_at is null;
