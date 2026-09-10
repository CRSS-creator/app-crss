create or replace function public.available_settlement_fee_definitions(public_settlement_id uuid)
returns setof public.oplaty_dodatkowe
language sql stable security invoker
set search_path = public
as $$
  select f.* from public.oplaty_dodatkowe f
  where f.aktywna
    and exists (
      select 1 from public.rozliczenia_miesieczne r
      join public.klienci k on k.id = r.klient_id
      where r.id = public_settlement_id
        and (f.nazwa not in ('APC - Marek Hebel - stała opłata miesięczna', 'Stała opłata miesięczna Cassubian')
          or public.is_cassubian_client(k.nip, k.nazwa))
    )
  order by f.nazwa;
$$;
revoke all on function public.available_settlement_fee_definitions(uuid) from public, anon;
grant execute on function public.available_settlement_fee_definitions(uuid) to authenticated, service_role;

create or replace function public.check_cassubian_additional_fee()
returns trigger language plpgsql security invoker
set search_path = public
as $$
begin
  if new.nazwa in ('APC - Marek Hebel - stała opłata miesięczna', 'Stała opłata miesięczna Cassubian')
    or exists (
      select 1 from public.oplaty_dodatkowe f where f.id = new.oplata_id
        and f.nazwa in ('APC - Marek Hebel - stała opłata miesięczna', 'Stała opłata miesięczna Cassubian')
    ) then
    if not exists (
      select 1 from public.rozliczenia_miesieczne r
      join public.klienci k on k.id = r.klient_id
      where r.id = new.rozliczenie_id and public.is_cassubian_client(k.nip, k.nazwa)
    ) then
      raise exception 'Opłata APC - Marek Hebel jest dostępna wyłącznie dla Cassubiana.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.check_cassubian_additional_fee() from public, anon, authenticated;
create trigger check_cassubian_additional_fee
before insert or update of rozliczenie_id, oplata_id, nazwa
on public.rozliczenia_oplaty_dodatkowe
for each row execute function public.check_cassubian_additional_fee();
