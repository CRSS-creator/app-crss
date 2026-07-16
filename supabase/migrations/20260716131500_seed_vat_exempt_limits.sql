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

update public.limity_rejestry
set limit_roczny = 240000,
    updated_at = now()
where typ = 'vat'
  and coalesce(limit_roczny, 0) = 0;
