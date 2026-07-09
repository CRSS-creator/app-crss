alter table public.faktury
  drop constraint if exists faktury_status_check;

alter table public.faktury
  add constraint faktury_status_check
  check (status in ('szkic', 'wystawiona', 'wyslana', 'oplacona', 'przeterminowana', 'anulowana'));

update public.faktury
set termin_platnosci = data_wystawienia + interval '7 days'
where termin_platnosci is null
  and data_wystawienia is not null
  and numer is not null
  and status not in ('oplacona', 'anulowana');

create or replace function public.mark_overdue_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  update public.faktury
  set status = 'przeterminowana'
  where status in ('wystawiona', 'wyslana')
    and termin_platnosci is not null
    and termin_platnosci < current_date;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_overdue_invoices() from public;
grant execute on function public.mark_overdue_invoices() to authenticated;

select public.mark_overdue_invoices();
