alter table public.cfo_rozbicia_platnosci
  add column if not exists faktura_id uuid references public.faktury(id) on delete set null;

create index if not exists cfo_rozbicia_platnosci_faktura_id_idx
  on public.cfo_rozbicia_platnosci(faktura_id);
