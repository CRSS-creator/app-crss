"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { colors, radius } from "@/app/design";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import { canAccessModule, type AppModule } from "@/lib/permissions";
import { createDueTaskNotifications, fetchUnreadNotificationsCount } from "@/lib/notificationService";
import UserAccessPanel from "@/components/UserAccessPanel";
import ContractRegisterSplitWidget from "@/components/ContractRegisterSplitWidget";
import CrmDetailsLayoutFixWidget from "@/components/CrmDetailsLayoutFixWidget";
import RodoRegisterPrintWidget from "@/components/RodoRegisterPrintWidget";
import {
  Home,
  Users,
  ListTodo,
  BarChart3,
  CalendarClock,
  TriangleAlert,
  Rocket,
  FolderCheck,
  Wallet,
  ShieldCheck,
  LockKeyhole,
  UserCog,
  BriefcaseBusiness,
  FileText,
  Bell,
  Megaphone,
} from "lucide-react";

type ActivePage = AppModule;

type AppLayoutProps = {
  children: React.ReactNode;
  activePage: ActivePage;
};

const menu = [
  {
    title: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home, page: "dashboard" },
      { href: "/powiadomienia", label: "Powiadomienia", icon: Bell, page: "powiadomienia" },
    ],
  },
  {
    title: "Operacyjne",
    items: [
      { href: "/klienci", label: "Klienci", icon: Users, page: "klienci" },
      { href: "/zadania", label: "Zadania", icon: ListTodo, page: "zadania" },
      { href: "/rozliczenia", label: "Rozliczenia", icon: BarChart3, page: "rozliczenia" },
      { href: "/kadry", label: "Kadry i terminy", icon: CalendarClock, page: "kadry" },
      { href: "/limity", label: "Limity", icon: TriangleAlert, page: "limity" },
      { href: "/onboarding", label: "Onboarding", icon: Rocket, page: "onboarding" },
      { href: "/zamykanie-roku", label: "Zamykanie roku", icon: FolderCheck, page: "zamykanie-roku" },
    ],
  },
  {
    title: "Zarządzanie",
    items: [
      { href: "/crm", label: "CRM", icon: BriefcaseBusiness, page: "crm" },
      { href: "/crm/umowy", label: "Umowy", icon: FileText, page: "umowy" },
      { href: "/faktury", label: "Faktury", icon: FileText, page: "faktury" },
      { href: "/cso", label: "CSO", icon: Megaphone, page: "cso" },
      { href: "/cfo", label: "CFO", icon: Wallet, page: "cfo" },
      { href: "/aml", label: "AML", icon: ShieldCheck, page: "aml" },
      { href: "/rodo", label: "RODO", icon: LockKeyhole, page: "rodo" },
    ],
  },
  {
    title: "Ustawienia",
    items: [{ href: "/uzytkownicy", label: "Ustawienia", icon: UserCog, page: "uzytkownicy" }],
  },
] as const;

export default function AppLayout({ children, activePage }: AppLayoutProps) {
  const { role, loading: roleLoading } = useCurrentUserRole();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (roleLoading || !role || !canAccessModule(role, "powiadomienia")) return;
    loadUnreadCount();
  }, [roleLoading, role]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const mustChangePassword = Boolean(
        data.user?.app_metadata?.must_change_password ||
        data.user?.user_metadata?.must_change_password
      );

      if (mustChangePassword && pathname !== "/zmiana-hasla") {
        window.location.href = "/zmiana-hasla";
      }
    });
  }, [pathname]);

  async function loadUnreadCount() {
    await createDueTaskNotifications();
    const { count } = await fetchUnreadNotificationsCount();
    setUnreadCount(count || 0);
  }

  const visibleMenu = menu
    .map((section) => ({
      ...section,
      items: roleLoading
        ? section.items
        : section.items.filter((item) => canAccessModule(role, item.page)),
    }))
    .filter((section) => section.items.length > 0);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main style={appStyle}>
      <aside style={sidebarStyle}>
        <div style={brandStyle}>
          <div style={logoBoxStyle}>
            <img src="/logo-crss.svg" alt="CRSS" style={logoStyle} />
          </div>

          <div>
            <div style={appNameStyle}>Aplikacja CRSS</div>
            <div style={appSubtitleStyle}>Panel operacyjny</div>
          </div>
        </div>

        <nav style={navStyle}>
          {visibleMenu.map((section) => (
            <div key={section.title ?? "main"}>
              {section.title && <div style={sectionTitleStyle}>{section.title}</div>}

              <div style={sectionItemsStyle}>
                {section.items.map((item) => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={activePage === item.page}
                    badge={item.page === "powiadomienia" ? unreadCount : 0}
                    highlighted={item.page === "powiadomienia" && unreadCount > 0}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <button onClick={handleLogout} style={logoutButtonStyle}>
          Wyloguj
        </button>
      </aside>

      <section data-active-page={activePage} style={contentStyle}>
        {children}
        {activePage === "crm" && <CrmDetailsLayoutFixWidget />}
        {activePage === "umowy" && <ContractRegisterSplitWidget />}
        {activePage === "rodo" && <RodoRegisterPrintWidget />}
        {activePage === "uzytkownicy" && <UserAccessPanel />}
      </section>
    </main>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  badge,
  highlighted,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: number;
  highlighted?: boolean;
}) {
  const itemStyle = active ? activeNavItem : highlighted ? unreadNavItem : navItem;

  return (
    <a href={href} style={itemStyle}>
      <Icon size={18} strokeWidth={2.2} />
      <span style={navLabelStyle}>{label}</span>
      {highlighted && !active && <span style={unreadDotStyle} />}
      {Boolean(badge) && <span style={active ? activeBadgeStyle : badgeStyle}>{badge}</span>}
    </a>
  );
}

const appStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  background: colors.background,
  color: colors.text,
};

const sidebarStyle: React.CSSProperties = {
  width: "270px",
  minHeight: "100vh",
  padding: "24px",
  background: colors.card,
  borderRight: `1px solid ${colors.border}`,
  boxShadow: "none",
  display: "flex",
  flexDirection: "column",
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  marginBottom: "30px",
};

const logoBoxStyle: React.CSSProperties = {
  width: "72px",
  height: "52px",
  borderRadius: radius.card,
  background: colors.card,
  border: `1px solid ${colors.border}`,
  boxShadow: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const logoStyle: React.CSSProperties = {
  width: "52px",
  height: "auto",
};

const appNameStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 800,
  color: colors.text,
};

const appSubtitleStyle: React.CSSProperties = {
  marginTop: "3px",
  fontSize: "12px",
  color: colors.muted,
};

const navStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "20px",
};

const sectionItemsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 9px 10px",
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: colors.muted,
};

const navItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "13px 15px",
  borderRadius: radius.button,
  color: colors.text,
  fontWeight: 650,
  cursor: "pointer",
  textDecoration: "none",
  transition: "all 0.18s ease",
  border: "1px solid transparent",
};

const activeNavItem: React.CSSProperties = {
  ...navItem,
  background: colors.navy,
  color: colors.white,
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
};

const unreadNavItem: React.CSSProperties = {
  ...navItem,
  background: "rgba(241, 51, 84, 0.08)",
  borderColor: "rgba(241, 51, 84, 0.28)",
  color: colors.navy,
};

const navLabelStyle: React.CSSProperties = { flex: 1 };
const unreadDotStyle: React.CSSProperties = { width: "8px", height: "8px", borderRadius: "999px", background: colors.red, boxShadow: "0 0 0 4px rgba(241, 51, 84, 0.12)" };
const badgeStyle: React.CSSProperties = { minWidth: "22px", height: "22px", borderRadius: radius.badge, background: colors.red, color: colors.white, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 850 };
const activeBadgeStyle: React.CSSProperties = { ...badgeStyle, background: colors.white, color: colors.navy };

const logoutButtonStyle: React.CSSProperties = {
  marginTop: "auto",
  border: "none",
  borderRadius: radius.button,
  padding: "15px 18px",
  background: colors.red,
  color: colors.white,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "none",
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  padding: "42px",
};
