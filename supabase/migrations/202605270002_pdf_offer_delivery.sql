alter table public.crm_oferty
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_file_name text,
  add column if not exists pdf_file_size integer,
  add column if not exists n8n_webhook_url text,
  add column if not exists email_recipient text,
  add column if not exists email_subject text,
  add column if not exists email_sent_at timestamptz;

insert into storage.buckets (id, name, public)
values ('crm-oferty-pdf', 'crm-oferty-pdf', true)
on conflict (id) do update set public = true;

drop policy if exists "crm_offer_pdf_public_read" on storage.objects;
drop policy if exists "crm_offer_pdf_owner_insert" on storage.objects;
drop policy if exists "crm_offer_pdf_owner_update" on storage.objects;
drop policy if exists "crm_offer_pdf_owner_delete" on storage.objects;

create policy "crm_offer_pdf_public_read"
  on storage.objects for select
  using (bucket_id = 'crm-oferty-pdf');

create policy "crm_offer_pdf_owner_insert"
  on storage.objects for insert
  with check (bucket_id = 'crm-oferty-pdf' and public.current_user_role() = 'owner');

create policy "crm_offer_pdf_owner_update"
  on storage.objects for update
  using (bucket_id = 'crm-oferty-pdf' and public.current_user_role() = 'owner')
  with check (bucket_id = 'crm-oferty-pdf' and public.current_user_role() = 'owner');

create policy "crm_offer_pdf_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'crm-oferty-pdf' and public.current_user_role() = 'owner');
