with latest_krs as (
  select distinct on (verification.klient_id)
    verification.klient_id,
    krs_check.value #> '{details,data,odpis,dane,dzial3,przedmiotDzialalnosci}' as pkd_root
  from public.aml_weryfikacje verification
  cross join lateral jsonb_array_elements(coalesce(verification.dane->'checks', '[]'::jsonb)) as krs_check(value)
  where krs_check.value->>'source' like 'KRS%'
    and krs_check.value->>'status' = 'ok'
    and krs_check.value #> '{details,data,odpis,dane,dzial3,przedmiotDzialalnosci}' is not null
  order by verification.klient_id, verification.created_at desc
),
krs_activity as (
  select
    latest_krs.klient_id,
    true as przewazajace,
    activity.value as item
  from latest_krs
  cross join lateral jsonb_array_elements(coalesce(latest_krs.pkd_root->'przedmiotPrzewazajacejDzialalnosci', '[]'::jsonb)) as activity(value)
  union all
  select
    latest_krs.klient_id,
    false as przewazajace,
    activity.value as item
  from latest_krs
  cross join lateral jsonb_array_elements(coalesce(latest_krs.pkd_root->'przedmiotPozostalejDzialalnosci', '[]'::jsonb)) as activity(value)
),
krs_codes as (
  select
    krs_activity.klient_id,
    jsonb_agg(
      jsonb_build_object(
        'kod',
        concat(
          krs_activity.item->>'kodDzial',
          '.',
          krs_activity.item->>'kodKlasa',
          case
            when nullif(krs_activity.item->>'kodPodklasa', '') is null then ''
            else concat('.', krs_activity.item->>'kodPodklasa')
          end
        ),
        'nazwa',
        nullif(krs_activity.item->>'opis', ''),
        'przewazajace',
        krs_activity.przewazajace,
        'zrodlo',
        'KRS'
      )
      order by
        krs_activity.przewazajace desc,
        krs_activity.item->>'kodDzial',
        krs_activity.item->>'kodKlasa',
        krs_activity.item->>'kodPodklasa'
    ) as codes
  from krs_activity
  where nullif(krs_activity.item->>'kodDzial', '') is not null
    and nullif(krs_activity.item->>'kodKlasa', '') is not null
  group by krs_activity.klient_id
)
update public.aml_rejestr_klientow register
set
  kody_pkd = krs_codes.codes,
  updated_at = now()
from krs_codes
where register.klient_id = krs_codes.klient_id
  and coalesce(jsonb_array_length(register.kody_pkd), 0) = 0;
