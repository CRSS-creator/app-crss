"use client";

import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { BookOpen } from "lucide-react";
import { colors, radius } from "@/app/design";

export default function ProceduresPage() {
  return (
    <AppLayout activePage="procedury">
      <AccessGuard moduleName="procedury">
        <header style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, color: colors.navy, fontSize: 42, lineHeight: 1.15 }}>Procedury/wzory</h1>
          <p style={{ margin: "12px 0 0", color: colors.muted, lineHeight: 1.6 }}>
            Procedury biura i wzory dokumentów w jednym miejscu.
          </p>
        </header>
        <section aria-label="Procedury i wzory dokumentów" style={{
          background: colors.card, border: `1px solid ${colors.border}`,
          borderRadius: radius.card, padding: "48px 24px", textAlign: "center",
        }}>
          <BookOpen size={40} strokeWidth={1.5} color={colors.navy} aria-hidden="true" />
          <h2 style={{ margin: "18px 0 10px", color: colors.navy, fontSize: 22 }}>Brak materiałów</h2>
          <p style={{ margin: 0, color: colors.muted, lineHeight: 1.6 }}>
            Nie dodano jeszcze procedur ani wzorów dokumentów.
          </p>
        </section>
      </AccessGuard>
    </AppLayout>
  );
}
