create or replace function public.can_access_client(public_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() in ('owner', 'manager', 'admin')
    or exists (
      select 1
      from public.klienci client
      where client.id = public_client_id
        and client.opiekun_id = (select auth.uid())
    );
$$;

grant execute on function public.can_access_client(uuid) to authenticated;

alter table public.klienci enable row level security;

grant select, insert, update on public.klienci to authenticated;

drop policy if exists "Enable read access for all users" on public.klienci;
drop policy if exists klienci_select_by_role on public.klienci;
create policy klienci_select_by_role
on public.klienci
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or opiekun_id = (select auth.uid())
);

drop policy if exists klienci_insert_by_role on public.klienci;
create policy klienci_insert_by_role
on public.klienci
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or opiekun_id = (select auth.uid())
);

drop policy if exists klienci_update_by_role on public.klienci;
create policy klienci_update_by_role
on public.klienci
for update
to authenticated
using (public.can_access_client(id))
with check (public.can_access_client(id));

drop policy if exists powiadomienia_select_app_users on public.powiadomienia;
create policy powiadomienia_select_app_users
on public.powiadomienia
for select
to authenticated
using (recipient_id = (select auth.uid()));

drop policy if exists powiadomienia_update_app_users on public.powiadomienia;
create policy powiadomienia_update_app_users
on public.powiadomienia
for update
to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

drop policy if exists onboarding_etapy_select_authenticated on public.onboarding_etapy;
drop policy if exists onboarding_etapy_insert_authenticated on public.onboarding_etapy;
drop policy if exists onboarding_etapy_update_authenticated on public.onboarding_etapy;
drop policy if exists onboarding_etapy_delete_authenticated on public.onboarding_etapy;
drop policy if exists onboarding_etapy_select_by_role on public.onboarding_etapy;
drop policy if exists onboarding_etapy_insert_by_role on public.onboarding_etapy;
drop policy if exists onboarding_etapy_update_by_role on public.onboarding_etapy;
drop policy if exists onboarding_etapy_delete_management on public.onboarding_etapy;

create policy onboarding_etapy_select_by_role
on public.onboarding_etapy
for select
to authenticated
using (public.can_access_client(klient_id));

create policy onboarding_etapy_insert_by_role
on public.onboarding_etapy
for insert
to authenticated
with check (public.can_access_client(klient_id));

create policy onboarding_etapy_update_by_role
on public.onboarding_etapy
for update
to authenticated
using (public.can_access_client(klient_id))
with check (public.can_access_client(klient_id));

create policy onboarding_etapy_delete_management
on public.onboarding_etapy
for delete
to authenticated
using (public.current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists onboarding_historia_select_authenticated on public.onboarding_historia;
drop policy if exists onboarding_historia_insert_authenticated on public.onboarding_historia;
drop policy if exists onboarding_historia_select_by_role on public.onboarding_historia;
drop policy if exists onboarding_historia_insert_by_role on public.onboarding_historia;

create policy onboarding_historia_select_by_role
on public.onboarding_historia
for select
to authenticated
using (public.can_access_client(klient_id));

create policy onboarding_historia_insert_by_role
on public.onboarding_historia
for insert
to authenticated
with check (public.can_access_client(klient_id));

drop policy if exists zadania_cykliczne_select_by_role on public.zadania_cykliczne;
create policy zadania_cykliczne_select_by_role
on public.zadania_cykliczne
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or (
    klient_id is not null
    and public.can_access_client(klient_id)
  )
);

drop policy if exists zadania_cykliczne_insert_by_role on public.zadania_cykliczne;
create policy zadania_cykliczne_insert_by_role
on public.zadania_cykliczne
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or (
    klient_id is not null
    and public.can_access_client(klient_id)
  )
);

drop policy if exists zadania_cykliczne_update_by_role on public.zadania_cykliczne;
create policy zadania_cykliczne_update_by_role
on public.zadania_cykliczne
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or (
    klient_id is not null
    and public.can_access_client(klient_id)
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or (
    klient_id is not null
    and public.can_access_client(klient_id)
  )
);

drop policy if exists zadania_cykliczne_delete_by_role on public.zadania_cykliczne;
create policy zadania_cykliczne_delete_by_role
on public.zadania_cykliczne
for delete
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or (
    klient_id is not null
    and public.can_access_client(klient_id)
  )
);

drop policy if exists zobowiazania_wysylki_historia_select_app_users on public.zobowiazania_wysylki_historia;
drop policy if exists zobowiazania_wysylki_historia_select_by_role on public.zobowiazania_wysylki_historia;
create policy zobowiazania_wysylki_historia_select_by_role
on public.zobowiazania_wysylki_historia
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or (
    client_id is not null
    and public.can_access_client(client_id)
  )
);
