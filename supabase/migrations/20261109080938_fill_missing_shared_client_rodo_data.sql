-- Fill missing shared data only; populated contract values are historical snapshots.
-- SECURITY INVOKER preserves existing RLS and client edit permissions.
create or replace function public.fill_rodo_data_from_client()
returns trigger language plpgsql security invoker set search_path = public as $$
declare c public.klienci%rowtype;
begin
  if new.klient_id is null then return new; end if;
  select * into c from public.klienci where id = new.klient_id;
  if not found then return new; end if;
  new.nazwa_klienta := coalesce(nullif(btrim(new.nazwa_klienta), ''), nullif(btrim(c.nazwa), ''), new.nazwa_klienta);
  new.nip := coalesce(nullif(btrim(new.nip), ''), nullif(btrim(c.nip), ''));
  new.siedziba := coalesce(nullif(btrim(new.siedziba), ''), nullif(btrim(c.adres_dzialalnosci), ''));
  new.email_klienta := coalesce(nullif(btrim(new.email_klienta), ''), nullif(btrim(c.email), ''));
  return new;
end;
$$;
create trigger fill_rodo_data_from_client_trg
before insert or update of klient_id, nazwa_klienta, nip, siedziba, email_klienta
on public.rodo_umowy_powierzenia for each row execute function public.fill_rodo_data_from_client();

create or replace function public.fill_missing_rodo_data_after_client_change()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  update public.rodo_umowy_powierzenia r set
    nazwa_klienta = coalesce(nullif(btrim(r.nazwa_klienta), ''), nullif(btrim(new.nazwa), ''), r.nazwa_klienta),
    nip = coalesce(nullif(btrim(r.nip), ''), nullif(btrim(new.nip), '')),
    siedziba = coalesce(nullif(btrim(r.siedziba), ''), nullif(btrim(new.adres_dzialalnosci), '')),
    email_klienta = coalesce(nullif(btrim(r.email_klienta), ''), nullif(btrim(new.email), '')),
    updated_at = now()
  where r.klient_id = new.id and (
    (nullif(btrim(r.nazwa_klienta), '') is null and nullif(btrim(new.nazwa), '') is not null) or
    (nullif(btrim(r.nip), '') is null and nullif(btrim(new.nip), '') is not null) or
    (nullif(btrim(r.siedziba), '') is null and nullif(btrim(new.adres_dzialalnosci), '') is not null) or
    (nullif(btrim(r.email_klienta), '') is null and nullif(btrim(new.email), '') is not null)
  );
  return new;
end;
$$;
create trigger fill_missing_rodo_data_after_client_change_trg
after insert or update of nazwa, nip, adres_dzialalnosci, email
on public.klienci for each row execute function public.fill_missing_rodo_data_after_client_change();

create or replace function public.fill_missing_client_data_from_rodo()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  -- RODO access alone must not grant administrative client edit permissions.
  if new.klient_id is null or coalesce(public.get_current_user_role(), '') not in ('owner', 'manager', 'admin') then
    return new;
  end if;
  update public.klienci c set
    nazwa = coalesce(nullif(btrim(c.nazwa), ''), nullif(btrim(new.nazwa_klienta), ''), c.nazwa),
    nip = coalesce(nullif(btrim(c.nip), ''), nullif(btrim(new.nip), '')),
    adres_dzialalnosci = coalesce(nullif(btrim(c.adres_dzialalnosci), ''), nullif(btrim(new.siedziba), '')),
    email = coalesce(nullif(btrim(c.email), ''), nullif(btrim(new.email_klienta), ''))
  where c.id = new.klient_id and (
    (nullif(btrim(c.nazwa), '') is null and nullif(btrim(new.nazwa_klienta), '') is not null) or
    (nullif(btrim(c.nip), '') is null and nullif(btrim(new.nip), '') is not null) or
    (nullif(btrim(c.adres_dzialalnosci), '') is null and nullif(btrim(new.siedziba), '') is not null) or
    (nullif(btrim(c.email), '') is null and nullif(btrim(new.email_klienta), '') is not null)
  );
  return new;
end;
$$;
create trigger fill_missing_client_data_from_rodo_trg
after insert or update of klient_id, nazwa_klienta, nip, siedziba, email_klienta
on public.rodo_umowy_powierzenia for each row execute function public.fill_missing_client_data_from_rodo();

revoke all on function public.fill_rodo_data_from_client() from public, anon;
revoke all on function public.fill_missing_rodo_data_after_client_change() from public, anon;
revoke all on function public.fill_missing_client_data_from_rodo() from public, anon;

-- Repair existing linked records without matching names or guessing client links.
update public.rodo_umowy_powierzenia r set
  nazwa_klienta = coalesce(nullif(btrim(r.nazwa_klienta), ''), nullif(btrim(c.nazwa), ''), r.nazwa_klienta),
  nip = coalesce(nullif(btrim(r.nip), ''), nullif(btrim(c.nip), '')),
  siedziba = coalesce(nullif(btrim(r.siedziba), ''), nullif(btrim(c.adres_dzialalnosci), '')),
  email_klienta = coalesce(nullif(btrim(r.email_klienta), ''), nullif(btrim(c.email), '')),
  updated_at = now()
from public.klienci c where c.id = r.klient_id and (
  (nullif(btrim(r.nazwa_klienta), '') is null and nullif(btrim(c.nazwa), '') is not null) or
  (nullif(btrim(r.nip), '') is null and nullif(btrim(c.nip), '') is not null) or
  (nullif(btrim(r.siedziba), '') is null and nullif(btrim(c.adres_dzialalnosci), '') is not null) or
  (nullif(btrim(r.email_klienta), '') is null and nullif(btrim(c.email), '') is not null)
);
