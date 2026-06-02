export type UserRole = "owner" | "manager" | "admin" | "accountant" | string;

export type AppModule =
  | "dashboard"
  | "powiadomienia"
  | "klienci"
  | "zadania"
  | "rozliczenia"
  | "kadry"
  | "limity"
  | "onboarding"
  | "zamykanie-roku"
  | "crm"
  | "cso"
  | "cfo"
  | "aml"
  | "rodo"
  | "uzytkownicy";

const moduleAccess: Record<AppModule, string[]> = {
  dashboard: ["owner", "manager", "admin", "accountant"],
  powiadomienia: ["owner", "manager", "admin", "accountant"],
  klienci: ["owner", "manager", "admin", "accountant"],
  zadania: ["owner", "manager", "admin", "accountant"],
  rozliczenia: ["owner", "manager", "admin", "accountant"],
  kadry: ["owner", "manager", "admin", "accountant"],
  limity: ["owner", "manager", "admin"],
  onboarding: ["owner", "manager", "admin", "accountant"],
  "zamykanie-roku": ["owner", "manager", "admin"],
  crm: ["owner"],
  cso: ["owner"],
  cfo: ["owner"],
  aml: ["owner", "manager"],
  rodo: ["owner", "manager"],
  uzytkownicy: ["owner", "admin"],
};

export function canAccessModule(role: UserRole | null, moduleName: AppModule) {
  if (!role) return false;
  return moduleAccess[moduleName]?.includes(role) ?? false;
}

export function canManageClients(role: UserRole | null) {
  return role === "owner" || role === "manager" || role === "admin";
}

export function canEditClientAdministrative(role: UserRole | null) {
  return canManageClients(role);
}
