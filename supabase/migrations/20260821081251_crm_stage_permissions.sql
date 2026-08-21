grant select, update on public.crm_szanse_sprzedazy to authenticated;
grant select, insert on public.crm_zadania to authenticated;

drop policy if exists "crm leads selectable by managers" on public.crm_szanse_sprzedazy;
create policy "crm leads selectable by managers"
on public.crm_szanse_sprzedazy
for select
to authenticated
using (
  public.current_user_role() = 'manager'
  or public.get_current_user_role() = 'manager'
);

drop policy if exists "crm leads updatable by managers" on public.crm_szanse_sprzedazy;
create policy "crm leads updatable by managers"
on public.crm_szanse_sprzedazy
for update
to authenticated
using (
  public.current_user_role() = 'manager'
  or public.get_current_user_role() = 'manager'
)
with check (
  public.current_user_role() = 'manager'
  or public.get_current_user_role() = 'manager'
);

drop policy if exists "crm tasks selectable by managers" on public.crm_zadania;
create policy "crm tasks selectable by managers"
on public.crm_zadania
for select
to authenticated
using (
  public.current_user_role() = 'manager'
  or public.get_current_user_role() = 'manager'
);

drop policy if exists "crm tasks insertable by managers" on public.crm_zadania;
create policy "crm tasks insertable by managers"
on public.crm_zadania
for insert
to authenticated
with check (
  public.current_user_role() = 'manager'
  or public.get_current_user_role() = 'manager'
);
