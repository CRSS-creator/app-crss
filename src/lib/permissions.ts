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
  | "budzet"
  | "aml"
  | "rodo"
  | "uzytkownicy";

const accountingRoles = ["accountant", "opiekun_ksiegowy", "ksiegowy"];
const salesRoles = ["handlowiec"];
const fullClientEditorUserIds = ["282ae06c-5d1f-4fe6-a5e9-8495b478c247"];

const moduleAccess: Record<AppModule, string[]> = {
  dashboard: ["owner", "manager", "admin", ...accountingRoles],
  powiadomienia: ["owner", "manager", "admin", ...accountingRoles],
  klienci: ["owner", "manager", "admin", ...accountingRoles],
  zadania: ["owner", "manager", "admin", ...accountingRoles],
  rozliczenia: ["owner", "manager", "admin", ...accountingRoles],
  komunikaty: ["owner", "manager", "admin", ...accountingRoles],
  kadry: ["owner", "manager", "admin", ...accountingRoles],
  limity: ["owner", "manager", "admin", ...accountingRoles],
  onboarding: ["owner", "manager", "admin", ...accountingRoles],
  "zamykanie-roku": ["owner", "manager", "admin"],
  crm: ["owner", "admin", ...salesRoles],
  umowy: ["owner", "admin"],
  faktury: ["owner", "admin"],
  cso: ["owner", "admin", ...salesRoles],
  cfo: ["owner"],
  budzet: ["owner"],
  aml: ["owner", "manager", "admin"],
  rodo: ["owner", "manager", "admin"],
  uzytkownicy: ["owner", "manager", "admin", ...accountingRoles],
};

export function canAccessModule(role: UserRole | null, moduleName: AppModule) {
  if (!role) return false;
  if (role === "admin") return true;
  return moduleAccess[moduleName]?.includes(role) ?? false;
}

export function canManageClients(role: UserRole | null) {
  return role === "owner" || role === "manager" || role === "admin";
}

export function canEditClientAdministrative(role: UserRole | null, userId?: string | null) {
  return canManageClients(role) || Boolean(userId && fullClientEditorUserIds.includes(userId));
}
