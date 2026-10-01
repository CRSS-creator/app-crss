import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findWfirmaCompanyAccounts,
  firstWfirmaInvoice,
  getWfirmaInvoice,
  setWfirmaInvoiceBankAccount,
  type WfirmaInvoice,
} from "@/lib/wfirmaClient";

type WfirmaConfig = Parameters<typeof getWfirmaInvoice>[0];
export type RequiredInvoiceBankAccount = { id: string; number: string };

export function createInvoiceBankAccountResolver(admin: SupabaseClient, config: WfirmaConfig) {
  let result: Promise<RequiredInvoiceBankAccount> | undefined;
  return () => result ??= resolveInvoiceBankAccount(admin, config);
}

export function normalizePolishBankAccount(value: unknown) {
  const number = String(value ?? "").replace(/\s/g, "").toUpperCase().replace(/^PL/, "");
  if (!/^\d{26}$/.test(number) || BigInt(number.slice(2) + "2521" + number.slice(0, 2)) % BigInt(97) !== BigInt(1)) {
    throw new Error("Nieprawidłowy numer rachunku bankowego do faktur.");
  }
  return number;
}

export async function resolveInvoiceBankAccount(admin: SupabaseClient, config: WfirmaConfig): Promise<RequiredInvoiceBankAccount> {
  const { data, error } = await admin.rpc("required_invoice_bank_account");
  if (error) throw new Error("Nie udało się pobrać obowiązkowego rachunku bankowego do faktur.");
  const number = normalizePolishBankAccount(data);
  const matches = new Set<string>();
  for (let page = 1; page <= 100; page++) {
    const accounts = await findWfirmaCompanyAccounts(config, page);
    for (const account of accounts) {
      // Other accounts may use foreign IBANs; only compare the requested Polish NRB.
      const candidate = String(account.number ?? "").replace(/\s/g, "").toUpperCase().replace(/^PL/, "");
      if (candidate === number && account.id) matches.add(String(account.id));
    }
    if (accounts.length < 100) {
      if (matches.size !== 1) throw new Error(matches.size === 0
        ? `Brak rachunku ${number} w ustawieniach wFirmy. Dodaj go przed wysłaniem faktury.`
        : "Wybrany numer rachunku występuje wielokrotnie w wFirmie. Uporządkuj rachunki przed wysłaniem faktury.");
      return { id: [...matches][0], number };
    }
  }
  throw new Error("Nie udało się jednoznacznie sprawdzić listy rachunków wFirmy.");
}

function matchesBankAccount(invoice: WfirmaInvoice, account: RequiredInvoiceBankAccount) {
  if (String(invoice.company_account?.id ?? "") !== account.id) return false;
  // When supplied, verify the bank number copied onto the invoice as well as its relation.
  if (invoice.company_detail?.bank_account) {
    return normalizePolishBankAccount(invoice.company_detail.bank_account) === account.number;
  }
  return true;
}

export function isWfirmaDraft(invoice: WfirmaInvoice) {
  return ["normal_draft", "bill_draft", "margin_draft"].includes(String(invoice.type ?? ""));
}

export async function ensureDraftInvoiceBankAccount(config: WfirmaConfig, invoiceId: string, account: RequiredInvoiceBankAccount) {
  let invoice = firstWfirmaInvoice(await getWfirmaInvoice(config, invoiceId));
  if (!invoice || String(invoice.id) !== invoiceId) throw new Error("Nie udało się odczytać rachunku zapisanego na fakturze w wFirmie.");
  if (matchesBankAccount(invoice, account)) return invoice;
  if (!isWfirmaDraft(invoice)) throw new Error("Faktura ma inny rachunek i nie jest już wersją roboczą. Wymaga osobnego sprawdzenia.");
  await setWfirmaInvoiceBankAccount(config, invoiceId, account.id);
  invoice = firstWfirmaInvoice(await getWfirmaInvoice(config, invoiceId));
  if (!invoice || String(invoice.id) !== invoiceId || !matchesBankAccount(invoice, account)) {
    throw new Error("wFirma nie potwierdziła wymaganego rachunku bankowego. Nie zatwierdzaj tego szkicu przed sprawdzeniem rachunku.");
  }
  return invoice;
}
