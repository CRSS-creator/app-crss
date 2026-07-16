export type UserRole = "owner" | "manager" | "admin" | "accountant" | "handlowiec" | string;

export type AppModule =
  | "dashboard"
  | "powiadomienia"
  | "klienci"
  | "zadania"
  | "rozliczenia"
  | "komunikaty"
  | "kadry"
  | "limity"
  | "onboarding"
  | "zamykanie-roku"
  | "crm"
  | "umowy"
  | "faktury"
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
  komunikaty: ["owner", "manager", "admin", "accountant"],
  kadry: ["owner", "manager", "admin", "accountant"],
  limity: ["owner", "manager", "admin", "accountant"],
  onboarding: ["owner", "manager", "admin", "accountant"],
  "zamykanie-roku": ["owner", "manager", "admin"],
  crm: ["owner", "admin", "handlowiec"],
  umowy: ["owner", "admin"],
  faktury: ["owner", "admin"],
  cso: ["owner", "admin", "handlowiec"],
  cfo: ["owner", "admin"],
  aml: ["owner", "manager", "admin"],
  rodo: ["owner", "manager", "admin"],
  uzytkownicy: ["owner", "manager", "admin", "accountant"],
};

export function canAccessModule(role: UserRole | null, moduleName: AppModule) {
  if (!role) return false;
  if (role === "admin") return true;
  return moduleAccess[moduleName]?.includes(role) ?? false;
}

export function canManageClients(_role: UserRole | null) {
  return false;
}

export function canEditClientAdministrative(role: UserRole | null) {
  return role === "owner" || role === "admin";
}
