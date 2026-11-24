"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Columns3, Download, List, Plus } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { custName, nextNumber, setProjectStage } from "@/lib/services";
import { projectFinancials } from "@/lib/calc";
import { compactMoney, download, fmtDate, money0, pct, toCSV } from "@/lib/format";
import { HEALTH, ServiceChips, StageBadge } from "@/components/status";
import { Avatar, Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, Progress, SearchInput, Segmented, Select, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import { PROJECT_STAGES, type ProjectStage } from "@/lib/types";
import { ServicePicker } from "@/components/forms";

export default function ProjectsPage() {
  return (
    <RequirePerm perm="projects.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const S = useSnapshot();
  const { can, user, role } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [pm, setPm] = useState("");
  const [crew, setCrew] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // field roles only see their assigned projects
  const fieldOnly = role?.key === "field_employee" || role?.key === "subcontractor";
  const myEmployee = S.employees.find((e) => e.profile_id === user?.id);

  const projects = useMemo(() => S.projects.filter((p) => {
    if (fieldOnly && !(myEmployee && (p.member_ids.includes(myEmployee.id) || S.crews.find((c) => c.id === p.crew_id)?.member_ids.includes(myEmployee.id)))) return false;
    if (pm && p.manager_id !== pm) return false;
    if (crew && p.crew_id !== crew) return false;
    if (!showClosed && p.stage === "Closed") return false;
    const c = S.customers.find((x) => x.id === p.customer_id);
    return !q || [p.name, p.number, p.address, custName(c)].some((x) => x.toLowerCase().includes(q.toLowerCase()));
  }), [S, q, pm, crew, showClosed, fieldOnly, myEmployee]);

  const stages = showClosed ? PROJECT_STAGES : PROJECT_STAGES.filter((s) => s !== "Closed");
  const fin = (id: string) => {
    const p = S.projects.find((x) => x.id === id)!;
    return projectFinancials(p, S.expenses, S.time_entries, S.invoices, S.payments);
  };

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${projects.filter((p) => p.stage !== "Closed").length} open · ${money0(projects.filter((p) => p.stage !== "Closed").reduce((s, p) => s + p.contract_value, 0))} contract value`}
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ key: "board", label: <><Columns3 className="h-3.5 w-3.5" />Stages</> }, { key: "list", label: <><List className="h-3.5 w-3.5" />List</> }]} />
            {can("finance.view") && <Button icon={<Download className="h-4 w-4" />} onClick={() => download("projects.csv", toCSV(projects.map((p) => { const f = fin(p.id); return { number: p.number, name: p.name, customer: custName(db.get("customers", p.customer_id)), stage: p.stage, start: p.start_date ?? "", end: p.end_date ?? "", contract: f.contract, estimated_cost: f.estimatedCost, actual_cost: f.actualCost, actual_profit: f.actualProfit, margin_pct: f.actualMargin, invoiced: f.invoiced, collected: f.collected }; })))}>Export</Button>}
            {can("projects.edit") && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>New project</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search projects…" className="lg:w-72" />
        <div className="flex flex-wrap gap-2">
          <Select value={pm} onChange={(e) => setPm(e.target.value)} className="w-48">
            <option value="">All project managers</option>
            {S.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select>
          <Select value={crew} onChange={(e) => setCrew(e.target.value)} className="w-44">
            <option value="">All crews</option>
            {S.crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button variant="ghost" onClick={() => setShowClosed((v) => !v)}>{showClosed ? "Hide closed" : "Show closed"}</Button>
        </div>
      </div>

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <div className="flex gap-3" style={{ minWidth: stages.length * 262 }}>
            {stages.map((st) => {
              const items = projects.filter((p) => p.stage === st);
              return (
                <div
                  key={st}
                  onDragOver={(e) => { e.preventDefault(); setOver(st); }}
                  onDragLeave={() => setOver((s) => (s === st ? null : s))}
                  onDrop={() => { setOver(null); if (dragId && can("projects.edit")) { setProjectStage(dragId, st as ProjectStage); toast(`Moved to ${st}`); } setDragId(null); }}
                  className={cn("flex w-[254px] shrink-0 flex-col rounded-xl bg-stone-150/70", over === st && "bg-brass-100/70 ring-2 ring-brass-300")}
                >
                  <div className="flex items-center justify-between px-3 pb-1 pt-3">
                    <StageBadge s={st as ProjectStage} />
                    <span className="text-[11px] tabular-nums text-stone-500">{items.length} · {compactMoney(items.reduce((s, p) => s + p.contract_value, 0))}</span>
                  </div>
                  <div className="flex min-h-[140px] flex-1 flex-col gap-2 p-2">
                    {items.map((p) => {
                      const c = db.get("customers", p.customer_id);
                      const cr = db.get("crews", p.crew_id);
                      const tasks = S.project_tasks.filter((t) => t.project_id === p.id && t.kind !== "checklist");
                      const done = tasks.filter((t) => t.done).length;
                      return (
                        <Link key={p.id} href={`/projects/${p.id}`} draggable onDragStart={() => setDragId(p.id)} className={cn("block cursor-grab rounded-lg border border-stone-200 bg-white p-3 shadow-sm hover:border-stone-300 hover:shadow-card", dragId === p.id && "opacity-40")}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{p.name}</p>
                            {p.health !== "on_track" && <Badge tone={HEALTH[p.health].tone}>{HEALTH[p.health].label}</Badge>}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-stone-500">{p.number} · {custName(c)}</p>
                          <ServiceChips services={p.services} className="mt-2" />
                          {tasks.length > 0 && <div className="mt-2.5"><Progress value={(done / tasks.length) * 100} tone="green" /><p className="mt-1 text-[10px] text-stone-400">{done}/{tasks.length} tasks</p></div>}
                          <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2 text-xs">
                            <span className="font-semibold tabular-nums">{money0(p.contract_value)}</span>
                            <span className="flex items-center gap-1.5 text-stone-500">{cr && <span className="h-2 w-2 rounded-full" style={{ background: cr.color }} />}{p.start_date ? fmtDate(p.start_date, "MMM d") : "Unscheduled"}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Card>
          <DataTable
            rows={projects}
            onRowClick={(p) => router.push(`/projects/${p.id}`)}
            initialSort={{ key: "stage", dir: "asc" }}
            columns={[
              { key: "name", header: "Project", sort: (p) => p.name, cell: (p) => <div><p className="font-medium">{p.name}</p><p className="text-xs text-stone-500">{p.number} · {custName(db.get("customers", p.customer_id))}</p></div> },
              { key: "stage", header: "Stage", sort: (p) => PROJECT_STAGES.indexOf(p.stage), cell: (p) => <StageBadge s={p.stage} /> },
              { key: "pm", header: "PM", cell: (p) => { const u = db.get("profiles", p.manager_id); return u ? <Avatar name={u.full_name} color={u.color} size={24} /> : "—"; }, hideOnMobile: true },
              { key: "crew", header: "Crew", cell: (p) => <span className="text-xs">{db.get("crews", p.crew_id)?.name ?? "—"}</span>, hideOnMobile: true },
              { key: "dates", header: "Schedule", sort: (p) => p.start_date ?? "9", cell: (p) => <span className="text-xs text-stone-500">{fmtDate(p.start_date, "MMM d")} – {fmtDate(p.end_date, "MMM d")}</span>, hideOnMobile: true },
              { key: "contract", header: "Contract", sort: (p) => p.contract_value, cell: (p) => <span className="font-semibold tabular-nums">{money0(p.contract_value)}</span>, className: "text-right", headerClassName: "text-right" },
              ...(can("finance.view") ? [{ key: "margin", header: "Margin", sort: (p: { id: string }) => fin(p.id).actualMargin, cell: (p: { id: string }) => { const f = fin(p.id); return <span className={cn("tabular-nums", f.actualMargin < 25 ? "text-clay-600" : "text-sage-700")}>{pct(f.actualCost > 0 ? f.actualMargin : f.estimatedMargin)}</span>; }, className: "text-right", headerClassName: "text-right", hideOnMobile: true }] : []),
            ]}
          />
        </Card>
      )}
      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => router.push(`/projects/${id}`)} />
    </div>
  );
}

function NewProjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const S = useSnapshot();
  const co = S.company_settings[0];
  const [f, setF] = useState({ customer_id: "", name: "", contract_value: 0, estimated_cost: 0, services: [] as ("tile" | "flooring" | "cabinets" | "countertops" | "general")[] });
  const save = () => {
    if (!f.customer_id || !f.name) return;
    const c = db.get("customers", f.customer_id);
    const p = db.insert("projects", {
      number: nextNumber("project"), name: f.name, customer_id: f.customer_id, estimate_id: null, lead_id: null, address: c?.project_address ?? "", manager_id: db.currentUserId, crew_id: null, member_ids: [],
      services: f.services, contract_value: f.contract_value, original_contract_value: f.contract_value, estimated_cost: f.estimated_cost, stage: "Contract Signed", health: "on_track",
      start_date: null, end_date: null, completed_at: null, notes: "", payment_schedule: co.default_payment_schedule.map((m) => ({ ...m, invoice_id: null })), signed_name: "", signed_at: null,
    });
    onClose();
    onCreated(p.id);
  };
  return (
    <Modal open={open} onClose={onClose} title="New project" subtitle="Tip: approving an estimate creates the project automatically with its scope and payment schedule." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.customer_id || !f.name} onClick={save}>Create project</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer" required className="sm:col-span-2">
          <Select value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}>
            <option value="">Select…</option>
            {S.customers.map((c) => <option key={c.id} value={c.id}>{custName(c)}</option>)}
          </Select>
        </Field>
        <Field label="Project name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Contract value"><Input type="number" value={f.contract_value} onChange={(e) => setF({ ...f, contract_value: Number(e.target.value) })} /></Field>
        <Field label="Estimated cost"><Input type="number" value={f.estimated_cost} onChange={(e) => setF({ ...f, estimated_cost: Number(e.target.value) })} /></Field>
        <Field label="Services" className="sm:col-span-2"><ServicePicker value={f.services} onChange={(services) => setF({ ...f, services })} /></Field>
      </div>
    </Modal>
  );
}
