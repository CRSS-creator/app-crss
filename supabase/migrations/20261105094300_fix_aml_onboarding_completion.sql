CREATE OR REPLACE FUNCTION public.prevent_unauthorized_client_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  user_role text;
begin
  -- Allow only the derived activation performed by the onboarding trigger.
  -- Direct edits and changes to any other client fields still require permission.
  if pg_trigger_depth() > 1
    and new.status_klienta = 'Aktywny'
    and new.aktywny is true
    and public.client_onboarding_is_complete(old.id)
    and (to_jsonb(new) - array['status_klienta', 'aktywny'])
      = (to_jsonb(old) - array['status_klienta', 'aktywny'])
  then
    return new;
  end if;

  select public.get_current_user_role() into user_role;

  if user_role in ('owner', 'manager', 'admin') then
    return new;
  end if;

  if public.is_ada_own_client_editor(old.id) then
    if new.opiekun_id is distinct from old.opiekun_id then
      raise exception 'Brak uprawnień do zmiany opiekuna klienta.';
    end if;

    return new;
  end if;

  if user_role = 'accountant' then
    if
      new.nazwa is distinct from old.nazwa or
      new.nip is distinct from old.nip or
      new.forma_prawna is distinct from old.forma_prawna or
      new.forma_opodatkowania is distinct from old.forma_opodatkowania or
      new.abonament is distinct from old.abonament or
      new.status_klienta is distinct from old.status_klienta or
      new.opiekun_id is distinct from old.opiekun_id or
      new.obsluga_kadrowa is distinct from old.obsluga_kadrowa
    then
      raise exception 'Brak uprawnień do edycji danych administracyjnych klienta.';
    end if;

    return new;
  end if;

  raise exception 'Brak uprawnień do edycji klienta.';
end;
$function$;

-- Reconcile existing complete, current AML files using the same completion criteria.
with ready as (
select e.id, e.klient_id, e.status
from public.onboarding_etapy e
where e.etap = 'aml' and e.status not in ('gotowe', 'papierowo', 'nowy_podmiot')
  and exists (select 1 from public.aml_weryfikacje v where v.klient_id = e.klient_id)
  and exists (select 1 from public.aml_formularze_wstepne f where f.klient_id = e.klient_id and (f.completed_at is not null or f.completed_pdf_document_id is not null))
  and exists (select 1 from public.aml_oswiadczenia_weryfikacji s where s.klient_id = e.klient_id and (s.completed_at is not null or s.completed_pdf_document_id is not null))
  and exists (select 1 from public.aml_oceny_ryzyka a where a.klient_id = e.klient_id and (a.completed_at is not null or a.completed_pdf_document_id is not null)
    and coalesce(nullif(trim(a.risk_level), ''), (select nullif(trim(r.poziom_ryzyka), '') from public.aml_rejestr_klientow r where r.klient_id = e.klient_id)) is not null
    and coalesce(a.next_update_date, (select r.nastepna_weryfikacja_at from public.aml_rejestr_klientow r where r.klient_id = e.klient_id), (now() at time zone 'Europe/Warsaw')::date) >= (now() at time zone 'Europe/Warsaw')::date)
), updated as (
  update public.onboarding_etapy e
  set status = 'gotowe', completed_at = now(), completed_by = null, updated_by = null
  from ready
  where e.id = ready.id and e.status = ready.status
  returning e.id, e.klient_id, ready.status as old_status
)
insert into public.onboarding_historia
  (klient_id, onboarding_etap_id, etap, akcja, old_status, new_status, opis, created_by)
select klient_id, id, 'aml', 'automatyczna_zmiana_statusu_aml', old_status, 'gotowe',
  'Automatycznie zakończono AML po potwierdzeniu kompletu dokumentów i poziomu ryzyka.', null
from updated;
