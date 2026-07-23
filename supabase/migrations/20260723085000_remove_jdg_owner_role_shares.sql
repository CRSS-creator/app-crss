with latest_form as (
  select distinct on (form.klient_id)
    form.klient_id,
    form.form_data->'individual' as individual
  from public.aml_formularze_wstepne form
  where form.status = 'completed'
    and form.form_data ? 'individual'
  order by form.klient_id, form.completed_at desc nulls last, form.created_at desc
),
latest_ceidg as (
  select distinct on (verification.klient_id)
    verification.klient_id,
    ceidg_check.value #> '{details,companies,0}' as company
  from public.aml_weryfikacje verification
  cross join lateral jsonb_array_elements(coalesce(verification.dane->'checks', '[]'::jsonb)) as ceidg_check(value)
  where ceidg_check.value->>'source' = 'CEIDG'
    and ceidg_check.value->>'status' = 'ok'
    and ceidg_check.value #> '{details,companies,0}' is not null
  order by verification.klient_id, verification.created_at desc
),
jdg_registers as (
  select
    register.id as register_id,
    client.nip,
    client.nazwa as client_name,
    coalesce(latest_ceidg.company, '{}'::jsonb) as company,
    coalesce(latest_ceidg.company #> '{wlasciciel}', '{}'::jsonb) as owner,
    coalesce(latest_form.individual, '{}'::jsonb) as individual,
    coalesce(register.beneficjenci_rzeczywisci->0, '{}'::jsonb) as existing_owner,
    nullif(trim(concat_ws(' ',
      latest_ceidg.company #>> '{wlasciciel,imie}',
      latest_ceidg.company #>> '{wlasciciel,nazwisko}'
    )), '') as owner_name
  from public.aml_rejestr_klientow register
  join public.klienci client on client.id = register.klient_id
  left join latest_form on latest_form.klient_id = client.id
  left join latest_ceidg on latest_ceidg.klient_id = client.id
  where register.dane_rejestrowe->>'typPodmiotu' = 'jdg'
     or lower(coalesce(client.forma_prawna, '')) = 'jdg'
     or lower(coalesce(client.forma_prawna, '')) like '%jednoosobow%'
     or lower(coalesce(client.forma_prawna, '')) like '%dzialalnosc gospodarcza%'
     or lower(coalesce(client.forma_prawna, '')) like '%działalność gospodarcza%'
)
update public.aml_rejestr_klientow register
set
  beneficjenci_rzeczywisci = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'typ', 'jdg',
    'source', coalesce(nullif(jdg_registers.existing_owner->>'source', ''), 'CEIDG'),
    'status', coalesce(nullif(jdg_registers.existing_owner->>'status', ''), 'pobrano'),
    'label', coalesce(nullif(jdg_registers.owner_name, ''), nullif(jdg_registers.existing_owner->>'label', ''), jdg_registers.client_name, 'Przedsiębiorca'),
    'pierwszeImie', coalesce(nullif(jdg_registers.owner->>'imie', ''), nullif(jdg_registers.existing_owner->>'pierwszeImie', '')),
    'nazwisko', coalesce(nullif(jdg_registers.owner->>'nazwisko', ''), nullif(jdg_registers.existing_owner->>'nazwisko', '')),
    'pesel', coalesce(nullif(jdg_registers.individual->>'peselOrBirthDate', ''), nullif(jdg_registers.existing_owner->>'pesel', '')),
    'adresZamieszkania', coalesce(nullif(jdg_registers.individual->>'residenceAddress', ''), nullif(jdg_registers.existing_owner->>'adresZamieszkania', '')),
    'krajZamieszkania', coalesce(nullif(jdg_registers.individual->>'residenceAddress', ''), nullif(jdg_registers.existing_owner->>'krajZamieszkania', '')),
    'obywatelstwo', nullif(jdg_registers.individual->>'citizenship', ''),
    'dokumentTozsamosci', nullif(jdg_registers.individual->>'identityDocument', ''),
    'krajUrodzenia', nullif(jdg_registers.individual->>'birthCountry', ''),
    'nip', coalesce(nullif(jdg_registers.owner->>'nip', ''), nullif(jdg_registers.existing_owner->>'nip', ''), jdg_registers.nip),
    'regon', coalesce(nullif(jdg_registers.owner->>'regon', ''), nullif(jdg_registers.existing_owner->>'regon', '')),
    'spolka', jsonb_build_object(
      'nazwa', coalesce(nullif(jdg_registers.company->>'nazwa', ''), jdg_registers.client_name),
      'nip', jdg_registers.nip,
      'forma', 'Jednoosobowa działalność gospodarcza'
    ),
    'checkedAt', coalesce(nullif(jdg_registers.existing_owner->>'checkedAt', ''), now()::text)
  ))),
  updated_at = now()
from jdg_registers
where register.id = jdg_registers.register_id;
