create table public.cso_google_reviews (
  klient_id uuid primary key references public.klienci(id) on delete cascade,
  opinia_dodana boolean not null default false
);
alter table public.cso_google_reviews enable row level security;
revoke all on public.cso_google_reviews from anon, authenticated;
grant select, insert, update on public.cso_google_reviews to authenticated;
grant all on public.cso_google_reviews to service_role;

create policy cso_google_reviews_select on public.cso_google_reviews
for select to authenticated
using (public.current_user_role() in ('owner','admin','handlowiec') and public.can_access_client(klient_id));
create policy cso_google_reviews_insert on public.cso_google_reviews
for insert to authenticated
with check (public.current_user_role() in ('owner','admin','handlowiec') and public.can_access_client(klient_id));
create policy cso_google_reviews_update on public.cso_google_reviews
for update to authenticated
using (public.current_user_role() in ('owner','admin','handlowiec') and public.can_access_client(klient_id))
with check (public.current_user_role() in ('owner','admin','handlowiec') and public.can_access_client(klient_id));
