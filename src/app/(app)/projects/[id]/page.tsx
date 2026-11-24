"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CalendarPlus, Check, ClipboardList, Copy, ExternalLink, FileSignature, GitPullRequestArrow, MapPin, MoreHorizontal, PackagePlus, PenLine, Plus,
  Receipt, Ruler, Trash2, Timer,
} from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  createChangeOrder, createInvoice, custName, deleteProject, invoiceMilestone, logTime, setProjectStage, signContract, stockMove,
} from "@/lib/services";
import { changeOrderTotals, invoiceTotals, milestoneAmounts, projectFinancials, todayISO } from "@/lib/calc";
import { fmtDate, fmtDateTime, money, money0, num, pct } from "@/lib/format";
import { ActivityTimeline } from "@/components/activity";
import { ChangeOrderEditor, CO_TONE } from "@/components/change-order";
import { FileGallery, FileUploader, uploadFiles } from "@/components/files";
import { EventModal } from "@/components/modals";
import { MessageThread } from "@/components/messages";
import { ScheduleEditor } from "@/components/schedule";
import { EVENT_META, HEALTH, InvoiceBadge, ServiceChips, StageBadge } from "@/components/status";
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, KV, Menu, Modal, NumberInput, Progress, Select, Stat, Tabs, Textarea, cn, useToast,
} from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import { PROJECT_STAGES, type ExpenseCategory, type Project, type ProjectTask } from "@/lib/types";

type Tab = "overview" | "tasks" | "log" | "photos" | "measurements" | "changes" | "materials" | "financials" | "documents" | "messages" | "activity";

export default function ProjectPage() {
  return (
    <RequirePerm perm="projects.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const S = useSnapshot();
  const { can } = useAuth();
  const router = useRouter();
  const { toast, confirm, prompt } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [evOpen, setEvOpen] = useState(false);
  const [coOpen, setCoOpen] = useState<string | null>(null);
  const actFilter = useMemo(() => (a: { project_id: string | null }) => a.project_id === id, [id]);
  const p = S.projects.find((x) => x.id === id);
  if (!p) return <Card><EmptyState title="Project not found" action={<Link href="/projects"><Button>Back</Button></Link>} /></Card>;
  const c = S.customers.find((x) => x.id === p.customer_id);
  const f = projectFinancials(p, S.expenses, S.time_entries, S.invoices, S.payments);
  const edit = can("projects.edit");
  const upd = (patch: Partial<Project>) => edit && db.update("projects", p.id, patch);
  const idx = PROJECT_STAGES.indexOf(p.stage);
  const tasks = S.project_tasks.filter((t) => t.project_id === id);
  const cos = S.change_orders.filter((x) => x.project_id === id);
  const files = S.files.filter((x) => x.project_id === id);
  const photos = files.filter((x) => x.mime.startsWith("image/") || x.category === "photo");
  const events = S.events.filter((e) => e.project_id === id).sort((a, b) => a.start.localeCompare(b.start));
  const invoices = S.invoices.filter((i) => i.project_id === id);
  const estimate = p.estimate_id ? S.estimates.find((e) => e.id === p.estimate_id) : undefined;
  const portalUrl = c ? `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${c.portal_token}` : "";
  const openTasks = tasks.filter((t) => !t.done && t.kind !== "checklist").length;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs text-stone-500"><Link href="/projects" className="hover:text-ink-900">Projects</Link> / {p.number}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{p.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-stone-500">
            <StageBadge s={p.stage} />
            <Badge tone={HEALTH[p.health].tone}>{HEALTH[p.health].label}</Badge>
            <Link href={`/customers/${c?.id}`} className="font-medium text-ink-800 hover:underline">{custName(c)}</Link>
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.address}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("calendar.edit") && <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setEvOpen(true)}>Schedule</Button>}
          {edit && <Button icon={<GitPullRequestArrow className="h-4 w-4" />} onClick={() => { const co = createChangeOrder(p.id); setCoOpen(co.id); }}>Change order</Button>}
          {edit && idx < PROJECT_STAGES.length - 1 && (
            <Button variant="primary" onClick={() => { setProjectStage(p.id, PROJECT_STAGES[idx + 1]); toast(`Moved to ${PROJECT_STAGES[idx + 1]}`); }}>
              Advance to {PROJECT_STAGES[idx + 1]} →
            </Button>
          )}
          <Menu
            trigger={<Button size="icon"><MoreHorizontal className="h-4 w-4" /></Button>}
            items={[
              { label: "Copy customer portal link", icon: <Copy />, onClick: () => { void navigator.clipboard.writeText(portalUrl); toast("Portal link copied"); } },
              { label: "Open customer portal", icon: <ExternalLink />, onClick: () => window.open(portalUrl, "_blank") },
              ...(estimate ? [{ label: `Open estimate ${estimate.number}`, icon: <FileSignature />, onClick: () => router.push(`/estimates/${estimate.id}`) }] : []),
              ...(edit && !p.signed_at ? [{ label: "Record contract signature", icon: <PenLine />, onClick: async () => { const n = await prompt({ title: "Contract signed by", initial: custName(c) }); if (n) signContract(p.id, n, "staff"); } }] : []),
              ...(edit ? ["divider" as const, { label: "Delete project", icon: <Trash2 />, danger: true, onClick: async () => { if (!(await confirm({ title: `Delete ${p.number}?`, body: "Tasks, logs, change orders and draft invoices are removed.", danger: true, confirmLabel: "Delete" }))) return; try { deleteProject(p.id); router.push("/projects"); } catch (e) { toast((e as Error).message, "error"); } } }] : []),
            ]}
          />
        </div>
      </div>

      {/* Stage tracker */}
      <Card className="mb-5 overflow-x-auto p-2">
        <div className="flex min-w-[1000px] gap-1">
          {PROJECT_STAGES.map((s, i) => (
            <button
              key={s}
              disabled={!edit}
              onClick={() => setProjectStage(p.id, s)}
              className={cn("flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[11px] font-semibold transition", i === idx ? "bg-ink-900 text-white" : i < idx ? "bg-brass-100 text-brass-800 hover:bg-brass-200" : "bg-stone-50 text-stone-500 hover:bg-stone-100")}
            >
              {i < idx && <Check className="h-3 w-3" />}{s}
            </button>
          ))}
        </div>
      </Card>

      {can("finance.view") && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Contract value" value={money0(f.contract)} sub={p.contract_value !== p.original_contract_value ? `${money0(p.original_contract_value)} + COs` : "Original"} />
          <Stat label="Est. profit" value={money0(f.estimatedProfit)} sub={pct(f.estimatedMargin)} />
          <Stat label="Actual cost" value={money0(f.actualCost)} sub={<span className={f.costProgress > 100 ? "text-clay-600" : ""}>{pct(f.costProgress, 0)} of budget</span>} />
          <Stat label="Projected profit" value={<span className={f.actualCost > f.estimatedCost ? "text-amberx-600" : "text-sage-700"}>{money0(f.contract - Math.max(f.actualCost, f.estimatedCost))}</span>} sub={f.actualCost > f.estimatedCost ? "over budget" : "on budget"} />
          <Stat label="Collected" value={money0(f.collected)} sub={`${money0(f.outstanding)} outstanding · ${money0(f.unbilled)} unbilled`} />
        </div>
      )}

      <Tabs<Tab>
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "tasks", label: "Tasks & punch", count: openTasks },
          { key: "log", label: "Daily log", count: S.project_updates.filter((u) => u.project_id === id).length },
          { key: "photos", label: "Photos", count: photos.length },
          { key: "measurements", label: "Measurements" },
          { key: "changes", label: "Change orders", count: cos.length },
          { key: "materials", label: "Materials" },
          ...(can("finance.view") ? [{ key: "financials" as Tab, label: "Financials" }] : []),
          { key: "documents", label: "Documents", count: files.length },
          { key: "messages", label: "Messages" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Project details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Project name"><Input disabled={!edit} value={p.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
              <Field label="Project manager">
                <Select disabled={!edit} value={p.manager_id ?? ""} onChange={(e) => upd({ manager_id: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {S.profiles.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </Select>
              </Field>
              <Field label="Health">
                <Select disabled={!edit} value={p.health} onChange={(e) => upd({ health: e.target.value as Project["health"] })}>
                  {Object.entries(HEALTH).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </Field>
              <Field label="Assigned crew">
                <Select disabled={!edit} value={p.crew_id ?? ""} onChange={(e) => upd({ crew_id: e.target.value || null })}>
                  <option value="">No crew</option>
                  {S.crews.map((cr) => <option key={cr.id} value={cr.id}>{cr.name}</option>)}
                </Select>
              </Field>
              <Field label="Start date"><Input type="date" disabled={!edit} value={p.start_date ?? ""} onChange={(e) => upd({ start_date: e.target.value || null })} /></Field>
              <Field label="Target completion"><Input type="date" disabled={!edit} value={p.end_date ?? ""} onChange={(e) => upd({ end_date: e.target.value || null })} /></Field>
              <Field label="Project address" className="sm:col-span-2"><Input disabled={!edit} value={p.address} onChange={(e) => upd({ address: e.target.value })} /></Field>
              <KV label="Services"><ServiceChips services={p.services} /></KV>
              <Field label="Crew members & subcontractors" className="sm:col-span-2 lg:col-span-3">
                <div className="flex flex-wrap gap-1.5">
                  {S.employees.filter((e) => e.active).map((e) => {
                    const on = p.member_ids.includes(e.id);
                    return (
                      <button key={e.id} disabled={!edit} onClick={() => upd({ member_ids: on ? p.member_ids.filter((x) => x !== e.id) : [...p.member_ids, e.id] })} className={cn("rounded-lg border px-2 py-1 text-xs font-medium", on ? "border-brass-400 bg-brass-50 text-brass-700" : "border-stone-200 text-stone-500")}>
                        {e.name}{e.kind === "subcontractor" && <span className="ml-1 text-[10px] opacity-70">SUB</span>}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Internal notes" className="sm:col-span-2 lg:col-span-3"><Textarea disabled={!edit} value={p.notes} onChange={(e) => upd({ notes: e.target.value })} placeholder="Access codes, site conditions, customer preferences…" /></Field>
            </div>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Contract" />
              <div className="space-y-2 p-5 text-sm">
                {p.signed_at ? (
                  <p className="flex items-center gap-2 text-sage-700"><Check className="h-4 w-4" />Signed by <b className="font-serif italic">{p.signed_name}</b> · {fmtDate(p.signed_at)}</p>
                ) : (
                  <div className="flex items-center justify-between gap-2"><span className="text-amberx-600">Awaiting signature</span>{edit && <Button size="xs" onClick={async () => { const n = await prompt({ title: "Contract signed by", initial: custName(c) }); if (n) signContract(p.id, n, "staff"); }}>Record</Button>}</div>
                )}
                {estimate && <Link href={`/estimates/${estimate.id}`} className="block text-xs font-medium text-brass-600">Source estimate {estimate.number} →</Link>}
                <div className="flex justify-between border-t border-stone-100 pt-2"><span className="text-stone-500">Original contract</span><span className="tabular-nums">{money(p.original_contract_value)}</span></div>
                <div className="flex justify-between"><span className="text-stone-500">Approved change orders</span><span className="tabular-nums">{money(p.contract_value - p.original_contract_value)}</span></div>
                <div className="flex justify-between font-semibold"><span>Current contract</span><span className="tabular-nums">{money(p.contract_value)}</span></div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Upcoming schedule" actions={can("calendar.edit") && <Button size="xs" onClick={() => setEvOpen(true)}>Add</Button>} />
              <div className="max-h-72 divide-y divide-stone-100 overflow-y-auto">
                {!events.length && <EmptyState title="Not scheduled" />}
                {events.filter((e) => e.end >= new Date(Date.now() - 86400000).toISOString()).slice(0, 10).map((e) => (
                  <div key={e.id} className="flex gap-3 px-5 py-2.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: EVENT_META[e.type]?.color }} />
                    <div className="min-w-0"><p className="truncate text-sm">{e.title}</p><p className="text-xs text-stone-500">{fmtDateTime(e.start)}{e.crew_id ? ` · ${db.get("crews", e.crew_id)?.name}` : ""}</p></div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          {can("finance.view") && (
            <Card className="xl:col-span-3">
              <CardHeader title="Payment milestones" subtitle="Generate invoices from the contract payment schedule" />
              <MilestoneTable p={p} />
            </Card>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <TaskList p={p} kind="task" title="Tasks" tasks={tasks} edit={edit} />
          <TaskList p={p} kind="checklist" title="Checklist" tasks={tasks} edit={edit} />
          <TaskList p={p} kind="punch" title="Punch list" tasks={tasks} edit={edit} />
        </div>
      )}

      {tab === "log" && <DailyLog p={p} edit={can("documents.edit") || edit} />}

      {tab === "photos" && (
        <Card className="space-y-6 p-5">
          {can("documents.edit") && <FileUploader meta={{ customer_id: p.customer_id, project_id: p.id, category: "photo", shared_with_customer: true }} categories={false} phases />}
          {(["before", "progress", "after", null] as const).map((ph) => {
            const list = photos.filter((x) => x.photo_phase === ph);
            if (!list.length) return null;
            return (
              <div key={String(ph)}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">{ph ? `${ph} photos` : "Other photos"}</p>
                <FileGallery files={list} canEdit={can("documents.edit")} showShare />
              </div>
            );
          })}
          {!photos.length && <EmptyState title="No photos yet" body="Upload before, progress and after photos. Shared photos appear in the customer portal." />}
        </Card>
      )}

      {tab === "measurements" && (
        <Card>
          <CardHeader title="Measurements & site conditions" actions={can("measurements.edit") && <Link href={`/measurements?project=${p.id}`}><Button size="sm" icon={<Ruler className="h-4 w-4" />}>Open measurement tool</Button></Link>} />
          <div className="divide-y divide-stone-100">
            {S.measurements.filter((m) => m.project_id === id).map((m) => (
              <Link key={m.id} href={`/measurements?project=${p.id}&m=${m.id}`} className="grid gap-2 px-5 py-3 hover:bg-stone-50 md:grid-cols-4">
                <div><p className="text-sm font-medium">{m.room}</p><p className="text-xs capitalize text-stone-500">{m.area_type.replace("_", " ")}</p></div>
                <p className="text-sm tabular-nums">{num(m.sqft, 1)} sqft · {num(m.lf, 1)} lf</p>
                <p className="text-xs text-stone-600 md:col-span-2">{m.material_spec}{m.existing_conditions && <span className="block text-stone-400">{m.existing_conditions}</span>}</p>
              </Link>
            ))}
            {!S.measurements.some((m) => m.project_id === id) && <EmptyState title="No measurements recorded" />}
          </div>
        </Card>
      )}

      {tab === "changes" && (
        <Card>
          <CardHeader title="Change orders" subtitle="Customer approval is required before changes are added to the contract." actions={edit && <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { const co = createChangeOrder(p.id); setCoOpen(co.id); }}>New change order</Button>} />
          {!cos.length ? <EmptyState icon={<GitPullRequestArrow className="h-6 w-6" />} title="No change orders" /> : (
            <div className="divide-y divide-stone-100">
              {cos.map((co) => {
                const t = changeOrderTotals(co);
                return (
                  <button key={co.id} onClick={() => setCoOpen(co.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-stone-50">
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{co.number} · {co.title}</p><p className="truncate text-xs text-stone-500">{co.reason || `${co.items.length} changes`}</p></div>
                    <Badge tone={CO_TONE[co.status]} dot>{co.status}</Badge>
                    <span className={cn("w-28 text-right text-sm font-semibold tabular-nums", t.amount < 0 && "text-clay-600")}>{t.amount >= 0 ? "+" : ""}{money(t.amount)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === "materials" && <MaterialsTab p={p} />}
      {tab === "financials" && <FinancialsTab p={p} />}

      {tab === "documents" && (
        <Card className="space-y-5 p-5">
          {can("documents.edit") && <FileUploader meta={{ customer_id: p.customer_id, project_id: p.id, category: "contract" }} />}
          <FileGallery files={files} canEdit={can("documents.edit")} showShare />
        </Card>
      )}
      {tab === "messages" && <MessageThread customerId={p.customer_id} projectId={p.id} />}
      {tab === "activity" && <Card className="p-5"><ActivityTimeline filter={actFilter} link={{ customer_id: p.customer_id, project_id: p.id }} canLog={edit} /></Card>}

      <EventModal open={evOpen} onClose={() => setEvOpen(false)} preset={{ title: `${c?.last_name ?? p.name} — installation`, type: "installation", project_id: p.id, customer_id: p.customer_id, crew_id: p.crew_id, location: p.address, employee_ids: p.member_ids }} />
      {coOpen && <ChangeOrderEditor co={S.change_orders.find((x) => x.id === coOpen) ?? null} onClose={() => setCoOpen(null)} />}
    </div>
  );
}

function MilestoneTable({ p }: { p: Project }) {
  const S = useSnapshot();
  const { can } = useAuth();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const amts = milestoneAmounts(p.contract_value, p.payment_schedule.map((m) => m.percent));
  // the final milestone absorbs approved change orders billed after earlier milestones
  const last = p.payment_schedule.length - 1;
  if (last >= 0 && !p.payment_schedule[last].invoice_id) {
    const billed = p.payment_schedule.slice(0, last).reduce((s, m, i) => {
      const inv = m.invoice_id ? S.invoices.find((x) => x.id === m.invoice_id) : undefined;
      return s + (inv && inv.status !== "void" ? invoiceTotals(inv).total : amts[i]);
    }, 0);
    amts[last] = Math.round((p.contract_value - billed) * 100) / 100;
  }
  if (editing)
    return (
      <div className="p-5">
        <ScheduleEditor schedule={p.payment_schedule} total={p.contract_value} locked={false} onChange={(payment_schedule) => db.update("projects", p.id, { payment_schedule: payment_schedule.map((m) => ({ ...m, invoice_id: p.payment_schedule.find((x) => x.id === m.id)?.invoice_id ?? null })) })} />
        <div className="mt-3 flex justify-end"><Button variant="primary" size="sm" onClick={() => setEditing(false)}>Done</Button></div>
      </div>
    );
  return (
    <div>
      <div className="divide-y divide-stone-100">
        {p.payment_schedule.map((m, i) => {
          const inv = m.invoice_id ? S.invoices.find((x) => x.id === m.invoice_id) : undefined;
          const t = inv ? invoiceTotals(inv, S.payments.filter((x) => x.invoice_id === inv.id)) : null;
          return (
            <div key={m.id} className="grid grid-cols-12 items-center gap-3 px-5 py-3">
              <div className="col-span-12 md:col-span-4"><p className="text-sm font-medium">{m.label} <span className="text-stone-400">· {m.percent}%</span></p><p className="text-xs text-stone-500">Due upon {m.trigger.toLowerCase()}</p></div>
              <span className="col-span-4 text-sm font-semibold tabular-nums md:col-span-2">{money(inv && t ? t.total : amts[i])}</span>
              <div className="col-span-8 flex items-center justify-end gap-2 md:col-span-6">
                {inv && t ? (
                  <>
                    <InvoiceBadge s={inv.status} />
                    {t.balance > 0 && inv.status !== "draft" && <span className="text-xs tabular-nums text-stone-500">{money(t.balance)} due</span>}
                    <Link href={`/finance/invoices/${inv.id}`}><Button size="xs">{inv.number}</Button></Link>
                  </>
                ) : can("finance.edit") ? (
                  <Button size="xs" variant="brass" icon={<Receipt className="h-3.5 w-3.5" />} onClick={() => { const n = invoiceMilestone(p.id, m.id); if (n) router.push(`/finance/invoices/${n.id}`); }}>Create invoice</Button>
                ) : <span className="text-xs text-stone-400">Not invoiced</span>}
              </div>
            </div>
          );
        })}
      </div>
      {can("finance.edit") && (
        <div className="flex justify-between border-t border-stone-100 px-5 py-2.5">
          <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>Edit schedule</Button>
          <Button size="xs" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => { const i = createInvoice({ customer_id: p.customer_id, project_id: p.id, kind: "change_order" }); router.push(`/finance/invoices/${i.id}`); }}>Custom invoice</Button>
        </div>
      )}
    </div>
  );
}

function TaskList({ p, kind, title, tasks, edit }: { p: Project; kind: ProjectTask["kind"]; title: string; tasks: ProjectTask[]; edit: boolean }) {
  const S = useSnapshot();
  const [text, setText] = useState("");
  const list = tasks.filter((t) => t.kind === kind).sort((a, b) => Number(a.done) - Number(b.done) || a.position - b.position);
  const done = list.filter((t) => t.done).length;
  const add = () => {
    if (!text.trim()) return;
    db.insert("project_tasks", { project_id: p.id, kind, title: text.trim(), assignee_id: null, due_date: kind === "checklist" ? null : todayISO(), done: false, done_at: null, position: list.length });
    setText("");
  };
  return (
    <Card>
      <CardHeader title={title} subtitle={`${done}/${list.length} complete`} icon={<ClipboardList className="h-4 w-4" />} />
      <div className="px-5 pt-3"><Progress value={list.length ? (done / list.length) * 100 : 0} tone={kind === "punch" ? "red" : "green"} /></div>
      <ul className="divide-y divide-stone-50 p-2">
        {list.map((t) => (
          <li key={t.id} className="group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-stone-50">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brass-500" checked={t.done} onChange={(e) => db.update("project_tasks", t.id, { done: e.target.checked, done_at: e.target.checked ? new Date().toISOString() : null })} />
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm", t.done && "text-stone-400 line-through")}>{t.title}</p>
              {kind !== "checklist" && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input type="date" disabled={!edit} className={cn("rounded border-0 bg-transparent p-0 text-[11px] text-stone-500", !t.done && t.due_date && t.due_date < todayISO() && "text-clay-600")} value={t.due_date ?? ""} onChange={(e) => db.update("project_tasks", t.id, { due_date: e.target.value || null })} />
                  <select disabled={!edit} className="rounded border-0 bg-transparent p-0 text-[11px] text-stone-500" value={t.assignee_id ?? ""} onChange={(e) => db.update("project_tasks", t.id, { assignee_id: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {S.profiles.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
              )}
            </div>
            {edit && <button className="rounded p-1 text-stone-300 opacity-0 hover:text-clay-600 group-hover:opacity-100" onClick={() => db.remove("project_tasks", t.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
          </li>
        ))}
      </ul>
      {(edit || kind === "punch") && (
        <div className="flex gap-2 border-t border-stone-100 p-3">
          <Input className="h-8" placeholder={`Add ${kind === "punch" ? "punch item" : kind}…`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button size="sm" onClick={add}>Add</Button>
        </div>
      )}
    </Card>
  );
}

function DailyLog({ p, edit }: { p: Project; edit: boolean }) {
  const S = useSnapshot();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [date, setDate] = useState(todayISO());
  const [vis, setVis] = useState(true);
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const updates = S.project_updates.filter((u) => u.project_id === p.id).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  const post = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const up = files?.length ? await uploadFiles(files, { customer_id: p.customer_id, project_id: p.id, category: "photo", photo_phase: "progress", shared_with_customer: vis }) : [];
      db.insert("project_updates", { project_id: p.id, date, body: body.trim(), user_id: db.currentUserId, visible_to_customer: vis, file_ids: up.map((f) => f.id) });
      setBody("");
      setFiles(null);
      toast("Update posted");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {edit && (
        <Card className="h-fit p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Post daily update</h3>
          <div className="space-y-3">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Textarea className="min-h-[120px]" placeholder="Work completed, crew on site, issues, next steps…" value={body} onChange={(e) => setBody(e.target.value)} />
            <input type="file" multiple accept="image/*" className="block w-full text-xs text-stone-500 file:mr-2 file:rounded-md file:border-0 file:bg-stone-100 file:px-2 file:py-1 file:text-xs" onChange={(e) => setFiles(e.target.files)} />
            <Checkbox checked={vis} onChange={setVis} label="Share with customer in portal" />
            <Button variant="primary" className="w-full" loading={busy} onClick={() => void post()}>Post update</Button>
          </div>
        </Card>
      )}
      <div className={cn("space-y-3", edit ? "lg:col-span-2" : "lg:col-span-3")}>
        {!updates.length && <Card><EmptyState title="No daily updates yet" /></Card>}
        {updates.map((u) => {
          const author = S.profiles.find((x) => x.id === u.user_id);
          return (
            <Card key={u.id} className="p-4">
              <div className="flex items-center gap-2">
                {author && <Avatar name={author.full_name} color={author.color} size={26} />}
                <p className="text-sm font-medium">{author?.full_name ?? "Team"}</p>
                <span className="text-xs text-stone-400">· {fmtDate(u.date, "EEE, MMM d")}</span>
                <button className="ml-auto" onClick={() => db.update("project_updates", u.id, { visible_to_customer: !u.visible_to_customer })}>
                  <Badge tone={u.visible_to_customer ? "green" : "neutral"}>{u.visible_to_customer ? "Shared" : "Internal"}</Badge>
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{u.body}</p>
              {u.file_ids.length > 0 && <div className="mt-3"><FileGallery files={S.files.filter((f) => u.file_ids.includes(f.id))} canEdit={false} /></div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MaterialsTab({ p }: { p: Project }) {
  const S = useSnapshot();
  const { can } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ item: "", qty: 0, type: "allocate" as "allocate" | "return" | "damage", notes: "" });
  const pos = S.purchase_orders.filter((x) => x.project_id === p.id);
  const moves = S.stock_movements.filter((m) => m.project_id === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const allocatedValue = moves.reduce((s, m) => s + -m.quantity * m.unit_cost, 0);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Purchase orders" actions={can("inventory.edit") && <Link href={`/inventory?tab=pos&newpo=${p.id}`}><Button size="sm" icon={<Plus className="h-4 w-4" />}>New PO</Button></Link>} />
        {!pos.length ? <EmptyState title="No purchase orders for this project" /> : (
          <div className="divide-y divide-stone-100">
            {pos.map((po) => (
              <Link key={po.id} href={`/inventory?tab=pos&po=${po.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{po.number} · {S.suppliers.find((s) => s.id === po.supplier_id)?.name}</p><p className="text-xs text-stone-500">{po.items.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(", ")}</p></div>
                <Badge tone={po.status === "received" ? "green" : po.status === "ordered" ? "blue" : po.status === "partially_received" ? "amber" : "neutral"}>{po.status.replace("_", " ")}</Badge>
                <span className="text-xs text-stone-500">ETA {fmtDate(po.expected_date, "MMM d")}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Materials allocated" subtitle={`${money(allocatedValue)} from inventory`} actions={can("inventory.edit") && <Button size="sm" icon={<PackagePlus className="h-4 w-4" />} onClick={() => setOpen(true)}>Allocate / return</Button>} />
        {!moves.length ? <EmptyState title="No stock movements" /> : (
          <div className="divide-y divide-stone-100">
            {moves.map((m) => {
              const it = S.inventory_items.find((i) => i.id === m.inventory_item_id);
              return (
                <div key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Badge tone={m.type === "allocate" ? "brass" : m.type === "return" ? "green" : m.type === "damage" ? "red" : "neutral"}>{m.type}</Badge>
                  <span className="min-w-0 flex-1 truncate">{it?.name}</span>
                  <span className="tabular-nums text-stone-500">{num(Math.abs(m.quantity))} {it?.unit}</span>
                  <span className="w-24 text-right tabular-nums">{money(Math.abs(m.quantity) * m.unit_cost)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Allocate materials from inventory" size="sm" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!f.item || f.qty <= 0} onClick={() => { stockMove(f.item, f.type, f.qty, p.id, f.notes); toast("Inventory updated · job cost posted"); setOpen(false); }}>Save</Button></>}>
        <div className="space-y-3">
          <Field label="Action"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}><option value="allocate">Allocate to project</option><option value="return">Return to stock</option><option value="damage">Damaged / write-off</option></Select></Field>
          <Field label="Item"><Select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}><option value="">Select…</option>{S.inventory_items.map((i) => <option key={i.id} value={i.id}>{i.name} — {num(i.quantity)} {i.unit} on hand</option>)}</Select></Field>
          <Field label="Quantity"><NumberInput value={f.qty} onChange={(n) => setF({ ...f, qty: n })} /></Field>
          <Field label="Notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}

const EXP_CATS: ExpenseCategory[] = ["material", "labor", "subcontractor", "equipment", "disposal", "permit", "overhead", "other"];

function FinancialsTab({ p }: { p: Project }) {
  const S = useSnapshot();
  const { can } = useAuth();
  const { toast } = useToast();
  const f = projectFinancials(p, S.expenses, S.time_entries, S.invoices, S.payments);
  const [exp, setExp] = useState({ category: "material" as ExpenseCategory, description: "", amount: 0, supplier_id: "", status: "unpaid" as "unpaid" | "paid" });
  const [te, setTe] = useState({ employee_id: "", hours: 8, sqft: 0, date: todayISO(), notes: "" });
  const expenses = S.expenses.filter((e) => e.project_id === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const time = S.time_entries.filter((t) => t.project_id === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const bars = [
    { label: "Materials", v: f.materialCost },
    { label: "Labor", v: f.laborCost },
    { label: "Subcontractors", v: f.subcontractorCost },
    { label: "Other", v: f.otherCost },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="p-5">
        <h3 className="text-[15px] font-semibold">Budget vs. actual</h3>
        <div className="mt-4 space-y-3">
          <div>
            <div className="flex justify-between text-sm"><span className="text-stone-500">Job cost</span><span className="tabular-nums"><b>{money0(f.actualCost)}</b> / {money0(f.estimatedCost)}</span></div>
            <Progress className="mt-1.5 h-2" value={f.costProgress} tone={f.costProgress > 100 ? "red" : "brass"} />
          </div>
          {bars.map((b) => (
            <div key={b.label} className="flex justify-between text-sm"><span className="text-stone-500">{b.label}</span><span className="tabular-nums">{money(b.v)}</span></div>
          ))}
          <div className="space-y-1.5 border-t border-stone-100 pt-3 text-sm">
            <div className="flex justify-between"><span className="text-stone-500">Contract</span><span className="tabular-nums">{money(f.contract)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Estimated gross profit</span><span className="tabular-nums">{money(f.estimatedProfit)} ({pct(f.estimatedMargin)})</span></div>
            <div className="flex justify-between font-semibold"><span>Actual gross profit to date</span><span className="tabular-nums">{money(f.actualProfit)} ({pct(f.actualMargin)})</span></div>
          </div>
          <div className="space-y-1.5 border-t border-stone-100 pt-3 text-sm">
            <div className="flex justify-between"><span className="text-stone-500">Invoiced</span><span className="tabular-nums">{money(f.invoiced)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Collected</span><span className="tabular-nums text-sage-700">{money(f.collected)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Accounts receivable</span><span className="tabular-nums">{money(f.outstanding)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Unbilled contract</span><span className="tabular-nums">{money(f.unbilled)}</span></div>
          </div>
        </div>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader title="Expenses" subtitle="Materials, subcontractors, equipment, disposal, permits" />
        {can("finance.edit") && (
          <div className="grid grid-cols-2 gap-2 border-b border-stone-100 p-3 md:grid-cols-6">
            <Select className="h-8 text-xs" value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value as ExpenseCategory })}>{EXP_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
            <Input className="col-span-2 h-8 text-xs" placeholder="Description" value={exp.description} onChange={(e) => setExp({ ...exp, description: e.target.value })} />
            <Select className="h-8 text-xs" value={exp.supplier_id} onChange={(e) => setExp({ ...exp, supplier_id: e.target.value })}><option value="">Vendor…</option>{S.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <NumberInput className="h-8 text-right text-xs" value={exp.amount} onChange={(n) => setExp({ ...exp, amount: n })} />
            <Button size="sm" variant="primary" disabled={!exp.description || exp.amount <= 0} onClick={() => { db.insert("expenses", { project_id: p.id, supplier_id: exp.supplier_id || null, employee_id: null, purchase_order_id: null, category: exp.category, description: exp.description, amount: exp.amount, date: todayISO(), due_date: todayISO(), status: exp.status, paid_date: null, reference: "" }); setExp({ ...exp, description: "", amount: 0 }); toast("Expense added"); }}>Add</Button>
          </div>
        )}
        <div className="max-h-80 divide-y divide-stone-100 overflow-y-auto">
          {!expenses.length && <EmptyState title="No expenses" />}
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <Badge>{e.category}</Badge>
              <span className="min-w-0 flex-1 truncate">{e.description}</span>
              <span className="hidden text-xs text-stone-500 md:block">{fmtDate(e.date, "MMM d")}</span>
              <button disabled={!can("finance.edit")} onClick={() => db.update("expenses", e.id, { status: e.status === "paid" ? "unpaid" : "paid", paid_date: e.status === "paid" ? null : todayISO() })}><Badge tone={e.status === "paid" ? "green" : "amber"}>{e.status}</Badge></button>
              <span className="w-24 text-right tabular-nums">{money(e.amount)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="xl:col-span-3">
        <CardHeader title="Labor & time" icon={<Timer className="h-4 w-4" />} subtitle={`${num(time.reduce((s, t) => s + t.hours, 0), 1)} hours · ${money(time.reduce((s, t) => s + t.cost, 0))} labor · ${num(time.reduce((s, t) => s + t.sqft_completed, 0))} sqft installed`} />
        {can("team.edit") && (
          <div className="grid grid-cols-2 gap-2 border-b border-stone-100 p-3 md:grid-cols-7">
            <Select className="col-span-2 h-8 text-xs" value={te.employee_id} onChange={(e) => setTe({ ...te, employee_id: e.target.value })}><option value="">Employee / sub…</option>{S.employees.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name} ({money(e.rate)}/{e.rate_type.replace("per_", "")})</option>)}</Select>
            <Input type="date" className="h-8 text-xs" value={te.date} onChange={(e) => setTe({ ...te, date: e.target.value })} />
            <div className="flex items-center gap-1"><NumberInput className="h-8 text-right text-xs" value={te.hours} onChange={(n) => setTe({ ...te, hours: n })} /><span className="text-xs text-stone-400">h</span></div>
            <div className="flex items-center gap-1"><NumberInput className="h-8 text-right text-xs" value={te.sqft} onChange={(n) => setTe({ ...te, sqft: n })} /><span className="text-xs text-stone-400">sf</span></div>
            <Input className="h-8 text-xs" placeholder="Notes" value={te.notes} onChange={(e) => setTe({ ...te, notes: e.target.value })} />
            <Button size="sm" variant="primary" disabled={!te.employee_id} onClick={() => { logTime({ employee_id: te.employee_id, project_id: p.id, date: te.date, hours: te.hours, sqft_completed: te.sqft, notes: te.notes }); toast("Time logged"); }}>Log time</Button>
          </div>
        )}
        <div className="max-h-80 divide-y divide-stone-100 overflow-y-auto">
          {time.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-5 py-2 text-sm">
              <span className="w-24 text-xs text-stone-500">{fmtDate(t.date, "EEE MMM d")}</span>
              <span className="min-w-0 flex-1 truncate">{S.employees.find((e) => e.id === t.employee_id)?.name}<span className="text-stone-400">{t.notes ? ` · ${t.notes}` : ""}</span></span>
              <span className="tabular-nums text-stone-500">{t.hours}h{t.sqft_completed ? ` · ${t.sqft_completed} sf` : ""}</span>
              <span className="w-20 text-right tabular-nums">{money(t.cost)}</span>
              {can("team.edit") && <button className="text-stone-300 hover:text-clay-600" onClick={() => db.remove("time_entries", t.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
