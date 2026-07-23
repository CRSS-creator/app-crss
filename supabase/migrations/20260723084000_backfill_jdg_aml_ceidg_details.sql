with latest_ceidg as (
  select distinct on (verification.klient_id)
    verification.klient_id,
    ceidg_check.value as ceidg_check,
    ceidg_check.value #> '{details,companies,0}' as company
  from public.aml_weryfikacje verification
  cross join lateral jsonb_array_elements(coalesce(verification.dane->'checks', '[]'::jsonb)) as ceidg_check(value)
  where ceidg_check.value->>'source' = 'CEIDG'
    and ceidg_check.value->>'status' = 'ok'
    and ceidg_check.value #> '{details,companies,0}' is not null
  order by verification.klient_id, verification.created_at desc
),
jdg_data as (
  select
    register.id as register_id,
    client.nip,
    client.nazwa as client_name,
    latest_ceidg.company,
    latest_ceidg.company #> '{wlasciciel}' as owner,
    nullif(trim(concat_ws(' ',
      latest_ceidg.company #>> '{adresDzialalnosci,kodPocztowy}',
      latest_ceidg.company #>> '{adresDzialalnosci,miejscowosc}',
      latest_ceidg.company #>> '{adresDzialalnosci,ulica}',
      latest_ceidg.company #>> '{adresDzialalnosci,budynek}',
      latest_ceidg.company #>> '{adresDzialalnosci,lokal}'
    )), '') as address,
    nullif(trim(concat_ws(' ',
      latest_ceidg.company #>> '{wlasciciel,imie}',
      latest_ceidg.company #>> '{wlasciciel,nazwisko}'
    )), '') as owner_name
  from latest_ceidg
  join public.klienci client on client.id = latest_ceidg.klient_id
  join public.aml_rejestr_klientow register on register.klient_id = client.id
  where lower(coalesce(client.forma_prawna, '')) in ('jdg', 'jednoosobowa działalność gospodarcza', 'jednoosobowa dzialalnosc gospodarcza')
     or lower(coalesce(client.forma_prawna, '')) like '%jednoosobow%'
     or lower(coalesce(client.forma_prawna, '')) like '%działalność gospodarcza%'
     or lower(coalesce(client.forma_prawna, '')) like '%dzialalnosc gospodarcza%'
)
update public.aml_rejestr_klientow register
set
  dane_rejestrowe =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      coalesce(register.dane_rejestrowe, '{}'::jsonb),
                      '{typPodmiotu}',
                      to_jsonb('jdg'::text),
                      true
                    ),
                    '{identyfikatory,krs}',
                    'null'::jsonb,
                    true
                  ),
                  '{identyfikatory,rejestr}',
                  'null'::jsonb,
                  true
                ),
                '{identyfikatory,nazwa}',
                to_jsonb(coalesce(jdg_data.company->>'nazwa', jdg_data.client_name)),
                true
              ),
              '{identyfikatory,adres}',
              coalesce(to_jsonb(jdg_data.address), 'null'::jsonb),
              true
            ),
            '{identyfikatory,forma}',
            to_jsonb('Jednoosobowa działalność gospodarcza'::text),
            true
          ),
          '{ceidg,dane}',
          coalesce(jdg_data.company, '{}'::jsonb),
          true
        ),
        '{ceidg,nazwa}',
        to_jsonb(coalesce(jdg_data.company->>'nazwa', jdg_data.client_name)),
        true
      ),
      '{ceidg,forma}',
      to_jsonb('Jednoosobowa działalność gospodarcza'::text),
      true
    )
    || jsonb_build_object(
      'ceidg',
      coalesce(register.dane_rejestrowe->'ceidg', '{}'::jsonb)
      || jsonb_build_object(
        'dane', coalesce(jdg_data.company, '{}'::jsonb),
        'nazwa', coalesce(jdg_data.company->>'nazwa', jdg_data.client_name),
        'adres', jdg_data.address,
        'forma', 'Jednoosobowa działalność gospodarcza',
        'przedsiebiorca', coalesce(jdg_data.owner_name, jdg_data.client_name)
      )
    ),
  numer_krs = null,
  beneficjenci_rzeczywisci = jsonb_build_array(jsonb_build_object(
    'source', 'CEIDG',
    'status', 'pobrano',
    'label', coalesce(jdg_data.owner_name, jdg_data.client_name, 'Przedsiębiorca'),
    'pierwszeImie', jdg_data.owner->>'imie',
    'nazwisko', jdg_data.owner->>'nazwisko',
    'nip', coalesce(jdg_data.owner->>'nip', jdg_data.nip),
    'regon', jdg_data.owner->>'regon',
    'rola', 'Przedsiębiorca',
    'reprezentant', true,
    'udzialowiec', true,
    'procentUdzialow', '100',
    'spolka', jsonb_build_object(
      'nazwa', coalesce(jdg_data.company->>'nazwa', jdg_data.client_name),
      'nip', jdg_data.nip,
      'forma', 'Jednoosobowa działalność gospodarcza'
    ),
    'checkedAt', now()
  )),
  updated_at = now()
from jdg_data
where register.id = jdg_data.register_id;
