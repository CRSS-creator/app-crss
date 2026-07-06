alter table public.onboarding_etapy
  drop constraint if exists onboarding_etapy_status_check;

alter table public.onboarding_etapy
  add constraint onboarding_etapy_status_check
  check (status in ('do_wykonania', 'w_toku', 'gotowe', 'zablokowane', 'papierowo', 'nowy_podmiot'));
