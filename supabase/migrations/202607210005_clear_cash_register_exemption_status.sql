update public.limity_rejestry
set status_zwolnienia = null,
    updated_at = now()
where typ = 'kasa_fiskalna'
  and status_zwolnienia is not null;
