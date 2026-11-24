"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CalendarClock, Columns3, Download, List, Plus, Target } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { custName, moveLead } from "@/lib/services";
import { todayISO } from "@/lib/calc";
import { ago, compactMoney, download, fmtDate, money0, toCSV } from "@/lib/format";
import { LeadModal, LEAD_SOURCES } from "@/components/forms";
import { PriorityBadge, ServiceChips } from "@/components/status";
import { Avatar, Badge, Button, Card, DataTable, PageHeader, SearchInput, Segmented, Select, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { Lead } from "@/lib/types";

export default function LeadsPage() {
  return (
    <RequirePerm perm="leads.view">
      <Suspense>
        <Inner />
      </Suspense>
    </RequirePerm>
  );
}

const LOST_REASONS = ["Price — went with lower bid", "Timing / postponed", "Chose another contractor", "Budget not approved", "No response", "Out of service area", "Scope too small", "Other"];

function Inner() {
  const S = useSnapshot();
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { prompt, toast } = useToast();
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [source, setSource] = useState("");
  const [onlyFollow, setOnlyFollow] = useState(params.get("filter") === "followup");
  const [showClosed, setShowClosed] = useState(true);
  const [newOpen, setNewOpen] = useState(params.get("new") === "1");
  const [presetStage, setPresetStage] = useState<string | undefined>();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const today = todayISO();
  useEffect(() => {
    if (params.get("new") === "1") setNewOpen(true);
  }, [params]);

  const stages = useMemo(() => [...S.pipeline_stages].sort((a, b) => a.position - b.position), [S.pipeline_stages]);
  const leads = useMemo(() => {
    const s = q.toLowerCase();
    return S.leads.filter((l) => {
      const c = S.customers.find((x) => x.id === l.customer_id);
      if (owner && l.assigned_to !== owner) return false;
      if (source && l.source !== source) return false;
      if (onlyFollow && !(l.status === "open" && l.follow_up_date && l.follow_up_date <= today)) return false;
      if (s && ![l.title, custName(c), c?.email ?? "", c?.project_address ?? ""].some((x) => x.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [S, q, owner, source, onlyFollow, today]);

  const drop = async (stageId: string) => {
    setOverStage(null);
    if (!dragId) return;
    const lead = db.get("leads", dragId);
    setDragId(null);
    if (!lead || lead.stage_id === stageId || !can("leads.edit")) return;
    const st = stages.find((s) => s.id === stageId)!;
    let reason = "";
    if (st.kind === "lost") {
      const r = await prompt({ title: "Why was this lead lost?", label: "Lost reason", placeholder: LOST_REASONS.join(" · "), initial: LOST_REASONS[0] });
      if (r === null) return;
      reason = r;
    }
    moveLead(lead.id, stageId, reason);
    toast(`Moved to ${st.name}`);
  };

  const visibleStages = showClosed ? stages : stages.filter((s) => s.kind === "open");
  const openValue = leads.filter((l) => l.status === "open").reduce((s, l) => s + l.estimated_value, 0);

  return (
    <div>
      <PageHeader
        title="Leads & Pipeline"
        subtitle={`${leads.filter((l) => l.status === "open").length} open opportunities · ${money0(openValue)} in pipeline`}
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ key: "board", label: <><Columns3 className="h-3.5 w-3.5" />Board</> }, { key: "list", label: <><List className="h-3.5 w-3.5" />List</> }]} />
            <Button icon={<Download className="h-4 w-4" />} onClick={() => download("leads.csv", toCSV(leads.map((l) => ({ title: l.title, customer: custName(db.get("customers", l.customer_id)), stage: stages.find((s) => s.id === l.stage_id)?.name, status: l.status, priority: l.priority, source: l.source, value: l.estimated_value, assigned: db.get("profiles", l.assigned_to)?.full_name ?? "", follow_up: l.follow_up_date ?? "", lost_reason: l.lost_reason, created: l.created_at.slice(0, 10) }))))}>Export</Button>
            {can("leads.edit") && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setPresetStage(undefined); setNewOpen(true); }}>New lead</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search leads…" className="lg:w-72" />
        <div className="flex flex-wrap gap-2">
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-44">
            <option value="">All reps</option>
            {S.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
          <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-44">
            <option value="">All sources</option>
            {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Button variant={onlyFollow ? "brass" : "secondary"} icon={<CalendarClock className="h-4 w-4" />} onClick={() => setOnlyFollow((v) => !v)}>Follow-ups due</Button>
          {view === "board" && <Button variant="ghost" onClick={() => setShowClosed((v) => !v)}>{showClosed ? "Hide won/lost" : "Show won/lost"}</Button>}
        </div>
      </div>

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <div className="flex gap-3" style={{ minWidth: visibleStages.length * 272 }}>
            {visibleStages.map((st) => {
              const items = leads.filter((l) => l.stage_id === st.id).sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
              const sum = items.reduce((s, l) => s + l.estimated_value, 0);
              return (
                <div
                  key={st.id}
                  onDragOver={(e) => { e.preventDefault(); setOverStage(st.id); }}
                  onDragLeave={() => setOverStage((s) => (s === st.id ? null : s))}
                  onDrop={() => void drop(st.id)}
                  className={cn("flex w-[264px] shrink-0 flex-col rounded-xl bg-stone-150/70 transition", overStage === st.id && "bg-brass-100/70 ring-2 ring-brass-300")}
                >
                  <div className="flex items-center justify-between px-3 pb-2 pt-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: st.color }} />
                      <p className="truncate text-[13px] font-semibold text-ink-900">{st.name}</p>
                      <span className="rounded-full bg-white px-1.5 text-[11px] font-semibold tabular-nums text-stone-500">{items.length}</span>
                    </div>
                    {can("leads.edit") && (
                      <button onClick={() => { setPresetStage(st.id); setNewOpen(true); }} className="rounded p-0.5 text-stone-400 hover:bg-white hover:text-ink-900" aria-label="Add lead">
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="px-3 pb-2 text-[11px] tabular-nums text-stone-500">{compactMoney(sum)} · {st.probability}% probability</p>
                  <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-2">
                    {items.map((l) => <LeadCard key={l.id} lead={l} onDragStart={() => setDragId(l.id)} dragging={dragId === l.id} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <DataTable
            rows={leads}
            onRowClick={(l) => router.push(`/leads/${l.id}`)}
            initialSort={{ key: "created", dir: "desc" }}
            columns={[
              { key: "title", header: "Opportunity", sort: (l) => l.title, cell: (l) => <div><p className="font-medium">{l.title}</p><p className="text-xs text-stone-500">{custName(db.get("customers", l.customer_id))}</p></div> },
              { key: "stage", header: "Stage", sort: (l) => stages.findIndex((s) => s.id === l.stage_id), cell: (l) => { const st = stages.find((s) => s.id === l.stage_id); return <span className="inline-flex items-center gap-1.5 text-xs font-medium"><span className="h-2 w-2 rounded-full" style={{ background: st?.color }} />{st?.name}</span>; } },
              { key: "services", header: "Services", cell: (l) => <ServiceChips services={l.services} />, hideOnMobile: true },
              { key: "priority", header: "Priority", sort: (l) => ["low", "medium", "high", "urgent"].indexOf(l.priority), cell: (l) => <PriorityBadge p={l.priority} />, hideOnMobile: true },
              { key: "source", header: "Source", sort: (l) => l.source, cell: (l) => <span className="text-xs text-stone-600">{l.source}</span>, hideOnMobile: true },
              { key: "owner", header: "Rep", cell: (l) => { const p = db.get("profiles", l.assigned_to); return p ? <Avatar name={p.full_name} color={p.color} size={24} /> : <span className="text-xs text-stone-400">—</span>; }, hideOnMobile: true },
              { key: "follow", header: "Follow-up", sort: (l) => l.follow_up_date ?? "9", cell: (l) => <span className={cn("text-xs", l.status === "open" && l.follow_up_date && l.follow_up_date <= today ? "font-semibold text-clay-600" : "text-stone-500")}>{fmtDate(l.follow_up_date)}</span> },
              { key: "value", header: "Value", sort: (l) => l.estimated_value, cell: (l) => <span className="font-semibold tabular-nums">{money0(l.estimated_value)}</span>, className: "text-right", headerClassName: "text-right" },
              { key: "created", header: "Created", sort: (l) => l.created_at, cell: (l) => <span className="text-xs text-stone-500">{ago(l.created_at)}</span>, hideOnMobile: true },
            ]}
          />
        </Card>
      )}
      <LeadModal open={newOpen} onClose={() => { setNewOpen(false); if (params.get("new")) router.replace("/leads"); }} presetStageId={presetStage} onSaved={(l) => router.push(`/leads/${l.id}`)} />
    </div>
  );
}

function LeadCard({ lead, onDragStart, dragging }: { lead: Lead; onDragStart: () => void; dragging: boolean }) {
  const c = db.get("customers", lead.customer_id);
  const rep = db.get("profiles", lead.assigned_to);
  const today = todayISO();
  const due = lead.status === "open" && lead.follow_up_date && lead.follow_up_date <= today;
  return (
    <Link
      href={`/leads/${lead.id}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      className={cn("block cursor-grab rounded-lg border border-stone-200 bg-white p-3 shadow-sm transition hover:border-stone-300 hover:shadow-card active:cursor-grabbing", dragging && "opacity-40")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink-900">{lead.title}</p>
        {lead.priority !== "medium" && lead.priority !== "low" && <PriorityBadge p={lead.priority} />}
      </div>
      <p className="mt-1 truncate text-xs text-stone-500">{custName(c)}</p>
      <ServiceChips services={lead.services} className="mt-2" />
      {lead.status === "lost" && lead.lost_reason && <p className="mt-2 truncate text-[11px] text-clay-600">{lead.lost_reason}</p>}
      <div className="mt-2.5 flex items-center justify-between border-t border-stone-100 pt-2">
        <span className="text-[13px] font-semibold tabular-nums">{money0(lead.estimated_value)}</span>
        <div className="flex items-center gap-1.5">
          {due && <Badge tone="red">Follow up</Badge>}
          {lead.inquiry_payload && <Badge tone="blue">Web</Badge>}
          {rep && <Avatar name={rep.full_name} color={rep.color} size={20} />}
        </div>
      </div>
    </Link>
  );
}
