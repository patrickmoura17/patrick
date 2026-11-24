"use client";
import { AuthProvider } from "@/lib/auth";
import { AuthGate } from "@/components/gate";
import { AppShell } from "@/components/shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </AuthProvider>
  );
}
