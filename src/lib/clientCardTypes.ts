export type ClientCardFormData = {
  osobaKontaktowa: string;
  adresDzialalnosci: string;
  adresZamieszkania: string;
  adresZamieszkaniaJakDzialalnosci: boolean;
  formaOpodatkowania: string;
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
    czynny_vat: boolean | null;
    vat_ue: boolean | null;
    osoba_kontaktowa: string | null;
  };
};
