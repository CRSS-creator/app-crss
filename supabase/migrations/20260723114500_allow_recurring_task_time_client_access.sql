drop policy if exists czas_pracy_select_visible on public.czas_pracy;

create policy czas_pracy_select_visible
on public.czas_pracy
for select
to authenticated
using (
  public.can_view_task(osoba_id)
  or exists (
    select 1
    from public.zadania z
    where z.id = czas_pracy.zadanie_id
      and public.can_view_task(z.osoba_id)
  )
  or (
    czas_pracy.zadanie_cykliczne_id is not null
    and czas_pracy.klient_id is not null
    and public.can_access_client(czas_pracy.klient_id)
  )
);
