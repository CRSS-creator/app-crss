drop function if exists public.settlement_tax_obligation_markers(date);

create function public.settlement_tax_obligation_markers(public_period date)
returns table (
  rozliczenie_id uuid,
  typy text[],
  niewyslane_typy text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    obligation.rozliczenie_id,
    coalesce(
      array_agg(distinct obligation.typ order by obligation.typ)
        filter (where obligation.status_email = 'wyslane' or obligation.status_sms = 'wyslane'),
      array[]::text[]
    ) as typy,
    coalesce(
      array_agg(distinct obligation.typ order by obligation.typ)
        filter (where obligation.status_email is distinct from 'wyslane' and obligation.status_sms is distinct from 'wyslane'),
      array[]::text[]
    ) as niewyslane_typy
  from public.zobowiazania_podatkowe obligation
  where obligation.okres = date_trunc('month', public_period)::date
    and obligation.rozliczenie_id is not null
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and coalesce(profile.aktywne, true) = true
    )
  group by obligation.rozliczenie_id
  having count(*) filter (
    where obligation.status_email = 'wyslane'
       or obligation.status_sms = 'wyslane'
       or (obligation.status_email is distinct from 'wyslane' and obligation.status_sms is distinct from 'wyslane')
  ) > 0;
$$;

revoke all on function public.settlement_tax_obligation_markers(date) from public;
revoke all on function public.settlement_tax_obligation_markers(date) from anon;

grant execute on function public.settlement_tax_obligation_markers(date) to authenticated;
