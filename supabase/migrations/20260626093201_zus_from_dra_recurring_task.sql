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

  delete from public.zobowiazania_podatkowe obligation
  where obligation.okres = public_period
    and obligation.typ = 'ZUS'
    and obligation.status_pobrania = 'do_pobrania'
    and obligation.status_email = 'niewyslane'
    and obligation.status_sms = 'niewyslane'
    and obligation.kwota is null
    and not exists (
      select 1
      from public.zadania_cykliczne_realizacje realization
      where realization.rozliczenie_id = obligation.rozliczenie_id
        and realization.tytul ilike 'Deklaracja ZUS DRA%'
        and extract(day from realization.termin)::integer in (13, 18)
    );

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
    'ZUS',
    'ZUS',
    public.tax_obligation_due_date(public_period, case dra.required_day when 13 then 15 when 18 then 20 end)
  from public.rozliczenia_miesieczne settlement
  join public.klienci client on client.id = settlement.klient_id
  join lateral (
    select min(extract(day from realization.termin)::integer) as required_day
    from public.zadania_cykliczne_realizacje realization
    where realization.rozliczenie_id = settlement.id
      and realization.tytul ilike 'Deklaracja ZUS DRA%'
      and extract(day from realization.termin)::integer in (13, 18)
  ) dra on dra.required_day is not null
  where settlement.okres = public_period
    and client.aktywny = true
  on conflict (rozliczenie_id, typ) do update
  set
    termin_platnosci = excluded.termin_platnosci,
    updated_at = now()
  where zobowiazania_podatkowe.status_pobrania = 'do_pobrania'
    and zobowiazania_podatkowe.status_email = 'niewyslane'
    and zobowiazania_podatkowe.status_sms = 'niewyslane'
    and zobowiazania_podatkowe.kwota is null;
end;
$$;
