create or replace function public.start_onboarding_from_signed_contract(public_contract_id uuid)
returns public.crm_umowy
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_contract public.crm_umowy;
  was_already_started boolean;
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into selected_contract
  from public.crm_umowy
  where id = public_contract_id
  for update;

  if selected_contract.id is null then
    raise exception 'Contract not found';
  end if;

  if selected_contract.status <> 'podpisana' then
    return selected_contract;
  end if;

  if selected_contract.klient_id is null then
    return selected_contract;
  end if;

  was_already_started := selected_contract.onboarding_uruchomiony_at is not null;

  update public.klienci
  set status_klienta = 'Onboarding'
  where id = selected_contract.klient_id;

  insert into public.onboarding_etapy (klient_id, etap, status)
  values
    (selected_contract.klient_id, 'contract', 'gotowe'),
    (selected_contract.klient_id, 'rodo', 'do_wykonania'),
    (selected_contract.klient_id, 'aml', 'do_wykonania'),
    (selected_contract.klient_id, 'client_card', 'do_wykonania'),
    (selected_contract.klient_id, 'powers', 'do_wykonania'),
    (selected_contract.klient_id, 'wfirma_account', 'do_wykonania'),
    (selected_contract.klient_id, 'wfirma', 'do_wykonania'),
    (selected_contract.klient_id, 'documents_takeover', 'do_wykonania')
  on conflict (klient_id, etap) do update
  set
    status = case
      when excluded.etap = 'contract' then 'gotowe'
      else public.onboarding_etapy.status
    end,
    completed_at = case
      when excluded.etap = 'contract' and public.onboarding_etapy.completed_at is null then now()
      else public.onboarding_etapy.completed_at
    end,
    completed_by = case
      when excluded.etap = 'contract' and public.onboarding_etapy.completed_by is null then current_user_id
      else public.onboarding_etapy.completed_by
    end,
    updated_by = current_user_id;

  if not was_already_started then
    update public.crm_umowy
    set
      onboarding_uruchomiony_at = now(),
      updated_at = now()
    where id = selected_contract.id
    returning * into selected_contract;

    insert into public.onboarding_historia (
      klient_id,
      etap,
      akcja,
      old_status,
      new_status,
      opis,
      created_by
    )
    values (
      selected_contract.klient_id,
      'contract',
      'uruchomienie_onboardingu',
      null,
      'gotowe',
      'Umowa księgowa ' || coalesce(selected_contract.numer_umowy, 'bez numeru') || ' została oznaczona jako podpisana i przekazana do onboardingu.',
      current_user_id
    );

    insert into public.powiadomienia (
      type,
      title,
      body,
      priority,
      related_table,
      related_id,
      recipient_id,
      metadata
    )
    select
      'contract_onboarding_started',
      'Umowa przekazana do onboardingu',
      'Umowa ' || coalesce(selected_contract.numer_umowy, 'bez numeru') || ' dla klienta ' || selected_contract.nazwa_klienta || ' została oznaczona jako podpisana i przekazana do onboardingu. Wybierz opiekuna księgowego dla tego klienta.',
      'high',
      'crm_umowy',
      selected_contract.id,
      profile.id,
      jsonb_build_object(
        'contract_id', selected_contract.id,
        'client_id', selected_contract.klient_id,
        'contract_number', selected_contract.numer_umowy,
        'client_name', selected_contract.nazwa_klienta,
        'notification_kind', 'onboarding_manager_caregiver_assignment'
      )
    from public.profiles profile
    where lower(coalesce(profile.role, '')) = 'manager'
      and coalesce(profile.aktywne, true) = true;
  end if;

  return selected_contract;
end;
$$;

revoke all on function public.start_onboarding_from_signed_contract(uuid) from public;
grant execute on function public.start_onboarding_from_signed_contract(uuid) to authenticated;
