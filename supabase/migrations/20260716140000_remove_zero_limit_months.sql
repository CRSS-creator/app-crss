delete from public.limity_miesieczne
where coalesce(kwota, 0) = 0;
