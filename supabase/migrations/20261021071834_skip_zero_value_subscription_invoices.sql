-- Skip empty automatic invoices, including calls made by settlement triggers.
-- Preserve the deployed function and all unrelated billing rules and permissions.
DO $migration$
DECLARE
  function_sql text := pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure);
  anchor text := E'  payroll_gross := payroll_net + payroll_vat;\n';
  guard_sql text := $guard$

  -- No subscription and no billable services: do not create a zero-value draft.
  if subscription_net <= 0
    and not (coalesce(client_record.obsluga_kadrowa, false) and payroll_net > 0)
    and not exists (
      select 1
      from public.rozliczenia_oplaty_dodatkowe fee
      join public.rozliczenia_miesieczne origin on origin.id = fee.rozliczenie_id
      where origin.klient_id = client_record.id
        and fee.billing_period <= settlement_period
        and fee.billing_hold_reason is null
        and round(fee.kwota_netto * fee.ilosc, 2) > 0
        and (fee.faktura_id is null or exists (
          select 1 from public.faktury draft
          where draft.id = fee.faktura_id
            and draft.klient_id = client_record.id
            and draft.okres = settlement_period
            and draft.automatyczna
            and draft.status = 'szkic'
            and draft.wfirma_id is null
            and draft.wfirma_sync_status in ('nie_wyslano', 'blad')
        ))
    ) then
    perform set_config('crss.fee_refresh', coalesce(previous_refresh, ''), true);
    return null;
  end if;
$guard$;
BEGIN
  IF position(anchor in function_sql) = 0 THEN
    RAISE EXCEPTION 'Invoice function anchor not found; no changes applied.';
  END IF;
  IF position('No subscription and no billable services' in function_sql) > 0 THEN
    RAISE EXCEPTION 'Zero-value invoice guard already installed.';
  END IF;
  EXECUTE replace(function_sql, anchor, anchor || guard_sql);
END;
$migration$;
