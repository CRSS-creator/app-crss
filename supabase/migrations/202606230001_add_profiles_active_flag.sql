alter table public.profiles
  add column if not exists aktywne boolean not null default true;

update public.profiles
set aktywne = true
where aktywne is distinct from true;
