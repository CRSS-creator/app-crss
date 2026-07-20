insert into public.aml_rejestr_klientow (klient_id, status)
select client.id, 'do_weryfikacji'
from public.klienci client
on conflict (klient_id) do nothing;

create or replace function public.ensure_aml_register_for_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.aml_rejestr_klientow (klient_id, status)
  values (new.id, 'do_weryfikacji')
  on conflict (klient_id) do nothing;

  return new;
end;
$$;

drop trigger if exists ensure_aml_register_for_onboarding_client_trigger on public.klienci;
drop trigger if exists ensure_aml_register_for_client_trigger on public.klienci;

create trigger ensure_aml_register_for_client_trigger
after insert on public.klienci
for each row
execute function public.ensure_aml_register_for_client();

revoke all on function public.ensure_aml_register_for_client() from public;
revoke all on function public.ensure_aml_register_for_onboarding_client() from public;
grant execute on function public.ensure_aml_register_for_client() to authenticated;
