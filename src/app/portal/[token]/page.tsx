"use client";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Check, CheckCircle2, ChevronRight, CreditCard, Download, FileSignature, FileText, GitPullRequestArrow, Home, ImageIcon, Loader2,
  Lock, MessageSquare, Phone, Receipt, Send, Upload, XCircle,
} from "lucide-react";
import { portalApi, type PortalData } from "@/lib/portal";
import { changeOrderLineAmount, changeOrderTotals, estimateTotals, invoiceTotals, lineTotal, lineUnitPrice, milestoneAmounts } from "@/lib/calc";
import { ago, fmtDate, fmtDateTime, money } from "@/lib/format";
import { changeOrderPdf, invoicePdf, openPdf, proposalPdf } from "@/lib/pdf";
import { SERVICE_META, SERVICES } from "@/components/status";
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, NumberInput, Textarea, cn, useToast } from "@/components/ui";
import { PROJECT_STAGES, type Estimate, type FileRecord } from "@/lib/types";

type Tab = "home" | "proposals" | "project" | "changes" | "invoices" | "messages" | "files";

export default function PortalPage() {
  return (
    <Suspense>
      <Portal />
    </Suspense>
  );
}

// Simplified customer-facing milestones mapped from the 11 internal stages
const CUSTOMER_STEPS = [
  { label: "Contract signed", upTo: "Deposit Received" },
  { label: "Materials", upTo: "Materials Delivered" },
  { label: "Scheduled", upTo: "Scheduled" },
  { label: "In progress", upTo: "Quality Inspection" },
  { label: "Complete", upTo: "Closed" },
];
const stepIndex = (stage: string) => CUSTOMER_STEPS.findIndex((s) => PROJECT_STAGES.indexOf(stage as never) <= PROJECT_STAGES.indexOf(s.upTo as never));

function Portal() {
  const { token } = useParams<{ token: string }>();
  const params = useSearchParams();
  const api = useMemo(() => portalApi(token), [token]);
  const { toast } = useToast();
  const [data, setData] = useState<PortalData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(params.get("estimate") ? "proposals" : params.get("invoice") ? "invoices" : "home");
  const [openEst, setOpenEst] = useState<string | null>(params.get("estimate"));
  const reload = useCallback(() => api.load().then(setData).catch((e: Error) => setErr(e.message)), [api]);
  useEffect(() => {
    void reload();
    return api.subscribe(() => void reload());
  }, [api, reload]);

  const act = async (fn: () => Promise<void>, msg: string) => {
    try {
      await fn();
      toast(msg);
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  if (err) return <Shell><Card className="mx-auto mt-16 max-w-md p-8 text-center"><Lock className="mx-auto h-8 w-8 text-stone-400" /><h1 className="mt-3 text-lg font-semibold">Portal unavailable</h1><p className="mt-1 text-sm text-stone-500">{err}</p></Card></Shell>;
  if (!data) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brass-500" /></div>;
  const { company: co, customer: c } = data;
  const brand = co.brand_color || "#b08a48";
  const pendingEst = data.estimates.filter((e) => ["sent", "viewed", "changes_requested"].includes(e.status));
  const pendingCO = data.change_orders.filter((x) => x.status === "sent");
  const openInv = data.invoices.filter((i) => ["sent", "partially_paid", "overdue"].includes(i.status));
  const balance = openInv.reduce((s, i) => s + invoiceTotals(i, data.payments.filter((p) => p.invoice_id === i.id)).balance, 0);
  const activeProjects = data.projects.filter((p) => p.stage !== "Closed");
  const upcoming = data.events.filter((e) => e.start >= new Date().toISOString()).sort((a, b) => a.start.localeCompare(b.start));
  const unsigned = data.projects.filter((p) => !p.signed_at);

  const tabs: { key: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: "home", label: "Overview", icon: Home },
    { key: "proposals", label: "Proposals", icon: FileSignature, badge: pendingEst.length },
    { key: "project", label: "My project", icon: CalendarDays },
    { key: "changes", label: "Change orders", icon: GitPullRequestArrow, badge: pendingCO.length },
    { key: "invoices", label: "Invoices", icon: Receipt, badge: openInv.length },
    { key: "messages", label: "Messages", icon: MessageSquare },
    { key: "files", label: "Photos & files", icon: ImageIcon },
  ];

  return (
    <Shell>
      <header className="bg-ink-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {co.logo_url ? <img src={co.logo_url} alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-1" /> : <div className="grid h-10 w-10 place-items-center rounded-lg text-lg font-bold" style={{ background: brand }}>{co.name[0]}</div>}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{co.name}</p>
            <p className="truncate text-xs text-stone-400">{co.tagline}</p>
          </div>
          <a href={`tel:${co.phone}`} className="hidden items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 sm:flex"><Phone className="h-4 w-4" />{co.phone}</a>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-6 pt-2">
          <p className="text-sm text-stone-400">Customer portal</p>
          <h1 className="text-2xl font-semibold">Welcome, {c.first_name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-400"><Lock className="h-3 w-3" />Private link for {c.first_name} {c.last_name} · {c.project_address}</p>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 scrollbar-none">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn("flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2.5 text-sm font-medium transition", tab === t.key ? "bg-stone-100 text-ink-900" : "text-stone-300 hover:text-white")}>
              <t.icon className="h-4 w-4" />{t.label}
              {!!t.badge && <span className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold text-white" style={{ background: brand }}>{t.badge}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {tab === "home" && (
          <div className="space-y-4">
            {(pendingEst.length > 0 || pendingCO.length > 0 || unsigned.length > 0 || balance > 0) && (
              <Card className="divide-y divide-stone-100">
                <p className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-stone-500">Needs your attention</p>
                {pendingEst.map((e) => <ActionRow key={e.id} icon={<FileSignature className="h-4 w-4" />} title={`Review proposal: ${e.title}`} sub={`${money(estimateTotals(e, data.estimate_items.filter((i) => i.estimate_id === e.id)).total)} · valid until ${fmtDate(e.valid_until)}`} onClick={() => { setTab("proposals"); setOpenEst(e.id); }} />)}
                {unsigned.map((p) => <ActionRow key={p.id} icon={<FileText className="h-4 w-4" />} title={`Sign your contract: ${p.name}`} sub="Electronic signature" onClick={() => setTab("project")} />)}
                {pendingCO.map((x) => <ActionRow key={x.id} icon={<GitPullRequestArrow className="h-4 w-4" />} title={`Approve change order ${x.number}: ${x.title}`} sub={money(changeOrderTotals(x).amount)} onClick={() => setTab("changes")} />)}
                {balance > 0 && <ActionRow icon={<CreditCard className="h-4 w-4" />} title={`Balance due ${money(balance)}`} sub={`${openInv.length} open invoice${openInv.length > 1 ? "s" : ""}`} onClick={() => setTab("invoices")} />}
              </Card>
            )}
            {activeProjects.map((p) => <ProjectStatus key={p.id} p={p} brand={brand} onOpen={() => setTab("project")} />)}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-stone-500">Upcoming</p>
                <div className="divide-y divide-stone-100">
                  {!upcoming.length && <p className="p-5 text-sm text-stone-400">Nothing scheduled yet.</p>}
                  {dedupeInstalls(upcoming).slice(0, 5).map((e) => <div key={e.id} className="px-5 py-3"><p className="text-sm font-medium">{e.title.replace(/^[^—]+—\s*/, "")}</p><p className="text-xs text-stone-500">{fmtDateTime(e.start)}</p></div>)}
                </div>
              </Card>
              <Card>
                <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-stone-500">Latest updates</p>
                <div className="divide-y divide-stone-100">
                  {!data.updates.length && <p className="p-5 text-sm text-stone-400">Updates from your project team will appear here.</p>}
                  {[...data.updates].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((u) => <div key={u.id} className="px-5 py-3"><p className="text-xs text-stone-400">{fmtDate(u.date, "EEE, MMM d")}</p><p className="text-sm">{u.body}</p></div>)}
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === "proposals" && (
          <div className="space-y-3">
            {!data.estimates.length && <Card><EmptyState title="No proposals yet" /></Card>}
            {data.estimates.map((e) => (
              <EstimateCard key={e.id} e={e} data={data} open={openEst === e.id} onToggle={() => { const o = openEst === e.id ? null : e.id; setOpenEst(o); if (o) void api.viewedEstimate(o); }} brand={brand}
                onRespond={(action, name, comment) => act(() => api.respondEstimate(e.id, action, name, comment), action === "approved" ? "Thank you! Your proposal is approved." : action === "rejected" ? "Response sent" : "Change request sent")} />
            ))}
          </div>
        )}

        {tab === "project" && (
          <div className="space-y-4">
            {!data.projects.length && <Card><EmptyState title="No projects yet" body="Once you approve a proposal, your project will appear here." /></Card>}
            {data.projects.map((p) => (
              <div key={p.id} className="space-y-4">
                <ProjectStatus p={p} brand={brand} />
                {!p.signed_at && <SignContract name={`${c.first_name} ${c.last_name}`} project={p.name} total={p.contract_value} onSign={(n) => act(() => api.signContract(p.id, n), "Contract signed — thank you!")} />}
                <Card>
                  <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-stone-500">Schedule</p>
                  <div className="divide-y divide-stone-100">
                    {!data.events.some((e) => e.project_id === p.id) && <p className="p-5 text-sm text-stone-400">Your installation dates will appear here once scheduled.</p>}
                    {data.events.filter((e) => e.project_id === p.id).sort((a, b) => a.start.localeCompare(b.start)).map((e) => <div key={e.id} className="flex justify-between px-5 py-2.5 text-sm"><span>{e.title.replace(/^[^—]+—\s*/, "")}</span><span className="text-stone-500">{fmtDateTime(e.start)}</span></div>)}
                  </div>
                </Card>
                <Card>
                  <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-stone-500">Progress updates</p>
                  <div className="space-y-4 p-5">
                    {!data.updates.some((u) => u.project_id === p.id) && <p className="text-sm text-stone-400">No updates yet.</p>}
                    {data.updates.filter((u) => u.project_id === p.id).sort((a, b) => b.date.localeCompare(a.date)).map((u) => (
                      <div key={u.id} className="border-l-2 pl-4" style={{ borderColor: brand }}>
                        <p className="text-xs text-stone-400">{fmtDate(u.date, "EEEE, MMM d")}</p>
                        <p className="text-sm">{u.body}</p>
                        {u.file_ids.length > 0 && <div className="mt-2"><Photos files={data.files.filter((f) => u.file_ids.includes(f.id))} api={api} /></div>}
                      </div>
                    ))}
                  </div>
                </Card>
                <Card className="p-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">Payment schedule</p>
                  {p.payment_schedule.map((m, i) => {
                    const inv = data.invoices.find((x) => x.id === m.invoice_id);
                    const amts = milestoneAmounts(p.contract_value, p.payment_schedule.map((x) => x.percent));
                    return <div key={m.id} className="flex items-center justify-between py-1.5 text-sm"><span>{m.label} <span className="text-stone-400">({m.percent}% · {m.trigger.toLowerCase()})</span></span><span className="flex items-center gap-2"><span className="tabular-nums">{money(inv ? invoiceTotals(inv).total : amts[i])}</span>{inv ? <Badge tone={inv.status === "paid" ? "green" : "blue"}>{inv.status.replace("_", " ")}</Badge> : <Badge>upcoming</Badge>}</span></div>;
                  })}
                </Card>
              </div>
            ))}
          </div>
        )}

        {tab === "changes" && (
          <div className="space-y-3">
            {!data.change_orders.length && <Card><EmptyState title="No change orders" /></Card>}
            {data.change_orders.map((x) => {
              const t = changeOrderTotals(x);
              const p = data.projects.find((pp) => pp.id === x.project_id);
              return (
                <Card key={x.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><p className="text-xs text-stone-400">{x.number} · {p?.name}</p><h3 className="text-lg font-semibold">{x.title}</h3><p className="text-sm text-stone-600">{x.reason}</p></div>
                    <Badge tone={x.status === "approved" ? "green" : x.status === "rejected" ? "red" : "amber"} dot>{x.status === "sent" ? "Awaiting your approval" : x.status}</Badge>
                  </div>
                  <div className="mt-3 divide-y divide-stone-100 rounded-xl border border-stone-200 text-sm">
                    {x.items.map((it) => <div key={it.id} className="flex justify-between gap-3 px-3 py-2"><span><Badge tone={it.action === "remove" ? "red" : it.action === "add" ? "green" : "blue"}>{it.action}</Badge> <span className="ml-1">{it.description}</span> <span className="text-stone-400">· {it.quantity} {it.unit}</span></span><span className="tabular-nums">{money(changeOrderLineAmount(it))}</span></div>)}
                  </div>
                  <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm"><span className="text-stone-500">Schedule impact: {x.schedule_impact_days} day(s)</span><span className="font-semibold">Contract change: {t.amount >= 0 ? "+" : ""}{money(t.amount)}</span></div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={async () => openPdf(await changeOrderPdf(co, x, p, c), `${x.number}.pdf`)}>PDF</Button>
                  </div>
                  {x.status === "sent" && <SignBox label="Approve change order" name={`${c.first_name} ${c.last_name}`} brand={brand} onApprove={(n) => act(() => api.respondChangeOrder(x.id, "approved", n, ""), "Change order approved")} onReject={(comment) => act(() => api.respondChangeOrder(x.id, "rejected", "", comment), "Response sent")} />}
                  {x.status === "approved" && <p className="mt-3 flex items-center gap-1.5 text-sm text-sage-700"><CheckCircle2 className="h-4 w-4" />Approved by {x.signed_name} · {fmtDateTime(x.approved_at)}</p>}
                </Card>
              );
            })}
          </div>
        )}

        {tab === "invoices" && (
          <div className="space-y-3">
            {balance > 0 && <Card className="flex items-center justify-between p-5" style={{ borderColor: brand }}><div><p className="text-sm text-stone-500">Total balance due</p><p className="text-2xl font-semibold tabular-nums">{money(balance)}</p></div><CreditCard className="h-8 w-8 text-stone-300" /></Card>}
            {!data.invoices.length && <Card><EmptyState title="No invoices yet" /></Card>}
            {[...data.invoices].sort((a, b) => b.issue_date.localeCompare(a.issue_date)).map((i) => {
              const pays = data.payments.filter((p) => p.invoice_id === i.id);
              const t = invoiceTotals(i, pays);
              return <InvoiceRow key={i.id} inv={i} t={t} brand={brand} highlight={params.get("invoice") === i.id}
                onPdf={async () => openPdf(await invoicePdf(co, i, c, data.projects.find((p) => p.id === i.project_id), pays), `${i.number}.pdf`)}
                onPay={(amt) => act(() => api.pay(i.id, amt), "Payment received — thank you!")} />;
            })}
          </div>
        )}

        {tab === "messages" && <Messages data={data} brand={brand} onSend={(b) => act(() => api.sendMessage(data.projects[0]?.id ?? null, b), "Message sent")} />}

        {tab === "files" && (
          <div className="space-y-4">
            <Card className="p-5">
              <p className="mb-1 font-semibold">Share inspiration photos & files</p>
              <p className="mb-3 text-sm text-stone-500">Upload tile, flooring or design ideas, photos of your space, or documents for our team.</p>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-200 px-4 py-8 text-center hover:bg-stone-50">
                <Upload className="mb-1.5 h-5 w-5 text-stone-400" /><span className="text-sm font-medium">Choose files to upload</span><span className="text-xs text-stone-400">JPG, PNG, PDF up to 25 MB</span>
                <input type="file" multiple className="hidden" onChange={(e) => { const f = e.target.files; if (f?.length) void act(() => api.upload(data.projects[0]?.id ?? null, f), "Files uploaded"); e.target.value = ""; }} />
              </label>
            </Card>
            <Card className="p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">Photos & documents</p>
              <Photos files={data.files} api={api} all />
            </Card>
          </div>
        )}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-xs text-stone-400">{co.name} · {co.address} · {co.phone} · {co.email}{co.license_number && ` · Lic. ${co.license_number}`}</footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-stone-100">{children}</div>;
}

function dedupeInstalls<T extends { project_id: string | null; type: string; id: string }>(evs: T[]) {
  const seen = new Set<string>();
  return evs.filter((e) => {
    const k = e.type === "installation" && e.project_id ? e.project_id : e.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function ActionRow({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-stone-50">
      <span className="rounded-lg bg-amberx-50 p-2 text-amberx-600">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{title}</span><span className="block text-xs text-stone-500">{sub}</span></span>
      <ChevronRight className="h-4 w-4 text-stone-400" />
    </button>
  );
}

function ProjectStatus({ p, brand, onOpen }: { p: PortalData["projects"][number]; brand: string; onOpen?: () => void }) {
  const idx = stepIndex(p.stage);
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div><p className="text-xs text-stone-400">{p.number}</p><h3 className="text-lg font-semibold">{p.name}</h3><p className="text-sm text-stone-500">{p.start_date ? `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}` : "Dates to be scheduled"}</p></div>
        {onOpen && <Button size="sm" onClick={onOpen}>Details</Button>}
      </div>
      <div className="mt-5 flex items-center">
        {CUSTOMER_STEPS.map((s, i) => (
          <div key={s.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <span className={cn("grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold", i < idx ? "text-white" : i === idx ? "bg-white" : "border-stone-200 bg-white text-stone-400")} style={i <= idx ? { borderColor: brand, background: i < idx ? brand : undefined, color: i === idx ? brand : undefined } : undefined}>
                {i < idx ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn("mt-1.5 w-16 text-center text-[11px] leading-tight", i <= idx ? "font-semibold text-ink-900" : "text-stone-400")}>{s.label}</span>
            </div>
            {i < CUSTOMER_STEPS.length - 1 && <div className="mx-1 mb-5 h-0.5 flex-1 rounded" style={{ background: i < idx ? brand : "#e3dfd7" }} />}
          </div>
        ))}
      </div>
    </Card>
  );
}

function EstimateCard({ e, data, open, onToggle, brand, onRespond }: { e: Estimate; data: PortalData; open: boolean; onToggle: () => void; brand: string; onRespond: (a: "approved" | "rejected" | "changes_requested", name: string, comment: string) => void }) {
  const items = data.estimate_items.filter((i) => i.estimate_id === e.id).sort((a, b) => a.position - b.position);
  const t = estimateTotals(e, items);
  const pending = ["sent", "viewed", "changes_requested"].includes(e.status);
  const [mode, setMode] = useState<null | "changes" | "reject">(null);
  const [comment, setComment] = useState("");
  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-5 text-left">
        <div className="min-w-0 flex-1"><p className="text-xs text-stone-400">{e.number} · {fmtDate(e.issue_date)}</p><h3 className="text-lg font-semibold">{e.title}</h3></div>
        <div className="text-right"><p className="text-lg font-semibold tabular-nums">{money(t.total)}</p><Badge tone={e.status === "approved" ? "green" : e.status === "rejected" ? "red" : e.status === "changes_requested" ? "amber" : "blue"}>{e.status === "sent" || e.status === "viewed" ? "Awaiting review" : e.status.replace("_", " ")}</Badge></div>
      </button>
      {open && (
        <div className="border-t border-stone-100 p-5">
          {e.intro && <p className="mb-4 text-sm text-stone-600">{e.intro}</p>}
          {SERVICES.filter((s) => items.some((i) => i.category === s)).map((s) => (
            <div key={s} className="mb-4">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500"><span className="h-2 w-2 rounded-full" style={{ background: SERVICE_META[s].color }} />{SERVICE_META[s].label}</p>
              <div className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {items.filter((i) => i.category === s).map((i) => (
                  <div key={i.id} className={cn("flex justify-between gap-3 px-3 py-2 text-sm", i.optional && "bg-stone-50 text-stone-500")}>
                    <div className="min-w-0"><p className="font-medium">{i.name}{i.optional && " (optional)"}</p>{i.description && <p className="text-xs text-stone-500">{i.description}</p>}<p className="text-xs text-stone-400">{Number(i.quantity)} {i.unit} × {money(lineUnitPrice(i))}</p></div>
                    <span className="shrink-0 tabular-nums">{money(lineTotal(i))}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-stone-500">Subtotal</span><span className="tabular-nums">{money(t.subtotal)}</span></div>
            {t.discount > 0 && <div className="flex justify-between"><span className="text-stone-500">Discount</span><span className="tabular-nums">− {money(t.discount)}</span></div>}
            <div className="flex justify-between"><span className="text-stone-500">Tax</span><span className="tabular-nums">{money(t.tax)}</span></div>
            <div className="flex justify-between border-t border-stone-200 pt-1 text-base font-semibold"><span>Total</span><span className="tabular-nums">{money(t.total)}</span></div>
          </div>
          {e.payment_schedule.length > 0 && (
            <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">Payment schedule</p>
              {e.payment_schedule.map((m, i) => <div key={m.id} className="flex justify-between py-0.5"><span>{m.label} — {m.trigger}</span><span className="tabular-nums">{money(milestoneAmounts(t.total, e.payment_schedule.map((x) => x.percent))[i])}</span></div>)}
            </div>
          )}
          {e.exclusions && <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Exclusions</summary><p className="mt-1 whitespace-pre-wrap text-stone-600">{e.exclusions}</p></details>}
          {e.terms && <details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">Terms & conditions</summary><p className="mt-1 whitespace-pre-wrap text-xs text-stone-600">{e.terms}</p></details>}
          <div className="mt-4"><Button size="sm" icon={<Download className="h-4 w-4" />} onClick={async () => openPdf(await proposalPdf(data.company, e, items, data.customer), `${e.number}.pdf`)}>Download PDF</Button></div>
          {pending && !mode && (
            <SignBox label="Approve & sign proposal" name={`${data.customer.first_name} ${data.customer.last_name}`} brand={brand} onApprove={(n) => onRespond("approved", n, "")} onReject={() => setMode("reject")} extra={<Button onClick={() => setMode("changes")}>Request changes</Button>} />
          )}
          {mode && (
            <div className="mt-4 space-y-2 rounded-xl border border-stone-200 p-4">
              <p className="font-semibold">{mode === "changes" ? "What would you like changed?" : "Let us know why (optional)"}</p>
              <Textarea value={comment} onChange={(ev) => setComment(ev.target.value)} placeholder={mode === "changes" ? "e.g. Can you price a larger format tile?" : ""} />
              <div className="flex gap-2"><Button onClick={() => setMode(null)}>Back</Button><Button variant={mode === "reject" ? "danger" : "primary"} disabled={mode === "changes" && !comment.trim()} onClick={() => { onRespond(mode === "changes" ? "changes_requested" : "rejected", "", comment); setMode(null); setComment(""); }}>{mode === "changes" ? "Send request" : "Decline proposal"}</Button></div>
            </div>
          )}
          {e.status === "approved" && <p className="mt-4 flex items-center gap-1.5 text-sm text-sage-700"><CheckCircle2 className="h-4 w-4" />Approved and signed by <b className="font-serif italic">{e.signed_name}</b> · {fmtDateTime(e.responded_at)}</p>}
        </div>
      )}
    </Card>
  );
}

function SignBox({ label, name, brand, onApprove, onReject, extra }: { label: string; name: string; brand: string; onApprove: (n: string) => void; onReject: (comment: string) => void; extra?: React.ReactNode }) {
  const [n, setN] = useState(name);
  const [agree, setAgree] = useState(false);
  return (
    <div className="mt-4 rounded-xl border-2 p-4" style={{ borderColor: brand }}>
      <p className="font-semibold">{label}</p>
      <p className="text-xs text-stone-500">Type your full name to sign electronically.</p>
      <Input className="mt-3 h-12 font-serif text-xl italic" value={n} onChange={(e) => setN(e.target.value)} />
      <Checkbox className="mt-3" checked={agree} onChange={setAgree} label="I have reviewed the scope, price and terms and agree to proceed." />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="success" icon={<Check className="h-4 w-4" />} disabled={!agree || n.trim().length < 3} onClick={() => onApprove(n.trim())}>Sign & approve</Button>
        {extra}
        <Button variant="ghost" className="text-clay-600" icon={<XCircle className="h-4 w-4" />} onClick={() => onReject("")}>Decline</Button>
      </div>
    </div>
  );
}

function SignContract({ name, project, total, onSign }: { name: string; project: string; total: number; onSign: (n: string) => void }) {
  return (
    <Card className="p-5">
      <p className="text-lg font-semibold">Sign your contract</p>
      <p className="text-sm text-stone-500">{project} · {money(total)}</p>
      <SignBox label="Contract signature" name={name} brand="#4f8a5e" onApprove={onSign} onReject={() => {}} />
    </Card>
  );
}

function InvoiceRow({ inv, t, brand, highlight, onPdf, onPay }: { inv: PortalData["invoices"][number]; t: ReturnType<typeof invoiceTotals>; brand: string; highlight: boolean; onPdf: () => void; onPay: (amt: number) => void }) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(t.balance);
  const [partial, setPartial] = useState(false);
  const payable = ["sent", "partially_paid", "overdue"].includes(inv.status) && t.balance > 0;
  return (
    <Card className={cn("p-5", highlight && "ring-2")} style={highlight ? { ["--tw-ring-color" as string]: brand } : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs text-stone-400">{inv.number} · due {fmtDate(inv.due_date)}</p><p className="font-semibold">{inv.items[0]?.description || "Invoice"}</p></div>
        <div className="text-right"><p className="font-semibold tabular-nums">{money(t.total)}</p><Badge tone={inv.status === "paid" ? "green" : inv.status === "overdue" ? "red" : inv.status === "partially_paid" ? "amber" : "blue"}>{inv.status.replace("_", " ")}</Badge></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={onPdf}>PDF</Button>
        {payable && <Button size="sm" variant="brass" icon={<CreditCard className="h-4 w-4" />} onClick={() => { setAmt(t.balance); setOpen(true); }}>Pay {money(t.balance)}</Button>}
        {t.paid > 0 && <span className="text-xs text-sage-700">{money(t.paid)} paid</span>}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={`Pay ${inv.number}`} size="sm" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="brass" disabled={amt <= 0 || amt > t.balance + 0.001} onClick={() => { onPay(partial ? amt : t.balance); setOpen(false); }}>Pay {money(partial ? amt : t.balance)}</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-stone-600">Balance due: <b>{money(t.balance)}</b></p>
          <Checkbox checked={partial} onChange={setPartial} label="Pay a partial amount" />
          {partial && <Field label="Amount"><NumberInput value={amt} onChange={setAmt} /></Field>}
          <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-500"><Lock className="mr-1 inline h-3 w-3" />Card and ACH payments are processed by Stripe when enabled for this account. In this workspace the payment is recorded immediately (demo processor) — no card details are collected here.</div>
        </div>
      </Modal>
    </Card>
  );
}

function Messages({ data, brand, onSend }: { data: PortalData; brand: string; onSend: (b: string) => void }) {
  const [body, setBody] = useState("");
  const msgs = [...data.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <Card>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
        {!msgs.length && <p className="py-8 text-center text-sm text-stone-400">Send us a message — your project team will reply here.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.sender === "customer" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", m.sender === "customer" ? "rounded-br-sm text-white" : "rounded-bl-sm bg-stone-100")} style={m.sender === "customer" ? { background: brand } : undefined}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-[10px] opacity-70">{m.sender === "customer" ? "You" : data.company.name} · {ago(m.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-stone-100 p-3">
        <Textarea rows={1} className="min-h-[44px]" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" />
        <Button variant="primary" icon={<Send className="h-4 w-4" />} disabled={!body.trim()} onClick={() => { onSend(body.trim()); setBody(""); }}>Send</Button>
      </div>
    </Card>
  );
}

function Photos({ files, api, all }: { files: FileRecord[]; api: ReturnType<typeof portalApi>; all?: boolean }) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all(files.map(async (f) => [f.id, await api.fileUrl(f)] as const)).then((r) => alive && setUrls(Object.fromEntries(r)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.map((f) => f.id).join(","), api]);
  if (!files.length) return <p className="text-sm text-stone-400">{all ? "No shared files yet." : ""}</p>;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {files.map((f) => (
          <button key={f.id} onClick={() => setOpen(urls[f.id] ?? null)} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.mime.startsWith("image/") && urls[f.id] ? <img src={urls[f.id]!} alt={f.name} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-1 text-stone-400"><FileText className="h-6 w-6" /><span className="max-w-full truncate px-2 text-[10px]">{f.name}</span></div>}
            {f.photo_phase && <Badge className="absolute left-1 top-1">{f.photo_phase}</Badge>}
            {f.uploaded_by_customer && <Badge tone="brass" className="absolute right-1 top-1">You</Badge>}
          </button>
        ))}
      </div>
      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={open} alt="" className="max-h-full max-w-full rounded-lg" /></div>}
    </>
  );
}
