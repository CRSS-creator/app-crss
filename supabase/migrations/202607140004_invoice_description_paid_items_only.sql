do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    'if coalesce(client_record.obsluga_kadrowa, false)
     and (greatest(coalesce(settlement_record.liczba_pracownikow, 0), 0) > 0
       or greatest(coalesce(settlement_record.liczba_zleceniobiorcow, 0), 0) > 0) then
    invoice_description_parts := invoice_description_parts || format(',
    'if coalesce(client_record.obsluga_kadrowa, false) and payroll_net > 0 then
    invoice_description_parts := invoice_description_parts || format('
  );

  function_definition := replace(
    function_definition,
    'if extra_documents_count > 0 then
    invoice_description_parts := invoice_description_parts || format(',
    'if coalesce(client_record.limit_dokumentow, 0) > 0 and extra_documents_count > 0 then
    invoice_description_parts := invoice_description_parts || format('
  );

  execute function_definition;
end;
$$;

create or replace function public.clean_invoice_description_without_document_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  client_record public.klienci;
  settlement_record public.rozliczenia_miesieczne;
  payroll_net numeric(12, 2);
begin
  if new.klient_id is null or new.opis is null then
    return new;
  end if;

  select *
    into client_record
    from public.klienci
   where id = new.klient_id;

  if coalesce(client_record.limit_dokumentow, 0) <= 0 then
    new.opis := regexp_replace(
      new.opis,
      '(^|\n)Dokumenty w abonamencie: [0-9]+[;,] dokumenty faktycznie dostarczone: [0-9]+\.($|\n)',
      E'\n',
      'g'
    );
  end if;

  select *
    into settlement_record
    from public.rozliczenia_miesieczne
   where klient_id = new.klient_id
     and date_trunc('month', okres)::date = date_trunc('month', new.okres)::date
   limit 1;

  payroll_net := round(
    greatest(coalesce(settlement_record.liczba_pracownikow, 0), 0) * coalesce(client_record.koszt_obslugi_pracownika, 0)
    + greatest(coalesce(settlement_record.liczba_zleceniobiorcow, 0), 0) * coalesce(client_record.koszt_obslugi_zleceniobiorcy, 0),
    2
  );

  if not coalesce(client_record.obsluga_kadrowa, false) or coalesce(payroll_net, 0) <= 0 then
    new.opis := regexp_replace(
      new.opis,
      '(^|\n)Liczba pracownik[^\n]*: pracownicy [0-9]+, zleceniobiorcy [0-9]+\.($|\n)',
      E'\n',
      'g'
    );
  end if;

  new.opis := nullif(trim(both E'\n' from new.opis), '');
  return new;
end;
$$;

update public.faktury as invoice
set opis = nullif(
  trim(both E'\n' from regexp_replace(
    coalesce(invoice.opis, ''),
    '(^|\n)Dokumenty w abonamencie: [0-9]+[;,] dokumenty faktycznie dostarczone: [0-9]+\.($|\n)',
    E'\n',
    'g'
  )),
  ''
)
from public.klienci as client
where client.id = invoice.klient_id
  and coalesce(client.limit_dokumentow, 0) <= 0
  and invoice.opis like '%Dokumenty w abonamencie:%';

update public.faktury as invoice
set opis = nullif(
  trim(both E'\n' from regexp_replace(
    coalesce(invoice.opis, ''),
    '(^|\n)Liczba pracownik[^\n]*: pracownicy [0-9]+, zleceniobiorcy [0-9]+\.($|\n)',
    E'\n',
    'g'
  )),
  ''
)
from public.klienci as client, public.rozliczenia_miesieczne as settlement
where client.id = invoice.klient_id
  and settlement.klient_id = invoice.klient_id
  and date_trunc('month', settlement.okres)::date = date_trunc('month', invoice.okres)::date
  and invoice.opis like '%Liczba pracownik%'
  and (
    not coalesce(client.obsluga_kadrowa, false)
    or round(
      greatest(coalesce(settlement.liczba_pracownikow, 0), 0) * coalesce(client.koszt_obslugi_pracownika, 0)
      + greatest(coalesce(settlement.liczba_zleceniobiorcow, 0), 0) * coalesce(client.koszt_obslugi_zleceniobiorcy, 0),
      2
    ) <= 0
  );
