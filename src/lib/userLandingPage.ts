// Landing-page preferences only; module and database permissions remain unchanged.
export function getUserLandingPage(userId?: string | null) {
  return userId === "c6608906-441a-4030-a507-9c675bd93f8e" ? "/crm" : "/dashboard";
}
