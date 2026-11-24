"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarPlus, Check, FileSignature, Mail, MapPin, Pencil, PenTool, Phone, Ruler, Trash2, XCircle } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { custName, moveLead } from "@/lib/services";
import { estimateTotals, todayISO } from "@/lib/calc";
import { fmtDate, fmtDateTime, money, money0, num } from "@/lib/format";
import { LeadModal } from "@/components/forms";
import { ActivityTimeline } from "@/components/activity";
import { EventModal, NewEstimateModal } from "@/components/modals";
import { EstimateBadge, EVENT_META, PriorityBadge, ServiceChips } from "@/components/status";
import { Badge, Button, Card, CardHeader, EmptyState, Input, KV, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import { NewQuoteModal } from "@/components/new-quote";

export default function LeadPage() {
  return (
    <RequirePerm perm="leads.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const S = useSnapshot();
  const { can } = useAuth();
  const router = useRouter();
  const { prompt, confirm, toast } = useToast();
  const [edit, setEdit] = useState(false);
  const [est, setEst] = useState(false);
  const [ev, setEv] = useState(false);
  const [draw, setDraw] = useState(false);
  const filter = useMemo(() => (a: { lead_id: string | null }) => a.lead_id === id, [id]);
  const lead = S.leads.find((l) => l.id === id);
  if (!lead) return <Card><EmptyState title="Lead not found" action={<Link href="/leads"><Button>Back to pipeline</Button></Link>} /></Card>;
  const c = S.customers.find((x) => x.id === lead.customer_id);
  const stages = [...S.pipeline_stages].sort((a, b) => a.position - b.position);
  const cur = stages.find((s) => s.id === lead.stage_id);
  const estimates = S.estimates.filter((e) => e.lead_id === id);
  const measurements = S.measurements.filter((m) => m.lead_id === id);
  const events = S.events.filter((e) => e.lead_id === id).sort((a, b) => a.start.localeCompare(b.start));
  const project = S.projects.find((p) => p.lead_id === id);
  const editable = can("leads.edit");
  const won = stages.find((s) => s.kind === "won");
  const lost = stages.find((s) => s.kind === "lost");

  const markLost = async () => {
    if (!lost) return;
    const r = await prompt({ title: "Mark as lost", label: "Lost reason", initial: "Price — went with lower bid" });
    if (r === null) return;
    moveLead(lead.id, lost.id, r);
    toast("Lead marked lost");
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs text-stone-500"><Link href="/leads" className="hover:text-ink-900">Leads</Link> / {cur?.name}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{lead.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={lead.status === "won" ? "green" : lead.status === "lost" ? "red" : "brass"} dot>{lead.status === "open" ? cur?.name : lead.status}</Badge>
            <PriorityBadge p={lead.priority} />
            <ServiceChips services={lead.services} />
          </div>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>
            <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setEv(true)}>Schedule visit</Button>
            {can("measurements.edit") && <Button icon={<Ruler className="h-4 w-4" />} onClick={() => router.push(`/measurements?lead=${lead.id}`)}>Measure</Button>}
            {can("estimates.edit") && lead.services.includes("countertops") && <Button icon={<PenTool className="h-4 w-4" />} onClick={() => setDraw(true)}>Countertop quote</Button>}
            {can("estimates.edit") && <Button variant="primary" icon={<FileSignature className="h-4 w-4" />} onClick={() => setEst(true)}>Create estimate</Button>}
          </div>
        )}
      </div>

      {/* stage stepper */}
      <Card className="mb-5 overflow-x-auto p-2">
        <div className="flex min-w-[860px] gap-1">
          {stages.filter((s) => s.kind !== "lost").map((s) => {
            const done = cur && (cur.kind === "won" || s.position <= cur.position) && lead.status !== "lost";
            const active = s.id === lead.stage_id;
            return (
              <button
                key={s.id}
                disabled={!editable}
                onClick={() => moveLead(lead.id, s.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11.5px] font-semibold transition",
                  active ? "bg-ink-900 text-white" : done ? "bg-brass-100 text-brass-800 hover:bg-brass-200" : "bg-stone-50 text-stone-500 hover:bg-stone-100",
                )}
              >
                {done && !active && <Check className="h-3 w-3" />}
                {s.name}
              </button>
            );
          })}
          {editable && (
            <button onClick={() => void markLost()} className={cn("flex items-center gap-1 rounded-lg px-3 py-2 text-[11.5px] font-semibold", lead.status === "lost" ? "bg-clay-600 text-white" : "bg-stone-50 text-clay-600 hover:bg-clay-50")}>
              <XCircle className="h-3.5 w-3.5" />Lost
            </button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Customer" actions={c && <Link href={`/customers/${c.id}`} className="text-xs font-medium text-brass-600">Profile →</Link>} />
            <div className="space-y-2 p-5 text-sm">
              <p className="text-base font-semibold">{custName(c)}</p>
              {c?.company && <p className="text-stone-500">{c.company}</p>}
              {c?.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-stone-600 hover:text-ink-900"><Phone className="h-4 w-4" />{c.phone}</a>}
              {c?.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-stone-600 hover:text-ink-900"><Mail className="h-4 w-4" />{c.email}</a>}
              {c?.project_address && <p className="flex items-start gap-2 text-stone-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{c.project_address}</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Opportunity" />
            <dl className="grid grid-cols-2 gap-4 p-5">
              <KV label="Estimated value">{money0(lead.estimated_value)}</KV>
              <KV label="Probability">{cur?.probability}%</KV>
              <KV label="Source">{lead.source}</KV>
              <KV label="Assigned to">{db.get("profiles", lead.assigned_to)?.full_name}</KV>
              <KV label="Created">{fmtDate(lead.created_at)}</KV>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Follow-up</dt>
                {editable ? (
                  <Input type="date" className={cn("mt-0.5 h-8", lead.status === "open" && lead.follow_up_date && lead.follow_up_date <= todayISO() && "border-clay-500/50 text-clay-700")} value={lead.follow_up_date ?? ""} onChange={(e) => db.update("leads", lead.id, { follow_up_date: e.target.value || null })} />
                ) : <dd className="text-sm">{fmtDate(lead.follow_up_date)}</dd>}
              </div>
              {lead.status === "lost" && <KV label="Lost reason" className="col-span-2">{lead.lost_reason}</KV>}
              {lead.description && <div className="col-span-2"><dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Description</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{lead.description}</dd></div>}
            </dl>
            {editable && lead.status === "open" && won && (
              <div className="flex gap-2 border-t border-stone-100 p-3">
                <Button size="sm" variant="success" className="flex-1" onClick={async () => { if (await confirm({ title: "Mark lead as won?", body: "Tip: approving the estimate creates the project automatically." })) moveLead(lead.id, won.id); }}>Mark won</Button>
                <Button size="sm" className="flex-1" onClick={async () => { if (await confirm({ title: "Delete lead?", danger: true, confirmLabel: "Delete" })) { db.remove("leads", lead.id); router.push("/leads"); } }} icon={<Trash2 className="h-3.5 w-3.5" />}>Delete</Button>
              </div>
            )}
          </Card>
          {lead.inquiry_payload && (
            <Card>
              <CardHeader title="Website inquiry" subtitle="Captured automatically from the inquiry form" />
              <dl className="space-y-2 p-5 text-sm">
                {Object.entries(lead.inquiry_payload).filter(([k]) => !["services"].includes(k)).map(([k, v]) => (
                  <div key={k}><dt className="text-[11px] uppercase tracking-wide text-stone-400">{k}</dt><dd className="whitespace-pre-wrap">{String(v)}</dd></div>
                ))}
              </dl>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          {project && (
            <Link href={`/projects/${project.id}`} className="flex items-center gap-3 rounded-xl border border-sage-100 bg-sage-50 px-4 py-3 text-sm text-sage-700">
              <Check className="h-4 w-4" /> Converted to project <b>{project.number} · {project.name}</b> <span className="ml-auto">Open →</span>
            </Link>
          )}
          <Card>
            <CardHeader title="Estimates" actions={can("estimates.edit") && <Button size="xs" onClick={() => setEst(true)}>New estimate</Button>} />
            {!estimates.length ? <EmptyState title="No estimates yet" body="Build a proposal from the pricing catalog or a template." /> : (
              <div className="divide-y divide-stone-100">
                {estimates.map((e) => (
                  <Link key={e.id} href={`/estimates/${e.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{e.number} · {e.title}</p><p className="text-xs text-stone-500">{fmtDate(e.issue_date)}</p></div>
                    <EstimateBadge s={e.status} />
                    <span className="w-28 text-right text-sm font-semibold tabular-nums">{money(estimateTotals(e, S.estimate_items.filter((i) => i.estimate_id === e.id)).total)}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Appointments" actions={editable && <Button size="xs" onClick={() => setEv(true)}>Schedule</Button>} />
              {!events.length ? <EmptyState title="Nothing scheduled" /> : (
                <div className="divide-y divide-stone-100">
                  {events.map((e) => (
                    <div key={e.id} className="flex gap-3 px-5 py-2.5">
                      <span className="mt-1.5 h-2 w-2 rounded-full" style={{ background: EVENT_META[e.type]?.color }} />
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{e.title}</p><p className="text-xs text-stone-500">{fmtDateTime(e.start)}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Measurements" actions={can("measurements.edit") && <Link href={`/measurements?lead=${lead.id}`} className="text-xs font-medium text-brass-600">Add →</Link>} />
              {!measurements.length ? <EmptyState title="No measurements" /> : (
                <div className="divide-y divide-stone-100">
                  {measurements.map((m) => (
                    <Link key={m.id} href={`/measurements?lead=${lead.id}&m=${m.id}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-stone-50">
                      <span className="text-sm">{m.room}</span>
                      <span className="text-xs tabular-nums text-stone-500">{num(m.sqft, 1)} sf · {num(m.lf, 1)} lf</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
          <Card className="p-5">
            <h3 className="mb-4 text-[15px] font-semibold">Activity & communication</h3>
            <ActivityTimeline filter={filter} link={{ customer_id: lead.customer_id, lead_id: lead.id }} canLog={editable} />
          </Card>
        </div>
      </div>
      <NewQuoteModal open={draw} onClose={() => setDraw(false)} customerId={lead.customer_id} leadId={lead.id} />
      <LeadModal open={edit} onClose={() => setEdit(false)} lead={lead} />
      <NewEstimateModal open={est} onClose={() => setEst(false)} customerId={lead.customer_id} leadId={lead.id} />
      <EventModal open={ev} onClose={() => setEv(false)} preset={{ title: `Site visit — ${c?.last_name ?? ""}`, type: "site_visit", customer_id: lead.customer_id, lead_id: lead.id, location: c?.project_address ?? "" }} />
    </div>
  );
}
