grant select, insert, update on public.kadry_a1 to authenticated;

drop policy if exists kadry_a1_select_app_users on public.kadry_a1;
create policy kadry_a1_select_app_users
on public.kadry_a1
for select
to authenticated
using (public.can_access_client(klient_id));

drop policy if exists kadry_a1_insert_app_users on public.kadry_a1;
create policy kadry_a1_insert_app_users
on public.kadry_a1
for insert
to authenticated
with check (public.can_access_client(klient_id));

drop policy if exists kadry_a1_update_app_users on public.kadry_a1;
create policy kadry_a1_update_app_users
on public.kadry_a1
for update
to authenticated
using (public.can_access_client(klient_id))
with check (public.can_access_client(klient_id));

grant select, insert, update on public.kadry_a1_przychody_miesieczne to authenticated;

drop policy if exists kadry_a1_przychody_select_app_users on public.kadry_a1_przychody_miesieczne;
create policy kadry_a1_przychody_select_app_users
on public.kadry_a1_przychody_miesieczne
for select
to authenticated
using (
  exists (
    select 1
    from public.kadry_a1 a1
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and public.can_access_client(a1.klient_id)
  )
);

drop policy if exists kadry_a1_przychody_insert_app_users on public.kadry_a1_przychody_miesieczne;
create policy kadry_a1_przychody_insert_app_users
on public.kadry_a1_przychody_miesieczne
for insert
to authenticated
with check (
  exists (
    select 1
    from public.kadry_a1 a1
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and public.can_access_client(a1.klient_id)
  )
);

drop policy if exists kadry_a1_przychody_update_app_users on public.kadry_a1_przychody_miesieczne;
create policy kadry_a1_przychody_update_app_users
on public.kadry_a1_przychody_miesieczne
for update
to authenticated
using (
  exists (
    select 1
    from public.kadry_a1 a1
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and public.can_access_client(a1.klient_id)
  )
)
with check (
  exists (
    select 1
    from public.kadry_a1 a1
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and public.can_access_client(a1.klient_id)
  )
);
