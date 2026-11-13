alter table public.procedury_wzory add column kategoria text not null default 'procedura' check (kategoria in ('procedura', 'wzor'));
