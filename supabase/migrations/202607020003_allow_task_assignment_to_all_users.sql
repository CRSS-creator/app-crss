create or replace function public.can_assign_task_to(task_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_role text;
begin
  viewer_role := public.current_user_role();

  return viewer_role in ('owner', 'manager', 'admin', 'accountant')
    and exists (
      select 1
      from public.profiles profile
      where profile.id = task_owner_id
        and profile.role in ('owner', 'manager', 'admin', 'accountant')
        and coalesce(profile.aktywne, true) = true
    );
end;
$$;

drop policy if exists zadania_select_visible on public.zadania;
create policy zadania_select_visible
on public.zadania
for select
to authenticated
using (
  public.can_view_task(osoba_id)
  or created_by = auth.uid()
);

drop policy if exists zadania_update_allowed on public.zadania;
create policy zadania_update_allowed
on public.zadania
for update
to authenticated
using (
  public.can_view_task(osoba_id)
  or created_by = auth.uid()
)
with check (public.can_assign_task_to(osoba_id));
