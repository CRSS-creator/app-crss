create or replace function public.cfo_classify_invoice_line(line_name text)
returns text
language plpgsql
immutable
as $$
declare
  value text := lower(coalesce(line_name, ''));
begin
  if value like '%opłata wdrożeniowa%' or value like '%oplata wdrozeniowa%' or value like '%wdrożen%' or value like '%wdrozen%' then
    return 'wdrozenia';
  end if;

  if value like '%abonament%' or value like '%usługa księgowa%' or value like '%usluga ksiegowa%' then
    return 'abonamenty';
  end if;

  if value like '%kadry%' or value like '%płac%' or value like '%plac%' or value like '%pracownik%' or value like '%zleceniobior%' or value like '%umowa%' then
    return 'kadry_place';
  end if;

  if value like '%dodatkow%' or value like '%konsult%' or value like '%doradz%' or value like '%korekt%' or value like '%wniosek%' or value like '%zaświadc%' or value like '%zaswiadc%' then
    return 'uslugi_dodatkowe';
  end if;

  return 'pozostale';
end;
$$;

update public.faktury_pozycje fp
set cfo_przychod_kategoria = 'abonamenty'
from public.faktury f
where f.id = fp.faktura_id
  and f.typ = 'sprzedaz'
  and f.status <> 'anulowana'
  and coalesce(f.okres, f.data_wystawienia) >= date '2026-01-01'
  and (lower(fp.nazwa) like '%usługa księgowa%' or lower(fp.nazwa) like '%usluga ksiegowa%');
