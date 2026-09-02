create or replace function public.is_ada_own_client_editor(public_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and exists (
      select 1
      from public.klienci client
      where client.id = public_client_id
        and client.opiekun_id = (select auth.uid())
    );
$$;

revoke all on function public.is_ada_own_client_editor(uuid) from public;
revoke all on function public.is_ada_own_client_editor(uuid) from anon;
grant execute on function public.is_ada_own_client_editor(uuid) to authenticated;

create or replace function public.prevent_unauthorized_client_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role text;
begin
  select public.get_current_user_role() into user_role;

  if user_role in ('owner', 'manager', 'admin') then
    return new;
  end if;

  if
    (select auth.uid()) = '282ae06c-5d1f-4fe6-a5e9-8495b478c247'::uuid
    and new.opiekun_id = (select auth.uid())
  then
    return new;
  end if;

  raise exception 'Brak uprawnień do dodawania klientów.';
end;
$$;

create or replace function public.prevent_unauthorized_client_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role text;
begin
  select public.get_current_user_role() into user_role;

  if user_role in ('owner', 'manager', 'admin') then
    return new;
  end if;

  if public.is_ada_own_client_editor(old.id) then
    if new.opiekun_id is distinct from old.opiekun_id then
      raise exception 'Brak uprawnień do zmiany opiekuna klienta.';
    end if;

    return new;
  end if;

  if user_role = 'accountant' then
    if
      new.nazwa is distinct from old.nazwa or
      new.nip is distinct from old.nip or
      new.forma_prawna is distinct from old.forma_prawna or
      new.forma_opodatkowania is distinct from old.forma_opodatkowania or
      new.abonament is distinct from old.abonament or
      new.status_klienta is distinct from old.status_klienta or
      new.opiekun_id is distinct from old.opiekun_id or
      new.obsluga_kadrowa is distinct from old.obsluga_kadrowa
    then
      raise exception 'Brak uprawnień do edycji danych administracyjnych klienta.';
    end if;

    return new;
  end if;

  raise exception 'Brak uprawnień do edycji klienta.';
end;
$$;
