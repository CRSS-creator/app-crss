alter table public.faktury
  add column if not exists wfirma_pdf_path text,
  add column if not exists wfirma_pdf_name text,
  add column if not exists wfirma_pdf_synced_at timestamptz;

insert into storage.buckets (id, name, public)
values ('faktury-pdf', 'faktury-pdf', false)
on conflict (id) do nothing;

drop policy if exists "invoice_pdf_files_select_management" on storage.objects;
create policy "invoice_pdf_files_select_management"
on storage.objects for select
to authenticated
using (
  bucket_id = 'faktury-pdf'
  and public.current_user_role() in ('owner', 'admin')
);

drop policy if exists "invoice_pdf_files_insert_management" on storage.objects;
create policy "invoice_pdf_files_insert_management"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'faktury-pdf'
  and public.current_user_role() in ('owner', 'admin')
);

drop policy if exists "invoice_pdf_files_update_management" on storage.objects;
create policy "invoice_pdf_files_update_management"
on storage.objects for update
to authenticated
using (
  bucket_id = 'faktury-pdf'
  and public.current_user_role() in ('owner', 'admin')
)
with check (
  bucket_id = 'faktury-pdf'
  and public.current_user_role() in ('owner', 'admin')
);

drop policy if exists "invoice_pdf_files_delete_management" on storage.objects;
create policy "invoice_pdf_files_delete_management"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'faktury-pdf'
  and public.current_user_role() in ('owner', 'admin')
);
