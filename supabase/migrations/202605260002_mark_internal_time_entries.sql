-- Jawne oznaczenie czasu pracy jako wewnętrznego albo klienckiego.
-- Czas zadań wewnętrznych nadal zapisuje się w public.czas_pracy,
-- ale ma klient_id = null oraz czy_wewnetrzne = true.

alter table public.czas_pracy
add column if not exists czy_wewnetrzne boolean not null default false;

create index if not exists czas_pracy_wewnetrzne_miesiac_idx
on public.czas_pracy(czy_wewnetrzne, miesiac_rozliczeniowy);

create or replace function public.prepare_time_entry()
returns trigger
language plpgsql
as $$
begin
  if new.ended_at is not null then
    new.duration_seconds := greatest(0, floor(extract(epoch from (new.ended_at - new.started_at)))::integer);
  else
    new.duration_seconds := null;
  end if;

  new.miesiac_rozliczeniowy := date_trunc('month', new.started_at)::date;

  if new.zadanie_id is not null then
    select z.klient_id, z.czy_wewnetrzne
    into new.klient_id, new.czy_wewnetrzne
    from public.zadania z
    where z.id = new.zadanie_id;
  end if;

  return new;
end;
$$;

update public.czas_pracy cp
set
  klient_id = z.klient_id,
  czy_wewnetrzne = z.czy_wewnetrzne,
  miesiac_rozliczeniowy = date_trunc('month', cp.started_at)::date
from public.zadania z
where cp.zadanie_id = z.id;
