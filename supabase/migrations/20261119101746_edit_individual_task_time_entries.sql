
-- Managers can edit completed task time they are already allowed to view.
create policy czas_pracy_update_task_management on public.czas_pracy for update to authenticated
using (zadanie_id is not null and ended_at is not null
 and public.current_user_role() in ('owner','manager')
 and exists(select 1 from public.zadania z where z.id=zadanie_id and public.can_view_task(z.osoba_id)))
with check (zadanie_id is not null and ended_at is not null
 and public.current_user_role() in ('owner','manager')
 and exists(select 1 from public.zadania z where z.id=zadanie_id and public.can_view_task(z.osoba_id)));

create policy task_corrections_update_visible on public.korekty_czasu_zadan for update to authenticated
using (zadanie_id is not null and (osoba_id=(select auth.uid()) or public.current_user_role() in ('owner','manager'))
 and exists(select 1 from public.zadania z where z.id=zadanie_id and public.can_view_task(z.osoba_id)))
with check (zadanie_id is not null and (osoba_id=(select auth.uid()) or public.current_user_role() in ('owner','manager'))
 and exists(select 1 from public.zadania z where z.id=zadanie_id and public.can_view_task(z.osoba_id)));
