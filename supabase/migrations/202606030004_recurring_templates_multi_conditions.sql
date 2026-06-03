alter table public.zadania_cykliczne
  add column if not exists formy_prawne text[] null,
  add column if not exists formy_opodatkowania text[] null,
  add column if not exists wymaga_czynnego_vat boolean null;

update public.zadania_cykliczne
set forma_prawna = case
    when lower(coalesce(forma_prawna, '')) in ('spółka cywilna', 'spolka cywilna', 'inna', 'inne') then 'organizacja'
    when lower(coalesce(forma_prawna, '')) in ('psa', 'prosta spolka akcyjna', 'prosta spółka akcyjna') then 'prosta spółka akcyjna'
    when lower(coalesce(forma_prawna, '')) in ('sp. z o.o.', 'sp z oo', 'spółka z o.o.', 'spolka z o.o.', 'sp zoo') then 'spółka z o.o.'
    when upper(coalesce(forma_prawna, '')) = 'JDG' then 'JDG'
    else forma_prawna
  end,
  forma_opodatkowania = case
    when forma_opodatkowania in ('Karta podatkowa', 'Inne') then null
    else forma_opodatkowania
  end;

update public.zadania_cykliczne
set formy_prawne = case
    when formy_prawne is not null then formy_prawne
    when forma_prawna is not null then array[forma_prawna]
    else null
  end,
  formy_opodatkowania = case
    when formy_opodatkowania is not null then formy_opodatkowania
    when forma_opodatkowania is not null then array[forma_opodatkowania]
    else null
  end;

update public.zadania_cykliczne
set formy_prawne = case
    when formy_prawne is null then null
    else (
      select nullif(array_agg(distinct normalized), '{}')
      from unnest(formy_prawne) as raw(value)
      cross join lateral (
        select case
          when lower(coalesce(raw.value, '')) in ('spółka cywilna', 'spolka cywilna', 'inna', 'inne') then 'organizacja'
          when lower(coalesce(raw.value, '')) in ('psa', 'prosta spolka akcyjna', 'prosta spółka akcyjna') then 'prosta spółka akcyjna'
          when lower(coalesce(raw.value, '')) in ('sp. z o.o.', 'sp z oo', 'spółka z o.o.', 'spolka z o.o.', 'sp zoo') then 'spółka z o.o.'
          when upper(coalesce(raw.value, '')) = 'JDG' then 'JDG'
          else raw.value
        end as normalized
      ) normalized_values
      where normalized is not null and normalized <> ''
    )
  end,
  formy_opodatkowania = case
    when formy_opodatkowania is null then null
    else (
      select nullif(array_agg(distinct value), '{}')
      from unnest(formy_opodatkowania) as raw(value)
      where value is not null and value <> '' and value not in ('Karta podatkowa', 'Inne')
    )
  end;
