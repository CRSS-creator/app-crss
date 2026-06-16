update public.crm_szanse_sprzedazy
set
  powod_kontaktu = case
    when nullif(btrim(coalesce(powod_kontaktu, '')), '') is null
      then btrim(powod_zmiany_biura)
    when nullif(btrim(coalesce(powod_zmiany_biura, '')), '') is null
      then powod_kontaktu
    when strpos(powod_kontaktu, btrim(powod_zmiany_biura)) > 0
      then powod_kontaktu
    else btrim(powod_kontaktu) || E'\n\n' || btrim(powod_zmiany_biura)
  end,
  powod_zmiany_biura = null,
  updated_at = now()
where nullif(btrim(coalesce(powod_zmiany_biura, '')), '') is not null;
