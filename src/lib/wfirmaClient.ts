const WFIRMA_API_URL = "https://api2.wfirma.pl";

type WfirmaConfig = {
  accessKey: string;
  secretKey: string;
  appKey: string;
  companyId?: string;
};

export type WfirmaInvoiceLine = {
  id?: string | number | null;
  name?: string | null;
  count?: string | number | null;
  unit?: string | null;
  price?: string | number | null;
  netto?: string | number | null;
  tax?: string | number | null;
  total?: string | number | null;
  vat?: string | number | null;
};

export type WfirmaInvoice = {
  id?: string | number | null;
  fullnumber?: string | null;
  number?: string | null;
  date?: string | null;
  disposaldate?: string | null;
  payment_date?: string | null;
  paymentstate?: string | null;
  type?: string | null;
  currency?: string | null;
  netto?: string | number | null;
  tax?: string | number | null;
  total?: string | number | null;
  total_composed?: string | number | null;
  description?: string | null;
  hash?: string | null;
  contractor_name?: string | null;
  contractor_company_name?: string | null;
  contractor_nip?: string | null;
  contractor_tax_id?: string | null;
  contractor_email?: string | null;
  contractor?: {
    id?: string | number | null;
    name?: string | null;
    company_name?: string | null;
    nip?: string | null;
    tax_id?: string | null;
    email?: string | null;
  } | null;
  invoicecontents?: unknown;
};

export function getWfirmaConfig() {
  const accessKey = process.env.WFIRMA_ACCESS_KEY?.trim();
  const secretKey = process.env.WFIRMA_SECRET_KEY?.trim();
  const appKey = process.env.WFIRMA_APP_KEY?.trim();
  const companyId = process.env.WFIRMA_COMPANY_ID?.trim();

  if (!accessKey || !secretKey || !appKey) {
    return {
      config: null,
      error: "Brak konfiguracji wFirmy. Uzupełnij WFIRMA_ACCESS_KEY, WFIRMA_SECRET_KEY oraz WFIRMA_APP_KEY.",
    };
  }

  return { config: { accessKey, secretKey, appKey, companyId } as WfirmaConfig, error: null };
}

export async function wfirmaRequest<T>(
  action: string,
  options: { method?: "POST"; body?: unknown; config: WfirmaConfig }
) {
  const method = options.method || "POST";
  const url = new URL(`${WFIRMA_API_URL}/${action.replace(/^\/+/, "")}`);
  url.searchParams.set("inputFormat", "json");
  url.searchParams.set("outputFormat", "json");
  if (options.config.companyId) url.searchParams.set("company_id", options.config.companyId);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      accessKey: options.config.accessKey,
      secretKey: options.config.secretKey,
      appKey: options.config.appKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok || data?.status?.code !== "OK") {
    const code = data?.status?.code || response.status;
    const message = data?.status?.message || data?.status?.description || text || "Nieznany błąd wFirmy.";
    throw new Error(`wFirma ${code}: ${message}`);
  }

  return data as T;
}

export async function findWfirmaInvoices(params: {
  config: WfirmaConfig;
  dateFrom: string;
  dateTo: string;
  page?: number;
  limit?: number;
}) {
  const body = {
    invoices: {
      parameters: {
        order: { desc: "Invoice.id" },
        conditions: {
          condition: {
            0: { field: "date", operator: "gte", value: params.dateFrom },
            1: { field: "date", operator: "lte", value: params.dateTo },
          },
        },
        page: params.page || 1,
        limit: params.limit || 100,
      },
    },
  };

  return wfirmaRequest<{ invoices?: unknown; status?: { code?: string } }>("invoices/find", {
    method: "POST",
    body,
    config: params.config,
  });
}

export async function addWfirmaInvoice(config: WfirmaConfig, invoice: unknown) {
  return wfirmaRequest<{ invoices?: unknown; status?: { code?: string } }>("invoices/add", {
    method: "POST",
    body: { invoices: { invoice } },
    config,
  });
}

export async function getWfirmaInvoice(config: WfirmaConfig, id: string | number) {
  return wfirmaRequest<{ invoices?: unknown; status?: { code?: string } }>("invoices/get", {
    method: "POST",
    body: { invoices: { invoice: { id } } },
    config,
  });
}

export async function downloadWfirmaInvoicePdf(config: WfirmaConfig, id: string | number) {
  const body = { invoices: { invoice: { id } } };
  const actions = ["invoices/download", "invoices/print", "invoices/pdf", "invoices/get"];
  const errors: string[] = [];

  for (const action of actions) {
    try {
      return await wfirmaBinaryRequest(action, { body, config });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors[0] || "wFirma nie zwróciła pliku PDF faktury.");
}

export function extractWfirmaInvoices(payload: unknown): WfirmaInvoice[] {
  const invoicesRoot = (payload as { invoices?: unknown } | null)?.invoices;
  return extractModuleRecords<WfirmaInvoice>(invoicesRoot, "invoice");
}

export function extractWfirmaInvoiceLines(invoice: WfirmaInvoice): WfirmaInvoiceLine[] {
  return extractModuleRecords<WfirmaInvoiceLine>(invoice.invoicecontents, "invoicecontent");
}

export function firstWfirmaInvoice(payload: unknown) {
  return extractWfirmaInvoices(payload)[0] || null;
}

function extractModuleRecords<T>(root: unknown, singularName: string): T[] {
  if (!root || typeof root !== "object") return [];

  const rootRecord = root as Record<string, unknown>;
  const directRecord = rootRecord[singularName];
  if (Array.isArray(directRecord)) return directRecord.filter(isRecord) as T[];
  if (isRecord(directRecord)) return [directRecord as T];

  return Object.entries(rootRecord).flatMap(([key, entry]) => {
    if (!isRecord(entry)) return [];
    const record = entry[singularName];
    if (Array.isArray(record)) return record.filter(isRecord) as T[];
    if (isRecord(record)) return [record as T];
    if (/^\d+$/.test(key)) return [entry as T];
    return [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJson(value: string) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function wfirmaBinaryRequest(
  action: string,
  options: { body?: unknown; config: WfirmaConfig }
) {
  const url = new URL(`${WFIRMA_API_URL}/${action.replace(/^\/+/, "")}`);
  url.searchParams.set("inputFormat", "json");
  url.searchParams.set("outputFormat", "pdf");
  if (options.config.companyId) url.searchParams.set("company_id", options.config.companyId);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      accessKey: options.config.accessKey,
      secretKey: options.config.secretKey,
      appKey: options.config.appKey,
      "Content-Type": "application/json",
      Accept: "application/pdf",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok || !looksLikePdf(bytes)) {
    const text = new TextDecoder().decode(bytes.slice(0, 1000));
    const data = parseJson(text);
    const message = data?.status?.message || data?.status?.description || text || `HTTP ${response.status}`;
    throw new Error(`wFirma ${response.status}: ${message}`);
  }

  return bytes;
}

function looksLikePdf(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}
