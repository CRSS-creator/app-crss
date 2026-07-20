# Dokumentacja kontrolna: SearXNG w procesie PEP OSINT

## Cel wdrożenia

SearXNG jest wykorzystywany jako prywatna wyszukiwarka metasearch w pomocniczym procesie sprawdzania PEP OSINT w module AML. Narzędzie nie jest oficjalną bazą PEP i nie zastępuje specjalistycznego screeningu u dostawcy danych sankcyjnych/PEP. Jego rolą jest zebranie publicznie dostępnych wyników internetowych, które następnie są oceniane przez asystenta AI w workflow n8n.

## Zakres procesu

Proces obejmuje beneficjentów rzeczywistych zapisanych przy kliencie AML. Aplikacja przekazuje do n8n podstawowe dane osoby: imię i nazwisko, rolę, nazwę klienta oraz kraj, jeśli jest dostępny. n8n generuje zapytania internetowe dotyczące PEP, funkcji publicznych i domen instytucjonalnych, a SearXNG zwraca wyniki wyszukiwania w formacie JSON.

Asystent AI analizuje wyłącznie przekazane wyniki wyszukiwania i zwraca ocenę w formie:

- `ok` - brak przesłanek PEP w sprawdzonych źródłach,
- `warning` - znaleziono potencjalne przesłanki albo wynik wymaga analizy,
- `error` - nie udało się przeprowadzić sprawdzenia.

## Architektura

Elementy procesu:

- aplikacja CRSS, moduł AML,
- webhook n8n `aml-pep-osint`,
- prywatna instancja SearXNG uruchomiona w Dockerze,
- OpenAI w n8n jako komponent oceny wyników,
- Supabase jako miejsce zapisu wyniku PEP OSINT w rejestrze AML.

Przepływ:

1. Użytkownik w module AML klika `Sprawdź PEP OSINT`.
2. Aplikacja wysyła dane beneficjentów do produkcyjnego webhooka n8n.
3. n8n tworzy zapytania wyszukiwania.
4. n8n odpytuje prywatną instancję SearXNG.
5. n8n przekazuje wyniki do OpenAI z instrukcją AML/PEP.
6. n8n zwraca do aplikacji ustandaryzowany JSON.
7. Aplikacja zapisuje wynik w AML i historii klienta.

## Konfiguracja techniczna

Konfiguracja SearXNG znajduje się w repozytorium:

- `infra/searxng/docker-compose.yml`,
- `infra/searxng/settings.yml`,
- `infra/searxng/.env.example`,
- `infra/searxng/README.md`.

Domyślna konfiguracja:

- kontener: `app-crss-searxng`,
- port wewnętrzny: `8080`,
- format odpowiedzi JSON włączony w `settings.yml`,
- instancja przeznaczona do użytku prywatnego przez n8n.

Workflow n8n jest opisany w:

- `docs/aml-pep-osint-n8n.md`.

## Źródła sprawdzane przez workflow

Workflow generuje zapytania dla każdej osoby m.in. według wzorców:

- imię i nazwisko + `PEP`,
- imię i nazwisko + `osoba politycznie eksponowana`,
- imię i nazwisko + funkcje publiczne, np. minister, poseł, senator, prezydent, burmistrz, wojewoda,
- wyniki z domen `gov.pl`,
- wyniki z domen `sejm.gov.pl`,
- wyniki z domen `senat.gov.pl`,
- wyniki z domen `europarl.europa.eu`,
- imię i nazwisko + nazwa klienta.

Lista faktycznie sprawdzonych źródeł/linków jest zapisywana w wyniku PEP OSINT jako `checkedSources` albo wyprowadzana z linków zwróconych przy ustaleniach `findings`.

## Dane zapisywane w module AML

Wynik PEP OSINT jest zapisywany przy kliencie w rejestrze AML, w danych rejestrowych jako `pepOsint`.

Zapisywane są:

- status sprawdzenia,
- opis wyniku,
- data i godzina sprawdzenia,
- osoby sprawdzane,
- ustalenia dla każdej osoby,
- linki do źródeł,
- opis metodyki,
- informacja, że wynik ma charakter pomocniczy.

W historii AML powstaje wpis `sprawdzenie_pep_osint` z datą, użytkownikiem i wynikiem.

## Ograniczenia

SearXNG nie jest bazą PEP. Jest narzędziem do pobierania publicznych wyników wyszukiwania z różnych wyszukiwarek. Wynik zależy od dostępności publicznych źródeł, jakości zapytań, dostępności wyszukiwarek źródłowych oraz możliwych ograniczeń antybotowych po stronie zewnętrznych wyszukiwarek.

Proces PEP OSINT:

- nie stanowi urzędowego potwierdzenia statusu PEP,
- nie gwarantuje kompletności danych,
- nie zastępuje ręcznej oceny w przypadku wyniku `warning`,
- nie powinien być jedyną podstawą decyzji w sprawach podwyższonego ryzyka.

## Bezpieczeństwo i prywatność

Instancja SearXNG jest przeznaczona do użytku prywatnego i nie powinna być publicznie dostępna bez dodatkowej ochrony. Zalecane jest ograniczenie dostępu do sieci wewnętrznej Dockera albo do wybranych adresów IP.

Do SearXNG trafiają wyłącznie zapytania niezbędne do sprawdzenia publicznych źródeł, zwykle imię i nazwisko beneficjenta oraz kontekst klienta. Nie należy wysyłać do wyszukiwarki numeru PESEL ani innych nadmiarowych danych identyfikacyjnych.

## Podstawy techniczne narzędzia

SearXNG jest wolnym, samo-hostowanym silnikiem metawyszukiwarki. Oficjalna dokumentacja opisuje go jako narzędzie agregujące wyniki z wielu usług wyszukiwania, bez profilowania użytkowników. Dokumentacja instalacji i konfiguracji jest dostępna w oficjalnych materiałach projektu:

- https://docs.searxng.org/
- https://docs.searxng.org/admin/installation-docker.html
- https://docs.searxng.org/admin/settings/settings.html

## Procedura eksploatacyjna

Podstawowe komendy na serwerze:

```bash
cd /var/www/app-crss/infra/searxng
docker-compose ps
docker-compose logs --tail=100
docker-compose up -d
docker-compose restart
```

Test działania:

```bash
curl "http://127.0.0.1:8080/search?q=Jan%20Kowalski%20PEP&format=json&language=pl"
```

Jeżeli n8n działa w kontenerze Docker, zalecane jest odpytywanie SearXNG po nazwie kontenera w tej samej sieci Dockera:

```text
http://app-crss-searxng:8080/search
```

## Reakcja na wyniki

Wynik `ok` oznacza brak widocznych przesłanek w sprawdzonych publicznych wynikach wyszukiwania.

Wynik `warning` wymaga analizy przez użytkownika AML. Użytkownik powinien sprawdzić linki źródłowe i ocenić, czy znalezione informacje dotyczą tej samej osoby oraz czy wskazują na funkcję publiczną, relację rodzinną albo bliską współpracę z osobą PEP.

Wynik `error` oznacza brak skutecznego sprawdzenia. W takim przypadku należy ponowić sprawdzenie albo przeprowadzić alternatywną weryfikację.

## Wersjonowanie

Dokument dotyczy konfiguracji wdrożonej w repozytorium aplikacji CRSS po dodaniu workflow PEP OSINT z użyciem n8n, SearXNG i OpenAI. Zmiany w konfiguracji SearXNG lub workflow n8n powinny być odnotowywane w repozytorium albo w dokumentacji operacyjnej AML.
