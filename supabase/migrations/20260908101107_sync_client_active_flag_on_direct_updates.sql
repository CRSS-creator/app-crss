-- Keep the existing status-to-flag mapping, including when only aktywny is written.
-- This closes the path that allowed active clients to disappear from new settlements.
drop trigger if exists klienci_sync_active_flag_from_status on public.klienci;
create trigger klienci_sync_active_flag_from_status
before insert or update of status_klienta, aktywny on public.klienci
for each row
execute function public.sync_client_active_flag_from_status();
