"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";

const categories = [
  "Ceny i koszty",
  "Problemy",
  "Porównania i zestawienia",
  "Recenzje",
  "Najlepsze w swojej klasie",
  "Inne",
] as const;

type TopicStatus = "pomysl" | "w_planie" | "opublikowane";
type TopicCategory = typeof categories[number];

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
  const [topics, setTopics] = useState<ContentTopic[]>(createInitialTopics);
  const [draft, setDraft] = useState<DraftTopic>(() => createEmptyDraft());
  const [selectedTopicId, setSelectedTopicId] = useState("topic-1");

  const filteredTopics = useMemo(() => {
    if (categoryFilter === "Wszystkie") return topics;
    return topics.filter((topic) => topic.category === categoryFilter);
  }, [categoryFilter, topics]);

  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) ?? filteredTopics[0] ?? topics[0];

  function updateTopic(id: string, patch: Partial<ContentTopic>) {
    setTopics((current) => current.map((topic) => topic.id === id ? { ...topic, ...patch } : topic));
  }

  function addTopic() {
    const title = draft.title.trim();
    if (!title) {
      alert("Wpisz temat do planu.");
      return;
    }

    const id = `topic-${Date.now()}`;
    setTopics((current) => [
      {
        id,
        category: draft.category,
        title,
        status: "pomysl",
        note: "",
      },
      ...current,
    ]);
    setSelectedTopicId(id);
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
            <p style={hintStyle}>Dodawaj tematy, wybieraj kategorię i zapisuj notatki robocze do każdego tematu.</p>
          </div>
          <select style={filterStyle} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as TopicCategory | "Wszystkie")}>
            <option>Wszystkie</option>
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </div>

        <div style={addPanelStyle}>
          <select style={inputStyle} value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as TopicCategory }))}>
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
          <input style={inputStyle} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Nowy temat" />
          <button style={primaryButtonStyle} onClick={addTopic}>Dodaj temat</button>
        </div>

        <div style={plannerGridStyle}>
          <div style={tableShellStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Kategoria</Th>
                  <Th>Temat</Th>
                  <Th>Status</Th>
                  <Th>Notatka</Th>
                  <Th>Akcje</Th>
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map((topic) => (
                  <tr key={topic.id} style={topic.id === selectedTopic?.id ? selectedRowStyle : rowStyle}>
                    <Td><Badge>{topic.category}</Badge></Td>
                    <Td strong>{topic.title}</Td>
                    <Td>
                      <select style={smallSelectStyle} value={topic.status} onChange={(event) => updateTopic(topic.id, { status: event.target.value as TopicStatus })}>
                        <option value="pomysl">Pomysł</option>
                        <option value="w_planie">W planie</option>
                        <option value="opublikowane">Opublikowane</option>
                      </select>
                    </Td>
                    <Td>{topic.note ? <span style={notePreviewStyle}>{topic.note}</span> : <span style={mutedStyle}>Brak notatki</span>}</Td>
                    <Td><button style={secondaryButtonStyle} onClick={() => setSelectedTopicId(topic.id)}>Notatka</button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedTopic && <TopicNote topic={selectedTopic} onChange={(note) => updateTopic(selectedTopic.id, { note })} />}
        </div>
      </section>
    </>
  );
}

function TopicNote({ topic, onChange }: { topic: ContentTopic; onChange: (note: string) => void }) {
  return (
    <aside style={detailsStyle}>
      <div style={detailsHeaderStyle}>
        <div>
          <p style={eyebrowStyle}>Notatka</p>
          <h3 style={detailsTitleStyle}>{topic.title}</h3>
        </div>
        <Badge>{topic.category}</Badge>
      </div>

      <div style={noteBoxStyle}>
        <label style={labelStyle}>Notatka do tematu</label>
        <textarea
          style={textareaStyle}
          value={topic.note}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Wpisz robocze założenia, linki, pomysły, strukturę wpisu albo uwagi do przygotowania materiału."
        />
      </div>
    </aside>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div style={summaryStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function Th({ children }: { children: ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong }: { children: ReactNode; strong?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 600 }}>{children}</td>; }
function Badge({ children }: { children: ReactNode }) { return <span style={badgeStyle}>{children}</span>; }

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap" };
const eyebrowStyle: CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850 };
const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.05 };
const subtitleStyle: CSSProperties = { margin: "12px 0 0", color: colors.muted, fontSize: "17px", lineHeight: 1.65, maxWidth: "760px" };
const headerStatsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(135px, 1fr))", gap: "12px", minWidth: "300px" };
const summaryStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, padding: "15px", display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 800, boxShadow: shadow.soft };
const panelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "26px", boxShadow: shadow.soft };
const panelHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", marginBottom: "18px", flexWrap: "wrap" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const hintStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.65 };
const filterStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, color: colors.text, padding: "11px 14px", fontWeight: 750, minWidth: "210px" };
const addPanelStyle: CSSProperties = { display: "grid", gridTemplateColumns: "220px minmax(260px, 1fr) auto", gap: "10px", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", marginBottom: "18px" };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "10px 12px", fontWeight: 700, minHeight: "42px", width: "100%" };
const primaryButtonStyle: CSSProperties = { border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, padding: "11px 15px", minHeight: "42px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "9px 12px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const plannerGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(360px, 0.9fr)", gap: "18px", alignItems: "start" };
const tableShellStyle: CSSProperties = { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", padding: "13px 14px", color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}` };
const tdStyle: CSSProperties = { padding: "14px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "top" };
const rowStyle: CSSProperties = { background: colors.white };
const selectedRowStyle: CSSProperties = { background: "rgba(23, 59, 115, 0.06)" };
const smallSelectStyle: CSSProperties = { ...inputStyle, minWidth: "145px" };
const badgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: radius.badge, padding: "6px 10px", background: "rgba(23, 59, 115, 0.10)", color: colors.navy, fontSize: "12px", fontWeight: 850, whiteSpace: "nowrap" };
const detailsStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "18px", position: "sticky", top: "18px" };
const detailsHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", marginBottom: "14px" };
const detailsTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "21px", lineHeight: 1.25 };
const noteBoxStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, padding: "14px" };
const labelStyle: CSSProperties = { display: "block", color: colors.text, fontWeight: 850, marginBottom: "8px" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: "300px", resize: "vertical", lineHeight: 1.55, fontWeight: 650 };
const notePreviewStyle: CSSProperties = { display: "block", maxWidth: "360px", color: colors.text, fontSize: "13px", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const mutedStyle: CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 700 };
