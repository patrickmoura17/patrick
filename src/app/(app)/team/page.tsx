"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, HardHat, Plus, ShieldCheck } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { addDaysISO, round2, todayISO } from "@/lib/calc";
import { fmtDate, money, money0, num } from "@/lib/format";
import { SERVICE_META, SERVICES } from "@/components/status";
import { Avatar, Badge, Button, Card, CardHeader, DataTable, EmptyState, Field, Input, Modal, NumberInput, PageHeader, Select, Stat, Tabs, Textarea, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { Crew, Employee, ServiceCategory } from "@/lib/types";

type Tab = "people" | "crews" | "performance" | "compliance";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TeamPage() {
  return (
    <RequirePerm perm="team.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const S = useSnapshot();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("people");
  const [kind, setKind] = useState<"" | "employee" | "subcontractor">("");
  const [emp, setEmp] = useState<Employee | "new" | null>(null);
  const [crew, setCrew] = useState<Crew | "new" | null>(null);
  const today = todayISO();
  const soon = addDaysISO(today, 30);
  const expiring = S.employees.filter((e) => e.active && ((e.insurance_expires && e.insurance_expires <= soon) || (e.license_expires && e.license_expires <= soon)));
  const from = addDaysISO(today, -90);

  const perf = useMemo(() => S.employees.map((e) => {
    const t = S.time_entries.filter((x) => x.employee_id === e.id && x.date >= from);
    const hours = t.reduce((s, x) => s + x.hours, 0);
    const sqft = t.reduce((s, x) => s + x.sqft_completed, 0);
    const cost = t.reduce((s, x) => s + x.cost, 0) + S.expenses.filter((x) => x.employee_id === e.id && x.date >= from).reduce((s, x) => s + x.amount, 0);
    const projects = new Set(t.map((x) => x.project_id)).size;
    return { ...e, hours, sqft, cost, projects, sqftPerHour: hours ? round2(sqft / hours) : 0, costPerSqft: sqft ? round2(cost / sqft) : 0 };
  }), [S, from]);
  const people = S.employees.filter((e) => !kind || e.kind === kind);

  return (
    <div>
      <PageHeader
        title="Team, Crews & Subcontractors"
        subtitle="People, rates, availability, compliance and productivity"
        actions={can("team.edit") && (tab === "crews" ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCrew("new")}>New crew</Button> : <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEmp("new")}>Add person</Button>)}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Employees" value={S.employees.filter((e) => e.kind === "employee" && e.active).length} />
        <Stat label="Subcontractors" value={S.employees.filter((e) => e.kind === "subcontractor" && e.active).length} />
        <Stat label="Labor cost (90d)" value={money0(perf.reduce((s, p) => s + p.cost, 0))} sub={`${num(perf.reduce((s, p) => s + p.hours, 0))} hours`} />
        <Stat label="Compliance alerts" value={<span className={expiring.length ? "text-clay-600" : ""}>{expiring.length}</span>} sub="insurance / license ≤ 30 days" onClick={() => setTab("compliance")} />
      </div>
      <Card>
        <div className="flex items-end justify-between border-b border-stone-100 px-3 pt-1">
          <Tabs<Tab> className="border-0" value={tab} onChange={setTab} tabs={[{ key: "people", label: "People", count: S.employees.length }, { key: "crews", label: "Crews", count: S.crews.length }, { key: "performance", label: "Productivity" }, { key: "compliance", label: "Compliance", count: expiring.length || undefined }]} />
          {tab === "people" && <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="mb-2 w-44"><option value="">Everyone</option><option value="employee">Employees</option><option value="subcontractor">Subcontractors</option></Select>}
        </div>
        {tab === "people" && (
          <DataTable
            rows={people}
            onRowClick={(r) => setEmp(r)}
            initialSort={{ key: "name", dir: "asc" }}
            columns={[
              { key: "name", header: "Name", sort: (r) => r.name, cell: (r) => <div className="flex items-center gap-3"><Avatar name={r.name} color={r.kind === "subcontractor" ? "#8a5a9e" : "#3e5a74"} size={32} /><div><p className="font-medium">{r.name}{!r.active && <Badge className="ml-2">Inactive</Badge>}</p><p className="text-xs text-stone-500">{r.position}{r.company ? ` · ${r.company}` : ""}</p></div></div> },
              { key: "kind", header: "Type", sort: (r) => r.kind, cell: (r) => <Badge tone={r.kind === "subcontractor" ? "purple" : "blue"}>{r.kind}</Badge> },
              { key: "spec", header: "Specialty", cell: (r) => <div className="flex flex-wrap gap-1">{r.specialty.map((s) => <Badge key={s} tone={SERVICE_META[s]?.tone}>{SERVICE_META[s]?.label}</Badge>)}</div>, hideOnMobile: true },
              { key: "rate", header: "Rate", sort: (r) => r.rate, cell: (r) => <span className="tabular-nums">{money(r.rate)}<span className="text-xs text-stone-400">/{r.rate_type === "per_sqft" ? "sqft" : r.rate_type === "hourly" ? "hr" : r.rate_type === "daily" ? "day" : "job"}</span></span> },
              { key: "avail", header: "Availability", cell: (r) => <div className="flex gap-0.5">{DAYS.map((d, i) => <span key={d} className={cn("grid h-5 w-5 place-items-center rounded text-[9px] font-semibold", r.availability.includes(i) ? "bg-sage-100 text-sage-700" : "bg-stone-100 text-stone-400")}>{d[0]}</span>)}</div>, hideOnMobile: true },
              { key: "proj", header: "Active projects", cell: (r) => <span className="tabular-nums">{S.projects.filter((p) => p.stage !== "Closed" && p.stage !== "Completed" && (p.member_ids.includes(r.id) || S.crews.find((c) => c.id === p.crew_id)?.member_ids.includes(r.id))).length}</span>, hideOnMobile: true },
              { key: "contact", header: "Contact", cell: (r) => <span className="text-xs text-stone-500">{r.phone}</span>, hideOnMobile: true },
            ]}
          />
        )}
        {tab === "crews" && (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
            {S.crews.map((c) => {
              const members = c.member_ids.map((m) => S.employees.find((e) => e.id === m)).filter(Boolean) as Employee[];
              const upcoming = S.events.filter((e) => e.crew_id === c.id && e.start >= new Date().toISOString() && e.status !== "cancelled").length;
              const active = S.projects.filter((p) => p.crew_id === c.id && !["Closed", "Completed", "Final Payment"].includes(p.stage));
              return (
                <button key={c.id} onClick={() => setCrew(c)} className="rounded-xl border border-stone-200 p-4 text-left transition hover:border-stone-300 hover:shadow-card">
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: c.color }} /><p className="font-semibold">{c.name}</p>{!c.active && <Badge>Inactive</Badge>}</div>
                  <p className="mt-0.5 text-xs text-stone-500">{SERVICE_META[c.specialty]?.label} · lead {S.employees.find((e) => e.id === c.lead_employee_id)?.name ?? "—"}</p>
                  <div className="mt-3 flex -space-x-1.5">{members.map((m) => <Avatar key={m.id} name={m.name} color={c.color} size={28} />)}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-stone-100 pt-3 text-xs">
                    <div><p className="text-stone-400">Active projects</p><p className="font-semibold">{active.length}</p></div>
                    <div><p className="text-stone-400">Upcoming bookings</p><p className="font-semibold">{upcoming}</p></div>
                  </div>
                </button>
              );
            })}
            {!S.crews.length && <EmptyState title="No crews yet" />}
          </div>
        )}
        {tab === "performance" && (
          <div>
            <p className="px-5 pt-4 text-xs text-stone-500">Last 90 days · based on logged time entries and labor expenses</p>
            <DataTable
              rows={perf.filter((p) => p.hours > 0 || p.cost > 0)}
              initialSort={{ key: "sqft", dir: "desc" }}
              empty={<EmptyState icon={<HardHat className="h-6 w-6" />} title="No time logged in the last 90 days" />}
              columns={[
                { key: "name", header: "Name", sort: (r) => r.name, cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-stone-500">{r.position}</p></div> },
                { key: "projects", header: "Projects", sort: (r) => r.projects, cell: (r) => r.projects, className: "text-right", headerClassName: "text-right" },
                { key: "hours", header: "Hours", sort: (r) => r.hours, cell: (r) => <span className="tabular-nums">{num(r.hours, 1)}</span>, className: "text-right", headerClassName: "text-right" },
                { key: "sqft", header: "Sqft installed", sort: (r) => r.sqft, cell: (r) => <span className="tabular-nums">{num(r.sqft)}</span>, className: "text-right", headerClassName: "text-right" },
                { key: "rate", header: "Sqft / hour", sort: (r) => r.sqftPerHour, cell: (r) => { const max = Math.max(...perf.map((p) => p.sqftPerHour), 1); return <div className="flex items-center justify-end gap-2"><div className="hidden h-1.5 w-20 rounded-full bg-stone-100 md:block"><div className="h-full rounded-full bg-brass-500" style={{ width: `${(r.sqftPerHour / max) * 100}%` }} /></div><span className="w-10 text-right font-semibold tabular-nums">{r.sqftPerHour || "—"}</span></div>; }, className: "text-right", headerClassName: "text-right" },
                { key: "cost", header: "Labor cost", sort: (r) => r.cost, cell: (r) => <span className="tabular-nums">{money0(r.cost)}</span>, className: "text-right", headerClassName: "text-right" },
                { key: "cps", header: "Cost / sqft", sort: (r) => r.costPerSqft, cell: (r) => <span className="tabular-nums">{r.costPerSqft ? money(r.costPerSqft) : "—"}</span>, className: "text-right", headerClassName: "text-right" },
              ]}
            />
          </div>
        )}
        {tab === "compliance" && (
          <div className="divide-y divide-stone-100">
            {S.employees.filter((e) => e.insurance_expires || e.license_expires).map((e) => {
              const badge = (d: string | null) => !d ? <span className="text-stone-400">—</span> : d < today ? <Badge tone="red">Expired {fmtDate(d)}</Badge> : d <= soon ? <Badge tone="amber">Expires {fmtDate(d)}</Badge> : <Badge tone="green">Valid to {fmtDate(d)}</Badge>;
              return (
                <button key={e.id} onClick={() => setEmp(e)} className="grid w-full grid-cols-1 gap-2 px-5 py-3 text-left hover:bg-stone-50 md:grid-cols-4 md:items-center">
                  <div><p className="font-medium">{e.name}</p><p className="text-xs text-stone-500">{e.company || e.position}</p></div>
                  <div className="text-xs"><span className="mr-2 text-stone-500">Insurance (COI)</span>{badge(e.insurance_expires)}</div>
                  <div className="text-xs"><span className="mr-2 text-stone-500">License {e.license_number}</span>{badge(e.license_expires)}</div>
                  <div className="text-right">{(e.insurance_expires && e.insurance_expires <= soon) || (e.license_expires && e.license_expires <= soon) ? <span className="inline-flex items-center gap-1 text-xs font-medium text-clay-600"><AlertTriangle className="h-3.5 w-3.5" />Action needed</span> : <span className="inline-flex items-center gap-1 text-xs text-sage-700"><ShieldCheck className="h-3.5 w-3.5" />Compliant</span>}</div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
      {emp && <EmployeeModal emp={emp === "new" ? null : emp} onClose={() => setEmp(null)} />}
      {crew && <CrewModal crew={crew === "new" ? null : crew} onClose={() => setCrew(null)} />}
    </div>
  );
}

function EmployeeModal({ emp, onClose }: { emp: Employee | null; onClose: () => void }) {
  const S = useSnapshot();
  const { can } = useAuth();
  const { toast, confirm } = useToast();
  const [f, setF] = useState<Omit<Employee, "id" | "created_at">>(emp ?? { name: "", kind: "employee", company: "", position: "", specialty: [], phone: "", email: "", rate_type: "hourly", rate: 0, availability: [1, 2, 3, 4, 5], insurance_expires: null, license_number: "", license_expires: null, notes: "", active: true, profile_id: null });
  const edit = can("team.edit");
  const history = emp ? S.time_entries.filter((t) => t.employee_id === emp.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const projectsWorked = [...new Set(history.map((h) => h.project_id))].map((id) => S.projects.find((p) => p.id === id)).filter(Boolean);
  return (
    <Modal open onClose={onClose} title={emp ? emp.name : "Add person"} size="lg" footer={<>{emp && edit && <Button variant="ghost" className="mr-auto text-clay-600" onClick={async () => { if (await confirm({ title: `Remove ${emp.name}?`, body: "Time history is kept if you deactivate instead.", danger: true, confirmLabel: "Delete" })) { db.remove("employees", emp.id); onClose(); } }}>Delete</Button>}<Button onClick={onClose}>Cancel</Button>{edit && <Button variant="primary" onClick={() => { if (!f.name.trim()) return toast("Name required", "error"); if (emp) db.update("employees", emp.id, f); else db.insert("employees", f); toast("Saved"); onClose(); }}>Save</Button>}</>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Employee["kind"] })}><option value="employee">Employee</option><option value="subcontractor">Subcontractor</option></Select></Field>
        <Field label="Position"><Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></Field>
        <Field label="Company (subs)"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <Field label="Linked app user"><Select value={f.profile_id ?? ""} onChange={(e) => setF({ ...f, profile_id: e.target.value || null })}><option value="">None</option>{S.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email" className="sm:col-span-2"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Rate type"><Select value={f.rate_type} onChange={(e) => setF({ ...f, rate_type: e.target.value as Employee["rate_type"] })}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="per_sqft">Per sqft</option><option value="contract">Contract / day rate</option></Select></Field>
        <Field label="Rate"><NumberInput value={f.rate} onChange={(n) => setF({ ...f, rate: n })} /></Field>
        <Field label="Status"><Select value={f.active ? "1" : "0"} onChange={(e) => setF({ ...f, active: e.target.value === "1" })}><option value="1">Active</option><option value="0">Inactive</option></Select></Field>
        <Field label="Specialty" className="sm:col-span-3"><div className="flex flex-wrap gap-1.5">{SERVICES.map((s) => { const on = f.specialty.includes(s); return <button key={s} type="button" onClick={() => setF({ ...f, specialty: on ? f.specialty.filter((x) => x !== s) : [...f.specialty, s as ServiceCategory] })} className={cn("rounded-lg border px-2 py-1 text-xs", on ? "border-brass-400 bg-brass-50 text-brass-700" : "border-stone-200 text-stone-500")}>{SERVICE_META[s].label}</button>; })}</div></Field>
        <Field label="Availability" className="sm:col-span-3"><div className="flex gap-1">{DAYS.map((d, i) => { const on = f.availability.includes(i); return <button key={d} type="button" onClick={() => setF({ ...f, availability: on ? f.availability.filter((x) => x !== i) : [...f.availability, i].sort() })} className={cn("w-11 rounded-lg border py-1 text-xs font-medium", on ? "border-sage-500/40 bg-sage-50 text-sage-700" : "border-stone-200 text-stone-400")}>{d}</button>; })}</div></Field>
        <Field label="Insurance expires"><Input type="date" value={f.insurance_expires ?? ""} onChange={(e) => setF({ ...f, insurance_expires: e.target.value || null })} /></Field>
        <Field label="License #"><Input value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} /></Field>
        <Field label="License expires"><Input type="date" value={f.license_expires ?? ""} onChange={(e) => setF({ ...f, license_expires: e.target.value || null })} /></Field>
        <Field label="Notes" className="sm:col-span-3"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {emp && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Work history</p>
            <div className="max-h-48 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200 text-sm">
              {history.slice(0, 30).map((h) => <div key={h.id} className="flex justify-between px-3 py-1.5"><span>{fmtDate(h.date, "MMM d")} · {S.projects.find((p) => p.id === h.project_id)?.name}</span><span className="tabular-nums text-stone-500">{h.hours}h · {money(h.cost)}</span></div>)}
              {!history.length && <p className="p-3 text-center text-stone-400">No time logged</p>}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Projects worked ({projectsWorked.length})</p>
            <div className="flex flex-wrap gap-1.5">{projectsWorked.map((p) => <Badge key={p!.id}>{p!.name}</Badge>)}</div>
            <p className="mt-3 text-sm text-stone-600">Total labor: <b>{money(history.reduce((s, h) => s + h.cost, 0))}</b> · {num(history.reduce((s, h) => s + h.hours, 0), 1)} hours</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CrewModal({ crew, onClose }: { crew: Crew | null; onClose: () => void }) {
  const S = useSnapshot();
  const { can } = useAuth();
  const { toast, confirm } = useToast();
  const [f, setF] = useState<Omit<Crew, "id" | "created_at">>(crew ?? { name: "", color: "#4f7190", lead_employee_id: null, member_ids: [], specialty: "tile", active: true });
  const edit = can("team.edit");
  return (
    <Modal open onClose={onClose} title={crew ? crew.name : "New crew"} footer={<>{crew && edit && <Button variant="ghost" className="mr-auto text-clay-600" onClick={async () => { if (await confirm({ title: "Delete crew?", danger: true, confirmLabel: "Delete" })) { db.remove("crews", crew.id); onClose(); } }}>Delete</Button>}<Button onClick={onClose}>Cancel</Button>{edit && <Button variant="primary" onClick={() => { if (!f.name.trim()) return toast("Name required", "error"); if (crew) db.update("crews", crew.id, f); else db.insert("crews", f); toast("Crew saved"); onClose(); }}>Save</Button>}</>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Crew name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Calendar color"><Input type="color" className="h-9 p-1" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
        <Field label="Specialty"><Select value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value as ServiceCategory })}>{SERVICES.map((s) => <option key={s} value={s}>{SERVICE_META[s].label}</option>)}</Select></Field>
        <Field label="Crew lead"><Select value={f.lead_employee_id ?? ""} onChange={(e) => setF({ ...f, lead_employee_id: e.target.value || null })}><option value="">—</option>{S.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
        <Field label="Members" className="sm:col-span-2"><div className="flex flex-wrap gap-1.5">{S.employees.filter((e) => e.active).map((e) => { const on = f.member_ids.includes(e.id); return <button key={e.id} type="button" onClick={() => setF({ ...f, member_ids: on ? f.member_ids.filter((x) => x !== e.id) : [...f.member_ids, e.id] })} className={cn("rounded-lg border px-2 py-1 text-xs", on ? "border-brass-400 bg-brass-50 text-brass-700" : "border-stone-200 text-stone-500")}>{e.name}</button>; })}</div></Field>
      </div>
    </Modal>
  );
}
