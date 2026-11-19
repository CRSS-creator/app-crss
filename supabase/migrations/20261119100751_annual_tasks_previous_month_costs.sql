alter table public.zadania add column czy_roczne boolean not null default false;
comment on column public.zadania.czy_roczne is 'Koszt obsługi klienta przypisywany do miesiąca poprzedzającego wykonanie pracy (Europe/Warsaw).';
