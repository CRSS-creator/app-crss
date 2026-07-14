alter table public.faktury_email_history
  add column if not exists notification_type text not null default 'invoice_mail',
  add column if not exists recipient_phone text;

alter table public.faktury_email_history
  drop constraint if exists faktury_email_history_notification_type_check;

alter table public.faktury_email_history
  add constraint faktury_email_history_notification_type_check
  check (notification_type in ('invoice_mail', 'overdue_notification'));
