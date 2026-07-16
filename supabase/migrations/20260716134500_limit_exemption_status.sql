alter table public.limity_rejestry
  add column if not exists status_zwolnienia text;

update public.limity_rejestry
set status_zwolnienia = coalesce(status_zwolnienia, 'podmiotowe')
where typ in ('vat', 'kasa_fiskalna')
  and status_zwolnienia is null;
