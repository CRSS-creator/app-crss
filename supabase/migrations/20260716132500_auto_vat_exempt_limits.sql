create or replace function public.ensure_vat_limit_for_exempt_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.czynny_vat, false) = false then
    insert into public.limity_rejestry (klient_id, typ, limit_roczny)
    values (new.id, 'vat', 240000)
    on conflict (klient_id, typ) do update
      set limit_roczny = case
          when coalesce(public.limity_rejestry.limit_roczny, 0) = 0 then 240000
          else public.limity_rejestry.limit_roczny
        end,
        updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_vat_limit_for_exempt_client_trigger on public.klienci;
create trigger ensure_vat_limit_for_exempt_client_trigger
after insert or update of czynny_vat on public.klienci
for each row
execute function public.ensure_vat_limit_for_exempt_client();

insert into public.limity_rejestry (klient_id, typ, limit_roczny)
select client.id, 'vat', 240000
from public.klienci client
where coalesce(client.czynny_vat, false) = false
  and not exists (
    select 1
    from public.limity_rejestry limit_record
    where limit_record.klient_id = client.id
      and limit_record.typ = 'vat'
  );
