create or replace function public.ensure_wnt_limit_for_vat_ue_exempt_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.czynny_vat, false) = false and coalesce(new.vat_ue, false) = true then
    insert into public.limity_rejestry (klient_id, typ, limit_roczny)
    values (new.id, 'wnt', 0)
    on conflict (klient_id, typ) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_wnt_limit_for_vat_ue_exempt_client_trigger on public.klienci;
create trigger ensure_wnt_limit_for_vat_ue_exempt_client_trigger
after insert or update of czynny_vat, vat_ue on public.klienci
for each row
execute function public.ensure_wnt_limit_for_vat_ue_exempt_client();

insert into public.limity_rejestry (klient_id, typ, limit_roczny)
select client.id, 'wnt', 0
from public.klienci client
where coalesce(client.czynny_vat, false) = false
  and coalesce(client.vat_ue, false) = true
  and not exists (
    select 1
    from public.limity_rejestry limit_record
    where limit_record.klient_id = client.id
      and limit_record.typ = 'wnt'
  );

delete from public.limity_rejestry limit_record
where limit_record.typ = 'wnt'
  and not exists (
    select 1
    from public.klienci client
    where client.id = limit_record.klient_id
      and coalesce(client.czynny_vat, false) = false
      and coalesce(client.vat_ue, false) = true
  );
