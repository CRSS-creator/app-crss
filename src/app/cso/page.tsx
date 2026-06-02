"use client";

import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { colors, radius, shadow } from "@/app/design";

type TabKey = "content" | "calendar" | "ideas" | "production" | "results";

type ContentTopic = {
  category: string;
  title: string;
  fb: boolean;
  blog: boolean;
  format: string;
  status: "pomysl" | "do_opracowania" | "w_produkcji" | "gotowe";
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "content", label: "Plan contentowy" },
  { key: "calendar", label: "Kalendarz" },
  { key: "ideas", label: "Bank pomysłów" },
  { key: "production", label: "Produkcja" },
  { key: "results", label: "Wyniki" },
];

const categories = ["Ceny i koszty", "Problemy", "Porównania", "Recenzje", "Najlepsze", "Inne"];

const topics: ContentTopic[] = [
  { category: "Ceny i koszty", title: "Ile kosztuje obsługa księgowa spółki z o.o. i od czego zależy cena?", fb: true, blog: true, format: "Edukacyjny", status: "do_opracowania" },
  { category: "Ceny i koszty", title: "Prawdziwy koszt obsługi spółki z o.o.: czego nie widać w miesięcznym abonamencie?", fb: true, blog: false, format: "Krótki film", status: "pomysl" },
  { category: "Problemy", title: "Dlaczego spółka ma problemy z płynnością, mimo dużych przychodów?", fb: true, blog: true, format: "Analiza", status: "w_produkcji" },
  { category: "Problemy", title: "Czy członek zarządu może odpowiadać prywatnym majątkiem za długi spółki?", fb: true, blog: true, format: "Ryzyko", status: "do_opracowania" },
  { category: "Porównania", title: "Biuro rachunkowe kontra księgowa na etacie. Co lepiej sprawdza się w spółce z o.o.?", fb: false, blog: true, format: "Porównanie", status: "pomysl" },
  { category: "Porównania", title: "Księgowość online czy dedykowany opiekun: co daje właścicielowi większą kontrolę?", fb: true, blog: true, format: "Karuzela", status: "do_opracowania" },
  { category: "Recenzje", title: "Po czym poznać, że biuro rachunkowe naprawdę dobrze obsługuje spółki z o.o.?", fb: true, blog: true, format: "Checklist", status: "gotowe" },
  { category: "Najlepsze", title: "Najlepszy raport miesięczny dla właściciela spółki: co powinno się w nim znaleźć?", fb: true, blog: true, format: "Ekspercki", status: "pomysl" },
  { category: "Inne", title: "Jak wygląda pierwszy miesiąc współpracy z biurem rachunkowym dla spółki z o.o.?", fb: true, blog: false, format: "Proces", status: "do_opracowania" },
];

const weeklySlots = [
  { day: "Poniedziałek", channel: "FB", theme: "Krótki film edukacyjny", owner: "Marketing", status: "Do scenariusza" },
  { day: "Środa", channel: "Blog", theme: "Artykuł poradnikowy", owner: "Sprzedaż", status: "Brief" },
  { day: "Piątek", channel: "FB", theme: "Checklist / karuzela", owner: "Marketing", status: "Publikacja" },
];

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
  const [categoryFilter, setCategoryFilter] = useState("Wszystkie");

  const filteredTopics = useMemo(() => {
    if (categoryFilter === "Wszystkie") return topics;
    return topics.filter((topic) => topic.category === categoryFilter);
  }, [categoryFilter]);

  return (
    <>
      <section style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Zarządzanie</p>
          <h1 style={titleStyle}>CSO</h1>
          <p style={subtitleStyle}>Strategia sprzedaży, content, produkcja materiałów i kontrola wyników marketingowych.</p>
        </div>
        <div style={headerStatsStyle}>
          <Summary label="Tematy" value={topics.length} />
          <Summary label="Gotowe" value={topics.filter((topic) => topic.status === "gotowe").length} />
          <Summary label="Kanały" value="FB / Blog" />
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
              <p style={hintStyle}>Lista tematów z przypisaniem do FB i bloga, kategorią, formatem oraz statusem produkcji.</p>
            </div>
            <select style={filterStyle} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option>Wszystkie</option>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
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
                  <tr key={`${topic.category}-${topic.title}`} style={rowStyle}>
                    <Td center><input type="checkbox" checked={topic.fb} readOnly /></Td>
                    <Td center><input type="checkbox" checked={topic.blog} readOnly /></Td>
                    <Td><Badge>{topic.category}</Badge></Td>
                    <Td strong>{topic.title}</Td>
                    <Td>{topic.format}</Td>
                    <Td><Status status={topic.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "calendar" && <CalendarTab />}
      {activeTab === "ideas" && <SimpleTab title="Bank pomysłów" text="Miejsce na szybkie zapisywanie tematów, pytań klientów, inspiracji z rozmów sprzedażowych i późniejsze przypisanie ich do kategorii." items={["Źródło pomysłu", "Potencjalny format", "Priorytet", "Powiązanie z ofertą CRSS"]} />}
      {activeTab === "production" && <SimpleTab title="Produkcja" text="Widok procesu od briefu do publikacji: scenariusz, akceptacja, nagranie, montaż, grafika, publikacja." items={["Do scenariusza", "Do nagrania", "Do montażu", "Do publikacji"]} />}
      {activeTab === "results" && <SimpleTab title="Wyniki" text="Panel do śledzenia, które tematy realnie pracują na sprzedaż: wejścia, zapytania, źródła leadów i tematy generujące rozmowy." items={["Najlepsze tematy", "Najlepsze kategorie", "Leady z contentu", "Wnioski na kolejny miesiąc"]} />}
    </>
  );
}

function CalendarTab() {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Kalendarz publikacji</h2>
          <p style={hintStyle}>Proponowany rytm tygodnia. Docelowo można tu dodać widok miesięczny i automatyczne statusy publikacji.</p>
        </div>
      </div>
      <div style={calendarGridStyle}>
        {weeklySlots.map((slot) => (
          <div key={slot.day} style={slotCardStyle}>
            <span style={slotDayStyle}>{slot.day}</span>
            <strong>{slot.theme}</strong>
            <p>{slot.channel} · {slot.owner}</p>
            <Badge>{slot.status}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}

function SimpleTab({ title, text, items }: { title: string; text: string; items: string[] }) {
  return (
    <section style={panelStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <p style={hintStyle}>{text}</p>
      <div style={simpleGridStyle}>
        {items.map((item) => <div key={item} style={simpleCardStyle}>{item}</div>)}
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div style={summaryStyle}><span>{label}</span><strong>{value}</strong></div>;
}

function Th({ children }: { children: React.ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong, center }: { children: React.ReactNode; strong?: boolean; center?: boolean }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 600, textAlign: center ? "center" : "left" }}>{children}</td>; }
function Badge({ children }: { children: React.ReactNode }) { return <span style={badgeStyle}>{children}</span>; }
function Status({ status }: { status: ContentTopic["status"] }) {
  const labels = { pomysl: "Pomysł", do_opracowania: "Do opracowania", w_produkcji: "W produkcji", gotowe: "Gotowe" };
  return <span style={{ ...badgeStyle, ...(status === "gotowe" ? successBadgeStyle : status === "w_produkcji" ? warningBadgeStyle : {}) }}>{labels[status]}</span>;
}

const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start", marginBottom: "24px" };
const eyebrowStyle: React.CSSProperties = { margin: "0 0 8px", color: colors.red, fontWeight: 850 };
const titleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "42px", lineHeight: 1.05 };
const subtitleStyle: React.CSSProperties = { margin: "12px 0 0", color: colors.muted, fontSize: "17px", lineHeight: 1.65, maxWidth: "760px" };
const headerStatsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: "12px", minWidth: "420px" };
const summaryStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, padding: "15px", display: "flex", flexDirection: "column", gap: "8px", color: colors.muted, fontWeight: 800, boxShadow: shadow.soft };
const tabsStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px" };
const tabStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.card, color: colors.navy, padding: "11px 15px", fontWeight: 850, cursor: "pointer" };
const activeTabStyle: React.CSSProperties = { ...tabStyle, borderColor: colors.navy, background: colors.navy, color: colors.white };
const panelStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "26px", boxShadow: shadow.soft };
const panelHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", marginBottom: "18px" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const hintStyle: React.CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.65 };
const filterStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, color: colors.text, padding: "11px 14px", fontWeight: 750, minWidth: "210px" };
const categoryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "10px", marginBottom: "18px" };
const categoryCardStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "13px", background: colors.inputBackground, display: "flex", flexDirection: "column", gap: "5px", color: colors.text, fontWeight: 800 };
const tableShellStyle: React.CSSProperties = { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "13px 14px", color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}` };
const tdStyle: React.CSSProperties = { padding: "14px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "top" };
const rowStyle: React.CSSProperties = { background: colors.white };
const badgeStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: radius.badge, padding: "6px 10px", background: "rgba(23, 59, 115, 0.10)", color: colors.navy, fontSize: "12px", fontWeight: 850, whiteSpace: "nowrap" };
const successBadgeStyle: React.CSSProperties = { background: "rgba(22, 163, 74, 0.12)", color: colors.success };
const warningBadgeStyle: React.CSSProperties = { background: "rgba(245, 158, 11, 0.14)", color: "#92400e" };
const calendarGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px" };
const slotCardStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "18px", display: "flex", flexDirection: "column", gap: "9px", color: colors.text };
const slotDayStyle: React.CSSProperties = { color: colors.red, fontWeight: 850, fontSize: "13px" };
const simpleGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px", marginTop: "18px" };
const simpleCardStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "18px", color: colors.text, fontWeight: 850, minHeight: "86px", display: "flex", alignItems: "center" };
