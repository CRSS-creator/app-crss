
create table public.procedury_wzory (
 id uuid primary key default gen_random_uuid(),
 nazwa text not null check (length(btrim(nazwa)) between 1 and 200),
 nazwa_pliku text not null,
 sciezka text not null unique,
 rozmiar bigint not null check (rozmiar > 0 and rozmiar <= 26214400),
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.procedury_wzory enable row level security;
revoke all on public.procedury_wzory from anon, authenticated;
grant select, insert on public.procedury_wzory to authenticated;
create policy procedures_team_read on public.procedury_wzory for select to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.aktywne is not false
and p.role in ('owner','manager','admin','accountant','opiekun_ksiegowy','ksiegowy','handlowiec')));
create policy procedures_owner_insert on public.procedury_wzory for insert to authenticated
with check (created_by=(select auth.uid())
and (storage.foldername(sciezka))[1]=(select auth.uid())::text
and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='owner' and p.aktywne is not false)
and exists (select 1 from storage.objects o where o.bucket_id='procedury-wzory' and o.name=sciezka));

insert into storage.buckets(id,name,public,file_size_limit)
values ('procedury-wzory','procedury-wzory',false,26214400);

create policy procedures_files_owner_insert on storage.objects for insert to authenticated
with check (bucket_id='procedury-wzory'
and (storage.foldername(name))[1]=(select auth.uid())::text
and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='owner' and p.aktywne is not false));
create policy procedures_files_team_read on storage.objects for select to authenticated
using (bucket_id='procedury-wzory'
and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.aktywne is not false
and p.role in ('owner','manager','admin','accountant','opiekun_ksiegowy','ksiegowy','handlowiec'))
and (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='owner')
or exists (select 1 from public.procedury_wzory d where d.sciezka=name)));
-- Only the owner can remove an unpublished upload after a failed metadata save.
create policy procedures_files_owner_cleanup on storage.objects for delete to authenticated
using (bucket_id='procedury-wzory'
and (storage.foldername(name))[1]=(select auth.uid())::text
and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='owner' and p.aktywne is not false)
and not exists (select 1 from public.procedury_wzory d where d.sciezka=name));
