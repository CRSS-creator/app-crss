revoke all on function public.can_access_client(uuid) from public;
revoke all on function public.can_access_client(uuid) from anon;
grant execute on function public.can_access_client(uuid) to authenticated;
