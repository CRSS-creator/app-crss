create table if not exists public.cso_content_topics (
  id text primary key,
  category text not null,
  title text not null,
  status text not null default 'pomysl' check (status in ('pomysl', 'w_planie', 'opublikowane')),
  note text not null default '',
  facebook_published boolean not null default false,
  blog_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists cso_content_topics_status_idx on public.cso_content_topics(status);
create index if not exists cso_content_topics_category_idx on public.cso_content_topics(category);

create or replace function public.touch_cso_content_topics_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cso_content_topics_touch_updated_at on public.cso_content_topics;
create trigger cso_content_topics_touch_updated_at
before update on public.cso_content_topics
for each row
execute function public.touch_cso_content_topics_updated_at();

alter table public.cso_content_topics enable row level security;

drop policy if exists cso_content_topics_select_by_role on public.cso_content_topics;
create policy cso_content_topics_select_by_role
on public.cso_content_topics
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('owner', 'manager', 'admin')
  )
);

drop policy if exists cso_content_topics_insert_by_role on public.cso_content_topics;
create policy cso_content_topics_insert_by_role
on public.cso_content_topics
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('owner', 'manager', 'admin')
  )
);

drop policy if exists cso_content_topics_update_by_role on public.cso_content_topics;
create policy cso_content_topics_update_by_role
on public.cso_content_topics
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('owner', 'manager', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('owner', 'manager', 'admin')
  )
);

drop policy if exists cso_content_topics_delete_by_role on public.cso_content_topics;
create policy cso_content_topics_delete_by_role
on public.cso_content_topics
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('owner', 'manager', 'admin')
  )
);

grant select, insert, update, delete on public.cso_content_topics to authenticated;
