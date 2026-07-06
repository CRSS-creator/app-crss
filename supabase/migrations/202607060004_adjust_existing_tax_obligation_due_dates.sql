update public.zobowiazania_podatkowe
set
  termin_platnosci = public.next_polish_business_day(termin_platnosci),
  updated_at = now()
where termin_platnosci is not null
  and termin_platnosci <> public.next_polish_business_day(termin_platnosci);
