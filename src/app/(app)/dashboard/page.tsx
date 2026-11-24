"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDollarSign, ClipboardCheck, FileSignature, FolderKanban, Gauge, Hammer,
  Plus, Receipt, Target, TrendingUp, Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { db, useSnapshot } from "@/lib/store";
import { computeAnalytics } from "@/lib/analytics";
import { addDaysISO, todayISO } from "@/lib/calc";
import { ago, compactMoney, fmtTime, money0, pct } from "@/lib/format";
import { custName } from "@/lib/services";
import { CHART_SERVICE_ORDER, EVENT_META, SERVICE_META, StageBadge } from "@/components/status";
import { DonutChart, FunnelBars, LegendList, ProfitBars, RevenueChart, HBarChart } from "@/components/charts";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Progress, Stat, cn } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import { PROJECT_STAGES } from "@/lib/types";

const ACT_ICON: Record<string, React.ReactNode> = {
  call: "📞", email: "✉️", sms: "💬", meeting: "🤝", note: "📝", site_visit: "📐", system: "⚙️", portal: "🏠",
};

export default function Dashboard() {
  return (
    <RequirePerm perm="dashboard.view">
      <DashboardInner />
    </RequirePerm>
  );
}

function DashboardInner() {
  const S = useSnapshot();
  const { user, can } = useAuth();
  const router = useRouter();
  const today = todayISO();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const A = useMemo(() => computeAnalytics(S, addDaysISO(today, -365), today), [S, today]);
  const ytd = useMemo(() => S.payments.filter((p) => p.date >= yearStart).reduce((s, p) => s + p.amount, 0), [S.payments, yearStart]);
  const newLeads = S.leads.filter((l) => l.created_at.slice(0, 10) >= addDaysISO(today, -30));
  const tasksToday = S.project_tasks.filter((t) => !t.done && t.due_date && t.due_date <= today && t.kind !== "checklist");
  const followUps = S.leads.filter((l) => l.status === "open" && l.follow_up_date && l.follow_up_date <= today);
  const upcomingEvents = S.events
    .filter((e) => e.status !== "cancelled" && e.start.slice(0, 10) >= today && e.start.slice(0, 10) <= addDaysISO(today, 7))
    .sort((a, b) => a.start.localeCompare(b.start));
  // collapse multi-day install blocks
  const seen = new Set<string>();
  const agenda = upcomingEvents.filter((e) => {
    const k = e.type === "installation" && e.project_id ? e.project_id : e.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 7);

  const catData = CHART_SERVICE_ORDER.filter((c) => A.byCat[c]).map((c) => ({ name: SERVICE_META[c].label, value: A.byCat[c], color: SERVICE_META[c].color }));
  const profitData = A.fin
    .filter(({ p }) => p.stage !== "Contract Signed")
    .sort((a, b) => (b.p.completed_at ?? b.p.start_date ?? "").localeCompare(a.p.completed_at ?? a.p.start_date ?? ""))
    .slice(0, 8)
    .reverse()
    .map(({ p, f }) => ({ name: p.name.split(/[ —-]/)[0], estimated: f.estimatedProfit, actual: ["Closed", "Final Payment", "Completed", "Quality Inspection"].includes(p.stage) ? f.actualProfit : f.contract - Math.max(f.actualCost, 0) - Math.max(0, f.estimatedCost - f.actualCost) }));
  const repData = A.reps.sort((a, b) => b.wonValue - a.wonValue).map((r) => ({ name: r.name, value: r.wonValue }));
  const activity = [...S.activities].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12);
  const trend = A.revenuePrevMonth ? ((A.revenueThisMonth - A.revenuePrevMonth) / A.revenuePrevMonth) * 100 : null;
  const finOK = can("finance.view");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-stone-500">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {user?.full_name.split(" ")[0]}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("leads.edit") && <Button icon={<Plus className="h-4 w-4" />} onClick={() => router.push("/leads?new=1")}>New lead</Button>}
          {can("estimates.edit") && <Button icon={<FileSignature className="h-4 w-4" />} onClick={() => router.push("/estimates?new=1")}>New estimate</Button>}
          {can("finance.edit") && <Button variant="primary" icon={<Receipt className="h-4 w-4" />} onClick={() => router.push("/finance?new=invoice")}>New invoice</Button>}
        </div>
      </div>

      {(A.overdue.length > 0 || followUps.length > 0) && (
        <div className="flex flex-col gap-2 md:flex-row">
          {finOK && A.overdue.length > 0 && (
            <Link href="/finance?status=overdue" className="flex flex-1 items-center gap-3 rounded-xl border border-clay-100 bg-clay-50 px-4 py-3 text-sm text-clay-700 hover:border-clay-500/40">
              <AlertTriangle className="h-4 w-4" />
              <span><b>{A.overdue.length} overdue invoice{A.overdue.length > 1 ? "s" : ""}</b> · {money0(A.overdueAmount)} past due</span>
              <ArrowRight className="ml-auto h-4 w-4" />
            </Link>
          )}
          {followUps.length > 0 && (
            <Link href="/leads?filter=followup" className="flex flex-1 items-center gap-3 rounded-xl border border-amberx-100 bg-amberx-50 px-4 py-3 text-sm text-amberx-600 hover:border-amberx-500/40">
              <CalendarClock className="h-4 w-4" />
              <span><b>{followUps.length} lead follow-up{followUps.length > 1 ? "s" : ""}</b> due today or overdue</span>
              <ArrowRight className="ml-auto h-4 w-4" />
            </Link>
          )}
        </div>
      )}

      {finOK && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Revenue YTD" value={money0(ytd)} icon={<CircleDollarSign className="h-4 w-4" />} sub={`${money0(A.totalCollectedAllTime)} all-time`} onClick={() => router.push("/reports")} />
          <Stat label="Revenue this month" value={money0(A.revenueThisMonth)} icon={<TrendingUp className="h-4 w-4" />} trend={trend !== null ? { value: pct(Math.abs(trend), 0), up: trend >= 0 } : null} sub="vs last month" />
          <Stat label="Outstanding invoices" value={money0(A.outstanding)} icon={<Wallet className="h-4 w-4" />} sub={<span className={A.overdueAmount ? "text-clay-600" : ""}>{money0(A.overdueAmount)} overdue</span>} onClick={() => router.push("/finance")} />
          <Stat label="Open project value" value={money0(A.totalProjectValue)} icon={<FolderKanban className="h-4 w-4" />} sub={`${A.openProjects.length} open projects`} onClick={() => router.push("/projects")} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MiniStat icon={<Hammer />} label="Active projects" value={A.active.length} href="/projects" />
        <MiniStat icon={<CalendarClock />} label="Upcoming projects" value={A.upcoming.length} href="/projects" />
        <MiniStat icon={<Target />} label="New leads (30d)" value={newLeads.length} href="/leads" />
        <MiniStat icon={<Gauge />} label="Conversion rate" value={pct(A.conversion, 0)} href="/reports" />
        <MiniStat icon={<FileSignature />} label="Pending estimates" value={A.estimatesPending.length} sub={compactMoney(A.pendingValue)} href="/estimates" />
        <MiniStat icon={<ClipboardCheck />} label="Tasks due today" value={tasksToday.length + followUps.length} href="/projects" />
      </div>

      {finOK && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Monthly revenue" subtitle="Payments collected · last 12 months" actions={<Link href="/reports" className="text-xs font-medium text-brass-600 hover:text-brass-700">Full report →</Link>} />
            <div className="px-3 pb-3 pt-4">
              <RevenueChart data={A.monthly} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Revenue by service" subtitle="Contract value booked · 12 months" />
            <div className="p-5">
              {catData.length ? (
                <>
                  <DonutChart data={catData} height={180} center={{ label: "Booked", value: compactMoney(catData.reduce((s, d) => s + d.value, 0)) }} />
                  <div className="mt-4">
                    <LegendList data={catData} fmt={compactMoney} />
                  </div>
                </>
              ) : (
                <EmptyState title="No booked projects yet" />
              )}
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Lead conversion funnel" subtitle="Leads reaching each stage · 12 months" />
          <div className="p-5">
            <FunnelBars data={A.funnel} />
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-100 pt-4 text-center">
              <div><p className="text-lg font-semibold tabular-nums">{A.leadsInRange.length}</p><p className="text-[11px] uppercase tracking-wide text-stone-500">Leads</p></div>
              <div><p className="text-lg font-semibold tabular-nums">{pct(A.conversion, 0)}</p><p className="text-[11px] uppercase tracking-wide text-stone-500">Win rate</p></div>
              <div><p className="text-lg font-semibold tabular-nums">{compactMoney(A.pipelineValue)}</p><p className="text-[11px] uppercase tracking-wide text-stone-500">Weighted pipeline</p></div>
            </div>
          </div>
        </Card>
        {finOK && (
          <Card className="xl:col-span-2">
            <CardHeader title="Project profitability" subtitle="Estimated vs. actual gross profit · recent projects" actions={<div className="text-right text-xs"><span className="text-stone-500">Avg project </span><b className="tabular-nums">{money0(A.avgProject)}</b></div>} />
            <div className="px-3 pb-3 pt-4">
              <ProfitBars data={profitData} height={260} />
            </div>
          </Card>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Upcoming appointments" subtitle="Next 7 days" actions={<Link href="/calendar" className="text-xs font-medium text-brass-600">Calendar →</Link>} />
          <div className="divide-y divide-stone-100">
            {!agenda.length && <EmptyState title="Nothing scheduled" />}
            {agenda.map((e) => {
              const crew = e.crew_id ? db.get("crews", e.crew_id) : undefined;
              return (
                <Link key={e.id} href={e.project_id ? `/projects/${e.project_id}` : e.lead_id ? `/leads/${e.lead_id}` : "/calendar"} className="flex gap-3 px-5 py-3 hover:bg-stone-50">
                  <div className="w-12 shrink-0 text-center">
                    <p className="text-[10px] font-semibold uppercase text-stone-400">{new Date(e.start).toLocaleDateString("en-US", { weekday: "short" })}</p>
                    <p className="text-lg font-semibold leading-tight tabular-nums">{new Date(e.start).getDate()}</p>
                  </div>
                  <div className="min-w-0 flex-1 border-l-2 pl-3" style={{ borderColor: EVENT_META[e.type]?.color }}>
                    <p className="truncate text-sm font-medium">{e.title}</p>
                    <p className="truncate text-xs text-stone-500">{e.all_day ? "All day" : fmtTime(e.start)} · {EVENT_META[e.type]?.label}{crew ? ` · ${crew.name}` : ""}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Due today" subtitle="Tasks, punch items & lead follow-ups" />
          <div className="divide-y divide-stone-100">
            {!tasksToday.length && !followUps.length && <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="All clear" body="No tasks due today." />}
            {followUps.slice(0, 5).map((l) => (
              <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-stone-50">
                <Badge tone="amber">Follow-up</Badge>
                <span className="min-w-0 flex-1 truncate text-sm">{custName(db.get("customers", l.customer_id))} — {l.title}</span>
                {l.follow_up_date! < today && <span className="text-[11px] text-clay-600">overdue</span>}
              </Link>
            ))}
            {tasksToday.slice(0, 8).map((t) => {
              const p = db.get("projects", t.project_id);
              return (
                <div key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                  <input type="checkbox" className="h-4 w-4 accent-brass-500" checked={t.done} onChange={() => db.update("project_tasks", t.id, { done: true, done_at: new Date().toISOString() })} />
                  <Link href={`/projects/${t.project_id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.title}</p>
                    <p className="truncate text-xs text-stone-500">{p?.name}</p>
                  </Link>
                  {t.kind === "punch" && <Badge tone="red">Punch</Badge>}
                  {t.due_date! < today && <span className="text-[11px] text-clay-600">overdue</span>}
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent activity" />
          <div className="max-h-[420px] divide-y divide-stone-50 overflow-y-auto">
            {activity.map((a) => {
              const u = a.user_id ? db.get("profiles", a.user_id) : undefined;
              const c = a.customer_id ? db.get("customers", a.customer_id) : undefined;
              return (
                <Link key={a.id} href={a.project_id ? `/projects/${a.project_id}` : a.estimate_id ? `/estimates/${a.estimate_id}` : a.lead_id ? `/leads/${a.lead_id}` : c ? `/customers/${c.id}` : "#"} className="flex gap-3 px-5 py-3 hover:bg-stone-50">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-stone-100 text-[13px]">{ACT_ICON[a.type] ?? "•"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm"><span className="font-medium">{a.subject}</span></p>
                    <p className="truncate text-xs text-stone-500">{[c ? custName(c) : null, u?.full_name ?? (a.type === "portal" ? "Customer" : "System")].filter(Boolean).join(" · ")} · {ago(a.created_at)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Active production" subtitle="Projects in the field and up next" actions={<Link href="/projects" className="text-xs font-medium text-brass-600">All projects →</Link>} />
          <div className="divide-y divide-stone-100">
            {A.openProjects.slice(0, 8).map((p) => {
              const idx = PROJECT_STAGES.indexOf(p.stage);
              const crew = p.crew_id ? db.get("crews", p.crew_id) : undefined;
              return (
                <Link key={p.id} href={`/projects/${p.id}`} className="grid grid-cols-12 items-center gap-3 px-5 py-3 hover:bg-stone-50">
                  <div className="col-span-12 min-w-0 md:col-span-5">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-stone-500">{p.number} · {custName(db.get("customers", p.customer_id))}</p>
                  </div>
                  <div className="col-span-6 md:col-span-3"><StageBadge s={p.stage} /></div>
                  <div className="col-span-6 flex items-center gap-2 md:col-span-2">
                    {crew && <span className="h-2 w-2 rounded-full" style={{ background: crew.color }} />}
                    <span className="truncate text-xs text-stone-500">{crew?.name ?? "Unassigned"}</span>
                  </div>
                  <div className="col-span-12 md:col-span-2">
                    <Progress value={((idx + 1) / PROJECT_STAGES.length) * 100} />
                    <p className="mt-1 text-right text-[11px] tabular-nums text-stone-500">{money0(p.contract_value)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
        {finOK && (
          <Card>
            <CardHeader title="Sales performance" subtitle="Won contract value by rep · 12 months" />
            <div className="px-3 py-3">
              {repData.length ? <HBarChart data={repData} height={Math.max(140, repData.length * 44)} /> : <EmptyState title="No assigned leads yet" />}
              <div className="mt-2 space-y-1.5 px-2">
                {A.reps.map((r) => {
                  const u = db.get("profiles", r.id);
                  return (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <Avatar name={r.name} color={u?.color} size={22} />
                      <span className="flex-1 text-stone-600">{r.name}</span>
                      <span className="tabular-nums text-stone-500">{r.won}/{r.leads} won</span>
                      <span className={cn("w-12 text-right font-semibold tabular-nums")}>{pct(r.rate, 0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value, sub, href }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; href: string }) {
  return (
    <Link href={href} className="group rounded-xl border border-stone-200/80 bg-white px-4 py-3 shadow-card transition hover:border-stone-300">
      <div className="flex items-center gap-2 text-stone-400 [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">
        {value}
        {sub && <span className="ml-1.5 text-xs font-medium text-stone-400">{sub}</span>}
      </p>
    </Link>
  );
}
