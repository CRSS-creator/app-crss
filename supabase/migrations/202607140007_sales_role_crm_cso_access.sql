drop policy if exists "owner can read crm" on public.crm_szanse_sprzedazy;
create policy "owner can read crm"
on public.crm_szanse_sprzedazy
for select
to authenticated
using (public.get_current_user_role() in ('owner', 'admin', 'handlowiec'));

drop policy if exists "owner can insert crm" on public.crm_szanse_sprzedazy;
create policy "owner can insert crm"
on public.crm_szanse_sprzedazy
for insert
to authenticated
with check (public.get_current_user_role() in ('owner', 'admin', 'handlowiec'));

drop policy if exists "owner can update crm" on public.crm_szanse_sprzedazy;
create policy "owner can update crm"
on public.crm_szanse_sprzedazy
for update
to authenticated
using (public.get_current_user_role() in ('owner', 'admin', 'handlowiec'))
with check (public.get_current_user_role() in ('owner', 'admin', 'handlowiec'));

drop policy if exists "owner can read crm tasks" on public.crm_zadania;
create policy "owner can read crm tasks"
on public.crm_zadania
for select
to authenticated
using (public.get_current_user_role() in ('owner', 'admin', 'handlowiec'));

drop policy if exists "owner can insert crm tasks" on public.crm_zadania;
create policy "owner can insert crm tasks"
on public.crm_zadania
for insert
to authenticated
with check (public.get_current_user_role() in ('owner', 'admin', 'handlowiec'));

drop policy if exists "owner can update crm tasks" on public.crm_zadania;
create policy "owner can update crm tasks"
on public.crm_zadania
for update
to authenticated
using (public.get_current_user_role() in ('owner', 'admin', 'handlowiec'))
with check (public.get_current_user_role() in ('owner', 'admin', 'handlowiec'));

drop policy if exists "owner can delete crm tasks" on public.crm_zadania;
create policy "owner can delete crm tasks"
on public.crm_zadania
for delete
to authenticated
using (public.get_current_user_role() in ('owner', 'admin', 'handlowiec'));

drop policy if exists crm_oferty_select_owner on public.crm_oferty;
create policy crm_oferty_select_owner
on public.crm_oferty
for select
to authenticated
using (public.current_user_role() in ('owner', 'admin', 'handlowiec'));

drop policy if exists crm_oferty_write_owner on public.crm_oferty;
create policy crm_oferty_write_owner
on public.crm_oferty
for all
to authenticated
using (public.current_user_role() in ('owner', 'admin', 'handlowiec'))
with check (public.current_user_role() in ('owner', 'admin', 'handlowiec'));

drop policy if exists crm_oferta_events_select_owner on public.crm_oferta_events;
create policy crm_oferta_events_select_owner
on public.crm_oferta_events
for select
to authenticated
using (public.current_user_role() in ('owner', 'admin', 'handlowiec'));

drop policy if exists cso_content_topics_select_by_role on public.cso_content_topics;
create policy cso_content_topics_select_by_role
on public.cso_content_topics
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('owner', 'manager', 'admin', 'handlowiec')
  )
);

drop policy if exists cso_content_topics_insert_by_role on public.cso_content_topics;
create policy cso_content_topics_insert_by_role
on public.cso_content_topics
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('owner', 'manager', 'admin', 'handlowiec')
  )
);

drop policy if exists cso_content_topics_update_by_role on public.cso_content_topics;
create policy cso_content_topics_update_by_role
on public.cso_content_topics
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('owner', 'manager', 'admin', 'handlowiec')
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('owner', 'manager', 'admin', 'handlowiec')
  )
);

drop policy if exists cso_content_topics_delete_by_role on public.cso_content_topics;
create policy cso_content_topics_delete_by_role
on public.cso_content_topics
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('owner', 'manager', 'admin', 'handlowiec')
  )
);

drop policy if exists "crm_offer_pdf_owner_insert" on storage.objects;
create policy "crm_offer_pdf_owner_insert"
on storage.objects
for insert
with check (
  bucket_id = 'crm-oferty-pdf'
  and public.current_user_role() in ('owner', 'admin', 'handlowiec')
);

drop policy if exists "crm_offer_pdf_owner_update" on storage.objects;
create policy "crm_offer_pdf_owner_update"
on storage.objects
for update
using (
  bucket_id = 'crm-oferty-pdf'
  and public.current_user_role() in ('owner', 'admin', 'handlowiec')
)
with check (
  bucket_id = 'crm-oferty-pdf'
  and public.current_user_role() in ('owner', 'admin', 'handlowiec')
);

drop policy if exists "crm_offer_pdf_owner_delete" on storage.objects;
create policy "crm_offer_pdf_owner_delete"
on storage.objects
for delete
using (
  bucket_id = 'crm-oferty-pdf'
  and public.current_user_role() in ('owner', 'admin', 'handlowiec')
);
