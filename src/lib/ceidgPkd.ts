export type CeidgPkdCode = {
  kod: string;
  nazwa: string | null;
  przewazajace: boolean;
  zrodlo: string;
};

type RegistryRecord = Record<string, unknown>;

function record(value: unknown): RegistryRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RegistryRecord : null;
}

function records(value: unknown): RegistryRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is RegistryRecord => item !== null) : [];
}

function currentCompany(company: RegistryRecord): RegistryRecord | null {
  const detailRoot = record(company.szczegoly);
  const details = records(detailRoot?.firma);
  // The detail response is authoritative and must belong to this registry entry.
  const detail = details.find((item) => !company.id || item.id === company.id);
  const selected = detail || company;
  const status = String(selected.status || company.status || "").trim().toUpperCase();
  // Suspended entries still exist; deregistered and not-yet-started businesses do not qualify.
  return status === "AKTYWNY" || status === "ZAWIESZONY" ? selected : null;
}

export function collectCurrentCeidgPkdCodes(details: unknown): CeidgPkdCode[] {
  const root = record(details);
  const codes = new Map<string, CeidgPkdCode>();
  for (const company of records(root?.companies)) {
    const current = currentCompany(company);
    if (!current) continue;
    const add = (value: unknown, main: boolean) => {
      const item = record(value);
      const raw = typeof value === "string" ? value : item?.kod;
      if (typeof raw !== "string") return;
      const compact = raw.toUpperCase().replace(/[.\s-]/g, "");
      const match = compact.match(/^(\d{2})(\d{2})([A-Z])$/);
      if (!match) return;
      const code = `${match[1]}.${match[2]}.${match[3]}`;
      const existing = codes.get(code);
      codes.set(code, {
        kod: code,
        nazwa: existing?.nazwa || (typeof item?.nazwa === "string" ? item.nazwa : null),
        przewazajace: Boolean(existing?.przewazajace || main),
        zrodlo: "CEIDG",
      });
    };
    // Read activity fields only: rokPkd and historical/raw response nodes are metadata.
    add(current.pkdGlowny, true);
    for (const item of Array.isArray(current.pkd) ? current.pkd : []) add(item, false);
  }
  return [...codes.values()];
}
