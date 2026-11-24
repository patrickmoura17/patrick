"use client";
// Shared create/edit forms with validation.
import { useEffect, useState } from "react";
import { db, useTable } from "@/lib/store";
import { createCustomer, createLead, custName, findCustomerByContact } from "@/lib/services";
import type { Customer, CustomerType, ID, Lead, Priority, ServiceCategory } from "@/lib/types";
import { SERVICE_META, SERVICES } from "./status";
import { Button, cn, Field, Input, Modal, NumberInput, Segmented, Select, Textarea, useToast } from "./ui";

export const LEAD_SOURCES = ["Google Search", "Referral", "Website", "Houzz", "Instagram", "Facebook", "Yelp", "Home Show", "Builder Partner", "Repeat Customer", "Yard Sign", "Other"];
export const CUSTOMER_TYPES: CustomerType[] = ["Residential", "Commercial", "Builder", "Contractor"];
const emailOk = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

type CustDraft = Pick<Customer, "first_name" | "last_name" | "company" | "type" | "phone" | "email" | "billing_address" | "project_address" | "lead_source" | "notes"> & { tags: string };
const blankCust = (): CustDraft => ({ first_name: "", last_name: "", company: "", type: "Residential", phone: "", email: "", billing_address: "", project_address: "", lead_source: "Referral", notes: "", tags: "" });

export function CustomerFields({ v, set, errors }: { v: CustDraft; set: (v: CustDraft) => void; errors: Record<string, string> }) {
  const [same, setSame] = useState(!v.project_address || v.project_address === v.billing_address);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="First name" required error={errors.first_name}>
        <Input value={v.first_name} onChange={(e) => set({ ...v, first_name: e.target.value })} autoFocus />
      </Field>
      <Field label="Last name">
        <Input value={v.last_name} onChange={(e) => set({ ...v, last_name: e.target.value })} />
      </Field>
      <Field label="Customer type">
        <Select value={v.type} onChange={(e) => set({ ...v, type: e.target.value as CustomerType })}>
          {CUSTOMER_TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Company">
        <Input value={v.company} onChange={(e) => set({ ...v, company: e.target.value })} placeholder={v.type === "Residential" ? "Optional" : ""} />
      </Field>
      <Field label="Phone" error={errors.phone}>
        <Input type="tel" value={v.phone} onChange={(e) => set({ ...v, phone: e.target.value })} placeholder="(512) 555-0100" />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input type="email" value={v.email} onChange={(e) => set({ ...v, email: e.target.value })} />
      </Field>
      <Field label="Billing address" className="sm:col-span-2">
        <Input value={v.billing_address} onChange={(e) => set({ ...v, billing_address: e.target.value, project_address: same ? e.target.value : v.project_address })} />
      </Field>
      <div className="sm:col-span-2">
        <label className="mb-1.5 flex items-center gap-2 text-xs text-stone-500">
          <input type="checkbox" className="accent-brass-500" checked={same} onChange={(e) => { setSame(e.target.checked); if (e.target.checked) set({ ...v, project_address: v.billing_address }); }} />
          Project address same as billing
        </label>
        {!same && <Input value={v.project_address} onChange={(e) => set({ ...v, project_address: e.target.value })} placeholder="Project / job site address" />}
      </div>
      <Field label="Lead source">
        <Select value={v.lead_source} onChange={(e) => set({ ...v, lead_source: e.target.value })}>
          {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Tags" hint="Comma separated">
        <Input value={v.tags} onChange={(e) => set({ ...v, tags: e.target.value })} placeholder="vip, repeat" />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea value={v.notes} onChange={(e) => set({ ...v, notes: e.target.value })} />
      </Field>
    </div>
  );
}

function validateCust(v: CustDraft, selfId?: ID) {
  const e: Record<string, string> = {};
  if (!v.first_name.trim()) e.first_name = "Required";
  if (!emailOk(v.email)) e.email = "Invalid email";
  if (v.phone && v.phone.replace(/\D/g, "").length < 7) e.phone = "Invalid phone";
  const dup = (v.email || v.phone) ? findCustomerByContact(v.email, v.phone) : undefined;
  if (dup && dup.id !== selfId) e.email = `Matches existing customer ${custName(dup)}`;
  return e;
}

export function CustomerModal({ open, onClose, customer, onSaved }: { open: boolean; onClose: () => void; customer?: Customer; onSaved?: (c: Customer) => void }) {
  const [v, setV] = useState<CustDraft>(blankCust());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  useEffect(() => {
    if (open) setV(customer ? { ...customer, tags: customer.tags.join(", ") } : blankCust());
    setErrors({});
  }, [open, customer]);
  const save = () => {
    const e = validateCust(v, customer?.id);
    setErrors(e);
    if (Object.keys(e).length) return;
    const data = { ...v, tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean), project_address: v.project_address || v.billing_address };
    const c = customer ? db.update("customers", customer.id, data)! : createCustomer(data);
    toast(customer ? "Customer updated" : "Customer created");
    onSaved?.(c);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={customer ? "Edit customer" : "New customer"} size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{customer ? "Save changes" : "Create customer"}</Button></>}>
      <CustomerFields v={v} set={setV} errors={errors} />
    </Modal>
  );
}

export function ServicePicker({ value, onChange }: { value: ServiceCategory[]; onChange: (v: ServiceCategory[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SERVICES.filter((s) => s !== "general").map((s) => {
        const on = value.includes(s);
        return (
          <button
            type="button"
            key={s}
            onClick={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}
            className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition", on ? "border-brass-400 bg-brass-50 text-brass-700" : "border-stone-200 text-stone-600 hover:border-stone-300")}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: SERVICE_META[s].color }} />
            {SERVICE_META[s].label}
          </button>
        );
      })}
    </div>
  );
}

export function LeadModal({ open, onClose, lead, presetCustomerId, presetStageId, onSaved }: { open: boolean; onClose: () => void; lead?: Lead; presetCustomerId?: ID; presetStageId?: ID; onSaved?: (l: Lead) => void }) {
  const customers = useTable("customers");
  const profiles = useTable("profiles");
  const stages = [...useTable("pipeline_stages")].sort((a, b) => a.position - b.position);
  const { toast } = useToast();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [cust, setCust] = useState<CustDraft>(blankCust());
  const [custId, setCustId] = useState<ID>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [f, setF] = useState({ title: "", services: [] as ServiceCategory[], stage_id: "", priority: "medium" as Priority, assigned_to: "", estimated_value: 0, follow_up_date: "", description: "", source: "Referral" });
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setCust(blankCust());
    if (lead) {
      setMode("existing");
      setCustId(lead.customer_id);
      setF({ title: lead.title, services: lead.services, stage_id: lead.stage_id, priority: lead.priority, assigned_to: lead.assigned_to ?? "", estimated_value: lead.estimated_value, follow_up_date: lead.follow_up_date ?? "", description: lead.description, source: lead.source });
    } else {
      setMode(presetCustomerId ? "existing" : "new");
      setCustId(presetCustomerId ?? "");
      setF({ title: "", services: [], stage_id: presetStageId ?? stages[0]?.id ?? "", priority: "medium", assigned_to: db.currentUserId ?? "", estimated_value: 0, follow_up_date: "", description: "", source: "Referral" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead, presetCustomerId, presetStageId]);

  const save = () => {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = "Required";
    if (mode === "existing" && !custId) e.customer = "Choose a customer";
    if (mode === "new") Object.assign(e, validateCust({ ...cust, lead_source: f.source }));
    setErrors(e);
    if (Object.keys(e).length) return;
    if (lead) {
      db.update("leads", lead.id, { ...f, assigned_to: f.assigned_to || null, follow_up_date: f.follow_up_date || null, customer_id: custId });
      toast("Lead updated");
      onClose();
      return;
    }
    const customerId = mode === "existing" ? custId : createCustomer({ ...cust, lead_source: f.source, tags: [] }).id;
    const l = createLead({ customer_id: customerId, ...f, assigned_to: f.assigned_to || null, follow_up_date: f.follow_up_date || null, stage_id: f.stage_id || undefined });
    toast("Lead created");
    onSaved?.(l);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={lead ? "Edit lead" : "New lead"} subtitle={lead ? undefined : "Create the customer once — it flows through estimate, project and invoice."} size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{lead ? "Save" : "Create lead"}</Button></>}>
      <div className="space-y-5">
        {!lead && (
          <Segmented value={mode} onChange={setMode} options={[{ key: "new", label: "New customer" }, { key: "existing", label: "Existing customer" }]} />
        )}
        {mode === "existing" ? (
          <Field label="Customer" required error={errors.customer}>
            <Select value={custId} onChange={(e) => setCustId(e.target.value)}>
              <option value="">Select customer…</option>
              {[...customers].sort((a, b) => custName(a).localeCompare(custName(b))).map((c) => (
                <option key={c.id} value={c.id}>{custName(c)}{c.company && c.company !== custName(c) ? ` (${c.company})` : ""}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="rounded-xl border border-stone-200 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Customer</p>
            <CustomerFields v={cust} set={setCust} errors={errors} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project / opportunity" required error={errors.title} className="sm:col-span-2">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Primary bath remodel with walk-in shower" />
          </Field>
          <Field label="Services" className="sm:col-span-2">
            <ServicePicker value={f.services} onChange={(services) => setF({ ...f, services })} />
          </Field>
          <Field label="Pipeline stage">
            <Select value={f.stage_id} onChange={(e) => setF({ ...f, stage_id: e.target.value })}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>
              {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="Lead source">
            <Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
              {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Assigned to">
            <Select value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
              <option value="">Unassigned</option>
              {profiles.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Estimated value">
            <NumberInput value={f.estimated_value} onChange={(n) => setF({ ...f, estimated_value: n })} min={0} />
          </Field>
          <Field label="Follow-up date">
            <Input type="date" value={f.follow_up_date} onChange={(e) => setF({ ...f, follow_up_date: e.target.value })} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
