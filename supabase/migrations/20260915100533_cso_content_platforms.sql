-- Keep all existing topics and publication flags in the Facebook plan.
alter table public.cso_content_topics
  add column if not exists platform text not null default 'facebook'
    check (platform in ('facebook', 'linkedin')),
  add column if not exists linkedin_published boolean not null default false;
create index if not exists cso_content_topics_platform_created_idx
  on public.cso_content_topics(platform, created_at);
-- Existing RLS policies remain in force for both plans.
