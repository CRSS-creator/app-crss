create or replace function public.ensure_wnt_limit_for_vat_ue_exempt_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.czynny_vat, false) = false and coalesce(new.vat_ue, false) = true then
    insert into public.limity_rejestry (klient_id, typ, limit_roczny)
    values (new.id, 'wnt', 50000)
    on conflict (klient_id, typ) do update
      set limit_roczny = 50000,
          updated_at = now();
  end if;

  return new;
end;
$$;

insert into public.limity_rejestry (klient_id, typ, limit_roczny)
select client.id, 'wnt', 50000
from public.klienci client
where coalesce(client.czynny_vat, false) = false
  and coalesce(client.vat_ue, false) = true
on conflict (klient_id, typ) do update
  set limit_roczny = 50000,
      updated_at = now();

update public.limity_rejestry
set limit_roczny = 50000,
    updated_at = now()
where typ = 'wnt';
