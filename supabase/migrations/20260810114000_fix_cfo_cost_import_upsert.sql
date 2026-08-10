drop index if exists public.cfo_koszty_import_key_unique;

create unique index cfo_koszty_import_key_unique
on public.cfo_koszty(import_key);
