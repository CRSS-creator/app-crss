create table if not exists public.crm_umowy (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  crm_id uuid references public.crm_szanse_sprzedazy(id) on delete set null,
  klient_id uuid references public.klienci(id) on delete set null,
  typ_umowy text not null check (typ_umowy in ('KH', 'KU')),
  status text not null default 'szkic' check (status in ('szkic', 'wygenerowana', 'wyslana_do_podpisu', 'podpisana', 'anulowana')),
  numer_umowy text,
  data_zawarcia date,
  miejsce_zawarcia text,
  pierwszy_okres text,
  nazwa_klienta text not null,
  siedziba text,
  rejestr text,
  krs text,
  nip text,
  reprezentant text,
  email_klienta text,
  abonament_netto numeric(12,2),
  limit_dokumentow integer,
  obsluga_kadrowa boolean not null default false,
  ustalenia_indywidualne text,
  wygenerowany_pdf_path text,
  wygenerowany_pdf_name text,
  podpisany_pdf_path text,
  podpisany_pdf_name text,
  podpisana_at timestamptz,
  onboarding_uruchomiony_at timestamptz
);

create index if not exists crm_umowy_crm_id_idx on public.crm_umowy(crm_id);
create index if not exists crm_umowy_klient_id_idx on public.crm_umowy(klient_id);
create index if not exists crm_umowy_status_idx on public.crm_umowy(status);
create index if not exists crm_umowy_created_at_idx on public.crm_umowy(created_at desc);

alter table public.crm_umowy enable row level security;

drop policy if exists "crm_umowy_select_authenticated" on public.crm_umowy;
create policy "crm_umowy_select_authenticated"
on public.crm_umowy for select
to authenticated
using (true);

drop policy if exists "crm_umowy_insert_authenticated" on public.crm_umowy;
create policy "crm_umowy_insert_authenticated"
on public.crm_umowy for insert
to authenticated
with check (true);

drop policy if exists "crm_umowy_update_authenticated" on public.crm_umowy;
create policy "crm_umowy_update_authenticated"
on public.crm_umowy for update
to authenticated
using (true)
with check (true);

drop policy if exists "crm_umowy_delete_authenticated" on public.crm_umowy;
create policy "crm_umowy_delete_authenticated"
on public.crm_umowy for delete
to authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('crm-umowy', 'crm-umowy', false)
on conflict (id) do nothing;

drop policy if exists "crm_contract_files_select_authenticated" on storage.objects;
create policy "crm_contract_files_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'crm-umowy');

drop policy if exists "crm_contract_files_insert_authenticated" on storage.objects;
create policy "crm_contract_files_insert_authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'crm-umowy');

drop policy if exists "crm_contract_files_update_authenticated" on storage.objects;
create policy "crm_contract_files_update_authenticated"
on storage.objects for update
to authenticated
using (bucket_id = 'crm-umowy')
with check (bucket_id = 'crm-umowy');

drop policy if exists "crm_contract_files_delete_authenticated" on storage.objects;
create policy "crm_contract_files_delete_authenticated"
on storage.objects for delete
to authenticated
using (bucket_id = 'crm-umowy');
