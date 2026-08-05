create or replace function public.has_existing_open_standard_invoice(
  public_client_id uuid,
  public_period date,
  public_invoice_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.faktury invoice
    where invoice.klient_id = public_client_id
      and invoice.okres = public_period
      and coalesce(invoice.kategoria, 'standardowa') = 'standardowa'
      and invoice.status <> 'anulowana'
      and (
        invoice.wfirma_id is not null
        or invoice.zrodlo = 'wfirma'
        or (
          invoice.zrodlo = 'aplikacja'
          and invoice.status = 'szkic'
          and invoice.wfirma_id is null
          and coalesce(invoice.wfirma_sync_status, 'nie_wyslano') in ('nie_wyslano', 'blad', 'w_kolejce')
        )
      )
      and (public_invoice_id is null or invoice.id <> public_invoice_id)
  );
$$;

revoke all on function public.has_existing_open_standard_invoice(uuid, date, uuid) from public;
revoke all on function public.has_existing_open_standard_invoice(uuid, date, uuid) from anon, authenticated;

create or replace function public.prevent_duplicate_standard_invoice_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.klient_id is not null
    and new.okres is not null
    and coalesce(new.kategoria, 'standardowa') = 'standardowa'
    and new.status = 'szkic'
    and new.zrodlo = 'aplikacja'
    and new.wfirma_id is null
    and coalesce(new.wfirma_sync_status, 'nie_wyslano') in ('nie_wyslano', 'blad', 'w_kolejce')
    and public.has_existing_open_standard_invoice(new.klient_id, new.okres, new.id)
  then
    raise exception 'Istnieje juz standardowa faktura lub szkic za ten okres.';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_duplicate_standard_invoice_draft() from public;
revoke all on function public.prevent_duplicate_standard_invoice_draft() from anon, authenticated;
