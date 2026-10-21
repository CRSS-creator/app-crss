alter policy cso_google_reviews_select on public.cso_google_reviews
using (public.current_user_role() = 'owner' and public.can_access_client(klient_id));
alter policy cso_google_reviews_insert on public.cso_google_reviews
with check (public.current_user_role() = 'owner' and public.can_access_client(klient_id));
alter policy cso_google_reviews_update on public.cso_google_reviews
using (public.current_user_role() = 'owner' and public.can_access_client(klient_id))
with check (public.current_user_role() = 'owner' and public.can_access_client(klient_id));
