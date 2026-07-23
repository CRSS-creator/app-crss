update public.aml_weryfikacje
set
  status = 'completed',
  zrodla = (
    select coalesce(jsonb_agg(
      case
        when lower(coalesce(source_item->>'source', '')) = 'crbr'
          then source_item || jsonb_build_object('status', 'confirmed')
        else source_item
      end
    ), '[]'::jsonb)
    from jsonb_array_elements(coalesce(to_jsonb(zrodla), '[]'::jsonb)) as source_item
  ),
  dane = coalesce(to_jsonb(dane), '{}'::jsonb) - 'archiwalny'
where wynik = 'pdf_crbr';

update public.aml_historia
set zmiany = coalesce(to_jsonb(zmiany), '{}'::jsonb) - 'archiwalny'
where akcja = 'dodano_pdf_crbr';