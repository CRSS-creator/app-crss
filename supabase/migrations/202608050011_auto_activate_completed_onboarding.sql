create or replace function public.client_onboarding_is_complete(public_client_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  with expected_stages(etap) as (
    values
      ('contract'::text),
      ('rodo'::text),
      ('aml'::text),
      ('client_card'::text),
      ('powers'::text),
      ('wfirma_account'::text),
      ('wfirma'::text),
      ('documents_takeover'::text)
  )
  select
    count(distinct stage.etap) = (select count(*) from expected_stages)
    and count(*) filter (where stage.status not in ('gotowe', 'papierowo', 'nowy_podmiot')) = 0
  from expected_stages expected
  left join public.onboarding_etapy stage
    on stage.klient_id = public_client_id
   and stage.etap = expected.etap;
$$;

create or replace function public.activate_client_when_onboarding_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  public_client_id uuid := coalesce(new.klient_id, old.klient_id);
  updated_count integer;
begin
  if public_client_id is null then
    return coalesce(new, old);
  end if;

  if public.client_onboarding_is_complete(public_client_id) then
    update public.klienci
    set
      status_klienta = 'Aktywny',
      aktywny = true
    where id = public_client_id
      and lower(coalesce(status_klienta, '')) <> 'aktywny';

    get diagnostics updated_count = row_count;

    if updated_count > 0 then
      insert into public.onboarding_historia (
        klient_id,
        onboarding_etap_id,
        etap,
        akcja,
        old_status,
        new_status,
        opis,
        created_by
      )
      values (
        public_client_id,
        null,
        null,
        'automatyczne_aktywowanie_klienta',
        null,
        'gotowe',
        'Onboarding klienta jest zakonczony. Status klienta zmieniono na Aktywny.',
        auth.uid()
      );
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.sync_completed_onboarding_client_statuses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  with completed_clients as (
    select client.id
    from public.klienci client
    where lower(coalesce(client.status_klienta, '')) <> 'aktywny'
      and public.client_onboarding_is_complete(client.id)
  ), updated_clients as (
    update public.klienci client
    set
      status_klienta = 'Aktywny',
      aktywny = true
    from completed_clients completed
    where client.id = completed.id
    returning client.id
  ), history_insert as (
    insert into public.onboarding_historia (
      klient_id,
      onboarding_etap_id,
      etap,
      akcja,
      old_status,
      new_status,
      opis,
      created_by
    )
    select
      updated.id,
      null,
      null,
      'automatyczne_aktywowanie_klienta',
      null,
      'gotowe',
      'Onboarding klienta byl zakonczony. Status klienta zmieniono na Aktywny.',
      auth.uid()
    from updated_clients updated
    returning 1
  )
  select count(*) into updated_count
  from history_insert;

  return updated_count;
end;
$$;

drop trigger if exists onboarding_auto_activate_client on public.onboarding_etapy;
create trigger onboarding_auto_activate_client
after insert or update or delete on public.onboarding_etapy
for each row
execute function public.activate_client_when_onboarding_completed();

revoke all on function public.client_onboarding_is_complete(uuid) from public;
grant execute on function public.client_onboarding_is_complete(uuid) to authenticated;

revoke all on function public.activate_client_when_onboarding_completed() from public;

revoke all on function public.sync_completed_onboarding_client_statuses() from public;
grant execute on function public.sync_completed_onboarding_client_statuses() to authenticated;
