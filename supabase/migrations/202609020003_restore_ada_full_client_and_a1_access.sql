create or replace function public.has_ada_full_client_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid;
$$;

grant execute on function public.has_ada_full_client_access() to authenticated;

create or replace function public.can_access_client(public_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() in ('owner', 'manager', 'admin')
    or public.has_ada_full_client_access()
    or exists (
      select 1
      from public.klienci client
      where client.id = public_client_id
        and client.opiekun_id = (select auth.uid())
    );
$$;

grant execute on function public.can_access_client(uuid) to authenticated;

grant select, insert, update on public.klienci to authenticated;

drop policy if exists klienci_insert_by_role on public.klienci;
create policy klienci_insert_by_role
on public.klienci
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or public.has_ada_full_client_access()
  or opiekun_id = (select auth.uid())
);

drop policy if exists klienci_update_by_role on public.klienci;
create policy klienci_update_by_role
on public.klienci
for update
to authenticated
using (public.can_access_client(id))
with check (public.can_access_client(id));

drop policy if exists kadry_a1_select_app_users on public.kadry_a1;
create policy kadry_a1_select_app_users
on public.kadry_a1
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or public.has_ada_full_client_access()
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_a1.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_a1_insert_app_users on public.kadry_a1;
create policy kadry_a1_insert_app_users
on public.kadry_a1
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or public.has_ada_full_client_access()
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_a1.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_a1_update_app_users on public.kadry_a1;
create policy kadry_a1_update_app_users
on public.kadry_a1
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or public.has_ada_full_client_access()
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_a1.klient_id
      and klient.opiekun_id = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or public.has_ada_full_client_access()
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_a1.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_a1_przychody_select_app_users on public.kadry_a1_przychody_miesieczne;
create policy kadry_a1_przychody_select_app_users
on public.kadry_a1_przychody_miesieczne
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or public.has_ada_full_client_access()
  or exists (
    select 1
    from public.kadry_a1 a1
    join public.klienci klient on klient.id = a1.klient_id
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_a1_przychody_insert_app_users on public.kadry_a1_przychody_miesieczne;
create policy kadry_a1_przychody_insert_app_users
on public.kadry_a1_przychody_miesieczne
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or public.has_ada_full_client_access()
  or exists (
    select 1
    from public.kadry_a1 a1
    join public.klienci klient on klient.id = a1.klient_id
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_a1_przychody_update_app_users on public.kadry_a1_przychody_miesieczne;
create policy kadry_a1_przychody_update_app_users
on public.kadry_a1_przychody_miesieczne
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or public.has_ada_full_client_access()
  or exists (
    select 1
    from public.kadry_a1 a1
    join public.klienci klient on klient.id = a1.klient_id
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and klient.opiekun_id = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or public.has_ada_full_client_access()
  or exists (
    select 1
    from public.kadry_a1 a1
    join public.klienci klient on klient.id = a1.klient_id
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and klient.opiekun_id = auth.uid()
  )
);
