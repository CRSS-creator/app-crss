alter table public.profiles add column phone text;

comment on column public.profiles.phone is
  'Optional caregiver contact phone used in the client caregiver notification.';
