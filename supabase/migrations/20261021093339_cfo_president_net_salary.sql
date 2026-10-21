ALTER TABLE public.cfo_zobowiazania DROP CONSTRAINT cfo_zobowiazania_typ_check;
ALTER TABLE public.cfo_zobowiazania ADD CONSTRAINT cfo_zobowiazania_typ_check CHECK (typ IN ('wynagrodzenia_netto', 'wynagrodzenie_prezesa_netto', 'zus', 'pit4', 'vat', 'cit'));
