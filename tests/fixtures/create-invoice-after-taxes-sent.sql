CREATE OR REPLACE FUNCTION public.create_invoice_after_taxes_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  client_billing_model text;
  client_nip text;
  client_name text;
begin
  if new.status_ksiegowosci = 'podatki_wyslane'
    and old.status_ksiegowosci is distinct from new.status_ksiegowosci then
    select model_fakturowania, nip, nazwa
    into client_billing_model, client_nip, client_name
    from public.klienci
    where id = new.klient_id;

    if (client_billing_model = 'z_dolu' or (regexp_replace(coalesce(client_nip, ''), '[^0-9]', '', 'g') = '9721378590'
        and date_trunc('month', new.okres)::date = date '2026-08-01'))
      and not public.is_apc_marek_hebel_client(client_nip, client_name)
      and not public.has_existing_standard_wfirma_invoice(new.klient_id, date_trunc('month', new.okres)::date) then
      perform public.ensure_invoice_for_settlement(
        new.id,
        public.invoice_issue_date_for_settlement(new.id, current_date)
      );
    end if;
  end if;

  return new;
end;
$function$;
