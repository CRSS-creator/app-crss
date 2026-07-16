create table if not exists public.rodo_historia (
  id uuid primary key default gen_random_uuid(),
  record_kind text not null,
  record_id uuid not null,
  action text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_fields jsonb not null default '[]'::jsonb,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now(),
  constraint rodo_historia_record_kind_check
    check (record_kind in ('contracts', 'changes', 'incidents', 'authorizedPersons')),
  constraint rodo_historia_action_check
    check (action in ('created', 'updated'))
);

create index if not exists rodo_historia_record_idx
  on public.rodo_historia(record_kind, record_id, created_at desc);
create index if not exists rodo_historia_changed_by_idx
  on public.rodo_historia(changed_by);

alter table public.rodo_historia enable row level security;

drop policy if exists rodo_historia_management_select on public.rodo_historia;
create policy rodo_historia_management_select
  on public.rodo_historia
  for select
  to authenticated
  using (public.current_user_role() in ('owner', 'manager', 'admin'));

grant select on public.rodo_historia to authenticated;

create or replace function public.log_rodo_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_json jsonb;
  new_json jsonb;
  field_changes jsonb;
  actor_id uuid;
  history_record_kind text;
begin
  history_record_kind := tg_argv[0];
  actor_id := auth.uid();

  if tg_op = 'INSERT' then
    insert into public.rodo_historia (
      record_kind,
      record_id,
      action,
      changed_by,
      changed_fields,
      new_data,
      created_at
    )
    values (
      history_record_kind,
      new.id,
      'created',
      coalesce(actor_id, new.created_by),
      '[]'::jsonb,
      to_jsonb(new),
      coalesce(new.created_at, now())
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    old_json := to_jsonb(old);
    new_json := to_jsonb(new);

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'field', key,
          'old', old_json -> key,
          'new', new_json -> key
        )
        order by key
      ),
      '[]'::jsonb
    )
    into field_changes
    from jsonb_object_keys(new_json) as key
    where key <> 'updated_at'
      and (old_json -> key) is distinct from (new_json -> key);

    if field_changes <> '[]'::jsonb then
      insert into public.rodo_historia (
        record_kind,
        record_id,
        action,
        changed_by,
        changed_fields,
        old_data,
        new_data
      )
      values (
        history_record_kind,
        new.id,
        'updated',
        coalesce(actor_id, new.created_by, old.created_by),
        field_changes,
        old_json,
        new_json
      );
    end if;

    return new;
  end if;

  return null;
end;
$$;

revoke execute on function public.log_rodo_history() from public;
revoke execute on function public.log_rodo_history() from anon;
revoke execute on function public.log_rodo_history() from authenticated;

drop trigger if exists rodo_umowy_powierzenia_history_trg on public.rodo_umowy_powierzenia;
create trigger rodo_umowy_powierzenia_history_trg
  after insert or update on public.rodo_umowy_powierzenia
  for each row execute function public.log_rodo_history('contracts');

drop trigger if exists rodo_rejestr_zmian_przegladow_history_trg on public.rodo_rejestr_zmian_przegladow;
create trigger rodo_rejestr_zmian_przegladow_history_trg
  after insert or update on public.rodo_rejestr_zmian_przegladow
  for each row execute function public.log_rodo_history('changes');

drop trigger if exists rodo_rejestr_incydentow_naruszen_history_trg on public.rodo_rejestr_incydentow_naruszen;
create trigger rodo_rejestr_incydentow_naruszen_history_trg
  after insert or update on public.rodo_rejestr_incydentow_naruszen
  for each row execute function public.log_rodo_history('incidents');

drop trigger if exists rodo_rejestr_osob_upowaznionych_history_trg on public.rodo_rejestr_osob_upowaznionych;
create trigger rodo_rejestr_osob_upowaznionych_history_trg
  after insert or update on public.rodo_rejestr_osob_upowaznionych
  for each row execute function public.log_rodo_history('authorizedPersons');

insert into public.rodo_historia (record_kind, record_id, action, changed_by, changed_fields, new_data, created_at)
select 'contracts', id, 'created', created_by, '[]'::jsonb, to_jsonb(rodo_umowy_powierzenia), created_at
from public.rodo_umowy_powierzenia
where not exists (
  select 1 from public.rodo_historia
  where record_kind = 'contracts'
    and record_id = rodo_umowy_powierzenia.id
    and action = 'created'
);

insert into public.rodo_historia (record_kind, record_id, action, changed_by, changed_fields, new_data, created_at)
select 'changes', id, 'created', created_by, '[]'::jsonb, to_jsonb(rodo_rejestr_zmian_przegladow), created_at
from public.rodo_rejestr_zmian_przegladow
where not exists (
  select 1 from public.rodo_historia
  where record_kind = 'changes'
    and record_id = rodo_rejestr_zmian_przegladow.id
    and action = 'created'
);

insert into public.rodo_historia (record_kind, record_id, action, changed_by, changed_fields, new_data, created_at)
select 'incidents', id, 'created', created_by, '[]'::jsonb, to_jsonb(rodo_rejestr_incydentow_naruszen), created_at
from public.rodo_rejestr_incydentow_naruszen
where not exists (
  select 1 from public.rodo_historia
  where record_kind = 'incidents'
    and record_id = rodo_rejestr_incydentow_naruszen.id
    and action = 'created'
);

insert into public.rodo_historia (record_kind, record_id, action, changed_by, changed_fields, new_data, created_at)
select 'authorizedPersons', id, 'created', created_by, '[]'::jsonb, to_jsonb(rodo_rejestr_osob_upowaznionych), created_at
from public.rodo_rejestr_osob_upowaznionych
where not exists (
  select 1 from public.rodo_historia
  where record_kind = 'authorizedPersons'
    and record_id = rodo_rejestr_osob_upowaznionych.id
    and action = 'created'
);
