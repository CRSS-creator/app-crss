create or replace function public.client_in_active_period_scope(client_active boolean, client_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(client_active, false)
    or lower(coalesce(client_status, '')) in ('aktywny', 'onboarding');
$$;

create or replace function public.ensure_recurring_task_realizations(public_period date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.zadania_cykliczne_realizacje (
    zadanie_cykliczne_id,
    klient_id,
    rozliczenie_id,
    okres,
    termin,
    tytul,
    opis,
    priorytet,
    osoba_id
  )
  select
    z.id,
    k.id,
    r.id,
    public_period,
    public.recurring_task_due_date(public_period, z.dzien_miesiaca, case when z.czestotliwosc = 'roczne' then z.miesiac_roczny else null end),
    z.tytul,
    z.opis,
    z.priorytet,
    coalesce(z.osoba_id, k.opiekun_id)
  from public.zadania_cykliczne z
  join public.klienci k on public.client_in_active_period_scope(k.aktywny, k.status_klienta)
  left join public.rozliczenia_miesieczne r on r.klient_id = k.id and r.okres = public_period
  where z.aktywne = true
    and (k.pierwszy_okres_rozliczeniowy is null or date_trunc('month', k.pierwszy_okres_rozliczeniowy)::date <= public_period)
    and (k.ostatni_okres_rozliczeniowy is null or date_trunc('month', k.ostatni_okres_rozliczeniowy)::date >= public_period)
    and (z.klient_id is null or z.klient_id = k.id)
    and (z.klient_id is not null or z.formy_prawne is null or cardinality(z.formy_prawne) = 0 or k.forma_prawna = any(z.formy_prawne))
    and (z.klient_id is not null or z.formy_opodatkowania is null or cardinality(z.formy_opodatkowania) = 0 or k.forma_opodatkowania = any(z.formy_opodatkowania))
    and (z.klient_id is not null or z.wymaga_czynnego_vat is null or k.czynny_vat = z.wymaga_czynnego_vat)
    and (z.klient_id is not null or z.wymaga_vat_ue is null or k.vat_ue = z.wymaga_vat_ue)
    and (z.klient_id is not null or z.wymaga_obslugi_kadrowej is null or k.obsluga_kadrowa = z.wymaga_obslugi_kadrowej)
    and (
      z.klient_id is not null
      or z.wymaga_a1 is null
      or (
        z.wymaga_a1 = true
        and exists (
          select 1
          from public.kadry_a1 a1
          where a1.klient_id = k.id
        )
      )
      or (
        z.wymaga_a1 = false
        and not exists (
          select 1
          from public.kadry_a1 a1
          where a1.klient_id = k.id
        )
      )
    )
    and (coalesce(z.czestotliwosc, 'miesieczne') = 'miesieczne' or z.miesiac_roczny = extract(month from public_period)::integer)
  on conflict (zadanie_cykliczne_id, klient_id, okres) do nothing;
end;
$$;

grant execute on function public.ensure_recurring_task_realizations(date) to authenticated;

create or replace function public.ensure_tax_obligations(public_period date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.zobowiazania_podatkowe obligation
  using public.rozliczenia_miesieczne settlement
  join public.klienci client on client.id = settlement.klient_id
  where obligation.rozliczenie_id = settlement.id
    and obligation.okres = public_period
    and obligation.status_pobrania = 'do_pobrania'
    and obligation.status_email = 'niewyslane'
    and obligation.status_sms = 'niewyslane'
    and obligation.kwota is null
    and (
      obligation.typ = 'VAT-UE'
      or (
        obligation.typ = 'VAT'
        and (
          coalesce(client.czynny_vat, false) is false
          or (
            coalesce(client.vat_okres_rozliczeniowy, 'miesieczny') = 'kwartalny'
            and extract(month from public_period)::integer not in (3, 6, 9, 12)
          )
        )
      )
      or (obligation.typ = 'VAT-9M' and not (client.vat_ue is true and coalesce(client.czynny_vat, false) is false))
      or (obligation.typ = 'PIT' and coalesce(client.forma_opodatkowania, '') not in ('Skala podatkowa', 'Podatek liniowy', 'Ryczałt'))
      or (
        obligation.typ = 'CIT'
        and (
          coalesce(client.forma_opodatkowania, '') <> 'CIT'
          or lower(trim(coalesce(client.forma_prawna, ''))) = 'organizacja'
        )
      )
      or (obligation.typ = 'PIT-4' and coalesce(client.obsluga_kadrowa, false) is false)
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
    obligation.typ,
    obligation.nazwa,
    public.tax_obligation_due_date(public_period, obligation.dzien)
  from public.rozliczenia_miesieczne settlement
  join public.klienci client on client.id = settlement.klient_id
  cross join lateral (
    values
      (
        'VAT'::text,
        'VAT',
        25,
        client.czynny_vat is true
          and (
            coalesce(client.vat_okres_rozliczeniowy, 'miesieczny') <> 'kwartalny'
            or extract(month from public_period)::integer in (3, 6, 9, 12)
          )
      ),
      ('VAT-9M'::text, 'VAT-9M', 25, client.vat_ue is true and coalesce(client.czynny_vat, false) is false),
      ('PIT'::text, 'PIT', 20, client.forma_opodatkowania in ('Skala podatkowa', 'Podatek liniowy', 'Ryczałt')),
      ('CIT'::text, 'CIT', 20, client.forma_opodatkowania = 'CIT' and lower(trim(coalesce(client.forma_prawna, ''))) <> 'organizacja'),
      ('PIT-4'::text, 'PIT-4', 20, client.obsluga_kadrowa is true)
  ) as obligation(typ, nazwa, dzien, warunek)
  where settlement.okres = public_period
    and public.client_in_active_period_scope(client.aktywny, client.status_klienta)
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
    and public.client_in_active_period_scope(client.aktywny, client.status_klienta)
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

grant execute on function public.ensure_tax_obligations(date) to authenticated;
