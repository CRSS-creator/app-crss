delete from public.zadania_cykliczne
where tytul ilike 'Informacja o%';

delete from public.zobowiazania_podatkowe
where typ = 'ZUS'
  and status_pobrania = 'do_pobrania'
  and status_email = 'niewyslane'
  and status_sms = 'niewyslane'
  and kwota is null;

create or replace function public.ensure_tax_obligations(public_period date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.zobowiazania_podatkowe (
    rozliczenie_id,
    klient_id,
    okres,
    typ,
    nazwa,
    termin_platnosci
  )
  select
    settlement.id,
    client.id,
    public_period,
    obligation.typ,
    obligation.nazwa,
    public.tax_obligation_due_date(public_period, obligation.dzien)
  from public.rozliczenia_miesieczne settlement
  join public.klienci client on client.id = settlement.klient_id
  cross join lateral (
    values
      ('VAT'::text, 'VAT', 25, client.czynny_vat is true),
      ('VAT-UE'::text, 'VAT-UE', 25, client.vat_ue is true),
      ('VAT-9M'::text, 'VAT-9M', 25, client.vat_ue is true and coalesce(client.czynny_vat, false) is false),
      ('PIT'::text, 'PIT', 20, client.forma_opodatkowania in ('Skala podatkowa', 'Podatek liniowy', 'Ryczałt')),
      ('CIT'::text, 'CIT', 20, client.forma_opodatkowania = 'CIT'),
      ('PIT-4'::text, 'PIT-4', 20, client.obsluga_kadrowa is true)
  ) as obligation(typ, nazwa, dzien, warunek)
  where settlement.okres = public_period
    and client.aktywny = true
    and obligation.warunek
  on conflict (rozliczenie_id, typ) do nothing;
end;
$$;
