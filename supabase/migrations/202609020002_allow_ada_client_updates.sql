create or replace function public.can_access_client(public_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() in ('owner', 'manager', 'admin')
    or (select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    or exists (
      select 1
      from public.klienci client
      where client.id = public_client_id
        and client.opiekun_id = (select auth.uid())
    );
$$;

grant execute on function public.can_access_client(uuid) to authenticated;

alter table public.klienci enable row level security;
grant select, update on public.klienci to authenticated;

drop policy if exists "Enable read access for all users" on public.klienci;
drop policy if exists klienci_select_by_role on public.klienci;
create policy klienci_select_by_role
on public.klienci
for select
to authenticated
using (public.can_access_client(id));

drop policy if exists klienci_update_by_role on public.klienci;
create policy klienci_update_by_role
on public.klienci
for update
to authenticated
using (public.can_access_client(id))
with check (public.can_access_client(id));
