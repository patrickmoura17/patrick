"use client";
// Login, first-run setup and permission gate.
import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTable } from "@/lib/store";
import type { Permission } from "@/lib/types";
import { Button, Card, EmptyState, Field, Input, Segmented, useToast } from "./ui";
import { Logo } from "./shell";

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="noise relative flex min-h-screen items-center justify-center bg-ink-950 p-4">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.04]" style={{ backgroundSize: "48px 48px" }} />
      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 flex justify-center">
          <Logo name="Stoneline" />
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-stone-500">Tile · Flooring · Cabinetry · Countertops</p>
      </div>
    </div>
  );
}

const DEMO_USERS = [
  ["owner@stoneline.demo", "Owner"],
  ["office@stoneline.demo", "Office Manager"],
  ["sales@stoneline.demo", "Sales Rep"],
  ["pm@stoneline.demo", "Project Manager"],
  ["estimator@stoneline.demo", "Estimator"],
  ["field@stoneline.demo", "Field Employee"],
  ["sub@stoneline.demo", "Subcontractor"],
];

function Login() {
  const { signIn, mode } = useAuth();
  const profiles = useTable("profiles");
  const isDemo = profiles.some((p) => p.email.endsWith("@stoneline.demo"));
  const [email, setEmail] = useState(isDemo ? "owner@stoneline.demo" : "");
  const [password, setPassword] = useState(isDemo ? "stoneline" : "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e?: React.FormEvent, em = email, pw = password) => {
    e?.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await signIn(em, pw);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Splash>
      <Card className="p-7">
        <h1 className="text-xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-stone-500">Sign in to your company workspace.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Field label="Email">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {err && <p className="rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700">{err}</p>}
          <Button variant="primary" size="lg" className="w-full" loading={busy} type="submit">
            Sign in
          </Button>
        </form>
        {isDemo && mode === "local" && (
          <div className="mt-6 border-t border-stone-100 pt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Demo accounts · password “stoneline”</p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_USERS.map(([em, label]) => (
                <button
                  key={em}
                  onClick={() => {
                    setEmail(em);
                    setPassword("stoneline");
                    void submit(undefined, em, "stoneline");
                  }}
                  className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-left text-xs font-medium text-ink-800 transition hover:border-brass-300 hover:bg-brass-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </Splash>
  );
}

function Setup() {
  const { setup } = useAuth();
  const { toast } = useToast();
  const [kind, setKind] = useState<"demo" | "fresh">("demo");
  const [f, setF] = useState({ companyName: "", ownerName: "", ownerEmail: "", ownerPassword: "" });
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "fresh" && f.ownerPassword.length < 8) return toast("Password must be at least 8 characters", "error");
    setBusy(true);
    try {
      await setup(kind === "demo" ? { demo: true } : { demo: false, ...f });
    } catch (x) {
      toast((x as Error).message, "error");
      setBusy(false);
    }
  };
  return (
    <Splash>
      <Card className="p-7">
        <h1 className="text-xl font-semibold">Set up your workspace</h1>
        <p className="mt-1 text-sm text-stone-500">Data is stored in this browser (IndexedDB). Connect Supabase for multi-user cloud mode.</p>
        <Segmented
          className="mt-5 w-full [&>button]:flex-1 [&>button]:justify-center"
          value={kind}
          onChange={setKind}
          options={[
            { key: "demo", label: "Explore with demo company" },
            { key: "fresh", label: "Start my company" },
          ]}
        />
        <form className="mt-5 space-y-4" onSubmit={go}>
          {kind === "demo" ? (
            <p className="rounded-lg bg-stone-50 p-3 text-sm leading-relaxed text-stone-600">
              Loads <b>Stoneline Interiors</b> with 12 months of history: leads, estimates, active projects, crews, materials, invoices and payments. Sign in as any of the 7 roles. You can wipe it later in Settings.
            </p>
          ) : (
            <>
              <Field label="Company name" required>
                <Input required value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} />
              </Field>
              <Field label="Your name" required>
                <Input required value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} />
              </Field>
              <Field label="Email" required>
                <Input type="email" required value={f.ownerEmail} onChange={(e) => setF({ ...f, ownerEmail: e.target.value })} />
              </Field>
              <Field label="Password" required hint="At least 8 characters">
                <Input type="password" required value={f.ownerPassword} onChange={(e) => setF({ ...f, ownerPassword: e.target.value })} />
              </Field>
            </>
          )}
          <Button variant="brass" size="lg" className="w-full" loading={busy} type="submit">
            {kind === "demo" ? "Launch demo workspace" : "Create workspace"}
          </Button>
        </form>
      </Card>
    </Splash>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, error } = useAuth();
  if (status === "loading")
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <Loader2 className="h-6 w-6 animate-spin text-brass-400" />
      </div>
    );
  if (status === "error")
    return (
      <Splash>
        <Card className="p-7">
          <h1 className="text-lg font-semibold">Could not connect</h1>
          <p className="mt-2 text-sm text-stone-600">{error}</p>
        </Card>
      </Splash>
    );
  if (status === "needs_setup") return <Setup />;
  if (status === "signed_out") return <Login />;
  return <>{children}</>;
}

export function RequirePerm({ perm, children }: { perm: Permission | Permission[]; children: React.ReactNode }) {
  const { can } = useAuth();
  const ok = Array.isArray(perm) ? perm.some(can) : can(perm);
  if (!ok)
    return (
      <Card>
        <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="You don't have access to this area" body="Ask an administrator to update your role permissions in Settings → Roles." />
      </Card>
    );
  return <>{children}</>;
}
