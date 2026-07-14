export type ClientCardFormData = {
  osobaKontaktowa: string;
  adresDzialalnosci: string;
  adresZamieszkania: string;
  adresZamieszkaniaJakDzialalnosci: boolean;
  formaOpodatkowania: string;
  glownaStawkaRyczaltu: string;
  urzadSkarbowy: string;
  telefon: string;
  uslugiBylyPracodawca: string;
  czynnyVat: string;
  vatFormaRozliczenia: string;
  vatZwolnieniePodstawy: string[];
  vatUe: string;
  vatUePowody: string[];
  sprzedazOsobyPrywatneUe: string;
  zusUlga: string;
  zusUlgaTytul: string;
  tylkoZdrowotne: string;
  tylkoZdrowotneTytul: string;
  chorobowe: string;
  niepelnosprawnosc: string;
  stopienNiepelnosprawnosci: string;
  emeryturaRenta: string;
  kasaFiskalna: string;
  kasaFiskalnaZwolnienie: string;
  potwierdzenie: boolean;
};

export const emptyClientCardFormData: ClientCardFormData = {
  osobaKontaktowa: "",
  adresDzialalnosci: "",
  adresZamieszkania: "",
  adresZamieszkaniaJakDzialalnosci: false,
  formaOpodatkowania: "",
  glownaStawkaRyczaltu: "",
  urzadSkarbowy: "",
  telefon: "",
  uslugiBylyPracodawca: "",
  czynnyVat: "",
  vatFormaRozliczenia: "",
  vatZwolnieniePodstawy: [],
  vatUe: "",
  vatUePowody: [],
  sprzedazOsobyPrywatneUe: "",
  zusUlga: "",
  zusUlgaTytul: "",
  tylkoZdrowotne: "",
  tylkoZdrowotneTytul: "",
  chorobowe: "",
  niepelnosprawnosc: "",
  stopienNiepelnosprawnosci: "",
  emeryturaRenta: "",
  kasaFiskalna: "",
  kasaFiskalnaZwolnienie: "",
  potwierdzenie: false,
};

export type PublicClientCardResponse = {
  status: "active" | "completed" | "revoked" | "missing";
  client?: {
    id: string;
    nazwa: string | null;
    nip: string | null;
    email: string | null;
    telefon: string | null;
    forma_opodatkowania: string | null;
    glowna_stawka_ryczaltu: string | null;
    czynny_vat: boolean | null;
    vat_ue: boolean | null;
    osoba_kontaktowa: string | null;
  };
};

export function validateClientCardFormData(data: ClientCardFormData) {
  const missing: string[] = [];
  const requireText = (value: string | null | undefined, label: string) => {
    if (!value?.trim()) missing.push(label);
  };
  const requireList = (value: string[], label: string) => {
    if (value.length === 0) missing.push(label);
  };

  requireText(data.osobaKontaktowa, "Osoba kontaktowa");
  requireText(data.telefon, "Telefon");
  requireText(data.adresDzialalnosci, "Adres działalności");
  if (!data.adresZamieszkaniaJakDzialalnosci) requireText(data.adresZamieszkania, "Adres zamieszkania");
  requireText(data.formaOpodatkowania, "Forma opodatkowania");
  if (data.formaOpodatkowania === "Ryczałt") requireText(data.glownaStawkaRyczaltu, "Główna stawka ryczałtu");
  requireText(data.urzadSkarbowy, "Właściwy Urząd Skarbowy");
  requireText(data.uslugiBylyPracodawca, "Usługi na rzecz byłego pracodawcy");
  requireText(data.sprzedazOsobyPrywatneUe, "Sprzedaż na rzecz osób fizycznych z innych krajów UE");
  requireText(data.czynnyVat, "Status VAT");
  if (data.czynnyVat === "tak") requireText(data.vatFormaRozliczenia, "Forma rozliczenia VAT");
  if (data.czynnyVat === "nie") requireList(data.vatZwolnieniePodstawy, "Podstawa zwolnienia z VAT");
  requireText(data.vatUe, "VAT-UE");
  if (data.vatUe === "tak") requireList(data.vatUePowody, "Powód rejestracji VAT-UE");
  requireText(data.zusUlga, "Ulgi w ZUS");
  if (data.zusUlga === "tak") requireText(data.zusUlgaTytul, "Tytuł ulgi ZUS");
  requireText(data.tylkoZdrowotne, "Tylko składka zdrowotna");
  if (data.tylkoZdrowotne === "tak") requireText(data.tylkoZdrowotneTytul, "Inny tytuł do składek społecznych");
  requireText(data.chorobowe, "Dobrowolne ubezpieczenie chorobowe");
  requireText(data.niepelnosprawnosc, "Orzeczenie o niepełnosprawności");
  if (data.niepelnosprawnosc === "tak") requireText(data.stopienNiepelnosprawnosci, "Stopień niepełnosprawności");
  requireText(data.emeryturaRenta, "Prawo do emerytury lub renty");
  requireText(data.kasaFiskalna, "Kasa fiskalna");
  if (data.kasaFiskalna === "nie") requireText(data.kasaFiskalnaZwolnienie, "Powód zwolnienia z kasy fiskalnej");
  if (!data.potwierdzenie) missing.push("Potwierdzenie ankiety i zgodności danych");

  return missing;
}
