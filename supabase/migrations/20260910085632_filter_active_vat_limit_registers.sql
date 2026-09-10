-- Keep turnover history while monitoring VAT limits only for currently exempt clients.
create or replace view public.limity_rejestry_aktywne
with (security_invoker = true)
as
select rejestr.*
from public.limity_rejestry as rejestr
where rejestr.typ <> 'vat'
   or exists (
     select 1 from public.klienci as klient
     where klient.id = rejestr.klient_id
       and klient.czynny_vat is not true
   );

revoke all on public.limity_rejestry_aktywne from anon, authenticated;
grant select on public.limity_rejestry_aktywne to authenticated, service_role;

comment on view public.limity_rejestry_aktywne is
  'Biezace monitorowanie limitow: VAT tylko dla klientow bez czynnego VAT. Historia pozostaje w limity_rejestry i limity_miesieczne. Uprawnienia zgodne z RLS tabel zrodlowych.';
