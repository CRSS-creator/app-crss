create unique index if not exists klienci_unique_normalized_nip_idx
on public.klienci ((regexp_replace(coalesce(nip, ''), '\D', '', 'g')))
where nullif(regexp_replace(coalesce(nip, ''), '\D', '', 'g'), '') is not null;
