create table if not exists public.zadania_cykliczne (
  id uuid primary key default gen_random_uuid(),
  klient_id uuid references public.klienci(id) on delete cascade,
  tytul text not null,
  opis text,
  forma_prawna text,
  forma_opodatkowania text,
  dzien_miesiaca integer not null default 10 check (dzien_miesiaca between 1 and 31),
  osoba_id uuid references public.profiles(id) on delete set null,
  priorytet text not null default 'normalny' check (priorytet in ('niski', 'normalny', 'wysoki', 'pilne')),
  aktywne boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists zadania_cykliczne_klient_idx on public.zadania_cykliczne(klient_id);
create index if not exists zadania_cykliczne_osoba_idx on public.zadania_cykliczne(osoba_id);
create index if not exists zadania_cykliczne_forma_idx on public.zadania_cykliczne(forma_prawna, forma_opodatkowania);

create or replace function public.touch_zadania_cykliczne_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists zadania_cykliczne_touch_updated_at on public.zadania_cykliczne;
create trigger zadania_cykliczne_touch_updated_at
before update on public.zadania_cykliczne
for each row
execute function public.touch_zadania_cykliczne_updated_at();

alter table public.zadania_cykliczne enable row level security;

drop policy if exists zadania_cykliczne_select_by_role on public.zadania_cykliczne;
create policy zadania_cykliczne_select_by_role
on public.zadania_cykliczne
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or klient_id is null
  or exists (
    select 1
    from public.klienci klient
    where klient.id = zadania_cykliczne.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists zadania_cykliczne_insert_by_role on public.zadania_cykliczne;
create policy zadania_cykliczne_insert_by_role
on public.zadania_cykliczne
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or (
    klient_id is not null
    and exists (
      select 1
      from public.klienci klient
      where klient.id = zadania_cykliczne.klient_id
        and klient.opiekun_id = auth.uid()
    )
  )
);

drop policy if exists zadania_cykliczne_update_by_role on public.zadania_cykliczne;
create policy zadania_cykliczne_update_by_role
on public.zadania_cykliczne
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = zadania_cykliczne.klient_id
      and klient.opiekun_id = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = zadania_cykliczne.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists zadania_cykliczne_delete_by_role on public.zadania_cykliczne;
create policy zadania_cykliczne_delete_by_role
on public.zadania_cykliczne
for delete
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = zadania_cykliczne.klient_id
      and klient.opiekun_id = auth.uid()
  )
);
