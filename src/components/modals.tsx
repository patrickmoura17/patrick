"use client";
// Cross-module modals: new estimate (with templates), calendar event (with crew conflict detection).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { db, useTable } from "@/lib/store";
import { createEstimate, custName } from "@/lib/services";
import { overlaps } from "@/lib/calc";
import { fmtDateTime } from "@/lib/format";
import type { CalendarEvent, EventType, ID } from "@/lib/types";
import { EVENT_META, SERVICE_META } from "./status";
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, cn, useToast } from "./ui";

export function NewEstimateModal({ open, onClose, customerId, leadId }: { open: boolean; onClose: () => void; customerId?: ID; leadId?: ID | null }) {
  const customers = useTable("customers");
  const leads = useTable("leads");
  const templates = useTable("estimate_templates");
  const router = useRouter();
  const [cust, setCust] = useState(customerId ?? "");
  const [lead, setLead] = useState<string>(leadId ?? "");
  const [tpl, setTpl] = useState("");
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (!open) return;
    setCust(customerId ?? "");
    setLead(leadId ?? "");
    setTpl("");
    setTitle(leadId ? db.get("leads", leadId)?.title ?? "" : "");
  }, [open, customerId, leadId]);
  const custLeads = leads.filter((l) => l.customer_id === cust && l.status === "open");
  const go = () => {
    if (!cust) return;
    const e = createEstimate({ customer_id: cust, lead_id: lead || null, title: title || undefined, template: templates.find((t) => t.id === tpl) ?? null });
    onClose();
    router.push(`/estimates/${e.id}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="New estimate" size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!cust} onClick={go}>Create estimate</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer" required>
          <Select value={cust} onChange={(e) => { setCust(e.target.value); setLead(""); }} disabled={!!customerId}>
            <option value="">Select customer…</option>
            {[...customers].sort((a, b) => custName(a).localeCompare(custName(b))).map((c) => <option key={c.id} value={c.id}>{custName(c)}</option>)}
          </Select>
        </Field>
        <Field label="Linked lead">
          <Select value={lead} onChange={(e) => { setLead(e.target.value); setTitle(db.get("leads", e.target.value)?.title ?? title); }}>
            <option value="">None</option>
            {custLeads.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </Select>
        </Field>
        <Field label="Estimate title" className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Primary Bathroom Remodel" />
        </Field>
      </div>
      <p className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-stone-500">Start from</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button onClick={() => setTpl("")} className={cn("rounded-xl border p-3 text-left transition", !tpl ? "border-brass-400 bg-brass-50" : "border-stone-200 hover:border-stone-300")}>
          <p className="text-sm font-semibold">Blank estimate</p>
          <p className="text-xs text-stone-500">Add items from the pricing catalog</p>
        </button>
        {templates.map((t) => (
          <button key={t.id} onClick={() => { setTpl(t.id); if (!title) setTitle(t.name); }} className={cn("rounded-xl border p-3 text-left transition", tpl === t.id ? "border-brass-400 bg-brass-50" : "border-stone-200 hover:border-stone-300")}>
            <p className="flex items-center gap-1.5 text-sm font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: SERVICE_META[t.category]?.color }} />{t.name}</p>
            <p className="line-clamp-1 text-xs text-stone-500">{t.description || `${t.items.length} line items`}</p>
          </button>
        ))}
      </div>
    </Modal>
  );
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
};

export function findConflicts(ev: Pick<CalendarEvent, "id" | "start" | "end" | "crew_id" | "employee_ids" | "status">, all: CalendarEvent[]) {
  const crews = db.all("crews");
  const people = new Set(ev.employee_ids);
  if (ev.crew_id) crews.find((c) => c.id === ev.crew_id)?.member_ids.forEach((m) => people.add(m));
  return all.filter((o) => {
    if (o.id === ev.id || o.status === "cancelled" || !overlaps(ev.start, ev.end, o.start, o.end)) return false;
    if (ev.crew_id && o.crew_id === ev.crew_id) return true;
    const op = new Set(o.employee_ids);
    if (o.crew_id) crews.find((c) => c.id === o.crew_id)?.member_ids.forEach((m) => op.add(m));
    return [...people].some((p) => op.has(p));
  });
}

/** Employees unavailable on that weekday (per their availability settings). */
export function unavailable(ev: Pick<CalendarEvent, "start" | "crew_id" | "employee_ids">) {
  const day = new Date(ev.start).getDay();
  const people = new Set(ev.employee_ids);
  if (ev.crew_id) db.get("crews", ev.crew_id)?.member_ids.forEach((m) => people.add(m));
  return [...people].map((id) => db.get("employees", id)).filter((e) => e && !e.availability.includes(day));
}

export function EventModal({ open, onClose, event, preset }: { open: boolean; onClose: () => void; event?: CalendarEvent | null; preset?: Partial<CalendarEvent> }) {
  const projects = useTable("projects");
  const customers = useTable("customers");
  const crews = useTable("crews");
  const employees = useTable("employees");
  const events = useTable("events");
  const { toast, confirm } = useToast();
  const blank = (): Omit<CalendarEvent, "id" | "created_at"> => {
    const s = new Date();
    s.setDate(s.getDate() + 1);
    s.setHours(9, 0, 0, 0);
    return { title: "", type: "site_visit", start: s.toISOString(), end: new Date(s.getTime() + 3600000).toISOString(), all_day: false, project_id: null, customer_id: null, lead_id: null, crew_id: null, employee_ids: [], location: "", notes: "", status: "scheduled", reminder_minutes: 60, ...preset };
  };
  const [f, setF] = useState(blank());
  const [days, setDays] = useState(1);
  useEffect(() => {
    if (open) {
      setF(event ? { ...event } : blank());
      setDays(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event]);
  const conflicts = useMemo(() => findConflicts({ id: event?.id ?? "new", ...f }, events), [f, events, event]);
  const off = useMemo(() => unavailable(f), [f]);

  const save = async () => {
    if (!f.title.trim()) return toast("Title is required", "error");
    if (new Date(f.end) < new Date(f.start)) return toast("End must be after start", "error");
    if (conflicts.length && !(await confirm({ title: "Scheduling conflict", body: `${conflicts.length} overlapping booking(s) for this crew/employees. Save anyway?`, confirmLabel: "Double-book" }))) return;
    if (event) db.update("events", event.id, f);
    else {
      // book `days` working days, skipping weekends after the first
      for (let i = 0, booked = 0; booked < Math.max(1, days) && i < 60; i++) {
        const s = new Date(f.start), e = new Date(f.end);
        s.setDate(s.getDate() + i);
        e.setDate(e.getDate() + i);
        if (i > 0 && (s.getDay() === 0 || s.getDay() === 6)) continue;
        db.insert("events", { ...f, start: s.toISOString(), end: e.toISOString() });
        booked++;
      }
    }
    if (f.project_id && f.type === "installation") {
      const p = db.get("projects", f.project_id);
      if (p && ["Contract Signed", "Deposit Received", "Materials Ordered", "Materials Delivered", "Ready to Schedule"].includes(p.stage)) {
        db.update("projects", p.id, { stage: "Scheduled", start_date: p.start_date ?? f.start.slice(0, 10), crew_id: p.crew_id ?? f.crew_id });
      }
    }
    toast(event ? "Event updated" : "Event scheduled");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? "Edit event" : "Schedule"}
      size="lg"
      footer={
        <>
          {event && <Button variant="ghost" className="mr-auto text-clay-600" onClick={async () => { if (await confirm({ title: "Delete event?", danger: true, confirmLabel: "Delete" })) { db.remove("events", event.id); onClose(); } }}>Delete</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>{event ? "Save" : "Schedule"}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required className="sm:col-span-2">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Kim — hardwood install" autoFocus />
        </Field>
        <Field label="Type">
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as EventType })}>
            {Object.entries(EVENT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as CalendarEvent["status"] })}>
            {["scheduled", "confirmed", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="Start">
          <Input type="datetime-local" value={toLocalInput(f.start)} onChange={(e) => { const s = new Date(e.target.value); const dur = new Date(f.end).getTime() - new Date(f.start).getTime(); setF({ ...f, start: s.toISOString(), end: new Date(s.getTime() + Math.max(dur, 1800000)).toISOString() }); }} />
        </Field>
        <Field label="End">
          <Input type="datetime-local" value={toLocalInput(f.end)} onChange={(e) => setF({ ...f, end: new Date(e.target.value).toISOString() })} />
        </Field>
        {!event && (
          <Field label="Repeat for working days" hint="Creates one booking per weekday (multi-day installs)">
            <Input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
          </Field>
        )}
        <div className="flex items-end pb-2">
          <Checkbox checked={f.all_day} onChange={(v) => setF({ ...f, all_day: v })} label="All day" />
        </div>
        <Field label="Project">
          <Select value={f.project_id ?? ""} onChange={(e) => { const p = db.get("projects", e.target.value); setF({ ...f, project_id: e.target.value || null, customer_id: p?.customer_id ?? f.customer_id, location: p?.address ?? f.location, crew_id: f.crew_id ?? p?.crew_id ?? null }); }}>
            <option value="">None</option>
            {projects.filter((p) => p.stage !== "Closed").map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Customer">
          <Select value={f.customer_id ?? ""} onChange={(e) => { const c = db.get("customers", e.target.value); setF({ ...f, customer_id: e.target.value || null, location: f.location || c?.project_address || "" }); }}>
            <option value="">None</option>
            {[...customers].sort((a, b) => custName(a).localeCompare(custName(b))).map((c) => <option key={c.id} value={c.id}>{custName(c)}</option>)}
          </Select>
        </Field>
        <Field label="Crew">
          <Select value={f.crew_id ?? ""} onChange={(e) => setF({ ...f, crew_id: e.target.value || null })}>
            <option value="">No crew</option>
            {crews.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Location">
          <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        </Field>
        <Field label="Employees" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {employees.filter((e) => e.active).map((e) => {
              const on = f.employee_ids.includes(e.id);
              return (
                <button key={e.id} type="button" onClick={() => setF({ ...f, employee_ids: on ? f.employee_ids.filter((x) => x !== e.id) : [...f.employee_ids, e.id] })} className={cn("rounded-lg border px-2 py-1 text-xs font-medium", on ? "border-brass-400 bg-brass-50 text-brass-700" : "border-stone-200 text-stone-600")}>
                  {e.name}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
      {(conflicts.length > 0 || off.length > 0) && (
        <div className="mt-4 rounded-xl border border-clay-100 bg-clay-50 p-3 text-sm text-clay-700">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Scheduling conflicts</p>
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {conflicts.map((c) => <li key={c.id}>• Overlaps “{c.title}” ({fmtDateTime(c.start)})</li>)}
            {off.map((e) => <li key={e!.id}>• {e!.name} is not normally available on this weekday</li>)}
          </ul>
        </div>
      )}
    </Modal>
  );
}
