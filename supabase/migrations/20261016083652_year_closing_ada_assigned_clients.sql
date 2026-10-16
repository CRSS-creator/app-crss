-- Ada can read and update year-closing records only for clients assigned to her.
-- Existing owner/admin/manager policies remain unchanged.

create policy ada_assigned_read on public.zamykanie_roku_jpk for select to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_jpk.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_insert on public.zamykanie_roku_jpk for insert to authenticated
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_jpk.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_update on public.zamykanie_roku_jpk for update to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_jpk.klient_id
      and k.opiekun_id = (select auth.uid())))
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_jpk.klient_id
      and k.opiekun_id = (select auth.uid())));

create policy ada_assigned_read on public.zamykanie_roku_salda for select to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_salda.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_insert on public.zamykanie_roku_salda for insert to authenticated
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_salda.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_update on public.zamykanie_roku_salda for update to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_salda.klient_id
      and k.opiekun_id = (select auth.uid())))
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_salda.klient_id
      and k.opiekun_id = (select auth.uid())));

create policy ada_assigned_read on public.zamykanie_roku_ift2r for select to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_ift2r.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_insert on public.zamykanie_roku_ift2r for insert to authenticated
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_ift2r.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_update on public.zamykanie_roku_ift2r for update to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_ift2r.klient_id
      and k.opiekun_id = (select auth.uid())))
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_ift2r.klient_id
      and k.opiekun_id = (select auth.uid())));

create policy ada_assigned_read on public.zamykanie_roku_kadry for select to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_kadry.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_insert on public.zamykanie_roku_kadry for insert to authenticated
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_kadry.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_update on public.zamykanie_roku_kadry for update to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_kadry.klient_id
      and k.opiekun_id = (select auth.uid())))
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_kadry.klient_id
      and k.opiekun_id = (select auth.uid())));

create policy ada_assigned_read on public.zamykanie_roku_jdg for select to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_jdg.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_insert on public.zamykanie_roku_jdg for insert to authenticated
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_jdg.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_update on public.zamykanie_roku_jdg for update to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_jdg.klient_id
      and k.opiekun_id = (select auth.uid())))
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_jdg.klient_id
      and k.opiekun_id = (select auth.uid())));

create policy ada_assigned_read on public.zamykanie_roku_full for select to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_full.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_insert on public.zamykanie_roku_full for insert to authenticated
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_full.klient_id
      and k.opiekun_id = (select auth.uid())));
create policy ada_assigned_update on public.zamykanie_roku_full for update to authenticated
  using ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_full.klient_id
      and k.opiekun_id = (select auth.uid())))
  with check ((select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.aktywne is not false and p.role in ('accountant', 'opiekun_ksiegowy', 'ksiegowy'))
    and exists (select 1 from public.klienci k where k.id = zamykanie_roku_full.klient_id
      and k.opiekun_id = (select auth.uid())));
