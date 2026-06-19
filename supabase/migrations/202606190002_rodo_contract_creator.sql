alter table public.rodo_umowy_powierzenia
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_rodo_umowy_powierzenia_created_by
  on public.rodo_umowy_powierzenia(created_by);
