-- Clear stale invoice markers only when the excluded client has no invoice for the period.
update public.rozliczenia_miesieczne s
set faktura_wystawiona = false
from public.klienci c
where c.id = s.klient_id
  and regexp_replace(coalesce(c.nip, ''), '[^0-9]', '', 'g') in ('7851816159', '7851821195')
  and s.faktura_wystawiona is true
  and not exists (
    select 1 from public.faktury f
    where f.klient_id = s.klient_id and f.okres = s.okres and f.status <> 'anulowana'
  );
