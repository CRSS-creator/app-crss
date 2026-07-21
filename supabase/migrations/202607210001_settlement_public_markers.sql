create or replace function public.settlement_invoice_markers(public_period date)
returns table (
  klient_id uuid,
  numer text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (invoice.klient_id)
    invoice.klient_id,
    invoice.numer
  from public.faktury invoice
  where invoice.okres = date_trunc('month', public_period)::date
    and invoice.kategoria = 'standardowa'
    and invoice.klient_id is not null
    and invoice.numer is not null
    and invoice.status in ('wystawiona', 'wyslana', 'oplacona', 'przeterminowana')
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and coalesce(profile.aktywne, true) = true
    )
  order by invoice.klient_id, invoice.created_at desc;
$$;

create or replace function public.settlement_tax_obligation_markers(public_period date)
returns table (
  rozliczenie_id uuid,
  typy text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    obligation.rozliczenie_id,
    array_agg(distinct obligation.typ order by obligation.typ) as typy
  from public.zobowiazania_podatkowe obligation
  where obligation.okres = date_trunc('month', public_period)::date
    and obligation.rozliczenie_id is not null
    and (obligation.status_email = 'wyslane' or obligation.status_sms = 'wyslane')
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and coalesce(profile.aktywne, true) = true
    )
  group by obligation.rozliczenie_id;
$$;

revoke all on function public.settlement_invoice_markers(date) from public;
revoke all on function public.settlement_tax_obligation_markers(date) from public;
revoke all on function public.settlement_invoice_markers(date) from anon;
revoke all on function public.settlement_tax_obligation_markers(date) from anon;

grant execute on function public.settlement_invoice_markers(date) to authenticated;
grant execute on function public.settlement_tax_obligation_markers(date) to authenticated;
