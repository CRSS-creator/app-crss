create or replace function public.clean_invoice_description_without_document_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  document_limit integer;
begin
  if new.klient_id is null or new.opis is null then
    return new;
  end if;

  select coalesce(limit_dokumentow, 0)
    into document_limit
    from public.klienci
   where id = new.klient_id;

  if coalesce(document_limit, 0) <= 0 then
    new.opis := regexp_replace(
      new.opis,
      '(^|\n)Dokumenty w abonamencie: 0; dokumenty faktycznie dostarczone: [0-9]+\.($|\n)',
      E'\n',
      'g'
    );
    new.opis := nullif(trim(both E'\n' from new.opis), '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clean_invoice_description_without_document_limit on public.faktury;

create trigger trg_clean_invoice_description_without_document_limit
before insert or update of opis, klient_id on public.faktury
for each row
execute function public.clean_invoice_description_without_document_limit();

update public.faktury as invoice
   set opis = nullif(
     trim(both E'\n' from regexp_replace(
       coalesce(invoice.opis, ''),
       '(^|\n)Dokumenty w abonamencie: 0; dokumenty faktycznie dostarczone: [0-9]+\.($|\n)',
       E'\n',
       'g'
     )),
     ''
   )
  from public.klienci as client
 where client.id = invoice.klient_id
   and coalesce(client.limit_dokumentow, 0) <= 0
   and invoice.opis like '%Dokumenty w abonamencie: 0;%';
