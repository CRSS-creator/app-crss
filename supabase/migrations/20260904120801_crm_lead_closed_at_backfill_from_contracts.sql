with inferred_closures as (
  select
    lead.id,
    greatest(
      lead.created_at,
      coalesce(
        min(offer.accepted_at),
        min(contract.podpisana_at),
        min(contract.data_zawarcia::timestamptz),
        min(contract.created_at),
        min(offer.email_sent_at),
        min(offer.published_at)
      )
    ) as inferred_closed_at
  from public.crm_szanse_sprzedazy lead
  left join public.crm_oferty offer
    on offer.crm_id = lead.id
  left join public.crm_umowy contract
    on contract.crm_id = lead.id
  where lead.status = 'wygrana'
  group by lead.id, lead.created_at
)
update public.crm_szanse_sprzedazy lead
set zamknieta_at = inferred.inferred_closed_at
from inferred_closures inferred
where lead.id = inferred.id
  and inferred.inferred_closed_at is not null
  and (
    lead.zamknieta_at is null
    or inferred.inferred_closed_at < lead.zamknieta_at
  );
