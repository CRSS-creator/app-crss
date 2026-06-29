alter table public.komunikaty_historia
  add column if not exists recipients jsonb not null default '[]'::jsonb;
