update public.klienci
set schemat_zus = 'Duży ZUS'
where lower(coalesce(schemat_zus, '')) = lower('Pełny ZUS');

update public.zus_przedsiebiorcy_skladki rate
set schemat_zus = 'Duży ZUS'
where lower(rate.schemat_zus) = lower('Pełny ZUS')
  and not exists (
    select 1
    from public.zus_przedsiebiorcy_skladki existing
    where existing.rok = rate.rok
      and lower(existing.schemat_zus) = lower('Duży ZUS')
  );

delete from public.zus_przedsiebiorcy_skladki rate
where lower(rate.schemat_zus) = lower('Pełny ZUS')
  and exists (
    select 1
    from public.zus_przedsiebiorcy_skladki existing
    where existing.rok = rate.rok
      and lower(existing.schemat_zus) = lower('Duży ZUS')
  );

update public.zus_przedsiebiorcy_skladki_historia
set schemat_zus = 'Duży ZUS'
where lower(schemat_zus) = lower('Pełny ZUS');
