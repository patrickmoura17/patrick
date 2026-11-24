"use client";
import { useEffect } from "react";
import { ToastProvider, useToast } from "@/components/ui";
import { db } from "@/lib/store";

function ErrorBridge() {
  const { toast } = useToast();
  useEffect(() => {
    db.onError = (m) => toast(m, "error");
  }, [toast]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ErrorBridge />
      {children}
    </ToastProvider>
  );
}
