"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, BookmarkPlus, CheckCircle2, ChevronDown, ChevronRight, Copy, Download, Eye, FolderKanban, Library, MoreHorizontal,
  Plus, Ruler, Send, Trash2, XCircle, MessageSquareWarning, PenTool,
} from "lucide-react";
import { db, useSettings, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  addEstimateItem, createCountertopQuote, createProjectFromEstimate, custName, deleteEstimate, duplicateEstimate, respondEstimate, saveAsTemplate, sendEstimate,
} from "@/lib/services";
import { estimateTotals, lineTotal, lineUnitPrice, milestoneAmounts, round2, unitPriceFrom } from "@/lib/calc";
import { fmtDate, fmtDateTime, money, num, pct } from "@/lib/format";
import { openPdf, proposalPdf } from "@/lib/pdf";
import { EstimateBadge, SERVICE_META, SERVICES } from "@/components/status";
import { FileGallery, FileUploader } from "@/components/files";
import {
  Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, Menu, Modal, NumberInput, SearchInput, Segmented, Select, Tabs, Textarea, cn, useToast,
} from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import { ScheduleEditor } from "@/components/schedule";
import { NewQuoteModal } from "@/components/new-quote";
import type { CatalogItem, EstimateItem, PaymentMilestone, ServiceCategory, TimelinePhase, Unit } from "@/lib/types";

const UNITS: Unit[] = ["SQFT", "LF", "EA", "HR", "LS"];

export default function EstimatePage() {
  return (
    <RequirePerm perm="estimates.view">
      <Builder />
    </RequirePerm>
  );
}

function Builder() {
  const { id } = useParams<{ id: string }>();
  const S = useSnapshot();
  const co = useSettings();
  const { can, user } = useAuth();
  const router = useRouter();
  const { toast, confirm, prompt } = useToast();
  const [tab, setTab] = useState<"proposal" | "payments" | "timeline" | "files" | "history">("proposal");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const [showCosts, setShowCosts] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const e = S.estimates.find((x) => x.id === id);
  const items = useMemo(() => S.estimate_items.filter((i) => i.estimate_id === id).sort((a, b) => a.position - b.position), [S.estimate_items, id]);
  if (!e || !co) return <Card><EmptyState title="Estimate not found" action={<Link href="/estimates"><Button>Back</Button></Link>} /></Card>;
  const t = estimateTotals(e, items);
  const cust = S.customers.find((c) => c.id === e.customer_id);
  const lead = e.lead_id ? S.leads.find((l) => l.id === e.lead_id) : undefined;
  const project = e.project_id ? S.projects.find((p) => p.id === e.project_id) : undefined;
  const locked = e.status === "approved" || !can("estimates.edit");
  const upd = (patch: Partial<typeof e>) => !locked && db.update("estimates", e.id, patch);
  const updItem = (it: EstimateItem, patch: Partial<EstimateItem>) => {
    if (locked) return;
    const next = { ...it, ...patch };
    if (!next.price_override) next.unit_price = unitPriceFrom(next.material_cost, next.labor_cost, next.markup);
    db.update("estimate_items", it.id, { ...patch, unit_price: next.unit_price });
  };
  const move = (it: EstimateItem, dir: -1 | 1) => {
    const same = items.filter((i) => i.category === it.category);
    const idx = same.findIndex((i) => i.id === it.id);
    const other = same[idx + dir];
    if (!other) return;
    db.update("estimate_items", it.id, { position: other.position });
    db.update("estimate_items", other.id, { position: it.position });
  };
  const cats = SERVICES.filter((c) => items.some((i) => i.category === c));
  const pdf = async (mode: "download" | "preview") => {
    const doc = await proposalPdf(co, e, items, cust, db.get("profiles", e.created_by)?.full_name);
    openPdf(doc, `${e.number}-${(cust?.last_name || "proposal").replace(/\W+/g, "")}.pdf`, mode);
  };
  const portalUrl = cust ? `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${cust.portal_token}?estimate=${e.id}` : "";
  const scheduleTotal = e.payment_schedule.reduce((s, m) => s + Number(m.percent), 0);

  const send = async () => {
    if (!items.length) return toast("Add at least one line item before sending", "error");
    if (Math.abs(scheduleTotal - 100) > 0.01 && e.payment_schedule.length) return toast(`Payment schedule totals ${scheduleTotal}% — must equal 100%`, "error");
    if (!(await confirm({ title: `Send ${e.number} to ${custName(cust)}?`, body: `The proposal will be available in the customer portal for review, e-signature and approval. Total ${money(t.total)}.`, confirmLabel: "Send proposal" }))) return;
    sendEstimate(e.id);
    void navigator.clipboard?.writeText(portalUrl).catch(() => {});
    toast("Proposal sent · portal link copied to clipboard");
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-stone-500">
            <Link href="/estimates" className="hover:text-ink-900">Estimates</Link> / {e.number}
            {lead && <> · <Link href={`/leads/${lead.id}`} className="hover:text-ink-900">Lead: {lead.title}</Link></>}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <input
              value={e.title}
              disabled={locked}
              onChange={(ev) => upd({ title: ev.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 -ml-1 text-2xl font-semibold tracking-tight hover:border-stone-200 focus:border-brass-300 focus:bg-white focus:outline-none disabled:hover:border-transparent"
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">
            <EstimateBadge s={e.status} />
            <Link href={`/customers/${cust?.id}`} className="font-medium text-ink-800 hover:underline">{custName(cust)}</Link>
            <span>·</span>
            <span>{cust?.project_address}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Eye className="h-4 w-4" />} onClick={() => void pdf("preview")}>Preview PDF</Button>
          <Button icon={<Download className="h-4 w-4" />} onClick={() => void pdf("download")}>PDF</Button>
          {can("estimates.edit") && ["draft", "changes_requested", "viewed", "sent"].includes(e.status) && (
            <Button variant="brass" icon={<Send className="h-4 w-4" />} onClick={() => void send()}>{e.status === "draft" ? "Send to customer" : "Resend"}</Button>
          )}
          {can("estimates.approve") && e.status !== "approved" && e.status !== "draft" && (
            <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setApproveOpen(true)}>Mark approved</Button>
          )}
          {e.status === "approved" && !project && can("projects.edit") && (
            <Button variant="primary" icon={<FolderKanban className="h-4 w-4" />} onClick={() => { const p = createProjectFromEstimate(e.id); if (p) router.push(`/projects/${p.id}`); }}>Create project</Button>
          )}
          {project && <Link href={`/projects/${project.id}`}><Button variant="primary" icon={<FolderKanban className="h-4 w-4" />}>Open {project.number}</Button></Link>}
          <Menu
            trigger={<Button size="icon"><MoreHorizontal className="h-4 w-4" /></Button>}
            items={[
              { label: "Copy customer portal link", icon: <Copy />, onClick: () => { void navigator.clipboard.writeText(portalUrl); toast("Portal link copied"); } },
              { label: "Open in customer portal", icon: <Eye />, onClick: () => window.open(portalUrl, "_blank") },
              ...(can("estimates.edit") ? [
                { label: "Duplicate estimate", icon: <Copy />, onClick: () => { const c = duplicateEstimate(e.id); if (c) router.push(`/estimates/${c.id}`); } },
                { label: "Save as template", icon: <BookmarkPlus />, onClick: async () => { const n = await prompt({ title: "Save as template", label: "Template name", initial: e.title }); if (n) { saveAsTemplate(e.id, n); toast("Template saved"); } } },
                ...(e.status !== "approved" && e.status !== "draft" ? [{ label: "Mark rejected", icon: <XCircle />, onClick: async () => { const r = await prompt({ title: "Reason for rejection", label: "Reason", initial: "" }); if (r !== null) respondEstimate(e.id, "rejected", "", r, "staff"); } }] : []),
                ...(e.status !== "draft" && e.status !== "approved" ? [{ label: "Revert to draft", icon: <Trash2 />, onClick: () => db.update("estimates", e.id, { status: "draft" }) }] : []),
                "divider" as const,
                { label: "Delete estimate", icon: <Trash2 />, danger: true, disabled: !!project, onClick: async () => { if (await confirm({ title: `Delete ${e.number}?`, danger: true, confirmLabel: "Delete" })) { deleteEstimate(e.id); router.push("/estimates"); } } },
              ] : []),
            ]}
          />
        </div>
      </div>

      {e.status === "approved" && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-sage-100 bg-sage-50 px-4 py-3 text-sm text-sage-700">
          <CheckCircle2 className="h-4 w-4" /> Approved {e.signed_name && <>and signed by <b className="font-serif italic">{e.signed_name}</b></>} on {fmtDateTime(e.responded_at)}. The estimate is locked — scope changes go through change orders on the project.
        </div>
      )}
      {e.status === "changes_requested" && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amberx-100 bg-amberx-50 px-4 py-3 text-sm text-amberx-600">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" /><div><b>Customer requested changes:</b> {e.customer_response}</div>
        </div>
      )}

      <div className="grid gap-5 2xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {/* Line items */}
          <Card>
            <CardHeader
              title="Scope & pricing"
              subtitle={`${items.length} line items · total ${money(t.total)} · ${pct(t.margin)} margin`}
              actions={
                <>
                  <Button size="sm" variant="ghost" onClick={() => setShowCosts((v) => !v)}>{showCosts ? "Hide costs" : "Show costs"}</Button>
                  {!locked && <Button size="sm" icon={<PenTool className="h-4 w-4" />} onClick={() => setDrawOpen(true)}>Draw countertops</Button>}
                  {!locked && <Button size="sm" icon={<Ruler className="h-4 w-4" />} onClick={() => setMeasureOpen(true)}>From measurements</Button>}
                  {!locked && <Button size="sm" variant="primary" icon={<Library className="h-4 w-4" />} onClick={() => setCatalogOpen(true)}>Add from catalog</Button>}
                </>
              }
            />
            {!items.length && (
              <EmptyState icon={<Library className="h-6 w-6" />} title="No line items yet" body="Add services from your pricing catalog, pull quantities from site measurements, or add a custom line." action={!locked && <Button variant="primary" onClick={() => setCatalogOpen(true)}>Open pricing catalog</Button>} />
            )}
            {cats.map((cat) => {
              const rows = items.filter((i) => i.category === cat);
              const sub = rows.filter((i) => !i.optional).reduce((s, i) => s + lineTotal(i), 0);
              const isCol = collapsed[cat];
              return (
                <div key={cat} className="border-b border-stone-100 last:border-0">
                  <button onClick={() => setCollapsed({ ...collapsed, [cat]: !isCol })} className="flex w-full items-center gap-2 bg-stone-50/70 px-4 py-2 text-left">
                    {isCol ? <ChevronRight className="h-4 w-4 text-stone-400" /> : <ChevronDown className="h-4 w-4 text-stone-400" />}
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERVICE_META[cat].color }} />
                    <span className="text-sm font-semibold">{SERVICE_META[cat].label}</span>
                    <span className="text-xs text-stone-400">{rows.length} items</span>
                    <span className="ml-auto text-sm font-semibold tabular-nums">{money(sub)}</span>
                  </button>
                  {!isCol && (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[960px] table-fixed text-sm">
                        <thead>
                          <tr className="text-[10.5px] font-semibold uppercase tracking-wider text-stone-400">
                            <th className="w-8" />
                            <th className="px-2 py-2 text-left">Item</th>
                            <th className="w-[76px] px-1 py-2 text-right">Qty</th>
                            <th className="w-[86px] px-1 py-2 text-left">Unit</th>
                            {showCosts && <th className="w-[88px] px-1 py-2 text-right">Material</th>}
                            {showCosts && <th className="w-[88px] px-1 py-2 text-right">Labor</th>}
                            {showCosts && <th className="w-[72px] px-1 py-2 text-right">Markup %</th>}
                            <th className="w-[96px] px-1 py-2 text-right">Unit price</th>
                            <th className="w-[112px] px-2 py-2 text-right">Total</th>
                            <th className="w-[76px]" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((it) => (
                            <LineRow key={it.id} it={it} locked={locked} showCosts={showCosts} expanded={expanded === it.id} onExpand={() => setExpanded(expanded === it.id ? null : it.id)} upd={(p) => updItem(it, p)} move={(d) => move(it, d)} />
                          ))}
                        </tbody>
                      </table>
                      {!locked && (
                        <button onClick={() => { const n = addEstimateItem(e.id, { category: cat, name: "", unit: "SQFT", markup: co.default_markup }); setExpanded(n.id); }} className="ml-10 mb-2 mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brass-600 hover:bg-brass-50">
                          <Plus className="h-3.5 w-3.5" /> Custom {SERVICE_META[cat].label.toLowerCase()} line
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!locked && items.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-stone-100 p-3">
                <span className="mr-1 self-center text-xs text-stone-500">Add custom line to:</span>
                {SERVICES.filter((c) => !cats.includes(c)).map((c) => (
                  <Button key={c} size="xs" variant="outline" onClick={() => { const n = addEstimateItem(e.id, { category: c, markup: co.default_markup }); setExpanded(n.id); }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: SERVICE_META[c].color }} /> {SERVICE_META[c].label}
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="px-4 pt-1">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { key: "proposal", label: "Proposal content" },
                  { key: "payments", label: "Payment schedule" },
                  { key: "timeline", label: "Timeline" },
                  { key: "files", label: "Photos & drawings", count: S.files.filter((f) => f.estimate_id === e.id).length },
                  { key: "history", label: "History" },
                ]}
              />
            </div>
            <div className="p-5">
              {tab === "proposal" && (
                <div className="grid gap-4">
                  <Field label="Introduction"><Textarea disabled={locked} value={e.intro} onChange={(ev) => upd({ intro: ev.target.value })} /></Field>
                  <Field label="Customer notes" hint="Shown on the proposal"><Textarea disabled={locked} value={e.customer_notes} onChange={(ev) => upd({ customer_notes: ev.target.value })} placeholder="Selections, assumptions, allowances…" /></Field>
                  <Field label="Exclusions"><Textarea disabled={locked} className="min-h-[120px]" value={e.exclusions} onChange={(ev) => upd({ exclusions: ev.target.value })} /></Field>
                  <Field label="Terms & conditions"><Textarea disabled={locked} className="min-h-[180px] text-xs" value={e.terms} onChange={(ev) => upd({ terms: ev.target.value })} /></Field>
                </div>
              )}
              {tab === "payments" && <ScheduleEditor schedule={e.payment_schedule} total={t.total} locked={locked} onChange={(payment_schedule) => upd({ payment_schedule })} />}
              {tab === "timeline" && <TimelineEditor phases={e.timeline} locked={locked} onChange={(timeline) => upd({ timeline })} />}
              {tab === "files" && (
                <div className="space-y-4">
                  {can("documents.edit") && <FileUploader meta={{ customer_id: e.customer_id, estimate_id: e.id, category: "drawing", shared_with_customer: true }} />}
                  <FileGallery files={S.files.filter((f) => f.estimate_id === e.id)} canEdit={can("documents.edit")} showShare />
                </div>
              )}
              {tab === "history" && (
                <ol className="space-y-2 text-sm">
                  {S.activities.filter((a) => a.estimate_id === e.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((a) => (
                    <li key={a.id} className="flex gap-3"><span className="w-40 shrink-0 text-xs text-stone-400">{fmtDateTime(a.created_at)}</span><span>{a.subject}{a.body && <span className="text-stone-500"> — {a.body}</span>}</span></li>
                  ))}
                  {S.audit_logs.filter((l) => l.record_id === e.id).slice(-15).reverse().map((l) => (
                    <li key={l.id} className="flex gap-3 text-xs text-stone-500"><span className="w-40 shrink-0 text-stone-400">{fmtDateTime(l.created_at)}</span><span>{db.get("profiles", l.user_id)?.full_name ?? "System"} · {l.action} {l.changes ? Object.keys(l.changes).join(", ") : ""}</span></li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </div>

        {/* Summary rail */}
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:sticky 2xl:top-20 2xl:block 2xl:space-y-4 2xl:self-start">
          <Card className="overflow-hidden">
            <div className="bg-ink-900 px-5 py-4 text-white">
              <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">Total investment</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{money(t.total)}</p>
              {t.optionalTotal > 0 && <p className="mt-1 text-xs text-stone-400">+ {money(t.optionalTotal)} optional</p>}
            </div>
            <div className="space-y-2.5 p-5 text-sm">
              <Row label="Subtotal" value={money(t.subtotal)} />
              <div className="flex items-center gap-2">
                <span className="flex-1 text-stone-500">Discount</span>
                <Segmented value={e.discount_type} onChange={(v) => upd({ discount_type: v })} options={[{ key: "percent", label: "%" }, { key: "amount", label: "$" }]} />
                <NumberInput disabled={locked} className="h-8 w-20 text-right" value={e.discount_value} onChange={(n) => upd({ discount_value: Math.max(0, n) })} />
              </div>
              {t.discount > 0 && <Row label="" value={`− ${money(t.discount)}`} muted />}
              <div className="flex items-center gap-2">
                <span className="flex-1 text-stone-500">Tax rate %</span>
                <NumberInput disabled={locked} className="h-8 w-20 text-right" value={e.tax_rate} onChange={(n) => upd({ tax_rate: Math.max(0, n) })} />
              </div>
              <Row label={`Tax on ${money(t.taxable)}`} value={money(t.tax)} muted />
              <div className="border-t border-stone-100 pt-2.5"><Row label="Total" value={money(t.total)} strong /></div>
            </div>
            <div className="border-t border-stone-100 bg-stone-50/70 p-5 text-sm">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Internal profitability</p>
              <div className="space-y-2">
                <Row label="Material cost" value={money(t.materialCost)} />
                <Row label="Labor cost" value={money(t.laborCost)} />
                <Row label="Total job cost" value={money(t.totalCost)} />
                <Row label="Est. gross profit" value={money(t.grossProfit)} strong />
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs"><span className="text-stone-500">Gross margin</span><span className={cn("font-semibold tabular-nums", t.margin < 25 ? "text-clay-600" : t.margin < 35 ? "text-amberx-600" : "text-sage-700")}>{pct(t.margin)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-200"><div className={cn("h-full rounded-full", t.margin < 25 ? "bg-clay-500" : t.margin < 35 ? "bg-amberx-500" : "bg-sage-500")} style={{ width: `${Math.min(100, Math.max(0, t.margin))}%` }} /></div>
                {t.margin < 25 && items.length > 0 && <p className="mt-1.5 text-xs text-clay-600">Below 25% target margin</p>}
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Issue date"><Input type="date" disabled={locked} value={e.issue_date} onChange={(ev) => upd({ issue_date: ev.target.value })} /></Field>
              <Field label="Valid until"><Input type="date" disabled={locked} value={e.valid_until} onChange={(ev) => upd({ valid_until: ev.target.value })} /></Field>
            </div>
            <div className="mt-4 space-y-1.5 text-xs text-stone-500">
              <p>Prepared by <b className="text-ink-800">{db.get("profiles", e.created_by)?.full_name ?? user?.full_name}</b></p>
              {e.sent_at && <p>Sent {fmtDateTime(e.sent_at)}</p>}
              {e.responded_at && <p>Customer responded {fmtDateTime(e.responded_at)}</p>}
            </div>
          </Card>
          {cats.length > 0 && (
            <Card className="p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500">By category</p>
              <div className="space-y-2">
                {cats.map((c) => (
                  <div key={c}>
                    <div className="flex justify-between text-sm"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: SERVICE_META[c].color }} />{SERVICE_META[c].label}</span><span className="tabular-nums">{money(t.byCategory[c] ?? 0)}</span></div>
                    <div className="mt-1 h-1 rounded-full bg-stone-100"><div className="h-full rounded-full" style={{ width: `${t.subtotal ? ((t.byCategory[c] ?? 0) / t.subtotal) * 100 : 0}%`, background: SERVICE_META[c].color }} /></div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <CatalogPicker open={catalogOpen} onClose={() => setCatalogOpen(false)} onAdd={(c, qty) => { addEstimateItem(e.id, { category: c.category, section: c.section, name: c.name, description: c.description, unit: c.unit, material_cost: c.material_cost, labor_cost: c.labor_cost, markup: c.markup, quantity: qty }); toast(`Added ${c.name}`); }} />
      {(() => {
        const linked = S.countertop_quotes.filter((x) => x.estimate_id === e.id);
        return linked.length > 0 && drawOpen ? (
          <Modal open onClose={() => setDrawOpen(false)} title="Countertop drawings" size="sm" footer={<><Button onClick={() => setDrawOpen(false)}>Close</Button><Button variant="primary" onClick={() => { const q = createCountertopQuote({ customer_id: e.customer_id, lead_id: e.lead_id, estimate_id: e.id }); router.push(`/countertop-quote/${q.id}`); }}>New drawing</Button></>}>
            <div className="space-y-1.5">{linked.map((x) => <Link key={x.id} href={`/countertop-quote/${x.id}`} className="block rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium hover:border-brass-300 hover:bg-brass-50">{x.name} <span className="text-xs font-normal text-stone-500">· {x.counters.length} counters</span></Link>)}</div>
          </Modal>
        ) : drawOpen ? <NewQuoteModal open onClose={() => setDrawOpen(false)} customerId={e.customer_id} leadId={e.lead_id} estimateId={e.id} /> : null;
      })()}
      <MeasurementImport open={measureOpen} onClose={() => setMeasureOpen(false)} estimateId={e.id} leadId={e.lead_id} projectId={e.project_id} customerId={e.customer_id} />
      <ApproveModal open={approveOpen} onClose={() => setApproveOpen(false)} defaultName={custName(cust)} onApprove={(name, note) => { respondEstimate(e.id, "approved", name, note, "staff"); toast("Estimate approved — project created"); setApproveOpen(false); }} />
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn(muted ? "text-xs text-stone-400" : "text-stone-500", strong && "font-semibold text-ink-900")}>{label}</span>
      <span className={cn("tabular-nums", strong ? "text-base font-semibold" : muted ? "text-xs text-stone-500" : "text-ink-800")}>{value}</span>
    </div>
  );
}

function LineRow({ it, locked, showCosts, expanded, onExpand, upd, move }: { it: EstimateItem; locked: boolean; showCosts: boolean; expanded: boolean; onExpand: () => void; upd: (p: Partial<EstimateItem>) => void; move: (d: -1 | 1) => void }) {
  const cell = "h-8 px-2 text-right text-[13px]";
  return (
    <>
      <tr className={cn("group border-t border-stone-100 align-top", it.optional && "bg-stone-50/60")}>
        <td className="pl-3 pt-2.5">
          <button onClick={onExpand} className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-ink-900">{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
        </td>
        <td className="px-2 py-1.5">
          <input disabled={locked} value={it.name} onChange={(e) => upd({ name: e.target.value })} placeholder="Item name" className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-medium hover:border-stone-200 focus:border-brass-300 focus:bg-white focus:outline-none" />
          {!expanded && it.description && <p className="truncate px-1.5 text-xs text-stone-400">{it.description}</p>}
          <div className="flex gap-1 px-1.5">
            {it.optional && <Badge tone="amber">Optional</Badge>}
            {!it.taxable && <Badge>Non-taxable</Badge>}
            {it.price_override && <Badge tone="blue">Price override</Badge>}
          </div>
        </td>
        <td className="px-1 py-1.5"><NumberInput disabled={locked} className={cell} value={it.quantity} onChange={(n) => upd({ quantity: Math.max(0, n) })} /></td>
        <td className="px-1 py-1.5">
          <Select disabled={locked} className="h-8 px-2 text-[13px]" value={it.unit} onChange={(e) => upd({ unit: e.target.value as Unit })}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </Select>
        </td>
        {showCosts && <td className="px-1 py-1.5"><NumberInput disabled={locked} className={cell} value={it.material_cost} onChange={(n) => upd({ material_cost: Math.max(0, n) })} /></td>}
        {showCosts && <td className="px-1 py-1.5"><NumberInput disabled={locked} className={cell} value={it.labor_cost} onChange={(n) => upd({ labor_cost: Math.max(0, n) })} /></td>}
        {showCosts && <td className="px-1 py-1.5"><NumberInput disabled={locked || it.price_override} className={cell} value={it.markup} onChange={(n) => upd({ markup: n })} /></td>}
        <td className="px-1 py-1.5">
          <NumberInput disabled={locked} className={cn(cell, it.price_override && "border-slateblue-400/50 bg-slateblue-50/50")} value={lineUnitPrice(it)} onChange={(n) => upd({ unit_price: n, price_override: true })} />
        </td>
        <td className="px-2 py-1.5 pt-3 text-right text-[13px] font-semibold tabular-nums">{it.optional ? <span className="text-stone-400">({money(lineTotal(it))})</span> : money(lineTotal(it))}</td>
        <td className="pr-2 pt-2">
          {!locked && (
            <div className="flex opacity-0 transition group-hover:opacity-100">
              <button onClick={() => move(-1)} className="rounded p-1 text-stone-400 hover:text-ink-900"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button onClick={() => move(1)} className="rounded p-1 text-stone-400 hover:text-ink-900"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button onClick={() => db.remove("estimate_items", it.id)} className="rounded p-1 text-stone-400 hover:text-clay-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-stone-50/50">
          <td />
          <td colSpan={showCosts ? 8 : 5} className="px-2 pb-3">
            <div className="grid gap-3 md:grid-cols-[1fr_200px]">
              <Textarea disabled={locked} className="min-h-[64px] text-[13px]" value={it.description} onChange={(e) => upd({ description: e.target.value })} placeholder="Description of work shown on the proposal" />
              <div className="space-y-2">
                <Select disabled={locked} className="h-8 text-[13px]" value={it.category} onChange={(e) => upd({ category: e.target.value as ServiceCategory })}>
                  {SERVICES.map((c) => <option key={c} value={c}>{SERVICE_META[c].label}</option>)}
                </Select>
                <Checkbox checked={it.taxable} onChange={(v) => upd({ taxable: v })} label="Taxable" />
                <Checkbox checked={it.optional} onChange={(v) => upd({ optional: v })} label="Optional add-on" />
                {it.price_override && <button className="block text-xs font-medium text-slateblue-600 hover:underline" onClick={() => upd({ price_override: false })}>Reset to cost + markup</button>}
                <p className="text-[11px] text-stone-500">Cost {money(it.material_cost + it.labor_cost)}/{it.unit} · line profit {money(lineTotal(it) - it.quantity * (it.material_cost + it.labor_cost))}</p>
              </div>
            </div>
          </td>
          <td colSpan={1} />
        </tr>
      )}
    </>
  );
}

function CatalogPicker({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (c: CatalogItem, qty: number) => void }) {
  const S = useSnapshot();
  const [cat, setCat] = useState<ServiceCategory | "all">("all");
  const [q, setQ] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const list = S.catalog_items.filter((c) => c.active && (cat === "all" || c.category === cat) && (!q || `${c.name} ${c.section} ${c.description}`.toLowerCase().includes(q.toLowerCase())));
  const sections = [...new Set(list.map((c) => `${c.category}|${c.section}`))];
  return (
    <Modal open={open} onClose={onClose} title="Pricing catalog" subtitle="Click + to add. Quantities can be edited in the estimate." size="xl" footer={<><Link href="/settings?tab=catalog" className="mr-auto text-xs font-medium text-brass-600">Manage catalog →</Link><Button variant="primary" onClick={onClose}>Done</Button></>}>
      <div className="mb-3 flex flex-col gap-2 md:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search services…" className="md:w-72" />
        <Segmented value={cat} onChange={setCat} options={[{ key: "all", label: "All" }, ...SERVICES.map((s) => ({ key: s, label: SERVICE_META[s].label }))]} />
      </div>
      <div className="space-y-4">
        {sections.map((sk) => {
          const [c, sec] = sk.split("|");
          return (
            <div key={sk}>
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500"><span className="h-2 w-2 rounded-full" style={{ background: SERVICE_META[c as ServiceCategory].color }} />{SERVICE_META[c as ServiceCategory].label} · {sec}</p>
              <div className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {list.filter((x) => x.category === c && x.section === sec).map((x) => (
                  <div key={x.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{x.name}</p>
                      <p className="truncate text-xs text-stone-500">{x.description || "—"}</p>
                    </div>
                    <span className="hidden text-xs tabular-nums text-stone-500 md:block">cost {money(x.material_cost + x.labor_cost)}</span>
                    <span className="w-28 text-right text-sm font-semibold tabular-nums">{money(unitPriceFrom(x.material_cost, x.labor_cost, x.markup))}<span className="text-xs font-normal text-stone-400">/{x.unit}</span></span>
                    <NumberInput className="h-8 w-20 text-right" value={qty[x.id] ?? 1} onChange={(n) => setQty({ ...qty, [x.id]: n })} />
                    <Button size="icon" variant="brass" onClick={() => onAdd(x, qty[x.id] ?? 1)} aria-label="Add"><Plus className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {!list.length && <EmptyState title="No catalog items match" />}
      </div>
    </Modal>
  );
}

function MeasurementImport({ open, onClose, estimateId, leadId, projectId, customerId }: { open: boolean; onClose: () => void; estimateId: string; leadId: string | null; projectId: string | null; customerId: string }) {
  const S = useSnapshot();
  const { toast } = useToast();
  const ms = S.measurements.filter((m) => (leadId && m.lead_id === leadId) || (projectId && m.project_id === projectId) || m.customer_id === customerId);
  const catalog = S.catalog_items.filter((c) => c.active);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [useWaste, setUseWaste] = useState(true);
  return (
    <Modal open={open} onClose={onClose} title="Import quantities from measurements" subtitle="Map each measured area to a catalog item — quantities use SQFT or LF automatically." size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
        let n = 0;
        ms.forEach((m) => {
          const c = catalog.find((x) => x.id === sel[m.id]);
          if (!c) return;
          const base = c.unit === "LF" ? m.lf : c.unit === "EA" ? Math.max(1, m.units) : m.sqft;
          const qty = c.unit === "SQFT" && useWaste ? round2(base * (1 + m.waste_percent / 100)) : base;
          addEstimateItem(estimateId, { category: c.category, section: c.section, name: c.name, description: `${m.room}${m.material_spec ? ` — ${m.material_spec}` : ""}`, unit: c.unit, material_cost: c.material_cost, labor_cost: c.labor_cost, markup: c.markup, quantity: qty });
          n++;
        });
        toast(`${n} line item${n === 1 ? "" : "s"} added`);
        onClose();
      }}>Add to estimate</Button></>}>
      {!ms.length ? <EmptyState icon={<Ruler className="h-6 w-6" />} title="No measurements for this customer yet" action={<Link href={leadId ? `/measurements?lead=${leadId}` : "/measurements"}><Button>Record measurements</Button></Link>} /> : (
        <div className="space-y-2">
          <Checkbox checked={useWaste} onChange={setUseWaste} label="Include waste factor on SQFT items" />
          {ms.map((m) => (
            <div key={m.id} className="flex flex-col gap-2 rounded-xl border border-stone-200 p-3 md:flex-row md:items-center">
              <div className="flex-1">
                <p className="text-sm font-medium">{m.room}</p>
                <p className="text-xs text-stone-500">{num(m.sqft, 1)} sqft · {num(m.lf, 1)} lf{m.units ? ` · ${m.units} units` : ""} · {m.waste_percent}% waste</p>
              </div>
              <Select className="md:w-72" value={sel[m.id] ?? ""} onChange={(e) => setSel({ ...sel, [m.id]: e.target.value })}>
                <option value="">Skip</option>
                {SERVICES.map((c) => (
                  <optgroup key={c} label={SERVICE_META[c].label}>
                    {catalog.filter((x) => x.category === c).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                  </optgroup>
                ))}
              </Select>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function TimelineEditor({ phases, locked, onChange }: { phases: TimelinePhase[]; locked: boolean; onChange: (p: TimelinePhase[]) => void }) {
  const total = phases.reduce((s, p) => s + Number(p.days), 0);
  let acc = 0;
  return (
    <div className="space-y-3">
      {phases.map((p, i) => {
        const start = acc;
        acc += Number(p.days);
        return (
          <div key={p.id} className="grid grid-cols-12 items-center gap-2">
            <Input disabled={locked} className="col-span-6 md:col-span-4" value={p.label} onChange={(e) => onChange(phases.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <div className="col-span-3 flex items-center gap-1 md:col-span-2"><NumberInput disabled={locked} className="text-right" value={p.days} onChange={(n) => onChange(phases.map((x, j) => (j === i ? { ...x, days: Math.max(0, Math.round(n)) } : x)))} /><span className="text-xs text-stone-400">days</span></div>
            <div className="col-span-12 order-last h-6 rounded bg-stone-50 md:order-none md:col-span-5">
              <div className="h-full rounded bg-brass-300/80" style={{ marginLeft: `${total ? (start / total) * 100 : 0}%`, width: `${total ? (p.days / total) * 100 : 0}%` }} />
            </div>
            {!locked && <button className="col-span-3 justify-self-end rounded p-1 text-stone-400 hover:text-clay-600 md:col-span-1" onClick={() => onChange(phases.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        {!locked ? <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...phases, { id: `t${Date.now()}`, label: "New phase", days: 1 }])}>Add phase</Button> : <span />}
        <span className="text-sm font-semibold">{total} working days</span>
      </div>
    </div>
  );
}

function ApproveModal({ open, onClose, defaultName, onApprove }: { open: boolean; onClose: () => void; defaultName: string; onApprove: (name: string, note: string) => void }) {
  const [name, setName] = useState(defaultName);
  const [note, setNote] = useState("Signed in person");
  return (
    <Modal open={open} onClose={onClose} title="Mark estimate approved" subtitle="Records the customer's acceptance and runs the approval automations (project creation, lead won)." size="sm"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="success" disabled={!name.trim()} onClick={() => onApprove(name.trim(), note)}>Approve</Button></>}>
      <div className="space-y-3">
        <Field label="Signed by (customer name)" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
