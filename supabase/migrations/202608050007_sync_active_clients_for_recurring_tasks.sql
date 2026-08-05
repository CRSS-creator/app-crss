update public.klienci
set aktywny = true
where lower(coalesce(status_klienta, '')) = 'aktywny'
  and coalesce(aktywny, false) is distinct from true;

create or replace function public.finish_client_onboarding(public_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.onboarding_etapy
  set
    status = 'gotowe',
    updated_by = current_user_id,
    completed_at = coalesce(completed_at, now()),
    completed_by = coalesce(completed_by, current_user_id)
  where klient_id = public_client_id
    and status not in ('gotowe', 'papierowo', 'nowy_podmiot');

  update public.klienci
  set
    status_klienta = 'Aktywny',
    aktywny = true
  where id = public_client_id;

  insert into public.onboarding_historia (
    klient_id,
    onboarding_etap_id,
    etap,
    akcja,
    old_status,
    new_status,
    opis,
    created_by
  )
  values (
    public_client_id,
    null,
    null,
    'zakonczenie_onboardingu',
    null,
    'gotowe',
    'Zakonczono onboarding klienta.',
    current_user_id
  );
end;
$$;

revoke all on function public.finish_client_onboarding(uuid) from public;
grant execute on function public.finish_client_onboarding(uuid) to authenticated;

create or replace function public.sync_client_active_flag_from_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.aktywny := lower(coalesce(new.status_klienta, '')) = 'aktywny';
  return new;
end;
$$;

drop trigger if exists klienci_sync_active_flag_from_status on public.klienci;
create trigger klienci_sync_active_flag_from_status
before insert or update of status_klienta on public.klienci
for each row
execute function public.sync_client_active_flag_from_status();

create or replace function public.sync_active_client_flags()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.klienci
  set aktywny = true
  where lower(coalesce(status_klienta, '')) = 'aktywny'
    and coalesce(aktywny, false) is distinct from true;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.sync_active_client_flags() from public;
grant execute on function public.sync_active_client_flags() to authenticated;

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
  join public.klienci k on k.aktywny = true or lower(coalesce(k.status_klienta, '')) = 'aktywny'
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
