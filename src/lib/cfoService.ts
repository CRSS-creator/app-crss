import { supabase } from "@/lib/supabaseClient";

export type CfoRevenueCategory = "abonamenty" | "kadry_place" | "uslugi_dodatkowe" | "wdrozenia" | "pozostale";
export type CfoCostCategory =
  | "koszty_zespolu"
  | "lokal_infrastruktura"
  | "systemy_technologia"
  | "marketing_sprzedaz"
  | "administracja_ogolne"
  | "zarzad_wlasciciel"
  | "jednorazowe_nadzwyczajne";
export type CfoBankTransactionType =
  | "do_przypisania"
  | "koszt"
  | "wynagrodzenie_netto"
  | "pit"
  | "zus"
  | "cit"
  | "vat"
  | "faktura_sprzedazowa"
  | "transfer_wewnetrzny"
  | "ignoruj"
  | "inne";

export type CfoInvoiceLine = {
  id: string;
  nazwa: string;
  kwota_netto: number;
  cfo_przychod_kategoria: CfoRevenueCategory | null;
  faktury?: CfoInvoiceParent | CfoInvoiceParent[] | null;
};

export type CfoInvoiceParent = {
    id: string;
    numer: string | null;
    okres: string | null;
    typ: string;
    status: string;
    data_wystawienia: string | null;
    klient_id: string | null;
    kontrahent_nazwa: string | null;
    klienci?: { nazwa: string | null } | { nazwa: string | null }[] | null;
};

export type CfoCashflowInvoice = {
  id: string;
  numer: string | null;
  okres: string | null;
  status: string;
  data_wystawienia: string | null;
  kontrahent_nazwa: string | null;
  kwota_brutto: number;
};

export type CfoCostItem = {
  id: string;
  data_dokumentu: string | null;
  numer_dokumentu: string | null;
  kontrahent: string;
  opis: string | null;
  kwota_netto_import: number | null;
  kwota_netto_cfo: number;
  kwota_vat: number | null;
  kwota_brutto: number | null;
  kategoria: CfoCostCategory;
  podkategoria: string | null;
  charakter: string;
  czestotliwosc: string;
  okres_start: string;
  okres_end: string;
  ujecie_zarzadcze: string;
  ignoruj: boolean;
};

export type CfoEmployeeCost = {
  id: string;
  okres: string;
  osoba_id: string | null;
  osoba_nazwa: string;
  zespol: "ksiegowy" | "marketingowy" | "sprzedazowy";
  w_capacity: boolean;
  wymiar_etatu: number;
  podstawa: number;
  zus_pracodawcy: number;
  benefity: number;
  premie: number;
  szkolenia: number;
  nieobecnosci_godziny: number;
  nadgodziny: number;
};

export type CfoTeamMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  aktywne: boolean | null;
};

export type CfoClientTimeEntry = {
  id: string;
  klient_id: string | null;
  osoba_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  miesiac_rozliczeniowy: string | null;
};

export type CfoBankAccount = {
  id: string;
  numer_rachunku: string;
  nazwa: string | null;
  waluta: string;
};

export type CfoBankTransaction = {
  id: string;
  rachunek_id: string;
  data_ksiegowania: string;
  data_operacji: string | null;
  tytul: string | null;
  kontrahent: string | null;
  rachunek_kontrahenta: string | null;
  kwota: number;
  saldo_po: number | null;
  typ: CfoBankTransactionType;
  koszt_id: string | null;
  faktura_id: string | null;
  ignoruj: boolean;
  dopasowanie_status: string;
  cfo_rachunki_bankowe?: CfoBankAccount | CfoBankAccount[] | null;
};

export type CfoCostImportRow = {
  import_key: string;
  data_dokumentu: string | null;
  numer_dokumentu: string | null;
  kontrahent: string;
  opis: string | null;
  kwota_netto_import: number;
  kwota_netto_cfo: number;
  kwota_vat: number | null;
  kwota_brutto: number | null;
  kategoria: CfoCostCategory;
  podkategoria: string | null;
  okres_start: string;
  okres_end: string;
  zrodlo: "import" | "recznie";
};

export type CfoBankImportRow = {
  account: {
    numer_rachunku: string;
    nazwa: string | null;
    waluta: string;
  };
  transaction: {
    import_key: string;
    data_ksiegowania: string;
    data_operacji: string | null;
    tytul: string | null;
    kontrahent: string | null;
    rachunek_kontrahenta: string | null;
    kwota: number;
    saldo_po: number | null;
    lp: number | null;
    typ: CfoBankTransactionType;
    ignoruj: boolean;
  };
};

const INVOICE_LINE_SELECT = `
  id,
  nazwa,
  kwota_netto,
  cfo_przychod_kategoria,
  faktury!inner (
    id,
    numer,
    okres,
    typ,
    status,
    data_wystawienia,
    klient_id,
    kontrahent_nazwa,
    klienci (
      nazwa
    )
  )
`;

const BANK_TRANSACTION_SELECT = `
  *,
  cfo_rachunki_bankowe (
    id,
    numer_rachunku,
    nazwa,
    waluta
  )
`;

export async function fetchCfoRevenueLines(period: string) {
  return supabase
    .from("faktury_pozycje")
    .select(INVOICE_LINE_SELECT)
    .eq("faktury.okres", period)
    .eq("faktury.typ", "sprzedaz")
    .neq("faktury.status", "anulowana")
    .order("nazwa", { ascending: true });
}

export async function fetchCfoRevenueLinesRange(from: string, to: string) {
  return supabase
    .from("faktury_pozycje")
    .select(INVOICE_LINE_SELECT)
    .gte("faktury.okres", from)
    .lte("faktury.okres", to)
    .eq("faktury.typ", "sprzedaz")
    .neq("faktury.status", "anulowana")
    .order("nazwa", { ascending: true });
}

export async function updateInvoiceLineCfoCategory(lineId: string, category: CfoRevenueCategory) {
  return supabase
    .from("faktury_pozycje")
    .update({ cfo_przychod_kategoria: category })
    .eq("id", lineId)
    .select(INVOICE_LINE_SELECT)
    .single();
}

export async function fetchCfoCashflowInvoices(period: string) {
  const [year] = period.slice(0, 7).split("-").map(Number);
  const from = `${year - 1}-12-01`;
  const to = endOfMonth(period);

  return supabase
    .from("faktury")
    .select("id,numer,okres,status,data_wystawienia,kontrahent_nazwa,kwota_brutto")
    .eq("typ", "sprzedaz")
    .neq("status", "anulowana")
    .gte("data_wystawienia", from)
    .lte("data_wystawienia", to)
    .order("data_wystawienia", { ascending: false, nullsFirst: false })
    .order("numer", { ascending: false })
    .limit(1000);
}

export async function fetchCfoCosts(period: string) {
  return supabase
    .from("cfo_koszty")
    .select("*")
    .lte("okres_start", period)
    .gte("okres_end", period)
    .order("data_dokumentu", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
}

export async function fetchCfoCostsRange(from: string, to: string) {
  return supabase
    .from("cfo_koszty")
    .select("*")
    .lte("okres_start", to)
    .gte("okres_end", from)
    .order("data_dokumentu", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
}

export async function insertCfoCosts(rows: CfoCostImportRow[]) {
  return supabase
    .from("cfo_koszty")
    .upsert(rows, { onConflict: "import_key", ignoreDuplicates: true })
    .select("*");
}

export async function updateCfoCost(costId: string, payload: Partial<CfoCostItem>) {
  return supabase
    .from("cfo_koszty")
    .update(payload)
    .eq("id", costId)
    .select("*")
    .single();
}

export async function fetchCfoEmployeeCosts(period: string) {
  return supabase
    .from("cfo_koszty_pracownikow")
    .select("*")
    .eq("okres", period)
    .order("osoba_nazwa", { ascending: true });
}

export async function fetchCfoEmployeeCostsRange(from: string, to: string) {
  return supabase
    .from("cfo_koszty_pracownikow")
    .select("*")
    .gte("okres", from)
    .lte("okres", to)
    .order("osoba_nazwa", { ascending: true });
}

export async function fetchCfoTeamMembers() {
  return supabase
    .from("profiles")
    .select("id, full_name, email, role, aktywne")
    .in("role", ["accountant", "manager", "opiekun_ksiegowy", "ksiegowy"])
    .neq("aktywne", false)
    .order("full_name", { ascending: true });
}

export async function fetchCfoClientTimeEntries(period: string) {
  const from = period;
  const to = startOfNextMonth(period);

  return supabase
    .from("czas_pracy")
    .select("id, klient_id, osoba_id, started_at, ended_at, duration_seconds, miesiac_rozliczeniowy")
    .not("ended_at", "is", null)
    .gte("started_at", from)
    .lt("started_at", to);
}

export async function fetchCfoClientTimeEntriesRange(from: string, to: string) {
  return supabase
    .from("czas_pracy")
    .select("id, klient_id, osoba_id, started_at, ended_at, duration_seconds, miesiac_rozliczeniowy")
    .not("ended_at", "is", null)
    .gte("started_at", from)
    .lt("started_at", startOfNextMonth(to));
}

export async function upsertCfoEmployeeCost(row: Omit<CfoEmployeeCost, "id"> & { id?: string }) {
  const { id, ...payload } = row;
  const query = id
    ? supabase.from("cfo_koszty_pracownikow").update(payload).eq("id", id)
    : supabase.from("cfo_koszty_pracownikow").insert(payload);

  return query.select("*").single();
}

export async function fetchCfoBankTransactions(period: string) {
  const from = period;
  const to = endOfMonth(period);

  return supabase
    .from("cfo_transakcje_bankowe")
    .select(BANK_TRANSACTION_SELECT)
    .gte("data_ksiegowania", from)
    .lte("data_ksiegowania", to)
    .order("data_ksiegowania", { ascending: false })
    .order("lp", { ascending: true });
}

export async function fetchCfoBankTransactionsRange(from: string, to: string) {
  return supabase
    .from("cfo_transakcje_bankowe")
    .select(BANK_TRANSACTION_SELECT)
    .gte("data_ksiegowania", from)
    .lte("data_ksiegowania", endOfMonth(to))
    .order("data_ksiegowania", { ascending: false })
    .order("lp", { ascending: true });
}

export async function importBankTransactions(rows: CfoBankImportRow[]) {
  const accountsByNumber = new Map<string, CfoBankImportRow["account"]>();
  rows.forEach((row) => accountsByNumber.set(row.account.numer_rachunku, row.account));

  const accountsResult = await supabase
    .from("cfo_rachunki_bankowe")
    .upsert(Array.from(accountsByNumber.values()), { onConflict: "numer_rachunku" })
    .select("id,numer_rachunku,nazwa,waluta");

  if (accountsResult.error) return { data: null, error: accountsResult.error };

  const accountIds = new Map((accountsResult.data || []).map((account) => [account.numer_rachunku, account.id]));
  const transactions = rows
    .map((row) => {
      const accountId = accountIds.get(row.account.numer_rachunku);
      if (!accountId) return null;

      return {
        ...row.transaction,
        rachunek_id: accountId,
      };
    })
    .filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction));

  return supabase
    .from("cfo_transakcje_bankowe")
    .upsert(transactions, { onConflict: "import_key", ignoreDuplicates: true })
    .select(BANK_TRANSACTION_SELECT);
}

export async function updateBankTransaction(transactionId: string, payload: Partial<CfoBankTransaction>) {
  return supabase
    .from("cfo_transakcje_bankowe")
    .update(payload)
    .eq("id", transactionId)
    .select(BANK_TRANSACTION_SELECT)
    .single();
}

function endOfMonth(period: string) {
  const [year, month] = period.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function startOfNextMonth(period: string) {
  const [year, month] = period.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}
