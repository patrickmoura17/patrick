"use client";
// Full-screen workspaces (no sidebar) — e.g. the countertop quote builder on a tablet.
import { AuthProvider } from "@/lib/auth";
import { AuthGate } from "@/components/gate";

export default function FullLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
