-- Avoid circular RLS dependencies between metadata inserts and Storage reads.
drop policy procedures_owner_insert on public.procedury_wzory;
create policy procedures_owner_insert on public.procedury_wzory for insert to authenticated
with check (created_by=(select auth.uid())
and (storage.foldername(sciezka))[1]=(select auth.uid())::text
and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='owner' and p.aktywne is not false));
