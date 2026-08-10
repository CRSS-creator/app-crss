alter table public.faktury_pozycje
  add column if not exists cfo_przychod_kategoria text;

alter table public.faktury_pozycje
  drop constraint if exists faktury_pozycje_cfo_przychod_kategoria_check;

alter table public.faktury_pozycje
  add constraint faktury_pozycje_cfo_przychod_kategoria_check
  check (
    cfo_przychod_kategoria is null
    or cfo_przychod_kategoria in ('abonamenty', 'kadry_place', 'uslugi_dodatkowe', 'wdrozenia', 'pozostale')
  );

create index if not exists faktury_pozycje_cfo_przychod_kategoria_idx
on public.faktury_pozycje(cfo_przychod_kategoria);

create or replace function public.cfo_classify_invoice_line(line_name text)
returns text
language plpgsql
immutable
as $$
declare
  value text := lower(coalesce(line_name, ''));
begin
  if value like '%opłata wdrożeniowa%' or value like '%oplata wdrozeniowa%' or value like '%wdrożen%' or value like '%wdrozen%' then
    return 'wdrozenia';
  end if;

  if value like '%abonament%' then
    return 'abonamenty';
  end if;

  if value like '%kadry%' or value like '%płac%' or value like '%plac%' or value like '%pracownik%' or value like '%zleceniobior%' or value like '%umowa%' then
    return 'kadry_place';
  end if;

  if value like '%dodatkow%' or value like '%konsult%' or value like '%doradz%' or value like '%korekt%' or value like '%wniosek%' or value like '%zaświadc%' or value like '%zaswiadc%' then
    return 'uslugi_dodatkowe';
  end if;

  return 'pozostale';
end;
$$;

create or replace function public.cfo_prepare_invoice_line()
returns trigger
language plpgsql
as $$
begin
  if new.cfo_przychod_kategoria is null then
    new.cfo_przychod_kategoria := public.cfo_classify_invoice_line(new.nazwa);
  end if;

  return new;
end;
$$;

drop trigger if exists cfo_prepare_invoice_line_trigger on public.faktury_pozycje;
create trigger cfo_prepare_invoice_line_trigger
before insert or update of nazwa, cfo_przychod_kategoria on public.faktury_pozycje
for each row
execute function public.cfo_prepare_invoice_line();

update public.faktury_pozycje
set cfo_przychod_kategoria = public.cfo_classify_invoice_line(nazwa)
where cfo_przychod_kategoria is null;

create table if not exists public.cfo_koszty (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  zrodlo text not null default 'recznie' check (zrodlo in ('import', 'recznie')),
  import_key text,
  data_dokumentu date,
  numer_dokumentu text,
  kontrahent text not null,
  opis text,
  kwota_netto_import numeric(12, 2),
  kwota_netto_cfo numeric(12, 2) not null default 0,
  kwota_vat numeric(12, 2),
  kwota_brutto numeric(12, 2),
  kategoria text not null default 'administracja_ogolne'
    check (kategoria in ('koszty_zespolu', 'lokal_infrastruktura', 'systemy_technologia', 'marketing_sprzedaz', 'administracja_ogolne', 'zarzad_wlasciciel', 'jednorazowe_nadzwyczajne')),
  podkategoria text,
  charakter text not null default 'staly'
    check (charakter in ('staly', 'polzmienny', 'zmienny', 'jednorazowy')),
  czestotliwosc text not null default 'miesieczna'
    check (czestotliwosc in ('miesieczna', 'kwartalna', 'roczna', 'nieregularna', 'jednorazowa')),
  okres_start date not null,
  okres_end date not null,
  ujecie_zarzadcze text not null default 'koszt_miesiaca'
    check (ujecie_zarzadcze in ('koszt_miesiaca', 'rozliczenie_w_czasie', 'korekta_jednorazowa')),
  ignoruj boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint cfo_koszty_okres_check check (okres_end >= okres_start)
);

create unique index if not exists cfo_koszty_import_key_unique
on public.cfo_koszty(import_key)
where import_key is not null;

create index if not exists cfo_koszty_okres_idx on public.cfo_koszty(okres_start, okres_end);
create index if not exists cfo_koszty_kategoria_idx on public.cfo_koszty(kategoria);

create table if not exists public.cfo_rachunki_bankowe (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  numer_rachunku text not null unique,
  nazwa text,
  waluta text not null default 'PLN',
  aktywny boolean not null default true
);

create table if not exists public.cfo_transakcje_bankowe (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rachunek_id uuid not null references public.cfo_rachunki_bankowe(id) on delete cascade,
  import_key text not null unique,
  data_ksiegowania date not null,
  data_operacji date,
  tytul text,
  kontrahent text,
  rachunek_kontrahenta text,
  kwota numeric(12, 2) not null,
  saldo_po numeric(12, 2),
  lp integer,
  typ text not null default 'do_przypisania'
    check (typ in ('do_przypisania', 'koszt', 'wynagrodzenie_netto', 'pit', 'zus', 'cit', 'vat', 'faktura_sprzedazowa', 'transfer_wewnetrzny', 'ignoruj', 'inne')),
  koszt_id uuid references public.cfo_koszty(id) on delete set null,
  faktura_id uuid references public.faktury(id) on delete set null,
  ignoruj boolean not null default false,
  dopasowanie_status text not null default 'nieprzypisane'
    check (dopasowanie_status in ('nieprzypisane', 'sugerowane', 'reczne', 'automatyczne')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid()
);

create index if not exists cfo_transakcje_bankowe_rachunek_idx on public.cfo_transakcje_bankowe(rachunek_id);
create index if not exists cfo_transakcje_bankowe_data_idx on public.cfo_transakcje_bankowe(data_ksiegowania);
create index if not exists cfo_transakcje_bankowe_typ_idx on public.cfo_transakcje_bankowe(typ);

create table if not exists public.cfo_koszty_pracownikow (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  okres date not null,
  osoba_id uuid references public.profiles(id) on delete set null,
  osoba_nazwa text not null,
  zespol text not null default 'ksiegowy' check (zespol in ('ksiegowy', 'marketingowy', 'sprzedazowy')),
  w_capacity boolean not null default true,
  wymiar_etatu numeric(5, 2) not null default 1 check (wymiar_etatu >= 0),
  podstawa numeric(12, 2) not null default 0,
  zus_pracodawcy numeric(12, 2) not null default 0,
  benefity numeric(12, 2) not null default 0,
  premie numeric(12, 2) not null default 0,
  szkolenia numeric(12, 2) not null default 0,
  nieobecnosci_godziny numeric(8, 2) not null default 0,
  nadgodziny numeric(8, 2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (okres, osoba_nazwa, zespol)
);

create index if not exists cfo_koszty_pracownikow_okres_idx on public.cfo_koszty_pracownikow(okres);

create table if not exists public.cfo_oceny_klientow (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  okres_kwartalny date not null,
  klient_id uuid not null references public.klienci(id) on delete cascade,
  opiekun_id uuid references public.profiles(id) on delete set null,
  terminowosc integer check (terminowosc between 1 and 5),
  jakosc_dokumentow integer check (jakosc_dokumentow between 1 and 5),
  komunikacja integer check (komunikacja between 1 and 5),
  chaos_oczekiwania integer check (chaos_oczekiwania between 1 and 5),
  trudnosc text check (trudnosc in ('niska', 'srednia', 'wysoka')),
  komentarz text,
  submitted_at timestamptz,
  unique (okres_kwartalny, klient_id, opiekun_id)
);

create or replace function public.cfo_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists cfo_koszty_touch_updated_at on public.cfo_koszty;
create trigger cfo_koszty_touch_updated_at
before update on public.cfo_koszty
for each row execute function public.cfo_touch_updated_at();

drop trigger if exists cfo_koszty_pracownikow_touch_updated_at on public.cfo_koszty_pracownikow;
create trigger cfo_koszty_pracownikow_touch_updated_at
before update on public.cfo_koszty_pracownikow
for each row execute function public.cfo_touch_updated_at();

alter table public.cfo_koszty enable row level security;
alter table public.cfo_rachunki_bankowe enable row level security;
alter table public.cfo_transakcje_bankowe enable row level security;
alter table public.cfo_koszty_pracownikow enable row level security;
alter table public.cfo_oceny_klientow enable row level security;

grant select, insert, update, delete on public.cfo_koszty to authenticated;
grant select, insert, update, delete on public.cfo_rachunki_bankowe to authenticated;
grant select, insert, update, delete on public.cfo_transakcje_bankowe to authenticated;
grant select, insert, update, delete on public.cfo_koszty_pracownikow to authenticated;
grant select, insert, update, delete on public.cfo_oceny_klientow to authenticated;
grant update (cfo_przychod_kategoria) on public.faktury_pozycje to authenticated;

drop policy if exists cfo_koszty_owner_all on public.cfo_koszty;
create policy cfo_koszty_owner_all on public.cfo_koszty
for all to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

drop policy if exists cfo_rachunki_owner_all on public.cfo_rachunki_bankowe;
create policy cfo_rachunki_owner_all on public.cfo_rachunki_bankowe
for all to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

drop policy if exists cfo_transakcje_owner_all on public.cfo_transakcje_bankowe;
create policy cfo_transakcje_owner_all on public.cfo_transakcje_bankowe
for all to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

drop policy if exists cfo_koszty_pracownikow_owner_all on public.cfo_koszty_pracownikow;
create policy cfo_koszty_pracownikow_owner_all on public.cfo_koszty_pracownikow
for all to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

drop policy if exists cfo_oceny_owner_all on public.cfo_oceny_klientow;
create policy cfo_oceny_owner_all on public.cfo_oceny_klientow
for all to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');
