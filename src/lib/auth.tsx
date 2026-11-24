"use client";
// Authentication + data bootstrap. Supabase Auth in cloud mode; PBKDF2-hashed
// local accounts in local mode. Exposes the signed-in profile, its role and
// a `can(permission)` check used for role-based UI gating.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createLocalBackend } from "./backends/local";
import { createSupabaseBackend, getSupabase, supabaseConfigured } from "./backends/supabase";
import { verifyPassword } from "./hash";
import { buildSeed } from "./seed";
import { db, useTable } from "./store";
import { runScheduledChecks } from "./services";
import type { Permission, Profile, Role } from "./types";

type Status = "loading" | "needs_setup" | "signed_out" | "ready" | "error";

interface AuthCtx {
  status: Status;
  mode: "local" | "supabase";
  user: Profile | null;
  role: Role | null;
  error: string | null;
  can: (p: Permission) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setup: (o: { demo: boolean; companyName?: string; ownerName?: string; ownerEmail?: string; ownerPassword?: string }) => Promise<void>;
  resetData: (demo: boolean) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const SESSION_KEY = "stoneline.session";

let bootPromise: Promise<void> | null = null;
function boot() {
  if (!bootPromise) bootPromise = db.init(supabaseConfigured() ? createSupabaseBackend() : createLocalBackend());
  return bootPromise;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const mode = supabaseConfigured() ? "supabase" : "local";
  const [status, setStatus] = useState<Status>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profiles = useTable("profiles");
  const roles = useTable("roles");

  const start = useCallback(async () => {
    try {
      if (mode === "supabase") {
        const { data } = await getSupabase().auth.getSession();
        if (!data.session) {
          setStatus("signed_out");
          return;
        }
        await boot();
        setUserId(data.session.user.id);
        db.currentUserId = data.session.user.id;
        setStatus("ready");
      } else {
        await boot();
        if (!db.all("company_settings").length) {
          setStatus("needs_setup");
          return;
        }
        const sid = localStorage.getItem(SESSION_KEY);
        const prof = sid ? db.get("profiles", sid) : undefined;
        if (prof?.active) {
          setUserId(prof.id);
          db.currentUserId = prof.id;
          setStatus("ready");
        } else setStatus("signed_out");
      }
      runScheduledChecks();
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, [mode]);

  useEffect(() => {
    void start();
  }, [start]);

  // hourly background sweep (overdue invoices, installation reminders)
  useEffect(() => {
    if (status !== "ready") return;
    const t = setInterval(runScheduledChecks, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [status]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (mode === "supabase") {
        const { error } = await getSupabase().auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        await start();
        return;
      }
      const prof = db.all("profiles").find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
      if (!prof || !(await verifyPassword(password, prof.password_hash))) throw new Error("Invalid email or password");
      if (!prof.active) throw new Error("This account is deactivated");
      localStorage.setItem(SESSION_KEY, prof.id);
      db.currentUserId = prof.id;
      setUserId(prof.id);
      setStatus("ready");
    },
    [mode, start],
  );

  const signOut = useCallback(async () => {
    if (mode === "supabase") await getSupabase().auth.signOut();
    localStorage.removeItem(SESSION_KEY);
    db.currentUserId = null;
    setUserId(null);
    setStatus("signed_out");
  }, [mode]);

  const setup = useCallback(async (o: Parameters<AuthCtx["setup"]>[0]) => {
    await boot();
    const snap = await buildSeed(o);
    await db.replaceAll(snap);
    const owner = db.all("profiles")[0];
    localStorage.setItem(SESSION_KEY, owner.id);
    db.currentUserId = owner.id;
    setUserId(owner.id);
    setStatus("ready");
    runScheduledChecks();
  }, []);

  const resetData = useCallback(
    async (demo: boolean) => {
      const s = db.all("company_settings")[0];
      const me = db.get("profiles", userId);
      const snap = await buildSeed({ demo, companyName: demo ? undefined : s?.name, ownerName: me?.full_name, ownerEmail: me?.email });
      if (!demo && me?.password_hash) (snap.profiles[0] as Profile).password_hash = me.password_hash;
      await db.replaceAll(snap);
      const owner = db.all("profiles")[0];
      localStorage.setItem(SESSION_KEY, owner.id);
      db.currentUserId = owner.id;
      setUserId(owner.id);
    },
    [userId],
  );

  const user = useMemo(() => profiles.find((p) => p.id === userId) ?? null, [profiles, userId]);
  const role = useMemo(() => roles.find((r) => r.id === user?.role_id) ?? null, [roles, user]);
  const can = useCallback((p: Permission) => !!role?.permissions.includes(p), [role]);

  const value = useMemo<AuthCtx>(() => ({ status, mode, user, role, error, can, signIn, signOut, setup, resetData }), [status, mode, user, role, error, can, signIn, signOut, setup, resetData]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

/** Boots the data layer without requiring a staff session (customer portal). */
export async function bootData() {
  await boot();
}
