drop policy if exists klienci_update_by_role on public.klienci;

create policy klienci_update_by_role
on public.klienci
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or opiekun_id = auth.uid()
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or opiekun_id = auth.uid()
);

grant update on public.klienci to authenticated;
