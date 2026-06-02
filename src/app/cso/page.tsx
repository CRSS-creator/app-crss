"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";

type TabKey = "content" | "calendar";
type TopicStatus = "pomysl" | "w_planie" | "opublikowane";
type TopicFormat = "Wpis z grafiką" | "Wpis bez grafiki" | "Filmik";
type TopicCategory = typeof categories[number];

type ContentTopic = {
  id: string;
  category: TopicCategory;
  title: string;
  fb: boolean;
  blog: boolean;
  format: TopicFormat;
  publishDate: string;
  status: TopicStatus;
};

type DraftTopic = {
  category: TopicCategory;
  title: string;
  fb: boolean;
  blog: boolean;
  format: TopicFormat;
  publishDate: string;
};

type RawTopic = {
  category: TopicCategory;
  title: string;
  format?: TopicFormat;
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "content", label: "Plan contentowy" },
  { key: "calendar", label: "Kalendarz" },
];

const categories = [
  "Ceny i koszty",
  "Problemy",
  "Porównania i zestawienia",
  "Recenzje",
  "Najlepsze w swojej klasie",
  "Inne",
] as const;

const formats: TopicFormat[] = ["Wpis z grafiką", "Wpis bez grafiki", "Filmik"];

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
  ]),
  ...topicGroup("Ceny i koszty", [
    "Tania księgowość dla spółki z o.o.: kiedy oszczędzasz, a kiedy tylko odkładasz koszt na później?",
    "Prawdziwy koszt obsługi spółki z o.o.: czego nie widać w miesięcznym abonamencie?",
    "5 kosztów księgowości, o których właściciel spółki dowiaduje się za późno.",
    "Dlaczego dwie spółki płacą zupełnie inną cenę za księgowość, chociaż wyglądają podobnie?",
    "Czy droższe biuro rachunkowe naprawdę może być tańsze dla spółki?",
    "Ile kosztuje bałagan w dokumentach spółki i dlaczego nie widać tego na fakturze od księgowej?",
    "Księgowość za kilkaset złotych miesięcznie: kiedy ma sens, a kiedy zaczyna być ryzykiem?",
  ], "Filmik"),

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
  ]),
  ...topicGroup("Problemy", [
    "5 błędów, przez które właściciel spółki z o.o. może stracić kontrolę nad finansami.",
    "Dlaczego spółka ma przychody, a właściciel nadal nie widzi pieniędzy?",
    "Czy członek zarządu naprawdę może odpowiadać prywatnym majątkiem za długi spółki?",
    "Estoński CIT: świetne rozwiązanie czy kosztowna pułapka dla nieprzygotowanej spółki?",
    "Ukryte zyski w Estońskim CIT: za co spółki wpadają najczęściej?",
    "Samochód w spółce z o.o.: wygoda, optymalizacja czy przyszły problem podatkowy?",
    "KSeF bez przygotowania: jak jeden źle ustawiony proces może sparaliżować obieg dokumentów?",
  ], "Filmik"),

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
  ]),
  ...topicGroup("Porównania i zestawienia", [
    "Biuro rachunkowe kontra księgowa na etacie: co lepiej sprawdza się w spółce z o.o.?",
    "Klasyczny CIT czy Estoński CIT: co naprawdę bardziej opłaca się spółce?",
    "Księgowość online czy dedykowany opiekun: co daje właścicielowi większą kontrolę?",
    "Raport finansowy kontra informacja o podatku do zapłaty: co naprawdę powinien dostawać właściciel?",
    "Zmiana biura rachunkowego w trakcie roku czy czekanie do stycznia: co jest bezpieczniejsze?",
    "E-commerce kontra zwykła firma usługowa: dlaczego księgowość nie powinna wyglądać tak samo?",
    "Pełna księgowość kontra uproszczone myślenie właściciela: gdzie najczęściej powstaje problem?",
  ], "Filmik"),

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
  ]),
  ...topicGroup("Recenzje", [
    "Szczera recenzja współpracy z biurem rachunkowym: po czym poznać, że firma jest dobrze obsługiwana?",
    "Jak sprawdzić biuro rachunkowe przed podpisaniem umowy i nie opierać się tylko na opiniach z internetu?",
    "5 sygnałów, że Twoje biuro rachunkowe nie rozumie specyfiki spółek z o.o.",
    "Jak wygląda dobra miesięczna obsługa spółki od środka?",
    "Czy dedykowany opiekun księgowy naprawdę coś zmienia, czy to tylko ładna obietnica?",
    "Po czym poznać, że biuro rachunkowe działa odpowiedzialnie, zanim pojawi się pierwszy problem?",
    "Jakie pytania zadać biuru rachunkowemu, zanim powierzysz mu spółkę?",
  ], "Filmik"),

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
  ]),
  ...topicGroup("Najlepsze w swojej klasie", [
    "Najlepsze biuro rachunkowe dla spółki z o.o.: według jakich kryteriów warto je wybrać?",
    "Najlepsza księgowość dla spółki na Estońskim CIT: co musi być dopilnowane?",
    "Najlepszy raport miesięczny dla właściciela spółki: co powinno się w nim znaleźć?",
    "Najlepszy sposób na przygotowanie spółki do KSeF bez chaosu i nerwów.",
    "Najlepszy model współpracy z biurem rachunkowym dla szybko rosnącej spółki.",
    "Najlepsze wskaźniki finansowe dla właściciela spółki: co warto znać co miesiąc?",
    "Najlepsza księgowość to nie tylko księgowanie faktur. Co powinna dawać właścicielowi?",
  ], "Filmik"),

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
  ]),
  ...topicGroup("Inne", [
    "Jak wygląda pierwszy miesiąc współpracy z biurem rachunkowym dla spółki z o.o.?",
    "Co musi przygotować właściciel spółki, zanim zmieni biuro rachunkowe?",
    "Jakie dokumenty najczęściej blokują sprawną obsługę spółki?",
    "Czy właściciel spółki powinien mieć dostęp do finansów na bieżąco?",
    "Co powinno się wydarzyć, gdy w dokumentach spółki brakuje ważnych informacji?",
    "Jak przygotować spółkę do leasingu lub kredytu, żeby nie robić wszystkiego na ostatnią chwilę?",
    "Dlaczego księgowość powinna pomagać właścicielowi podejmować decyzje, a nie tylko liczyć podatki?",
  ], "Filmik"),
];

function topicGroup(category: TopicCategory, titles: string[], format?: TopicFormat): RawTopic[] {
  return titles.map((title) => ({ category, title, format }));
}

function createInitialTopics(): ContentTopic[] {
  return rawTopics.map((topic, index) => ({
    id: `topic-${index + 1}`,
    category: topic.category,
    title: topic.title,
    fb: false,
    blog: false,
    format: topic.format ?? "Wpis z grafiką",
    publishDate: "",
    status: "pomysl",
  }));
}

function createEmptyDraft(): DraftTopic {
  return {
    category: categories[0],
    title: "",
    fb: false,
    blog: false,
    format: "Wpis z grafiką",
    publishDate: "",
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
  const [activeTab, setActiveTab] = useState<TabKey>("content");
  const [categoryFilter, setCategoryFilter] = useState<TopicCategory | "Wszystkie">("Wszystkie");
  const [topics, setTopics] = useState<ContentTopic[]>(createInitialTopics);
  const [draft, setDraft] = useState<DraftTopic>(() => createEmptyDraft());
  const [calendarMonth, setCalendarMonth] = useState(() => getCurrentMonthValue());

  const filteredTopics = useMemo(() => {
    if (categoryFilter === "Wszystkie") return topics;
    return topics.filter((topic) => topic.category === categoryFilter);
  }, [categoryFilter, topics]);

  function updateTopic(id: string, patch: Partial<ContentTopic>) {
    setTopics((current) => current.map((topic) => topic.id === id ? { ...topic, ...patch } : topic));
  }

  function addTopic() {
    const title = draft.title.trim();
    if (!title) {
      alert("Wpisz temat do planu.");
      return;
    }

    setTopics((current) => [
      {
        id: `topic-${Date.now()}`,
        category: draft.category,
        title,
        fb: draft.fb,
        blog: draft.blog,
        format: draft.format,
        publishDate: draft.publishDate,
        status: "w_planie",
      },
      ...current,
    ]);
    setDraft(createEmptyDraft());
  }

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Zarządzanie</p>
          <h1 style={titleStyle}>CSO</h1>
          <p style={subtitleStyle}>Planowanie tematów, publikacji i materiałów marketingowych CRSS.</p>
        </div>
        <div style={headerStatsStyle}>
          <Summary label="Tematy" value={topics.length} />
          <Summary label="Opublikowane" value={topics.filter((topic) => topic.status === "opublikowane").length} />
        </div>
      </section>

      <section style={tabsStyle}>
        {tabs.map((tab) => (
          <button key={tab.key} style={activeTab === tab.key ? activeTabStyle : tabStyle} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </section>

      {activeTab === "content" && (
        <section style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>Plan contentowy</h2>
              <p style={hintStyle}>Dodawaj tematy do planu, ustaw datę, format i status publikacji.</p>
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
            <select style={inputStyle} value={draft.format} onChange={(event) => setDraft((current) => ({ ...current, format: event.target.value as TopicFormat }))}>
              {formats.map((format) => <option key={format}>{format}</option>)}
            </select>
            <input style={inputStyle} type="date" value={draft.publishDate} onChange={(event) => setDraft((current) => ({ ...current, publishDate: event.target.value }))} />
            <label style={checkLabelStyle}><input type="checkbox" checked={draft.fb} onChange={(event) => setDraft((current) => ({ ...current, fb: event.target.checked }))} /> FB</label>
            <label style={checkLabelStyle}><input type="checkbox" checked={draft.blog} onChange={(event) => setDraft((current) => ({ ...current, blog: event.target.checked }))} /> Blog</label>
            <button style={primaryButtonStyle} onClick={addTopic}>Dodaj temat</button>
          </div>

          <div style={categoryGridStyle}>
            {categories.map((category) => {
              const count = topics.filter((topic) => topic.category === category).length;
              return <div key={category} style={categoryCardStyle}><strong>{category}</strong><span>{count} tematów</span></div>;
            })}
          </div>

          <div style={tableShellStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>FB</Th>
                  <Th>Blog</Th>
                  <Th>Kategoria</Th>
                  <Th>Temat</Th>
                  <Th>Format</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map((topic) => (
                  <tr key={topic.id} style={rowStyle}>
                    <Td><input style={dateInputStyle} type="date" value={topic.publishDate} onChange={(event) => updateTopic(topic.id, { publishDate: event.target.value })} /></Td>
                    <Td center><input type="checkbox" checked={topic.fb} onChange={(event) => updateTopic(topic.id, { fb: event.target.checked })} /></Td>
                    <Td center><input type="checkbox" checked={topic.blog} onChange={(event) => updateTopic(topic.id, { blog: event.target.checked })} /></Td>
                    <Td><Badge>{topic.category}</Badge></Td>
                    <Td strong>{topic.title}</Td>
                    <Td>
                      <select style={smallSelectStyle} value={topic.format} onChange={(event) => updateTopic(topic.id, { format: event.target.value as TopicFormat })}>
                        {formats.map((format) => <option key={format}>{format}</option>)}
                      </select>
                    </Td>
                    <Td>
                      <select style={smallSelectStyle} value={topic.status} onChange={(event) => updateTopic(topic.id, { status: event.target.value as TopicStatus })}>
                        <option value="pomysl">Pomysł</option>
                        <option value="w_planie">W planie</option>
                        <option value="opublikowane">Opublikowane</option>
                      </select>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "calendar" && <CalendarTab topics={topics} month={calendarMonth} onMonthChange={setCalendarMonth} />}
    </>
  );
}

function CalendarTab({ topics, month, onMonthChange }: { topics: ContentTopic[]; month: string; onMonthChange: (value: string) => void }) {
  const days = useMemo(() => buildMonthDays(month), [month]);
  const topicsByDate = useMemo(() => {
    return topics.reduce<Record<string, ContentTopic[]>>((acc, topic) => {
      if (!topic.publishDate) return acc;
      if (!acc[topic.publishDate]) acc[topic.publishDate] = [];
      acc[topic.publishDate].push(topic);
      return acc;
    }, {});
  }, [topics]);

  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Kalendarz publikacji</h2>
          <p style={hintStyle}>Widok całego miesiąca na podstawie dat ustawionych w planie contentowym.</p>
        </div>
        <input style={filterStyle} type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} />
      </div>
      <div style={calendarHeaderStyle}>
        {weekdays.map((day) => <strong key={day}>{day}</strong>)}
      </div>
      <div style={calendarGridStyle}>
        {days.map((day, index) => {
          const dayTopics = day.date ? topicsByDate[day.date] || [] : [];
          return (
            <div key={`${day.date || "empty"}-${index}`} style={day.empty ? emptyDayStyle : dayCardStyle}>
              {!day.empty && <span style={dayNumberStyle}>{day.day}</span>}
              {dayTopics.map((topic) => (
                <div key={topic.id} style={calendarTopicStyle}>
                  <strong>{topic.title}</strong>
                  <span>{topic.category}</span>
                  <span>{topic.format}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div style={summaryStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function Th({ children }: { children: ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong, center }: { children: ReactNode; strong?: boolean; center?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 600, textAlign: center ? "center" : "left" }}>{children}</td>; }
function Badge({ children }: { children: ReactNode }) { return <span style={badgeStyle}>{children}</span>; }

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const weekdays = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

function buildMonthDays(month: string) {
  const [yearValue, monthValue] = month.split("-").map(Number);
  const year = yearValue || new Date().getFullYear();
  const monthIndex = (monthValue || new Date().getMonth() + 1) - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const leadingEmptyDays = (firstDay.getDay() + 6) % 7;
  const result: { empty: boolean; day?: number; date?: string }[] = [];

  for (let index = 0; index < leadingEmptyDays; index += 1) result.push({ empty: true });
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    result.push({
      empty: false,
      day,
      date: `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }

  return result;
}

const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap" };
const eyebrowStyle: CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850 };
const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.05 };
const subtitleStyle: CSSProperties = { margin: "12px 0 0", color: colors.muted, fontSize: "17px", lineHeight: 1.65, maxWidth: "760px" };
const headerStatsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(135px, 1fr))", gap: "12px", minWidth: "300px" };
const summaryStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, padding: "15px", display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 800, boxShadow: shadow.soft };
const tabsStyle: CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px" };
const tabStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.card, color: colors.navy, padding: "11px 15px", fontWeight: 850, cursor: "pointer" };
const activeTabStyle: CSSProperties = { ...tabStyle, borderColor: colors.navy, background: colors.navy, color: colors.white };
const panelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "26px", boxShadow: shadow.soft };
const panelHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", marginBottom: "18px", flexWrap: "wrap" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const hintStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.65 };
const filterStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, color: colors.text, padding: "11px 14px", fontWeight: 750, minWidth: "210px" };
const addPanelStyle: CSSProperties = { display: "grid", gridTemplateColumns: "180px minmax(260px, 1fr) 170px 160px auto auto auto", gap: "10px", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", marginBottom: "18px", overflowX: "auto" };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "10px 12px", fontWeight: 700, minHeight: "42px", width: "100%" };
const checkLabelStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "7px", color: colors.text, fontWeight: 800, whiteSpace: "nowrap" };
const primaryButtonStyle: CSSProperties = { border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, padding: "11px 15px", minHeight: "42px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const categoryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px", marginBottom: "18px" };
const categoryCardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "13px", background: colors.inputBackground, display: "flex", flexDirection: "column", gap: "5px", color: colors.text, fontWeight: 800 };
const tableShellStyle: CSSProperties = { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", padding: "13px 14px", color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}` };
const tdStyle: CSSProperties = { padding: "14px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "top" };
const rowStyle: CSSProperties = { background: colors.white };
const dateInputStyle: CSSProperties = { ...inputStyle, minWidth: "145px" };
const smallSelectStyle: CSSProperties = { ...inputStyle, minWidth: "150px" };
const badgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: radius.badge, padding: "6px 10px", background: "rgba(23, 59, 115, 0.10)", color: colors.navy, fontSize: "12px", fontWeight: 850, whiteSpace: "nowrap" };
const calendarHeaderStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "8px", marginBottom: "8px", color: colors.muted, fontSize: "13px", textAlign: "center" };
const calendarGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "8px" };
const dayCardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, minHeight: "132px", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" };
const emptyDayStyle: CSSProperties = { ...dayCardStyle, background: "transparent", borderColor: "transparent" };
const dayNumberStyle: CSSProperties = { color: colors.navy, fontWeight: 850, fontSize: "13px" };
const calendarTopicStyle: CSSProperties = { borderRadius: "10px", background: "rgba(23, 59, 115, 0.08)", color: colors.text, padding: "8px", display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px", lineHeight: 1.35 };
