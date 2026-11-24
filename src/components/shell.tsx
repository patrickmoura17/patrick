"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Bell, Boxes, Calendar, ClipboardList, FileSignature, FileText, FolderKanban, FolderOpen, HardHat, LayoutDashboard,
  LogOut, Menu as MenuIcon, Ruler, Search, Settings, Target, Users, Wallet, Workflow, X, GitPullRequestArrow, ExternalLink, PenTool,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { db, useSettings, useTable } from "@/lib/store";
import { custName } from "@/lib/services";
import { ago } from "@/lib/format";
import type { Permission } from "@/lib/types";
import { Avatar, Badge, cn, Menu } from "./ui";

const NAV: { section: string; items: { href: string; label: string; icon: React.ElementType; perm: Permission }[] }[] = [
  { section: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" }] },
  {
    section: "Sales",
    items: [
      { href: "/leads", label: "Leads & Pipeline", icon: Target, perm: "leads.view" },
      { href: "/customers", label: "Customers", icon: Users, perm: "customers.view" },
      { href: "/estimates", label: "Estimates", icon: FileSignature, perm: "estimates.view" },
      { href: "/countertops", label: "Countertop Quotes", icon: PenTool, perm: "estimates.view" },
      { href: "/measurements", label: "Measurements", icon: Ruler, perm: "measurements.view" },
    ],
  },
  {
    section: "Operations",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban, perm: "projects.view" },
      { href: "/calendar", label: "Schedule", icon: Calendar, perm: "calendar.view" },
      { href: "/change-orders", label: "Change Orders", icon: GitPullRequestArrow, perm: "projects.view" },
      { href: "/team", label: "Team & Crews", icon: HardHat, perm: "team.view" },
      { href: "/inventory", label: "Materials", icon: Boxes, perm: "inventory.view" },
    ],
  },
  {
    section: "Business",
    items: [
      { href: "/finance", label: "Financials", icon: Wallet, perm: "finance.view" },
      { href: "/documents", label: "Documents", icon: FolderOpen, perm: "documents.view" },
      { href: "/reports", label: "Reports", icon: BarChart3, perm: "reports.view" },
      { href: "/automations", label: "Automations", icon: Workflow, perm: "automations.manage" },
      { href: "/settings", label: "Settings", icon: Settings, perm: "settings.manage" },
    ],
  },
];

function Logo({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-brass-300 to-brass-600 shadow-inner">
        <div className="grid grid-cols-2 gap-[2px]">
          <span className="h-2 w-2 rounded-[2px] bg-white/95" />
          <span className="h-2 w-2 rounded-[2px] bg-white/60" />
          <span className="h-2 w-2 rounded-[2px] bg-white/60" />
          <span className="h-2 w-2 rounded-[2px] bg-white/95" />
        </div>
      </div>
      <div className="leading-tight">
        <p className="text-[14px] font-semibold tracking-tight text-white">{name}</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brass-300/80">Operating System</p>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { can, role } = useAuth();
  const s = useSettings();
  const leads = useTable("leads");
  const invoices = useTable("invoices");
  const counts: Record<string, number> = {
    "/leads": leads.filter((l) => l.status === "open").length,
    "/finance": invoices.filter((i) => i.status === "overdue").length,
  };
  return (
    <div className="flex h-full flex-col bg-ink-900 text-stone-300">
      <div className="px-4 pb-4 pt-5">
        <Logo name={s?.name ?? "Stoneline"} />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV.map((sec) => {
          const items = sec.items.filter((i) => can(i.perm) || (i.href === "/settings" && can("users.manage")));
          if (!items.length) return null;
          return (
            <div key={sec.section}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{sec.section}</p>
              <div className="space-y-0.5">
                {items.map((it) => {
                  const active = path === it.href || path.startsWith(it.href + "/");
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={onNavigate}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] font-medium transition",
                        active ? "bg-white/[.08] text-white" : "text-stone-400 hover:bg-white/[.04] hover:text-stone-100",
                      )}
                    >
                      <it.icon className={cn("h-[17px] w-[17px]", active ? "text-brass-300" : "text-stone-500 group-hover:text-stone-300")} />
                      <span className="flex-1">{it.label}</span>
                      {counts[it.href] ? (
                        <span className={cn("rounded-md px-1.5 text-[11px] tabular-nums", it.href === "/finance" ? "bg-clay-600/80 text-white" : "bg-white/10 text-stone-300")}>{counts[it.href]}</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/5 p-3">
        <Link href="/inquiry" target="_blank" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-stone-400 hover:bg-white/5 hover:text-stone-200">
          <ExternalLink className="h-3.5 w-3.5" /> Public inquiry form
        </Link>
        <p className="px-2.5 pt-1 text-[10px] uppercase tracking-wider text-stone-600">{role?.name}</p>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const customers = useTable("customers");
  const leads = useTable("leads");
  const estimates = useTable("estimates");
  const projects = useTable("projects");
  const invoices = useTable("invoices");
  const inventory = useTable("inventory_items");
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    const c = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", h);
    document.addEventListener("mousedown", c);
    return () => {
      window.removeEventListener("keydown", h);
      document.removeEventListener("mousedown", c);
    };
  }, []);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const m = (...f: (string | undefined | null)[]) => f.some((x) => x?.toLowerCase().includes(s));
    const out: { group: string; label: string; sub: string; href: string }[] = [];
    customers.filter((c) => m(c.first_name + " " + c.last_name, c.company, c.email, c.phone, c.project_address)).slice(0, 5).forEach((c) => out.push({ group: "Customers", label: custName(c), sub: c.project_address || c.email, href: `/customers/${c.id}` }));
    leads.filter((l) => m(l.title, custName(db.get("customers", l.customer_id)))).slice(0, 4).forEach((l) => out.push({ group: "Leads", label: l.title, sub: custName(db.get("customers", l.customer_id)), href: `/leads/${l.id}` }));
    estimates.filter((e) => m(e.number, e.title, custName(db.get("customers", e.customer_id)))).slice(0, 4).forEach((e) => out.push({ group: "Estimates", label: `${e.number} · ${e.title}`, sub: custName(db.get("customers", e.customer_id)), href: `/estimates/${e.id}` }));
    projects.filter((p) => m(p.number, p.name, p.address)).slice(0, 4).forEach((p) => out.push({ group: "Projects", label: `${p.number} · ${p.name}`, sub: p.stage, href: `/projects/${p.id}` }));
    invoices.filter((i) => m(i.number, custName(db.get("customers", i.customer_id)))).slice(0, 4).forEach((i) => out.push({ group: "Invoices", label: i.number, sub: custName(db.get("customers", i.customer_id)), href: `/finance/invoices/${i.id}` }));
    inventory.filter((i) => m(i.name, i.sku, i.manufacturer)).slice(0, 3).forEach((i) => out.push({ group: "Materials", label: i.name, sub: i.sku, href: `/inventory?item=${i.id}` }));
    return out;
  }, [q, customers, leads, estimates, projects, invoices, inventory]);
  const groups = [...new Set(results.map((r) => r.group))];
  return (
    <div className="relative w-full max-w-md" ref={ref}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search customers, projects, estimates…"
        className="h-9 w-full rounded-lg border border-stone-200 bg-stone-50 pl-9 pr-14 text-sm placeholder:text-stone-400 focus:border-brass-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brass-300/30"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-stone-200 bg-white px-1.5 text-[10px] font-medium text-stone-400 sm:block">⌘K</kbd>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-[70vh] animate-rise overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-pop">
          {!results.length && <p className="px-3 py-6 text-center text-sm text-stone-500">No matches for “{q}”</p>}
          {groups.map((g) => (
            <div key={g} className="mb-1">
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">{g}</p>
              {results
                .filter((r) => r.group === g)
                .map((r) => (
                  <button
                    key={r.href}
                    onClick={() => {
                      router.push(r.href);
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left hover:bg-stone-100"
                  >
                    <span className="truncate text-sm font-medium text-ink-900">{r.label}</span>
                    <span className="truncate text-xs text-stone-500">{r.sub}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function useMyNotifications() {
  const { user, role } = useAuth();
  const all = useTable("notifications");
  return useMemo(
    () =>
      all
        .filter((n) => (n.user_id ? n.user_id === user?.id : !n.role_keys.length || (role && n.role_keys.includes(role.key))))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [all, user, role],
  );
}

function Notifications() {
  const { user } = useAuth();
  const router = useRouter();
  const notes = useMyNotifications();
  const unread = notes.filter((n) => user && !n.read_by.includes(user.id));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", c);
    return () => document.removeEventListener("mousedown", c);
  }, []);
  const markAll = () => unread.forEach((n) => db.update("notifications", n.id, { read_by: [...n.read_by, user!.id] }));
  const dot = { info: "bg-slateblue-500", success: "bg-sage-500", warning: "bg-amberx-500", danger: "bg-clay-500" };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-ink-900" aria-label="Notifications">
        <Bell className="h-[18px] w-[18px]" />
        {unread.length > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-clay-600 px-1 text-[10px] font-semibold text-white">{unread.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-[min(380px,calc(100vw-24px))] animate-rise overflow-hidden rounded-xl border border-stone-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread.length > 0 && (
              <button className="text-xs font-medium text-brass-600 hover:text-brass-700" onClick={markAll}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {!notes.length && <p className="px-4 py-10 text-center text-sm text-stone-500">You&apos;re all caught up.</p>}
            {notes.slice(0, 30).map((n) => {
              const isUnread = user && !n.read_by.includes(user.id);
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (isUnread) db.update("notifications", n.id, { read_by: [...n.read_by, user!.id] });
                    setOpen(false);
                    if (n.link) router.push(n.link);
                  }}
                  className={cn("flex w-full gap-3 border-b border-stone-50 px-4 py-3 text-left hover:bg-stone-50", isUnread && "bg-brass-50/40")}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot[n.kind] ?? "bg-stone-400")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", isUnread ? "font-semibold text-ink-900" : "text-ink-800")}>{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-stone-500">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-stone-400">{ago(n.created_at)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, role, signOut, mode } = useAuth();
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const path = usePathname();
  useEffect(() => setMobile(false), [path]);
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block">
        <Sidebar />
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setMobile(false)} />
          <div className="absolute inset-y-0 left-0 w-[272px] animate-rise shadow-pop">
            <Sidebar onNavigate={() => setMobile(false)} />
            <button className="absolute right-3 top-5 rounded-md p-1 text-stone-400 hover:text-white" onClick={() => setMobile(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-stone-200/80 bg-white/85 px-4 backdrop-blur-md md:px-6">
          <button className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu">
            <MenuIcon className="h-5 w-5" />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1.5">
            {mode === "local" && (
              <Badge tone="brass" className="hidden md:inline-flex">
                Local mode
              </Badge>
            )}
            <Notifications />
            {user && (
              <Menu
                trigger={
                  <button className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-stone-100">
                    <Avatar name={user.full_name} color={user.color} size={30} />
                    <span className="hidden text-left leading-tight md:block">
                      <span className="block text-[13px] font-semibold text-ink-900">{user.full_name}</span>
                      <span className="block text-[11px] text-stone-500">{role?.name}</span>
                    </span>
                  </button>
                }
                items={[
                  { label: "My tasks & schedule", icon: <ClipboardList />, onClick: () => router.push("/calendar") },
                  { label: "Documents", icon: <FileText />, onClick: () => router.push("/documents") },
                  "divider",
                  { label: "Sign out", icon: <LogOut />, danger: true, onClick: () => void signOut() },
                ]}
              />
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export { Logo };
