"use client";

import type { ReactNode } from "react";
import { colors, radius } from "@/app/design";
import { useCurrentUserRole } from "@/hooks/useCurrentUserRole";
import {
  canAccessModule,
  type AppModule,
  type UserRole,
} from "@/lib/permissions";

type AccessGuardProps = {
  moduleName: AppModule;
  children: ReactNode | ((role: UserRole | null) => ReactNode);
};

export default function AccessGuard({ moduleName, children }: AccessGuardProps) {
  const { role, loading, error } = useCurrentUserRole();

  if (loading) {
    return <AccessState title="Ładowanie" description="Sprawdzamy dostęp do modułu." />;
  }

  if (error || !canAccessModule(role, moduleName)) {
    return <AccessState title="Brak dostępu" description="Nie masz uprawnień do tego modułu." />;
  }

  return <>{typeof children === "function" ? children(role) : children}</>;
}

function AccessState({ title, description }: { title: string; description: string }) {
  return (
    <section style={stateStyle}>
      <h1 style={titleStyle}>{title}</h1>
      <p style={descriptionStyle}>{description}</p>
    </section>
  );
}

const stateStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "30px",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: colors.navy,
  fontSize: "24px",
};

const descriptionStyle: React.CSSProperties = {
  color: colors.muted,
  lineHeight: 1.7,
  margin: "14px 0 0",
};
