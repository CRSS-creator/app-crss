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

drop policy if exists klienci_select_by_role on public.klienci;
create policy klienci_select_by_role
on public.klienci
for select
to authenticated
using (public.can_access_client(id));
