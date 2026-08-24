create or replace function public.special_invoice_due_date(
  public_client_id uuid,
  public_contractor_nip text,
  public_issue_date date
)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  normalized_nip text;
begin
  if public_issue_date is null then
    return null;
  end if;

  select regexp_replace(coalesce(public_contractor_nip, client.nip, ''), '\D', '', 'g')
  into normalized_nip
  from (select 1) seed
  left join public.klienci client on client.id = public_client_id;

  if normalized_nip in ('5273158702', '5273221116') then
    return (date_trunc('month', public_issue_date)::date + interval '1 month' + interval '13 days')::date;
  end if;

  return null;
end;
$$;

create or replace function public.set_invoice_due_date_from_issue_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  special_due_date date;
begin
  if new.data_wystawienia is null then
    return new;
  end if;

  special_due_date := public.special_invoice_due_date(new.klient_id, new.kontrahent_nip, new.data_wystawienia);
  if special_due_date is not null then
    new.termin_platnosci := special_due_date;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.termin_platnosci := coalesce(new.termin_platnosci, new.data_wystawienia + 7);
    return new;
  end if;

  if new.termin_platnosci is distinct from old.termin_platnosci then
    return new;
  end if;

  if new.data_wystawienia is distinct from old.data_wystawienia
    and (
      old.termin_platnosci is null
      or old.termin_platnosci = old.data_wystawienia + 7
    )
  then
    new.termin_platnosci := new.data_wystawienia + 7;
  end if;

  return new;
end;
$$;

update public.faktury invoice
set
  termin_platnosci = public.special_invoice_due_date(invoice.klient_id, invoice.kontrahent_nip, invoice.data_wystawienia),
  status = case
    when invoice.status in ('oplacona', 'anulowana') then invoice.status
    when public.special_invoice_due_date(invoice.klient_id, invoice.kontrahent_nip, invoice.data_wystawienia) < current_date then 'przeterminowana'
    else 'wystawiona'
  end
where public.special_invoice_due_date(invoice.klient_id, invoice.kontrahent_nip, invoice.data_wystawienia) is not null
  and invoice.status <> 'anulowana'
  and invoice.data_wystawienia >= date '2026-08-01';
