-- User explicitly requested removal of the APC-to-Cassubian billing mechanism
-- directly on GitHub main and production Supabase.
-- Verified: APC's own subscription is klienci.abonament = 250, model z_dolu.
-- oplaty_dodatkowe is a separate additional-fee catalog: deactivating the
-- Cassubian surcharge below DOES NOT change APC's subscription or client data.
-- Before deployment, original function definitions and the sole unbilled fee
-- were backed up locally (apc-live-definitions.json / apc-removal-data-backup.json).
-- Restore ordinary invoicing for APC; preserve all unrelated billing rules.
-- Exact anchors make an unexpected production definition abort the migration.
do $migration$
declare
  patch record;
  definition text;
begin
  for patch in select * from (values
    ('public.ensure_invoice_for_settlement(uuid,date)', $old$  if public.is_apc_marek_hebel_client(client_record.nip, client_record.nazwa) then
    return null;
  end if;

$old$, $new$$new$, 1),
    ('public.ensure_invoice_for_settlement(uuid,date)', $old$,
      public.is_apc_marek_hebel_client(fee_client.nip, fee_client.nazwa) as is_apc_fee$old$, $new$$new$, 1),
    ('public.ensure_invoice_for_settlement(uuid,date)', $old$where (
        fee_settlement.klient_id = client_record.id
        or (
          public.is_cassubian_client(client_record.nip, client_record.nazwa)
          and public.is_apc_marek_hebel_client(fee_client.nip, fee_client.nazwa)
        )
      )$old$, $new$where fee_settlement.klient_id = client_record.id$new$, 1),
    ('public.ensure_invoice_for_settlement(uuid,date)', $old$is not null
      and not fee_record.is_apc_fee then$old$, $new$is not null then$new$, 1),
    ('public.ensure_invoice_for_settlement(uuid,date)', $old$case
        when fee_record.is_apc_fee then 'Opłata dodatkowa'
        else fee_record.nazwa
      end$old$, $new$fee_record.nazwa$new$, 1),
    ('public.ensure_invoice_for_settlement(uuid,date)', $old$case
        when fee_record.is_apc_fee or fee_record.oplata_id='f6b592d3-949a-4ed0-a3de-e35467417aec' then 'abonamenty'
        else null
      end$old$, $new$null$new$, 1),
    ('public.ensure_subscription_invoices(date)', $old$and not public.is_apc_marek_hebel_client(client.nip, client.nazwa)
$old$, $new$$new$, 2),
    ('public.create_invoice_after_taxes_sent()', $old$      and not public.is_apc_marek_hebel_client(client_nip, client_name)
$old$, $new$$new$, 1),
    ('public.available_settlement_fee_definitions(uuid)', $old$        and (f.nazwa not in ('APC - Marek Hebel - stała opłata miesięczna', 'Stała opłata miesięczna Cassubian')
          or public.is_cassubian_client(k.nip, k.nazwa))
$old$, $new$$new$, 1)
  ) as changes(signature, old_text, new_text, expected_count)
  loop
    definition := pg_get_functiondef(patch.signature::regprocedure);
    if (length(definition) - length(replace(definition, patch.old_text, '')))
        / length(patch.old_text) <> patch.expected_count then
      raise exception 'Unexpected definition for %', patch.signature;
    end if;
    execute replace(definition, patch.old_text, patch.new_text);
  end loop;
end;
$migration$;

drop trigger rozliczenia_miesieczne_sync_cassubian_monthly_fee on public.rozliczenia_miesieczne;
drop function public.sync_cassubian_monthly_additional_fee_trigger();
drop function public.sync_cassubian_monthly_additional_fee(uuid);
drop trigger check_cassubian_additional_fee on public.rozliczenia_oplaty_dodatkowe;
drop function public.check_cassubian_additional_fee();

-- Retain the definitions for historical references, but stop offering the fee.
update public.oplaty_dodatkowe set aktywna = false
where nazwa in ('APC - Marek Hebel - stała opłata miesięczna', 'Stała opłata miesięczna Cassubian');

-- Only remove detached, never-invoiced Cassubian surcharges.
-- Production preflight found exactly one row: September 2026, net 250,
-- no invoice, no invoicing timestamp, and no invoice line.
-- Issued historical July/August charges are excluded by these predicates.
delete from public.rozliczenia_oplaty_dodatkowe fee
using public.rozliczenia_miesieczne s, public.klienci c
where s.id = fee.rozliczenie_id and c.id = s.klient_id
  and public.is_cassubian_client(c.nip, c.nazwa)
  and fee.nazwa in ('APC - Marek Hebel - stała opłata miesięczna', 'Stała opłata miesięczna Cassubian')
  and fee.fakturowane_at is null
  and fee.faktura_id is null
  and not exists (
    select 1 from public.faktury_pozycje p where p.rozliczenie_oplata_id = fee.id
  );

drop function public.is_apc_marek_hebel_client(text,text);
drop function public.is_cassubian_client(text,text);
