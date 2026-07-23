update public.aml_rejestr_klientow register
set
  kody_pkd = coalesce(filtered.codes, '[]'::jsonb),
  updated_at = now()
from (
  select
    register.id,
    jsonb_agg(code.value order by code.ordinality) filter (
      where not (
        code.value->>'zrodlo' = 'CEIDG'
        and nullif(code.value->>'nazwa', '') is null
      )
    ) as codes
  from public.aml_rejestr_klientow register
  cross join lateral jsonb_array_elements(coalesce(register.kody_pkd, '[]'::jsonb)) with ordinality as code(value, ordinality)
  group by register.id
) filtered
where register.id = filtered.id
  and exists (
    select 1
    from jsonb_array_elements(coalesce(register.kody_pkd, '[]'::jsonb)) as code(value)
    where code.value->>'zrodlo' = 'CEIDG'
      and nullif(code.value->>'nazwa', '') is null
  );
