create table public.cfo_harmonogramy_roczne (
  id uuid primary key default gen_random_uuid(),
  nazwa text not null check (length(trim(nazwa)) > 0),
  kontrahent text not null check (length(trim(kontrahent)) > 0),
  kategoria text not null check (kategoria in ('koszty_zespolu','lokal_infrastruktura','systemy_technologia','marketing_sprzedaz','administracja_ogolne','zarzad_wlasciciel','jednorazowe_nadzwyczajne')),
  podkategoria text,
  kwota_netto numeric(14,2) not null check (kwota_netto >= 0),
  kwota_brutto numeric(14,2) not null check (kwota_brutto >= kwota_netto),
  pierwszy_okres date not null check (pierwszy_okres = date_trunc('month',pierwszy_okres)::date),
  data_faktury date not null,
  termin_platnosci date not null,
  aktywny boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);
alter table public.cfo_harmonogramy_roczne enable row level security;
revoke all on public.cfo_harmonogramy_roczne from anon;
grant select, insert, update, delete on public.cfo_harmonogramy_roczne to authenticated;
create policy cfo_annual_schedules_owner_all on public.cfo_harmonogramy_roczne
  for all to authenticated using (public.current_user_role()='owner')
  with check (public.current_user_role()='owner');

alter table public.cfo_koszty add column harmonogram_id uuid references public.cfo_harmonogramy_roczne(id);
create index cfo_koszty_harmonogram_idx on public.cfo_koszty(harmonogram_id) where harmonogram_id is not null;
create index cfo_annual_vendor_idx on public.cfo_harmonogramy_roczne(lower(trim(kontrahent)),kategoria) where aktywny;
create index cfo_annual_created_by_idx on public.cfo_harmonogramy_roczne(created_by);

-- Match only one unambiguous renewal. All reads run with the caller's RLS.
-- Explicit linkage also supports a changed renewal price or supplier spelling.
create function public.cfo_link_annual_cost() returns trigger
language plpgsql set search_path=public as $$
declare
  selected_schedule public.cfo_harmonogramy_roczne%rowtype;
  candidate_ids uuid[];
  year_offset integer;
  document_date date;
begin
  if tg_op='UPDATE' then
    if new.harmonogram_id is not distinct from old.harmonogram_id and new.harmonogram_id is not null then return new; end if;
    if old.harmonogram_id is not null and new.harmonogram_id is null then return new; end if;
  end if;
  document_date := coalesce(new.data_dokumentu,new.okres_start);
  if new.harmonogram_id is null then
    select array_agg(h.id) into candidate_ids
    from public.cfo_harmonogramy_roczne h
    where h.aktywny and lower(trim(h.kontrahent))=lower(trim(new.kontrahent))
      and h.kategoria=new.kategoria and coalesce(h.podkategoria,'')=coalesce(new.podkategoria,'')
      and not new.ignoruj
      and abs(coalesce(new.kwota_brutto,new.kwota_netto_cfo)-h.kwota_brutto)<=greatest(0.01,h.kwota_brutto*0.01)
      and exists (
        select 1 from generate_series(extract(year from document_date)::int-extract(year from h.data_faktury)::int-1,
          extract(year from document_date)::int-extract(year from h.data_faktury)::int+1) y
        where y>=0 and abs(document_date-(h.data_faktury+make_interval(years=>y))::date)<=45
      );
    if coalesce(array_length(candidate_ids,1),0)<>1 then return new; end if;
    new.harmonogram_id := candidate_ids[1];
  end if;
  select * into selected_schedule from public.cfo_harmonogramy_roczne where id=new.harmonogram_id;
  if not found then raise exception 'Nie znaleziono harmonogramu kosztu'; end if;
  select y into year_offset from generate_series(
    extract(year from document_date)::int-extract(year from selected_schedule.data_faktury)::int-1,
    extract(year from document_date)::int-extract(year from selected_schedule.data_faktury)::int+1) y
    order by abs(document_date-(selected_schedule.data_faktury+make_interval(years=>y))::date) limit 1;
  new.okres_start := (selected_schedule.pierwszy_okres+make_interval(years=>year_offset))::date;
  new.okres_end := (new.okres_start+interval '1 year'-interval '1 day')::date;
  new.ujecie_zarzadcze := 'rozliczenie_w_czasie';
  new.czestotliwosc := 'roczna';
  new.termin_platnosci := coalesce(new.termin_platnosci,(selected_schedule.termin_platnosci+make_interval(years=>year_offset))::date);
  return new;
end;
$$;
revoke all on function public.cfo_link_annual_cost() from public, anon;
create trigger cfo_link_annual_cost before insert or update of harmonogram_id,kontrahent,kategoria,podkategoria,data_dokumentu,kwota_brutto,kwota_netto_cfo
on public.cfo_koszty for each row execute function public.cfo_link_annual_cost();

-- Save the schedule and its optional source invoice in one transaction.
create function public.save_cfo_annual_schedule(p_schedule jsonb,p_source_cost_id uuid default null)
returns public.cfo_harmonogramy_roczne language plpgsql set search_path=public as $$
declare saved public.cfo_harmonogramy_roczne%rowtype;
begin
  insert into public.cfo_harmonogramy_roczne(id,nazwa,kontrahent,kategoria,podkategoria,kwota_netto,kwota_brutto,pierwszy_okres,data_faktury,termin_platnosci,aktywny)
  values(coalesce(nullif(p_schedule->>'id','')::uuid,gen_random_uuid()),p_schedule->>'nazwa',p_schedule->>'kontrahent',
    p_schedule->>'kategoria',nullif(p_schedule->>'podkategoria',''),(p_schedule->>'kwota_netto')::numeric,
    (p_schedule->>'kwota_brutto')::numeric,(p_schedule->>'pierwszy_okres')::date,
    (p_schedule->>'data_faktury')::date,(p_schedule->>'termin_platnosci')::date,coalesce((p_schedule->>'aktywny')::boolean,true))
  on conflict(id) do update set nazwa=excluded.nazwa,kontrahent=excluded.kontrahent,kategoria=excluded.kategoria,
    podkategoria=excluded.podkategoria,kwota_netto=excluded.kwota_netto,kwota_brutto=excluded.kwota_brutto,
    pierwszy_okres=excluded.pierwszy_okres,data_faktury=excluded.data_faktury,termin_platnosci=excluded.termin_platnosci,aktywny=excluded.aktywny
  returning * into saved;
  if p_source_cost_id is not null then
    update public.cfo_koszty set harmonogram_id=saved.id where id=p_source_cost_id;
    if not found then raise exception 'Nie znaleziono kosztu źródłowego'; end if;
  end if;
  if saved.aktywny then
    update public.cfo_koszty set kontrahent=kontrahent
    where harmonogram_id is null and lower(trim(kontrahent))=lower(trim(saved.kontrahent));
  end if;
  return saved;
end;
$$;
revoke all on function public.save_cfo_annual_schedule(jsonb,uuid) from public,anon;
grant execute on function public.save_cfo_annual_schedule(jsonb,uuid) to authenticated;
