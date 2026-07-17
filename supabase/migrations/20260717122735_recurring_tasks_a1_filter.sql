alter table public.zadania_cykliczne
  add column if not exists wymaga_a1 boolean;

comment on column public.zadania_cykliczne.wymaga_a1 is
  'Warunek A1 dla szablonu zadania cyklicznego: true = tylko klienci z rejestru A1, false = tylko spoza A1, null = dowolnie.';

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
  join public.klienci k on k.aktywny = true
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
