create or replace function public.check_opiekun_is_accountant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.opiekun_id is not null and not exists (
    select 1
    from public.profiles
    where id = new.opiekun_id
      and role in ('accountant', 'manager', 'owner')
      and coalesce(aktywne, true) = true
  ) then
    raise exception 'Opiekun klienta musi mieć rolę accountant, manager albo owner';
  end if;

  return new;
end;
$$;

revoke all on function public.check_opiekun_is_accountant() from public;
