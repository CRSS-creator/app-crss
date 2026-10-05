alter table public.kadry_wakacje_skladkowe
  add column nie_chce_skorzystac boolean not null default false,
  add column miesiac_skorzystania smallint
    check (miesiac_skorzystania between 1 and 12);
