create or replace function public.set_invoice_due_date_from_issue_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.data_wystawienia is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.termin_platnosci := coalesce(new.termin_platnosci, new.data_wystawienia + 7);
    return new;
  end if;

  if new.termin_platnosci is distinct from old.termin_platnosci then
    return new;
  end if;

  if new.data_wystawienia is distinct from old.data_wystawienia
    and (
      old.termin_platnosci is null
      or old.termin_platnosci = old.data_wystawienia + 7
    )
  then
    new.termin_platnosci := new.data_wystawienia + 7;
  end if;

  return new;
end;
$$;

update public.faktury
set termin_platnosci = date '2026-09-14'
where id in (
  'ac4ef699-bc5d-4f5a-bd2b-3cdb478871fb',
  '67c6d68e-136c-4a39-9444-98b45005beb3'
);
