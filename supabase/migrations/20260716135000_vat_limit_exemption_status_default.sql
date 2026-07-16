create or replace function public.ensure_vat_limit_for_exempt_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.czynny_vat, false) = false then
    insert into public.limity_rejestry (klient_id, typ, limit_roczny, status_zwolnienia)
    values (new.id, 'vat', 240000, 'podmiotowe')
    on conflict (klient_id, typ) do update
      set limit_roczny = case
          when coalesce(public.limity_rejestry.limit_roczny, 0) = 0 then 240000
          else public.limity_rejestry.limit_roczny
        end,
        status_zwolnienia = coalesce(public.limity_rejestry.status_zwolnienia, 'podmiotowe'),
        updated_at = now();
  end if;

  return new;
end;
$$;

update public.limity_rejestry
set status_zwolnienia = 'podmiotowe'
where typ = 'vat'
  and status_zwolnienia is null;
