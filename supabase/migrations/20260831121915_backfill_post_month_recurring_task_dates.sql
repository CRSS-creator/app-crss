update public.zadania_cykliczne_realizacje realization
set termin = public.recurring_task_due_date_for_template(
  realization.okres,
  template.dzien_miesiaca,
  case when template.czestotliwosc = 'roczne' then template.miesiac_roczny else null end,
  template.tytul
)
from public.zadania_cykliczne template
where realization.zadanie_cykliczne_id = template.id
  and template.tytul = any(array[
    'Przesłanie informacji o nierozliczonych rozrachunkach i fakturach',
    'Sprawdzenie sald kont księgowych'
  ])
  and realization.status in ('do_zrobienia', 'w_trakcie')
  and realization.okres >= date '2026-08-01'
  and realization.termin is distinct from public.recurring_task_due_date_for_template(
    realization.okres,
    template.dzien_miesiaca,
    case when template.czestotliwosc = 'roczne' then template.miesiac_roczny else null end,
    template.tytul
  );
