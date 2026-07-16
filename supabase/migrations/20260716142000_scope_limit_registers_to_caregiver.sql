drop policy if exists limity_rejestry_select_app_users on public.limity_rejestry;
create policy limity_rejestry_select_app_users
on public.limity_rejestry
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = limity_rejestry.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists limity_rejestry_insert_app_users on public.limity_rejestry;
create policy limity_rejestry_insert_app_users
on public.limity_rejestry
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = limity_rejestry.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists limity_rejestry_update_app_users on public.limity_rejestry;
create policy limity_rejestry_update_app_users
on public.limity_rejestry
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = limity_rejestry.klient_id
      and klient.opiekun_id = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = limity_rejestry.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists limity_miesieczne_select_app_users on public.limity_miesieczne;
create policy limity_miesieczne_select_app_users
on public.limity_miesieczne
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.limity_rejestry limit_record
    join public.klienci klient on klient.id = limit_record.klient_id
    where limit_record.id = limity_miesieczne.limit_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists limity_miesieczne_insert_app_users on public.limity_miesieczne;
create policy limity_miesieczne_insert_app_users
on public.limity_miesieczne
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.limity_rejestry limit_record
    join public.klienci klient on klient.id = limit_record.klient_id
    where limit_record.id = limity_miesieczne.limit_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists limity_miesieczne_update_app_users on public.limity_miesieczne;
create policy limity_miesieczne_update_app_users
on public.limity_miesieczne
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.limity_rejestry limit_record
    join public.klienci klient on klient.id = limit_record.klient_id
    where limit_record.id = limity_miesieczne.limit_id
      and klient.opiekun_id = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.limity_rejestry limit_record
    join public.klienci klient on klient.id = limit_record.klient_id
    where limit_record.id = limity_miesieczne.limit_id
      and klient.opiekun_id = auth.uid()
  )
);
