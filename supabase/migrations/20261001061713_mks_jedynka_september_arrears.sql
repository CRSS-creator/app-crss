-- Extend the existing MKS Jedynka August exception to September only.
-- Guard generation, monthly selection and generation on settlement completion.
do $$
declare item record; definition text; original text;
begin
  for item in select * from (values
    ('public.ensure_invoice_for_settlement(uuid,date)', 'settlement_period'),
    ('public.ensure_subscription_invoices(date)', 'settlement.okres'),
    ('public.create_invoice_after_taxes_sent()', 'new.okres')
  ) targets(signature,period_expression) loop
    definition := pg_get_functiondef(item.signature::regprocedure);
    original := format('date_trunc(''month'', %s)::date = date ''2026-08-01''',item.period_expression);
    if position(original in definition)=0 or position('9721378590' in definition)=0 then
      raise exception 'Existing MKS exception not found in %; review before changing billing.',item.signature;
    end if;
    definition := replace(definition,original,
      format('date_trunc(''month'', %s)::date in (date ''2026-08-01'',date ''2026-09-01'')',item.period_expression));
    definition := replace(definition,'One-month exception: MKS August waits for the completed settlement.',
      'MKS August and September 2026 wait for the completed settlement.');
    execute definition;
  end loop;
end $$;

-- September is settled in arrears, including fees incurred in that period.
create or replace function public.additional_fee_billing_period(public_settlement_id uuid)
returns date language sql stable security definer set search_path=public as $$
  select (date_trunc('month',s.okres) + case
    when regexp_replace(coalesce(c.nip,''),'[^0-9]','','g')='9721378590'
      and date_trunc('month',s.okres)::date=date '2026-09-01' then interval '0 months'
    when c.model_fakturowania='z_gory' then interval '1 month'
    else interval '0 months' end)::date
  from public.rozliczenia_miesieczne s join public.klienci c on c.id=s.klient_id
  where s.id=public_settlement_id
$$;
revoke all on function public.additional_fee_billing_period(uuid) from public,anon,authenticated;

-- Withdraw only unissued local automatic drafts while September remains open.
-- The transactional helper releases any fee reservations without deleting fees.
do $$ declare item record; begin
  for item in
    select i.id from public.faktury i
    join public.klienci c on c.id=i.klient_id
    join public.rozliczenia_miesieczne s on s.klient_id=i.klient_id and s.okres=i.okres
    where regexp_replace(coalesce(c.nip,''),'[^0-9]','','g')='9721378590'
      and i.okres=date '2026-09-01' and s.status_ksiegowosci is distinct from 'podatki_wyslane'
      and i.automatyczna and i.status='szkic' and i.zrodlo='aplikacja'
      and i.wfirma_id is null and i.wfirma_sync_status in ('nie_wyslano','blad')
  loop
    perform public.delete_local_invoice_draft(item.id);
  end loop;
end $$;

update public.rozliczenia_miesieczne s set faktura_wystawiona=false
from public.klienci c where c.id=s.klient_id
  and regexp_replace(coalesce(c.nip,''),'[^0-9]','','g')='9721378590'
  and s.okres=date '2026-09-01' and s.status_ksiegowosci is distinct from 'podatki_wyslane'
  and not exists(select 1 from public.faktury i where i.klient_id=c.id and i.okres=s.okres and i.status<>'anulowana');

update public.rozliczenia_oplaty_dodatkowe f
set billing_period=public.additional_fee_billing_period(f.rozliczenie_id)
from public.rozliczenia_miesieczne s join public.klienci c on c.id=s.klient_id
where f.rozliczenie_id=s.id and f.faktura_id is null
  and regexp_replace(coalesce(c.nip,''),'[^0-9]','','g')='9721378590'
  and s.okres=date '2026-09-01';
