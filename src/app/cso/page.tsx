"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";
import { supabase } from "@/lib/supabaseClient";

const categories = [
  "Ceny i koszty",
  "Problemy",
  "Porównania i zestawienia",
  "Recenzje",
  "Najlepsze w swojej klasie",
  "Inne",
] as const;

const STORAGE_KEY = "crss-cso-content-plan";

type TopicStatus = "pomysl" | "w_planie" | "opublikowane";
type TopicCategory = typeof categories[number];

const statusOptions: { value: TopicStatus; label: string }[] = [
  { value: "pomysl", label: "Pomysł" },
  { value: "w_planie", label: "W planie" },
  { value: "opublikowane", label: "Opublikowane" },
];

type ContentTopic = {
  id: string;
  category: TopicCategory;
  title: string;
  status: TopicStatus;
  note: string;
};

type DraftTopic = {
  category: TopicCategory;
  title: string;
};

type StoredContentPlan = {
  topics?: ContentTopic[];
  facebookTopics?: Record<string, boolean>;
  blogTopics?: Record<string, boolean>;
};

type ContentTopicRow = {
  id: string;
  category: TopicCategory;
  title: string;
  status: TopicStatus;
  note: string | null;
  facebook_published: boolean | null;
  blog_published: boolean | null;
};

type RawTopic = {
  category: TopicCategory;
  title: string;
};

const rawTopics: RawTopic[] = [
  ...topicGroup("Ceny i koszty", [
    "Ile kosztuje obsługa księgowa spółki z o.o. i od czego zależy cena?",
    "Jakie opłaty dodatkowe mogą pojawić się przy obsłudze spółki?",
    "Dlaczego część firm przepłaca za księgowość?",
    "Czy tanie biuro rachunkowe dla spółki z o.o. może być ryzykiem?",
    "Co powinno być zawarte w cenie miesięcznej obsługi księgowej?",
    "Ile kosztuje zmiana biura rachunkowego w trakcie roku?",
    "Ile kosztują błędy w księgowości spółki z o.o.?",
    "Czy przygotowanie bilansu do leasingu lub kredytu jest dodatkowo płatne?",
    "Ile kosztuje nieuporządkowany obieg dokumentów w spółce?",
    "Czy KSeF zwiększy koszty obsługi księgowej spółki?",
    "Czy dostęp do finansów firmy na żywo powinien być standardem, czy usługą dodatkową?",
    "Kiedy wyższa cena księgowości naprawdę się opłaca?",
    "Tania księgowość dla spółki z o.o.: kiedy oszczędzasz, a kiedy tylko odkładasz koszt na później?",
    "Prawdziwy koszt obsługi spółki z o.o.: czego nie widać w miesięcznym abonamencie?",
    "5 kosztów księgowości, o których właściciel spółki dowiaduje się za późno.",
    "Dlaczego dwie spółki płacą zupełnie inną cenę za księgowość, chociaż wyglądają podobnie?",
    "Czy droższe biuro rachunkowe naprawdę może być tańsze dla spółki?",
    "Ile kosztuje bałagan w dokumentach spółki i dlaczego nie widać tego na fakturze od księgowej?",
    "Księgowość za kilkaset złotych miesięcznie: kiedy ma sens, a kiedy zaczyna być ryzykiem?",
  ]),
  ...topicGroup("Problemy", [
    "Czy jako członek zarządu możesz odpowiadać prywatnym majątkiem za długi spółki?",
    "Kiedy spółka z o.o. naprawdę zaczyna mieć problemy z płynnością?",
    "Dlaczego firmy tracą pieniądze mimo dużych przychodów?",
    "Dlaczego właściciele spółek nie wiedzą, ile naprawdę zarabiają?",
    "Czym są ukryte zyski w Estońskim CIT i za co firmy wpadają najczęściej?",
    "Kiedy Estoński CIT może stać się pułapką?",
    "Czy samochód w spółce może wygenerować problem podatkowy?",
    "Dlaczego zarządy spółek boją się kontroli skarbowej?",
    "Jak przygotować spółkę do KSeF bez chaosu?",
    "Jak uporządkować dokumenty w firmie, żeby nie tonąć w papierach?",
    "Jakie błędy popełniają nowe spółki z o.o. w pierwszych sześciu miesiącach?",
    "Co się dzieje, gdy klient nie dostarcza dokumentów na czas?",
    "Jakie dokumenty najczęściej blokują rozwój firmy?",
    "Dlaczego firmy tracą czas na ręczne procesy księgowe?",
    "Czy pełna księgowość naprawdę musi być skomplikowana?",
    "Czy da się legalnie obniżyć podatek bez kombinowania?",
    "Dlaczego zysk na papierze nie oznacza pieniędzy na koncie?",
    "Co powinien zrobić właściciel, gdy księgowość informuje go o problemie za późno?",
    "5 błędów, przez które właściciel spółki z o.o. może stracić kontrolę nad finansami.",
    "Dlaczego spółka ma przychody, a właściciel nadal nie widzi pieniędzy?",
    "Czy członek zarządu naprawdę może odpowiadać prywatnym majątkiem za długi spółki?",
    "Estoński CIT: świetne rozwiązanie czy kosztowna pułapka dla nieprzygotowanej spółki?",
    "Ukryte zyski w Estońskim CIT: za co spółki wpadają najczęściej?",
    "Samochód w spółce z o.o.: wygoda, optymalizacja czy przyszły problem podatkowy?",
    "KSeF bez przygotowania: jak jeden źle ustawiony proces może sparaliżować obieg dokumentów?",
  ]),
  ...topicGroup("Porównania i zestawienia", [
    "Biuro rachunkowe czy księgowa na etacie. Co lepiej sprawdza się w spółce z o.o.?",
    "Klasyczny CIT czy Estoński CIT. Co bardziej opłaca się spółce?",
    "Tania księgowość czy księgowość z raportowaniem finansowym. Gdzie jest realna różnica?",
    "Pełna księgowość w małej spółce i większej spółce. Co się zmienia?",
    "Biuro rachunkowe online czy biuro z dedykowanym opiekunem. Co wybrać?",
    "Księgowa czy partner finansowy. Czego dziś naprawdę potrzebuje spółka?",
    "Raport miesięczny czy sama informacja o podatkach. Co powinien widzieć właściciel?",
    "Zmiana biura rachunkowego w trakcie roku czy czekanie do końca roku. Co jest bezpieczniejsze?",
    "Księgowość dla e-commerce czy księgowość dla zwykłej firmy usługowej. Czym się różnią?",
    "Obieg dokumentów papierowy czy cyfrowy. Co lepiej przygotowuje firmę do KSeF?",
    "Ręczne procesy księgowe czy automatyzacja. Gdzie spółka traci najwięcej czasu?",
    "Samodzielna analiza finansów czy miesięczny raport od biura. Co daje właścicielowi większą kontrolę?",
    "Biuro rachunkowe kontra księgowa na etacie: co lepiej sprawdza się w spółce z o.o.?",
    "Klasyczny CIT czy Estoński CIT: co naprawdę bardziej opłaca się spółce?",
    "Księgowość online czy dedykowany opiekun: co daje właścicielowi większą kontrolę?",
    "Raport finansowy kontra informacja o podatku do zapłaty: co naprawdę powinien dostawać właściciel?",
    "Zmiana biura rachunkowego w trakcie roku czy czekanie do stycznia: co jest bezpieczniejsze?",
    "E-commerce kontra zwykła firma usługowa: dlaczego księgowość nie powinna wyglądać tak samo?",
    "Pełna księgowość kontra uproszczone myślenie właściciela: gdzie najczęściej powstaje problem?",
  ]),
  ...topicGroup("Recenzje", [
    "Po czym poznać, że biuro rachunkowe naprawdę dobrze obsługuje spółki z o.o.?",
    "Jak sprawdzić opinie o biurze rachunkowym przed podpisaniem umowy?",
    "Jak wygląda dobra współpraca z biurem rachunkowym w praktyce?",
    "Co powinno wzbudzić niepokój przy wyborze biura rachunkowego?",
    "Jak wygląda miesięczna obsługa spółki z perspektywy klienta?",
    "Czy dedykowany opiekun księgowy realnie poprawia jakość współpracy?",
    "Jak biuro rachunkowe powinno reagować na braki w dokumentacji?",
    "Jakie pytania warto zadać obecnym klientom biura rachunkowego?",
    "Czy opinie w internecie wystarczą do wyboru biura rachunkowego?",
    "Jak rozpoznać, że biuro rachunkowe nie tylko księguje, ale też pilnuje bezpieczeństwa spółki?",
    "Co powinno znaleźć się w dobrej rekomendacji biura rachunkowego?",
    "Jak wygląda nowoczesne biuro rachunkowe od środka?",
    "Szczera recenzja współpracy z biurem rachunkowym: po czym poznać, że firma jest dobrze obsługiwana?",
    "Jak sprawdzić biuro rachunkowe przed podpisaniem umowy i nie opierać się tylko na opiniach z internetu?",
    "5 sygnałów, że Twoje biuro rachunkowe nie rozumie specyfiki spółek z o.o.",
    "Jak wygląda dobra miesięczna obsługa spółki od środka?",
    "Czy dedykowany opiekun księgowy naprawdę coś zmienia, czy to tylko ładna obietnica?",
    "Po czym poznać, że biuro rachunkowe działa odpowiedzialnie, zanim pojawi się pierwszy problem?",
    "Jakie pytania zadać biuru rachunkowemu, zanim powierzysz mu spółkę?",
  ]),
  ...topicGroup("Najlepsze w swojej klasie", [
    "Jak wybrać najlepsze biuro rachunkowe dla spółki z o.o.?",
    "Jakie biuro rachunkowe najlepiej sprawdzi się przy szybko rosnącej spółce?",
    "Jakie biuro rachunkowe będzie najlepsze dla e-commerce?",
    "Jaki raport finansowy powinien dostawać właściciel spółki co miesiąc?",
    "Jakie wskaźniki powinien znać każdy właściciel spółki?",
    "Jak najlepiej przygotować spółkę do KSeF?",
    "Jak najlepiej uporządkować obieg dokumentów w spółce?",
    "Jakie rozwiązanie księgowe jest najlepsze dla spółki, która planuje leasing lub kredyt?",
    "Jakie biuro rachunkowe najlepiej obsłuży spółkę na Estońskim CIT?",
    "Jakie narzędzia najlepiej pomagają właścicielowi kontrolować finanse spółki?",
    "Jaki model współpracy z biurem rachunkowym daje właścicielowi najwięcej spokoju?",
    "Jak wygląda najlepsza księgowość dla właściciela, który chce podejmować decyzje na podstawie danych?",
    "Najlepsze biuro rachunkowe dla spółki z o.o.: według jakich kryteriów warto je wybrać?",
    "Najlepsza księgowość dla spółki na Estońskim CIT: co musi być dopilnowane?",
    "Najlepszy raport miesięczny dla właściciela spółki: co powinno się w nim znaleźć?",
    "Najlepszy sposób na przygotowanie spółki do KSeF bez chaosu i nerwów.",
    "Najlepszy model współpracy z biurem rachunkowym dla szybko rosnącej spółki.",
    "Najlepsze wskaźniki finansowe dla właściciela spółki: co warto znać co miesiąc?",
    "Najlepsza księgowość to nie tylko księgowanie faktur. Co powinna dawać właścicielowi?",
  ]),
  ...topicGroup("Inne", [
    "Jak w praktyce wygląda miesięczna obsługa księgowa spółki?",
    "Jakie formalności trzeba wykonać na początku współpracy z biurem rachunkowym?",
    "Co należy do comiesięcznych obowiązków klienta?",
    "Jak wygląda przekazywanie dokumentów między spółką a biurem rachunkowym?",
    "Czy biuro rachunkowe pomaga uporządkować dokumenty na starcie współpracy?",
    "Jak wygląda zmiana biura rachunkowego w trakcie roku?",
    "Jak szybko można przygotować bilans do leasingu lub kredytu?",
    "Co powinien widzieć właściciel firmy w miesięcznym raporcie finansowym?",
    "Czy właściciel spółki powinien mieć dostęp do finansów firmy na bieżąco?",
    "Jak przygotować firmę na nagły wzrost sprzedaży?",
    "Czy księgowość może pomagać właścicielowi zarabiać więcej?",
    "Jak wygląda komunikacja z biurem rachunkowym, gdy pojawia się pilny problem?",
    "Jak wygląda pierwszy miesiąc współpracy z biurem rachunkowym dla spółki z o.o.?",
    "Co musi przygotować właściciel spółki, zanim zmieni biuro rachunkowe?",
    "Jakie dokumenty najczęściej blokują sprawną obsługę spółki?",
    "Czy właściciel spółki powinien mieć dostęp do finansów na bieżąco?",
    "Co powinno się wydarzyć, gdy w dokumentach spółki brakuje ważnych informacji?",
    "Jak przygotować spółkę do leasingu lub kredytu, żeby nie robić wszystkiego na ostatnią chwilę?",
    "Dlaczego księgowość powinna pomagać właścicielowi podejmować decyzje, a nie tylko liczyć podatki?",
  ]),
];

function topicGroup(category: TopicCategory, titles: string[]): RawTopic[] {
  return titles.map((title) => ({ category, title }));
}

function createInitialTopics(): ContentTopic[] {
  return rawTopics.map((topic, index) => ({
    id: `topic-${index + 1}`,
    category: topic.category,
    title: topic.title,
    status: "pomysl",
    note: "",
  }));
}

function createEmptyDraft(): DraftTopic {
  return {
    category: categories[0],
    title: "",
  };
}

function readSavedPlan(): StoredContentPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const savedPlan = window.localStorage.getItem(STORAGE_KEY);
    return savedPlan ? JSON.parse(savedPlan) as StoredContentPlan : null;
  } catch {
    return null;
  }
}

function mergeSavedTopics(initialTopics: ContentTopic[], savedTopics: ContentTopic[]) {
  const initialById = new Map(initialTopics.map((topic) => [topic.id, topic]));
  const savedById = new Map(savedTopics.map((topic) => [topic.id, topic]));
  const mergedInitialTopics = initialTopics.map((topic) => ({ ...topic, ...savedById.get(topic.id) }));
  const customTopics = savedTopics.filter((topic) => !initialById.has(topic.id));
  return [...customTopics, ...mergedInitialTopics];
}

function rowToTopic(row: ContentTopicRow): ContentTopic {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    status: row.status,
    note: row.note || "",
  };
}

async function persistTopic(topic: ContentTopic, facebookPublished: boolean, blogPublished: boolean) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id || null;
  const result = await supabase
    .from("cso_content_topics")
    .upsert({
      id: topic.id,
      category: topic.category,
      title: topic.title,
      status: topic.status,
      note: topic.note,
      facebook_published: facebookPublished,
      blog_published: blogPublished,
      updated_by: userId,
      created_by: userId,
    }, { onConflict: "id" });

  if (result.error) {
    console.error("Błąd zapisu planu contentowego:", result.error);
  }
}

export default function CsoPage() {
  return (
    <AppLayout activePage="cso">
      <AccessGuard moduleName="cso">
        <CsoContent />
      </AccessGuard>
    </AppLayout>
  );
}

function CsoContent() {
  const [categoryFilter, setCategoryFilter] = useState<TopicCategory | "Wszystkie">("Wszystkie");
  const [statusFilter, setStatusFilter] = useState<TopicStatus | "Wszystkie">("Wszystkie");
  const [topics, setTopics] = useState<ContentTopic[]>(createInitialTopics);
  const [facebookTopics, setFacebookTopics] = useState<Record<string, boolean>>({});
  const [blogTopics, setBlogTopics] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<DraftTopic>(() => createEmptyDraft());
  const [noteTopicId, setNoteTopicId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadContentPlan();
  }, []);

  async function loadContentPlan() {
    const savedPlan = readSavedPlan();
    const initialTopics = createInitialTopics();
    let localTopics = initialTopics;
    let localFacebookTopics: Record<string, boolean> = {};
    let localBlogTopics: Record<string, boolean> = {};

    if (savedPlan) {
      localTopics = mergeSavedTopics(initialTopics, savedPlan.topics || []);
      localFacebookTopics = savedPlan.facebookTopics || {};
      localBlogTopics = savedPlan.blogTopics || {};
      setTopics(localTopics);
      setFacebookTopics(localFacebookTopics);
      setBlogTopics(localBlogTopics);
    }

    const result = await supabase
      .from("cso_content_topics")
      .select("id, category, title, status, note, facebook_published, blog_published")
      .order("created_at", { ascending: true });

    if (result.error) {
      console.error("Błąd pobierania planu contentowego:", result.error);
      setIsReady(true);
      return;
    }

    const rows = (result.data || []) as ContentTopicRow[];
    if (rows.length > 0) {
      const remoteTopics = rows.map(rowToTopic);
      setTopics(mergeSavedTopics(initialTopics, remoteTopics));
      setFacebookTopics(rows.reduce<Record<string, boolean>>((acc, row) => ({ ...acc, [row.id]: Boolean(row.facebook_published) }), {}));
      setBlogTopics(rows.reduce<Record<string, boolean>>((acc, row) => ({ ...acc, [row.id]: Boolean(row.blog_published) }), {}));
    } else if (savedPlan) {
      await Promise.all(localTopics.map((topic) => persistTopic(topic, Boolean(localFacebookTopics[topic.id]), Boolean(localBlogTopics[topic.id]))));
    }

    setIsReady(true);
  }

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ topics, facebookTopics, blogTopics }));
  }, [blogTopics, facebookTopics, isReady, topics]);

  const filteredTopics = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return topics.filter((topic) => {
      const matchesCategory = categoryFilter === "Wszystkie" || topic.category === categoryFilter;
      const matchesStatus = statusFilter === "Wszystkie" || topic.status === statusFilter;
      const matchesSearch = !query || [topic.category, topic.title, topic.note].join(" ").toLowerCase().includes(query);
      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [categoryFilter, searchQuery, statusFilter, topics]);

  const noteTopic = noteTopicId ? topics.find((topic) => topic.id === noteTopicId) : null;

  function updateTopic(id: string, patch: Partial<ContentTopic>) {
    const currentTopic = topics.find((topic) => topic.id === id);
    if (!currentTopic) return;
    const nextTopic = { ...currentTopic, ...patch };
    setTopics((current) => current.map((topic) => topic.id === id ? nextTopic : topic));
    persistTopic(nextTopic, Boolean(facebookTopics[id]), Boolean(blogTopics[id]));
  }

  function toggleChecked(kind: "facebook" | "blog", id: string) {
    const setter = kind === "facebook" ? setFacebookTopics : setBlogTopics;
    const currentMap = kind === "facebook" ? facebookTopics : blogTopics;
    const nextValue = !currentMap[id];
    setter((current) => ({ ...current, [id]: nextValue }));
    const topic = topics.find((item) => item.id === id);
    if (!topic) return;
    persistTopic(topic, kind === "facebook" ? nextValue : Boolean(facebookTopics[id]), kind === "blog" ? nextValue : Boolean(blogTopics[id]));
  }

  function addTopic() {
    const title = draft.title.trim();
    if (!title) {
      alert("Wpisz temat do planu.");
      return;
    }

    const id = `topic-${Date.now()}`;
    const topic: ContentTopic = {
      id,
      category: draft.category,
      title,
      status: "pomysl",
      note: "",
    };
    setTopics((current) => [topic, ...current]);
    persistTopic(topic, false, false);
    setNoteTopicId(id);
    setDraft(createEmptyDraft());
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Zarządzanie</p>
          <h1 style={titleStyle}>CSO</h1>
          <p style={subtitleStyle}>Planowanie tematów i notatek do materiałów marketingowych CRSS.</p>
        </div>
        <div style={headerStatsStyle}>
          <Summary label="Tematy" value={topics.length} />
          <Summary label="Opublikowane" value={topics.filter((topic) => topic.status === "opublikowane").length} />
        </div>
      </section>

      <section style={panelStyle}>
        <div style={panelHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Plan contentowy</h2>
            <p style={hintStyle}>Dodawaj tematy, oznaczaj publikację na FB i Blogu oraz zapisuj notatki robocze pod przyciskiem po prawej stronie.</p>
          </div>
          <div style={filtersRowStyle}>
            <select style={filterStyle} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as TopicCategory | "Wszystkie")}>
              <option>Wszystkie</option>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <select style={filterStyle} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TopicStatus | "Wszystkie")}>
              <option value="Wszystkie">Wszystkie statusy</option>
              {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>
        </div>

        <input
          style={searchInputStyle}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Szukaj po temacie, kategorii lub notatce"
        />

        <div style={addPanelStyle}>
          <select style={inputStyle} value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as TopicCategory }))}>
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
          <input style={inputStyle} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Nowy temat" />
          <button style={primaryButtonStyle} onClick={addTopic}>Dodaj temat</button>
        </div>

        <div style={tableShellStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Kategoria</Th>
                <Th compact>FB</Th>
                <Th compact>Blog</Th>
                <Th>Temat</Th>
                <Th>Status</Th>
                <Th>Akcje</Th>
              </tr>
            </thead>
            <tbody>
              {filteredTopics.map((topic) => (
                <tr key={topic.id} style={rowStyle}>
                  <Td><Badge>{topic.category}</Badge></Td>
                  <Td compact>
                    <ChannelCheckbox checked={Boolean(facebookTopics[topic.id])} label="FB" onChange={() => toggleChecked("facebook", topic.id)} />
                  </Td>
                  <Td compact>
                    <ChannelCheckbox checked={Boolean(blogTopics[topic.id])} label="Blog" onChange={() => toggleChecked("blog", topic.id)} />
                  </Td>
                  <Td strong>{topic.title}</Td>
                  <Td>
                    <select style={{ ...smallSelectStyle, ...statusStyle(topic.status) }} value={topic.status} onChange={(event) => updateTopic(topic.id, { status: event.target.value as TopicStatus })}>
                      {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </Td>
                  <Td><button style={secondaryButtonStyle} onClick={() => setNoteTopicId(topic.id)}>Notatka</button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {noteTopic && <TopicNoteDialog topic={noteTopic} onClose={() => setNoteTopicId(null)} onChange={(note) => updateTopic(noteTopic.id, { note })} />}
    </>
  );
}

function ChannelCheckbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label style={checkboxLabelStyle} title={label}>
      <input type="checkbox" checked={checked} onChange={onChange} style={checkboxInputStyle} />
    </label>
  );
}

function TopicNoteDialog({ topic, onClose, onChange }: { topic: ContentTopic; onClose: () => void; onChange: (note: string) => void }) {
  return (
    <div style={overlayStyle}>
      <section style={dialogStyle}>
        <div style={detailsHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Notatka</p>
            <h3 style={detailsTitleStyle}>{topic.title}</h3>
          </div>
          <button style={secondaryButtonStyle} onClick={onClose}>Zamknij</button>
        </div>
        <Badge>{topic.category}</Badge>
        <div style={noteBoxStyle}>
          <label style={labelStyle}>Notatka do tematu</label>
          <textarea
            style={textareaStyle}
            value={topic.note}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Wpisz robocze założenia, linki, pomysły, strukturę wpisu albo uwagi do przygotowania materiału."
          />
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div style={summaryStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function Th({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return <th style={{ ...thStyle, width: compact ? "72px" : undefined, textAlign: compact ? "center" : "left" }}>{children}</th>;
}

function Td({ children, strong, compact }: { children: ReactNode; strong?: boolean; compact?: boolean }) {
  return <td style={{ ...tdStyle, width: compact ? "72px" : undefined, textAlign: compact ? "center" : "left", fontWeight: strong ? 800 : 600 }}>{children}</td>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span style={badgeStyle}>{children}</span>;
}

function statusStyle(status: TopicStatus): CSSProperties {
  if (status === "w_planie") return { background: "#eef5ff", borderColor: "#bdd3f2", color: colors.navy };
  if (status === "opublikowane") return { background: "#d8f5df", borderColor: "#a8e3b7", color: colors.success };
  return { background: colors.white, borderColor: colors.border, color: colors.text };
}

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap" };
const eyebrowStyle: CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850 };
const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.05 };
const subtitleStyle: CSSProperties = { margin: "12px 0 0", color: colors.muted, fontSize: "17px", lineHeight: 1.65, maxWidth: "760px" };
const headerStatsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(135px, 1fr))", gap: "12px", minWidth: "300px" };
const summaryStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, padding: "15px", display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 800, boxShadow: shadow.soft };
const panelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "26px", boxShadow: shadow.soft };
const panelHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", marginBottom: "18px", flexWrap: "wrap" };
const filtersRowStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const hintStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.65 };
const filterStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, color: colors.text, padding: "11px 14px", fontWeight: 750, minWidth: "210px" };
const searchInputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "12px 14px", fontWeight: 700, minHeight: "44px", width: "100%", marginBottom: "14px" };
const addPanelStyle: CSSProperties = { display: "grid", gridTemplateColumns: "220px minmax(260px, 1fr) auto", gap: "10px", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", marginBottom: "18px" };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "10px 12px", fontWeight: 700, minHeight: "42px", width: "100%" };
const primaryButtonStyle: CSSProperties = { border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, padding: "11px 15px", minHeight: "42px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "9px 12px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const tableShellStyle: CSSProperties = { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", padding: "13px 14px", color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}` };
const tdStyle: CSSProperties = { padding: "14px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle" };
const rowStyle: CSSProperties = { background: colors.white };
const smallSelectStyle: CSSProperties = { ...inputStyle, minWidth: "145px" };
const badgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: radius.badge, padding: "6px 10px", background: "rgba(23, 59, 115, 0.10)", color: colors.navy, fontSize: "12px", fontWeight: 850, whiteSpace: "nowrap" };
const checkboxLabelStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: radius.badge, background: colors.inputBackground, border: `1px solid ${colors.border}`, cursor: "pointer" };
const checkboxInputStyle: CSSProperties = { width: "17px", height: "17px", accentColor: colors.red, cursor: "pointer" };
const overlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 50, background: "rgba(5, 15, 35, 0.32)", display: "flex", justifyContent: "flex-end", padding: "28px" };
const dialogStyle: CSSProperties = { width: "min(620px, 100%)", height: "100%", overflowY: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "22px", boxShadow: shadow.soft };
const detailsHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", marginBottom: "14px" };
const detailsTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "22px", lineHeight: 1.25 };
const noteBoxStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", marginTop: "14px" };
const labelStyle: CSSProperties = { display: "block", color: colors.text, fontWeight: 850, marginBottom: "8px" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: "430px", resize: "vertical", lineHeight: 1.55, fontWeight: 650 };
