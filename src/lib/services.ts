"use client";
// Domain workflows. Every cross-module transition (lead → estimate → project →
// invoice → payment) lives here so UI screens and the customer portal share
// identical behaviour, audit trail and automation triggers.
import { db } from "./store";
import { fire, registerDomainHandlers } from "./automation";
import {
  addDaysISO, changeOrderTotals, deriveInvoiceStatus, estimateTotals, invoiceTotals, milestoneAmounts, round2, todayISO, unitPriceFrom,
} from "./calc";
import { money } from "./format";
import {
  PROJECT_STAGES, type ChangeOrder, type Customer, type Estimate, type EstimateItem, type EstimateTemplate, type ID, type Invoice,
  type InvoiceLine, type Lead, type NewRow, type Payment, type Project, type ProjectStage, type PurchaseOrder,
} from "./types";

export const custName = (c?: Pick<Customer, "first_name" | "last_name" | "company"> | null) =>
  c ? (`${c.first_name} ${c.last_name}`.trim() || c.company) : "—";

function settings() {
  return db.all("company_settings")[0];
}

export function nextNumber(kind: keyof ReturnType<typeof settings>["next_numbers"]) {
  const s = settings();
  const n = s.next_numbers[kind] ?? 1;
  db.update("company_settings", s.id, { next_numbers: { ...s.next_numbers, [kind]: n + 1 } });
  return `${s.number_prefixes[kind] ?? ""}${n}`;
}

export function logActivity(a: Partial<NewRow<"activities">> & { subject: string; type?: NewRow<"activities">["type"] }) {
  return db.insert("activities", {
    type: a.type ?? "system", subject: a.subject, body: a.body ?? "", customer_id: a.customer_id ?? null, lead_id: a.lead_id ?? null,
    project_id: a.project_id ?? null, estimate_id: a.estimate_id ?? null, invoice_id: a.invoice_id ?? null, user_id: a.user_id === undefined ? db.currentUserId : a.user_id,
  });
}

// ---------------------------------------------------------------- customers
export function newPortalToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createCustomer(c: Partial<NewRow<"customers">> & { first_name: string }) {
  return db.insert("customers", {
    first_name: c.first_name.trim(), last_name: (c.last_name ?? "").trim(), company: c.company ?? "", type: c.type ?? "Residential",
    phone: c.phone ?? "", email: (c.email ?? "").trim(), billing_address: c.billing_address ?? "", project_address: c.project_address || c.billing_address || "",
    lead_source: c.lead_source ?? "", notes: c.notes ?? "", tags: c.tags ?? [], portal_token: newPortalToken(), owner_id: c.owner_id ?? db.currentUserId,
  });
}

export function findCustomerByContact(email: string, phone: string) {
  const e = email.trim().toLowerCase();
  const p = phone.replace(/\D/g, "");
  return db.all("customers").find((c) => (e && c.email.toLowerCase() === e) || (p.length >= 7 && c.phone.replace(/\D/g, "") === p));
}

// ---------------------------------------------------------------- leads
export function openStages() {
  return [...db.all("pipeline_stages")].sort((a, b) => a.position - b.position);
}

export function createLead(l: Partial<NewRow<"leads">> & { customer_id: ID; title: string }) {
  const stages = openStages();
  const lead = db.insert("leads", {
    customer_id: l.customer_id, title: l.title, services: l.services ?? [], stage_id: l.stage_id ?? stages[0].id, priority: l.priority ?? "medium",
    source: l.source ?? db.get("customers", l.customer_id)?.lead_source ?? "", assigned_to: l.assigned_to ?? null, estimated_value: Number(l.estimated_value ?? 0),
    follow_up_date: l.follow_up_date ?? addDaysISO(todayISO(), 1), lost_reason: "", description: l.description ?? "", status: "open", converted_at: null,
    inquiry_payload: l.inquiry_payload ?? null,
  });
  const cust = db.get("customers", lead.customer_id);
  logActivity({ subject: "Lead created", body: lead.title, customer_id: lead.customer_id, lead_id: lead.id });
  fire("lead.created", { record_id: lead.id, lead_id: lead.id, customer_id: lead.customer_id, vars: { title: lead.title, customer: custName(cust), source: lead.source, value: lead.estimated_value } });
  return lead;
}

/** Website / inquiry form intake: dedupes the customer by email/phone, then creates the lead. */
export function intakeInquiry(f: { name: string; email: string; phone: string; address: string; services: Lead["services"]; message: string; source?: string; budget?: number }) {
  const [first, ...rest] = f.name.trim().split(/\s+/);
  let cust = findCustomerByContact(f.email, f.phone);
  if (!cust) cust = createCustomer({ first_name: first || "New", last_name: rest.join(" "), email: f.email, phone: f.phone, billing_address: f.address, project_address: f.address, lead_source: f.source || "Website" });
  const lead = createLead({
    customer_id: cust.id, title: f.services.length ? `${f.services.map(cap).join(" + ")} inquiry` : "Website inquiry", services: f.services,
    source: f.source || "Website", priority: "high", estimated_value: f.budget || 0, description: f.message,
    inquiry_payload: { form: "Website inquiry", ...f },
  });
  logActivity({ type: "email", subject: "Website inquiry received", body: f.message, customer_id: cust.id, lead_id: lead.id, user_id: null });
  return lead;
}

export function moveLead(leadId: ID, stageId: ID, lostReason = "") {
  const lead = db.get("leads", leadId);
  const stage = db.get("pipeline_stages", stageId);
  if (!lead || !stage || lead.stage_id === stageId) return;
  const status = stage.kind === "won" ? "won" : stage.kind === "lost" ? "lost" : "open";
  db.update("leads", leadId, {
    stage_id: stageId, status, lost_reason: status === "lost" ? lostReason || lead.lost_reason : "",
    converted_at: status === "won" ? lead.converted_at ?? new Date().toISOString() : null,
  });
  const cust = db.get("customers", lead.customer_id);
  logActivity({ subject: `Moved to ${stage.name}`, body: status === "lost" && lostReason ? `Lost reason: ${lostReason}` : "", customer_id: lead.customer_id, lead_id: leadId });
  fire("lead.stage_changed", { record_id: leadId, lead_id: leadId, customer_id: lead.customer_id, vars: { title: lead.title, customer: custName(cust), stage: stage.name } });
}

function moveLeadToStageNamed(leadId: ID | null, name: string, onlyForward = true) {
  if (!leadId) return;
  const lead = db.get("leads", leadId);
  const stages = openStages();
  const target = stages.find((s) => s.name === name);
  const current = stages.find((s) => s.id === lead?.stage_id);
  if (!lead || !target) return;
  if (onlyForward && current && current.kind === "open" && target.kind === "open" && current.position >= target.position) return;
  if (current?.kind !== "open" && target.kind === "open") return;
  moveLead(leadId, target.id);
}

// ---------------------------------------------------------------- estimates
export function createEstimate(opts: { customer_id: ID; lead_id?: ID | null; title?: string; template?: EstimateTemplate | null }) {
  const s = settings();
  const est = db.insert("estimates", {
    number: nextNumber("estimate"), customer_id: opts.customer_id, lead_id: opts.lead_id ?? null, project_id: null,
    title: opts.title || opts.template?.name || "New Estimate", status: "draft", issue_date: todayISO(), valid_until: addDaysISO(todayISO(), s.estimate_valid_days),
    tax_rate: s.tax_rate, discount_type: "percent", discount_value: 0,
    intro: "Thank you for the opportunity to quote your project. This proposal covers all labor and materials described below, installed to manufacturer specifications by our in-house crews.",
    customer_notes: "", exclusions: opts.template?.exclusions || s.estimate_exclusions, terms: opts.template?.terms || s.estimate_terms,
    payment_schedule: s.default_payment_schedule.map((m) => ({ ...m })),
    timeline: [{ id: "t1", label: "Material ordering & lead time", days: 10 }, { id: "t2", label: "Demolition & preparation", days: 2 }, { id: "t3", label: "Installation", days: 5 }, { id: "t4", label: "Finishing & walkthrough", days: 1 }],
    sent_at: null, responded_at: null, customer_response: "", signed_name: "", created_by: db.currentUserId,
  });
  opts.template?.items.forEach((it, i) => db.insert("estimate_items", { ...it, estimate_id: est.id, position: i }));
  moveLeadToStageNamed(est.lead_id, "Estimate in Progress");
  logActivity({ subject: `Estimate ${est.number} created`, customer_id: est.customer_id, lead_id: est.lead_id, estimate_id: est.id });
  return est;
}

export function addEstimateItem(estimateId: ID, partial: Partial<EstimateItem> = {}) {
  const items = db.where("estimate_items", (i) => i.estimate_id === estimateId);
  const markup = partial.markup ?? settings().default_markup;
  const m = partial.material_cost ?? 0, l = partial.labor_cost ?? 0;
  return db.insert("estimate_items", {
    estimate_id: estimateId, category: partial.category ?? "tile", section: partial.section ?? "", name: partial.name ?? "", description: partial.description ?? "",
    quantity: partial.quantity ?? 1, unit: partial.unit ?? "SQFT", material_cost: m, labor_cost: l, markup, unit_price: partial.unit_price ?? unitPriceFrom(m, l, markup),
    price_override: partial.price_override ?? false, taxable: partial.taxable ?? true, optional: partial.optional ?? false,
    position: items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0,
  });
}

export function duplicateEstimate(id: ID) {
  const e = db.get("estimates", id);
  if (!e) return;
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = e;
  const copy = db.insert("estimates", { ...rest, number: nextNumber("estimate"), title: `${e.title} (copy)`, status: "draft", project_id: null, issue_date: todayISO(), sent_at: null, responded_at: null, customer_response: "", signed_name: "" });
  db.where("estimate_items", (i) => i.estimate_id === id).forEach((i) => {
    const { id: _i, created_at: _ic, updated_at: _iu, ...ir } = i;
    db.insert("estimate_items", { ...ir, estimate_id: copy.id });
  });
  return copy;
}

export function saveAsTemplate(estimateId: ID, name: string) {
  const e = db.get("estimates", estimateId)!;
  const items = db.where("estimate_items", (i) => i.estimate_id === estimateId).sort((a, b) => a.position - b.position);
  return db.insert("estimate_templates", {
    name, category: items[0]?.category ?? "general", description: e.title, exclusions: e.exclusions, terms: e.terms,
    items: items.map(({ id: _i, created_at: _c, updated_at: _u, estimate_id: _e, position: _p, ...rest }) => rest),
  });
}

function estimateVars(e: Estimate) {
  const t = estimateTotals(e, db.where("estimate_items", (i) => i.estimate_id === e.id));
  return { number: e.number, customer: custName(db.get("customers", e.customer_id)), total: money(t.total) };
}

export function sendEstimate(id: ID) {
  const e = db.get("estimates", id);
  if (!e) return;
  db.update("estimates", id, { status: "sent", sent_at: new Date().toISOString() });
  moveLeadToStageNamed(e.lead_id, "Estimate Sent");
  logActivity({ type: "email", subject: `Estimate ${e.number} sent`, body: "Proposal delivered to customer portal.", customer_id: e.customer_id, lead_id: e.lead_id, estimate_id: id });
  fire("estimate.sent", { record_id: id, estimate_id: id, lead_id: e.lead_id, customer_id: e.customer_id, vars: estimateVars(e) });
}

export function markEstimateViewed(id: ID) {
  const e = db.get("estimates", id);
  if (e && e.status === "sent") db.update("estimates", id, { status: "viewed" });
}

export function respondEstimate(id: ID, action: "approved" | "rejected" | "changes_requested", signedName: string, comment: string, by: "staff" | "customer") {
  const e = db.get("estimates", id);
  if (!e) return;
  db.update("estimates", id, { status: action, responded_at: new Date().toISOString(), signed_name: signedName, customer_response: comment });
  const who = by === "customer" ? "in customer portal" : "by staff";
  logActivity({ type: by === "customer" ? "portal" : "system", subject: `Estimate ${e.number} ${action.replace("_", " ")} ${who}`, body: comment, customer_id: e.customer_id, lead_id: e.lead_id, estimate_id: id, user_id: by === "customer" ? null : db.currentUserId });
  const vars = estimateVars(e);
  if (action === "approved") {
    const before = db.get("estimates", id)!.project_id;
    fire("estimate.approved", { record_id: id, estimate_id: id, lead_id: e.lead_id, customer_id: e.customer_id, vars });
    // safety net if the automation was disabled: still mark the lead as won
    if (!db.get("estimates", id)!.project_id && !before) {
      const won = openStages().find((s) => s.kind === "won");
      if (e.lead_id && won) moveLead(e.lead_id, won.id);
    }
  } else if (action === "rejected") {
    fire("estimate.rejected", { record_id: id, estimate_id: id, lead_id: e.lead_id, customer_id: e.customer_id, vars });
  } else {
    moveLeadToStageNamed(e.lead_id, "Follow-Up");
    db.insert("notifications", { user_id: null, role_keys: ["owner", "sales_rep", "estimator"], title: `Changes requested on ${e.number}`, body: comment, link: `/estimates/${id}`, read_by: [], kind: "warning" });
  }
}

export function createProjectFromEstimate(estimateId: ID): Project | undefined {
  const e = db.get("estimates", estimateId);
  if (!e) return;
  if (e.project_id && db.get("projects", e.project_id)) return db.get("projects", e.project_id);
  const existing = db.all("projects").find((p) => p.estimate_id === e.id);
  if (existing) {
    db.update("estimates", e.id, { project_id: existing.id });
    return existing;
  }
  const items = db.where("estimate_items", (i) => i.estimate_id === e.id);
  const t = estimateTotals(e, items);
  const cust = db.get("customers", e.customer_id);
  const services = [...new Set(items.map((i) => i.category).filter((c) => c !== "general"))];
  const signed = e.status === "approved" && e.signed_name;
  const p = db.insert("projects", {
    number: nextNumber("project"), name: `${cust?.last_name || cust?.company || "New"} — ${e.title}`, customer_id: e.customer_id, estimate_id: e.id, lead_id: e.lead_id,
    address: cust?.project_address ?? "", manager_id: null, crew_id: null, member_ids: [], services, contract_value: t.total, original_contract_value: t.total,
    estimated_cost: t.totalCost, stage: "Contract Signed", health: "on_track", start_date: null, end_date: null, completed_at: null, notes: e.customer_notes,
    payment_schedule: e.payment_schedule.map((m) => ({ ...m, invoice_id: null })), signed_name: signed ? e.signed_name : "", signed_at: signed ? e.responded_at : null,
  });
  db.update("estimates", e.id, { project_id: p.id });
  // carry measurements & files from the sales phase into the project
  db.where("measurements", (m) => !m.project_id && ((!!e.lead_id && m.lead_id === e.lead_id))).forEach((m) => db.update("measurements", m.id, { project_id: p.id }));
  db.where("files", (f) => f.estimate_id === e.id && !f.project_id).forEach((f) => db.update("files", f.id, { project_id: p.id }));
  // default checklist
  ["Confirm material selections", "Order materials", "Schedule crew", "Before photos", "After photos", "Final walkthrough with customer"].forEach((title, i) =>
    db.insert("project_tasks", { project_id: p.id, kind: "checklist", title, assignee_id: null, due_date: null, done: false, done_at: null, position: i }));
  const won = openStages().find((s) => s.kind === "won");
  if (e.lead_id && won) moveLead(e.lead_id, won.id);
  logActivity({ subject: `Project ${p.number} created from ${e.number}`, customer_id: p.customer_id, project_id: p.id, estimate_id: e.id, lead_id: e.lead_id });
  if (p.signed_at) fire("contract.signed", { record_id: p.id, project_id: p.id, customer_id: p.customer_id, vars: { name: p.name, customer: custName(cust) } });
  return p;
}

// ---------------------------------------------------------------- projects
export function setProjectStage(id: ID, stage: ProjectStage) {
  const p = db.get("projects", id);
  if (!p || p.stage === stage) return;
  const patch: Partial<Project> = { stage };
  const completedIdx = PROJECT_STAGES.indexOf("Completed");
  if (PROJECT_STAGES.indexOf(stage) >= completedIdx && !p.completed_at) patch.completed_at = new Date().toISOString();
  if (PROJECT_STAGES.indexOf(stage) < completedIdx) patch.completed_at = null;
  db.update("projects", id, patch);
  const cust = db.get("customers", p.customer_id);
  logActivity({ subject: `${p.number} moved to ${stage}`, customer_id: p.customer_id, project_id: id });
  fire("project.stage_changed", { record_id: id, project_id: id, customer_id: p.customer_id, vars: { name: p.name, customer: custName(cust), stage } });
  if (stage === "Completed") fire("project.completed", { record_id: id, project_id: id, customer_id: p.customer_id, vars: { name: p.name, customer: custName(cust) } });
}

export function signContract(projectId: ID, name: string, by: "staff" | "customer") {
  const p = db.get("projects", projectId);
  if (!p || p.signed_at) return;
  db.update("projects", projectId, { signed_name: name, signed_at: new Date().toISOString() });
  logActivity({ type: by === "customer" ? "portal" : "system", subject: `Contract signed by ${name}`, customer_id: p.customer_id, project_id: projectId, user_id: by === "customer" ? null : db.currentUserId });
  fire("contract.signed", { record_id: projectId, project_id: projectId, customer_id: p.customer_id, vars: { name: p.name, customer: custName(db.get("customers", p.customer_id)) } });
}

// ---------------------------------------------------------------- invoices
export function createInvoice(opts: { customer_id: ID; project_id?: ID | null; kind?: Invoice["kind"]; items?: InvoiceLine[]; milestone_id?: string | null; notes?: string; tax_rate?: number }) {
  const s = settings();
  const inv = db.insert("invoices", {
    number: nextNumber("invoice"), customer_id: opts.customer_id, project_id: opts.project_id ?? null, milestone_id: opts.milestone_id ?? null, kind: opts.kind ?? "standard",
    status: "draft", issue_date: todayISO(), due_date: addDaysISO(todayISO(), s.default_payment_terms_days), items: opts.items ?? [{ id: "l0", description: "", quantity: 1, unit: "LS", unit_price: 0, taxable: true }],
    tax_rate: opts.tax_rate ?? 0, discount: 0, notes: opts.notes ?? s.invoice_footer, sent_at: null, external_ref: null,
  });
  logActivity({ subject: `Invoice ${inv.number} created`, customer_id: inv.customer_id, project_id: inv.project_id, invoice_id: inv.id });
  return inv;
}

/** Contract value already includes tax, so milestone invoices are non-taxable lump sums. */
export function invoiceMilestone(projectId: ID, milestoneId: string) {
  const p = db.get("projects", projectId);
  if (!p) return;
  const idx = p.payment_schedule.findIndex((m) => m.id === milestoneId);
  const m = p.payment_schedule[idx];
  if (!m || (m.invoice_id && db.get("invoices", m.invoice_id))) return m?.invoice_id ? db.get("invoices", m.invoice_id) : undefined;
  const amounts = milestoneAmounts(p.contract_value, p.payment_schedule.map((x) => x.percent));
  // if earlier milestones were billed on an older contract value, true-up on the last milestone
  let amount = amounts[idx];
  if (idx === p.payment_schedule.length - 1) {
    const billed = p.payment_schedule.slice(0, idx).reduce((s, x) => {
      const inv = x.invoice_id ? db.get("invoices", x.invoice_id) : undefined;
      return s + (inv && inv.status !== "void" ? invoiceTotals(inv).total : amounts[p.payment_schedule.indexOf(x)]);
    }, 0);
    amount = round2(p.contract_value - billed);
  }
  const kind: Invoice["kind"] = idx === 0 ? "deposit" : idx === p.payment_schedule.length - 1 ? "final" : "progress";
  const inv = createInvoice({
    customer_id: p.customer_id, project_id: p.id, kind, milestone_id: m.id, tax_rate: 0,
    items: [{ id: "l0", description: `${m.label} — ${m.percent}% of contract (${p.number} ${p.name})`, quantity: 1, unit: "LS", unit_price: amount, taxable: false }],
  });
  db.update("projects", p.id, { payment_schedule: p.payment_schedule.map((x) => (x.id === m.id ? { ...x, invoice_id: inv.id } : x)) });
  return inv;
}

export function createFinalInvoice(projectId: ID) {
  const p = db.get("projects", projectId);
  if (!p) return;
  const unbilled = p.payment_schedule.filter((m) => !m.invoice_id || !db.get("invoices", m.invoice_id));
  if (unbilled.length) {
    unbilled.forEach((m) => invoiceMilestone(projectId, m.id));
    return;
  }
  // all milestones billed: bill any approved change orders not yet invoiced
  const billed = db.where("invoices", (i) => i.project_id === projectId && i.status !== "void").reduce((s, i) => s + invoiceTotals(i).total, 0);
  const remaining = round2(p.contract_value - billed);
  if (remaining > 0.01)
    createInvoice({ customer_id: p.customer_id, project_id: p.id, kind: "final", tax_rate: 0, items: [{ id: "l0", description: `Final balance incl. approved change orders — ${p.number}`, quantity: 1, unit: "LS", unit_price: remaining, taxable: false }] });
}

export function sendInvoice(id: ID) {
  const inv = db.get("invoices", id);
  if (!inv) return;
  const status = deriveInvoiceStatus({ ...inv, status: "sent" }, db.where("payments", (p) => p.invoice_id === id));
  db.update("invoices", id, { status, sent_at: new Date().toISOString() });
  logActivity({ type: "email", subject: `Invoice ${inv.number} sent`, customer_id: inv.customer_id, project_id: inv.project_id, invoice_id: id });
}

export function recordPayment(p: { invoice_id: ID; amount: number; method: Payment["method"]; date?: string; reference?: string; notes?: string; processor?: Payment["processor"] }) {
  const inv = db.get("invoices", p.invoice_id);
  if (!inv) throw new Error("Invoice not found");
  if (!(p.amount > 0)) throw new Error("Amount must be greater than zero");
  const pay = db.insert("payments", {
    invoice_id: inv.id, customer_id: inv.customer_id, project_id: inv.project_id, amount: round2(p.amount), method: p.method, date: p.date ?? todayISO(),
    reference: p.reference ?? "", notes: p.notes ?? "", processor: p.processor ?? "manual", external_ref: null,
  });
  refreshInvoiceStatus(inv.id);
  const cust = db.get("customers", inv.customer_id);
  const proj = inv.project_id ? db.get("projects", inv.project_id) : undefined;
  logActivity({ type: p.processor === "portal" ? "portal" : "system", subject: `Payment ${money(pay.amount)} received (${inv.number})`, customer_id: inv.customer_id, project_id: inv.project_id, invoice_id: inv.id, user_id: p.processor === "portal" ? null : db.currentUserId });
  const ctx = { record_id: pay.id, project_id: inv.project_id, customer_id: inv.customer_id, vars: { number: inv.number, customer: custName(cust), amount: money(pay.amount), method: pay.method, project: proj?.name ?? "" } };
  fire("payment.received", ctx);
  if (inv.kind === "deposit") fire("deposit.received", ctx);
  // final payment received → advance project
  if (proj && inv.kind === "final" && db.get("invoices", inv.id)!.status === "paid" && PROJECT_STAGES.indexOf(proj.stage) >= PROJECT_STAGES.indexOf("Completed")) {
    setProjectStage(proj.id, "Final Payment");
  }
  return pay;
}

export function deletePayment(id: ID) {
  const p = db.get("payments", id);
  if (!p) return;
  db.remove("payments", id);
  refreshInvoiceStatus(p.invoice_id);
}

export function refreshInvoiceStatus(id: ID) {
  const inv = db.get("invoices", id);
  if (!inv) return;
  const status = deriveInvoiceStatus(inv, db.where("payments", (p) => p.invoice_id === id));
  if (status !== inv.status) {
    db.update("invoices", id, { status });
    if (status === "overdue") {
      const t = invoiceTotals(inv, db.where("payments", (p) => p.invoice_id === id));
      fire("invoice.overdue", { record_id: id, customer_id: inv.customer_id, project_id: inv.project_id, vars: { number: inv.number, customer: custName(db.get("customers", inv.customer_id)), balance: money(t.balance) } });
    }
  }
}

/** Daily sweeps: overdue invoices + upcoming installation reminders. Idempotent. */
export function runScheduledChecks() {
  db.all("invoices").forEach((i) => {
    if (["sent", "partially_paid"].includes(i.status)) refreshInvoiceStatus(i.id);
  });
  const now = Date.now();
  const soon = now + 48 * 3600 * 1000;
  db.all("events")
    .filter((e) => e.type === "installation" && e.status !== "cancelled" && new Date(e.start).getTime() > now && new Date(e.start).getTime() < soon)
    .forEach((e) => {
      const already = db.all("automation_runs").some((r) => r.trigger === "event.upcoming_installation" && r.record_id === e.id);
      // only remind for the first day of a multi-day installation for the project
      const firstOfRun = !db.all("events").some((o) => o.id !== e.id && o.project_id && o.project_id === e.project_id && o.type === "installation" && new Date(o.start) < new Date(e.start) && new Date(o.start).getTime() > now - 3 * 86400000);
      if (already || !firstOfRun) return;
      fire("event.upcoming_installation", { record_id: e.id, project_id: e.project_id, customer_id: e.customer_id, vars: { title: e.title, customer: custName(db.get("customers", e.customer_id)), date: new Date(e.start).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) } });
    });
}

// ---------------------------------------------------------------- change orders
export function createChangeOrder(projectId: ID, title = "Change order") {
  return db.insert("change_orders", { number: nextNumber("change_order"), project_id: projectId, title, reason: "", status: "draft", items: [], schedule_impact_days: 0, sent_at: null, approved_at: null, signed_name: "", customer_comment: "" });
}

export function sendChangeOrder(id: ID) {
  const co = db.get("change_orders", id);
  if (!co) return;
  db.update("change_orders", id, { status: "sent", sent_at: new Date().toISOString() });
  const p = db.get("projects", co.project_id);
  logActivity({ type: "email", subject: `Change order ${co.number} sent for approval`, customer_id: p?.customer_id, project_id: co.project_id });
}

export function respondChangeOrder(id: ID, action: "approved" | "rejected", signedName: string, comment: string, by: "staff" | "customer") {
  const co = db.get("change_orders", id) as ChangeOrder | undefined;
  if (!co || co.status === "approved") return;
  const p = db.get("projects", co.project_id);
  db.update("change_orders", id, { status: action, signed_name: signedName, customer_comment: comment, approved_at: action === "approved" ? new Date().toISOString() : null });
  if (action === "approved" && p) {
    const t = changeOrderTotals(co);
    db.update("projects", p.id, {
      contract_value: round2(p.contract_value + t.amount),
      estimated_cost: round2(p.estimated_cost + t.cost),
      end_date: p.end_date && co.schedule_impact_days ? addDaysISO(p.end_date, co.schedule_impact_days) : p.end_date,
    });
    fire("change_order.approved", { record_id: id, project_id: p.id, customer_id: p.customer_id, vars: { number: co.number, amount: money(t.amount), project: p.name } });
  }
  logActivity({ type: by === "customer" ? "portal" : "system", subject: `Change order ${co.number} ${action}${by === "customer" ? " in portal" : ""}`, body: comment, customer_id: p?.customer_id, project_id: co.project_id, user_id: by === "customer" ? null : db.currentUserId });
}

// ---------------------------------------------------------------- purchasing & stock
export function placePurchaseOrder(id: ID) {
  const po = db.get("purchase_orders", id);
  if (!po) return;
  db.update("purchase_orders", id, { status: "ordered", order_date: todayISO() });
  const sup = db.get("suppliers", po.supplier_id);
  if (po.project_id) {
    const p = db.get("projects", po.project_id);
    fire("po.ordered", { record_id: id, project_id: po.project_id, customer_id: p?.customer_id, vars: { number: po.number, supplier: sup?.name ?? "", project: p?.name ?? "" } });
  }
}

export function poTotal(po: Pick<PurchaseOrder, "items" | "shipping" | "tax">) {
  return round2(po.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0) + Number(po.shipping || 0) + Number(po.tax || 0));
}

/** Receive quantities against a PO: updates stock, logs movements, books the material cost. */
export function receivePurchaseOrder(id: ID, received: Record<string, number>, allocateToProject: boolean) {
  const po = db.get("purchase_orders", id);
  if (!po) return;
  let receivedValue = 0;
  const items = po.items.map((it) => {
    const q = Math.max(0, Math.min(Number(received[it.id] || 0), it.quantity - it.received));
    if (q > 0) {
      receivedValue += q * it.unit_cost;
      if (it.inventory_item_id) {
        const inv = db.get("inventory_items", it.inventory_item_id);
        if (inv) {
          db.update("inventory_items", inv.id, { quantity: round2(inv.quantity + q - (allocateToProject && po.project_id ? q : 0)), cost: it.unit_cost });
          db.insert("stock_movements", { inventory_item_id: inv.id, project_id: null, purchase_order_id: po.id, type: "receive", quantity: q, unit_cost: it.unit_cost, date: todayISO(), notes: po.number });
          if (allocateToProject && po.project_id)
            db.insert("stock_movements", { inventory_item_id: inv.id, project_id: po.project_id, purchase_order_id: po.id, type: "allocate", quantity: -q, unit_cost: it.unit_cost, date: todayISO(), notes: `Direct to job (${po.number})` });
        }
      }
    }
    return { ...it, received: round2(it.received + q) };
  });
  const complete = items.every((i) => i.received >= i.quantity);
  db.update("purchase_orders", id, { items, status: complete ? "received" : "partially_received", delivered_date: complete ? todayISO() : po.delivered_date });
  if (receivedValue > 0) {
    const firstReceipt = po.items.every((i) => i.received === 0);
    db.insert("expenses", {
      project_id: allocateToProject ? po.project_id : null, supplier_id: po.supplier_id, employee_id: null, purchase_order_id: po.id, category: "material",
      description: `Materials received — ${po.number}`, amount: round2(receivedValue + (firstReceipt ? Number(po.shipping) + Number(po.tax) : 0)),
      date: todayISO(), due_date: addDaysISO(todayISO(), 30), status: "unpaid", paid_date: null, reference: po.number,
    });
  }
  if (complete && po.project_id) {
    const p = db.get("projects", po.project_id);
    fire("po.received", { record_id: id, project_id: po.project_id, customer_id: p?.customer_id, vars: { number: po.number, supplier: db.get("suppliers", po.supplier_id)?.name ?? "", project: p?.name ?? "" } });
  }
}

/** Move stock in/out of inventory for a project, posting the job cost. */
export function stockMove(itemId: ID, type: "allocate" | "return" | "damage" | "adjust", qty: number, projectId: ID | null, notes = "") {
  const item = db.get("inventory_items", itemId);
  if (!item) return;
  const signed = type === "allocate" || type === "damage" ? -Math.abs(qty) : type === "return" ? Math.abs(qty) : qty;
  db.update("inventory_items", itemId, { quantity: round2(item.quantity + signed) });
  db.insert("stock_movements", { inventory_item_id: itemId, project_id: projectId, purchase_order_id: null, type, quantity: signed, unit_cost: item.cost, date: todayISO(), notes });
  if (projectId && (type === "allocate" || type === "return")) {
    db.insert("expenses", {
      project_id: projectId, supplier_id: item.supplier_id, employee_id: null, purchase_order_id: null, category: "material",
      description: `${type === "allocate" ? "Allocated" : "Returned"}: ${Math.abs(qty)} ${item.unit} ${item.name}`, amount: round2(-signed * item.cost),
      date: todayISO(), due_date: null, status: "paid", paid_date: todayISO(), reference: "inventory",
    });
  }
}

// ---------------------------------------------------------------- labor
export function logTime(t: { employee_id: ID; project_id: ID; date: string; hours: number; sqft_completed?: number; notes?: string }) {
  const e = db.get("employees", t.employee_id);
  if (!e) throw new Error("Employee not found");
  const rate = e.rate_type === "hourly" ? e.rate : e.rate_type === "daily" ? e.rate / 8 : 0;
  const cost = e.rate_type === "per_sqft" ? round2((t.sqft_completed || 0) * e.rate) : e.rate_type === "contract" ? round2(e.rate * (t.hours / 8)) : round2(rate * t.hours);
  return db.insert("time_entries", { employee_id: t.employee_id, project_id: t.project_id, date: t.date, hours: t.hours, rate: e.rate, cost, sqft_completed: t.sqft_completed ?? 0, notes: t.notes ?? "" });
}

// ---------------------------------------------------------------- portal / messages
export function sendMessage(customerId: ID, projectId: ID | null, body: string, sender: "customer" | "staff") {
  const m = db.insert("messages", { customer_id: customerId, project_id: projectId, sender, user_id: sender === "staff" ? db.currentUserId : null, body, read: sender === "staff" });
  if (sender === "customer") fire("portal.message", { record_id: m.id, customer_id: customerId, project_id: projectId, vars: { customer: custName(db.get("customers", customerId)), body: body.slice(0, 120) } });
  return m;
}

// ---------------------------------------------------------------- deletes with integrity
export function deleteCustomer(id: ID) {
  const blocking = db.where("projects", (p) => p.customer_id === id).length + db.where("invoices", (i) => i.customer_id === id).length;
  if (blocking) throw new Error("This customer has projects or invoices. Archive them before deleting.");
  db.where("estimates", (e) => e.customer_id === id).forEach((e) => deleteEstimate(e.id));
  db.where("leads", (l) => l.customer_id === id).forEach((l) => db.remove("leads", l.id));
  db.where("activities", (a) => a.customer_id === id).forEach((a) => db.remove("activities", a.id));
  db.where("messages", (a) => a.customer_id === id).forEach((a) => db.remove("messages", a.id));
  db.remove("customers", id);
}

export function deleteEstimate(id: ID) {
  db.where("estimate_items", (i) => i.estimate_id === id).forEach((i) => db.remove("estimate_items", i.id));
  db.remove("estimates", id);
}

export function deleteProject(id: ID) {
  if (db.where("invoices", (i) => i.project_id === id && i.status !== "draft" && i.status !== "void").length)
    throw new Error("This project has issued invoices and cannot be deleted. Close it instead.");
  for (const t of ["project_tasks", "project_updates", "change_orders", "time_entries"] as const)
    db.where(t, (r) => (r as { project_id: ID }).project_id === id).forEach((r) => db.remove(t, r.id));
  db.where("invoices", (i) => i.project_id === id).forEach((i) => db.remove("invoices", i.id));
  db.where("estimates", (e) => e.project_id === id).forEach((e) => db.update("estimates", e.id, { project_id: null }));
  db.remove("projects", id);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

registerDomainHandlers({ createProjectFromEstimate: (id) => void createProjectFromEstimate(id), createFinalInvoice });

// Remote changes (e.g. customer actions through the Supabase portal RPCs) run
// the same downstream automations as local actions.
// Only in Supabase mode: in local mode the originating tab already ran the
// automations and the other tabs merely mirror the resulting rows.
db.onChange(({ table, before, after, origin }) => {
  if (origin !== "remote" || !after || db.backend?.mode !== "supabase") return;
  const b = before as Record<string, unknown> | null;
  const a = after as Record<string, unknown>;
  if (table === "estimates" && a.status === "approved" && b?.status !== "approved" && !a.project_id) {
    const e = a as unknown as Estimate;
    fire("estimate.approved", { record_id: e.id, estimate_id: e.id, lead_id: e.lead_id, customer_id: e.customer_id, vars: estimateVars(e) });
  }
  if (table === "messages" && !b && a.sender === "customer") {
    fire("portal.message", { record_id: a.id as ID, customer_id: a.customer_id as ID, project_id: (a.project_id as ID) ?? null, vars: { customer: custName(db.get("customers", a.customer_id as ID)), body: String(a.body).slice(0, 120) } });
  }
  if (table === "payments" && !b && a.processor === "portal") {
    refreshInvoiceStatus(a.invoice_id as ID);
    const inv = db.get("invoices", a.invoice_id as ID);
    const proj = inv?.project_id ? db.get("projects", inv.project_id) : undefined;
    const ctx = { record_id: a.id as ID, project_id: inv?.project_id ?? null, customer_id: a.customer_id as ID, vars: { number: inv?.number ?? "", customer: custName(db.get("customers", a.customer_id as ID)), amount: money(Number(a.amount)), method: String(a.method), project: proj?.name ?? "" } };
    fire("payment.received", ctx);
    if (inv?.kind === "deposit") fire("deposit.received", ctx);
  }
});
