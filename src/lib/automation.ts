"use client";
// Automation engine: user-configurable trigger → conditions → actions.
// Business services call `fire()` at each lifecycle event. Actions that need
// domain logic (create project, final invoice) are injected by services.ts to
// avoid a circular import. Email/SMS actions are queued as activities with an
// integration hook (`deliver`) so a provider (Resend, Twilio) can be plugged in.
import { db } from "./store";
import { addDaysISO, todayISO } from "./calc";
import type { Automation, AutomationAction, ID, ProjectStage, TriggerKey } from "./types";
import { PROJECT_STAGES } from "./types";

export interface TriggerContext {
  record_id?: ID | null;
  customer_id?: ID | null;
  project_id?: ID | null;
  lead_id?: ID | null;
  estimate_id?: ID | null;
  vars: Record<string, string | number>;
}

export const TRIGGERS: { key: TriggerKey; label: string; vars: string[] }[] = [
  { key: "lead.created", label: "A new lead is created", vars: ["title", "customer", "source", "value"] },
  { key: "lead.stage_changed", label: "A lead changes pipeline stage", vars: ["title", "customer", "stage"] },
  { key: "estimate.sent", label: "An estimate is sent", vars: ["number", "customer", "total"] },
  { key: "estimate.approved", label: "An estimate is approved", vars: ["number", "customer", "total"] },
  { key: "estimate.rejected", label: "An estimate is rejected", vars: ["number", "customer", "total"] },
  { key: "contract.signed", label: "A contract is signed", vars: ["name", "customer"] },
  { key: "payment.received", label: "Any payment is received", vars: ["number", "customer", "amount", "method", "project"] },
  { key: "deposit.received", label: "A deposit payment is received", vars: ["number", "customer", "amount", "method", "project"] },
  { key: "po.ordered", label: "Materials are ordered (PO placed)", vars: ["number", "supplier", "project"] },
  { key: "po.received", label: "A purchase order is fully received", vars: ["number", "supplier", "project"] },
  { key: "project.stage_changed", label: "A project changes stage", vars: ["name", "customer", "stage"] },
  { key: "project.completed", label: "A project is completed", vars: ["name", "customer"] },
  { key: "event.upcoming_installation", label: "An installation starts within 48 hours", vars: ["title", "customer", "date"] },
  { key: "invoice.overdue", label: "An invoice becomes overdue", vars: ["number", "customer", "balance"] },
  { key: "change_order.approved", label: "A change order is approved", vars: ["number", "amount", "project"] },
  { key: "portal.message", label: "A customer sends a portal message", vars: ["customer", "body"] },
];

export const ACTIONS: { type: AutomationAction["type"]; label: string; params: { key: string; label: string; placeholder?: string }[] }[] = [
  { type: "notify", label: "Send in-app notification", params: [{ key: "roles", label: "Roles (comma separated keys)", placeholder: "owner,office_manager" }, { key: "title", label: "Title" }, { key: "body", label: "Message" }] },
  { type: "create_task", label: "Create project task", params: [{ key: "title", label: "Task title" }, { key: "days", label: "Due in (days)" }] },
  { type: "schedule_follow_up", label: "Schedule follow-up reminder", params: [{ key: "title", label: "Reminder title" }, { key: "days", label: "In (days)" }] },
  { type: "create_project", label: "Create project from estimate", params: [] },
  { type: "set_project_stage", label: "Set project stage", params: [{ key: "stage", label: "Stage", placeholder: "Deposit Received" }] },
  { type: "create_final_invoice", label: "Create final invoice (draft)", params: [] },
  { type: "log_activity", label: "Log activity on customer", params: [{ key: "subject", label: "Subject" }] },
  { type: "send_email", label: "Send email (integration)", params: [{ key: "to", label: "To (customer / team)", placeholder: "customer" }, { key: "subject", label: "Subject" }, { key: "body", label: "Body" }] },
  { type: "send_sms", label: "Send SMS (integration)", params: [{ key: "to", label: "To", placeholder: "customer" }, { key: "body", label: "Message" }] },
];

type DomainHandlers = {
  createProjectFromEstimate: (estimateId: ID) => void;
  createFinalInvoice: (projectId: ID) => void;
};
let handlers: DomainHandlers | null = null;
export function registerDomainHandlers(h: DomainHandlers) {
  handlers = h;
}

/** Outbound message hook. Replace with a provider call (Edge Function) to go live. */
export let deliver = async (channel: "email" | "sms", to: string, subject: string, body: string) => {
  console.info(`[${channel}] → ${to}: ${subject}\n${body}`);
};
export function setDeliver(fn: typeof deliver) {
  deliver = fn;
}

const fill = (tpl: string | number | boolean | undefined, vars: Record<string, string | number>) =>
  String(tpl ?? "").replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));

function conditionsPass(a: Automation, ctx: TriggerContext) {
  return a.conditions.every((c) => {
    const v = String(ctx.vars[c.field] ?? "");
    switch (c.op) {
      case "eq": return v === c.value;
      case "neq": return v !== c.value;
      case "gt": return Number(v) > Number(c.value);
      case "lt": return Number(v) < Number(c.value);
      case "contains": return v.toLowerCase().includes(c.value.toLowerCase());
    }
  });
}

export function fire(trigger: TriggerKey, ctx: TriggerContext) {
  const autos = db.all("automations").filter((a) => a.active && a.trigger === trigger);
  for (const a of autos) {
    if (!conditionsPass(a, ctx)) {
      db.insert("automation_runs", { automation_id: a.id, trigger, record_id: ctx.record_id ?? null, status: "skipped", detail: "Conditions not met" });
      continue;
    }
    const done: string[] = [];
    try {
      for (const act of a.actions) done.push(runAction(act, ctx));
      db.update("automations", a.id, { run_count: a.run_count + 1, last_run_at: new Date().toISOString() });
      db.insert("automation_runs", { automation_id: a.id, trigger, record_id: ctx.record_id ?? null, status: "success", detail: done.join(" · ") });
    } catch (e) {
      db.insert("automation_runs", { automation_id: a.id, trigger, record_id: ctx.record_id ?? null, status: "error", detail: (e as Error).message });
    }
  }
}

function runAction(act: AutomationAction, ctx: TriggerContext): string {
  const p = act.params;
  const v = ctx.vars;
  switch (act.type) {
    case "notify": {
      db.insert("notifications", {
        user_id: null, role_keys: String(p.roles || "owner").split(",").map((s) => s.trim()).filter(Boolean),
        title: fill(p.title, v), body: fill(p.body, v), link: linkFor(ctx), read_by: [], kind: (p.kind as "info") || "info",
      });
      return "notified";
    }
    case "create_task": {
      if (!ctx.project_id) return "no project";
      db.insert("project_tasks", { project_id: ctx.project_id, kind: "task", title: fill(p.title, v), assignee_id: null, due_date: addDaysISO(todayISO(), Number(p.days || 1)), done: false, done_at: null, position: 999 });
      return "task created";
    }
    case "schedule_follow_up": {
      const lead = ctx.lead_id ? db.get("leads", ctx.lead_id) : undefined;
      const date = addDaysISO(todayISO(), Number(p.days || 3));
      if (lead) db.update("leads", lead.id, { follow_up_date: date });
      const start = new Date(date + "T09:00:00");
      db.insert("events", {
        title: fill(p.title, v), type: "reminder", start: start.toISOString(), end: new Date(start.getTime() + 30 * 60000).toISOString(), all_day: false,
        project_id: ctx.project_id ?? null, customer_id: ctx.customer_id ?? null, lead_id: ctx.lead_id ?? null, crew_id: null, employee_ids: [],
        location: "", notes: "Automated follow-up", status: "scheduled", reminder_minutes: 30,
      });
      return `follow-up on ${date}`;
    }
    case "create_project": {
      if (ctx.estimate_id && handlers) handlers.createProjectFromEstimate(ctx.estimate_id);
      return "project created";
    }
    case "set_project_stage": {
      const proj = ctx.project_id ? db.get("projects", ctx.project_id) : undefined;
      const stage = String(p.stage) as ProjectStage;
      if (!proj || !PROJECT_STAGES.includes(stage)) return "no project";
      if (p.only_if_before && PROJECT_STAGES.indexOf(proj.stage) >= PROJECT_STAGES.indexOf(stage)) return "stage unchanged";
      if (PROJECT_STAGES.indexOf(proj.stage) < PROJECT_STAGES.indexOf(stage) || !p.only_if_before) {
        if (PROJECT_STAGES.indexOf(proj.stage) < PROJECT_STAGES.indexOf(stage)) db.update("projects", proj.id, { stage });
      }
      return `stage → ${stage}`;
    }
    case "create_final_invoice": {
      if (ctx.project_id && handlers) handlers.createFinalInvoice(ctx.project_id);
      return "final invoice drafted";
    }
    case "log_activity": {
      db.insert("activities", { type: "system", subject: fill(p.subject, v), body: "Automation", customer_id: ctx.customer_id ?? null, lead_id: ctx.lead_id ?? null, project_id: ctx.project_id ?? null, estimate_id: ctx.estimate_id ?? null, invoice_id: null, user_id: null });
      return "activity logged";
    }
    case "send_email":
    case "send_sms": {
      const cust = ctx.customer_id ? db.get("customers", ctx.customer_id) : undefined;
      const to = p.to === "customer" && cust ? (act.type === "send_email" ? cust.email : cust.phone) : String(p.to || "");
      const subject = fill(p.subject, v);
      const body = fill(p.body, v);
      void deliver(act.type === "send_email" ? "email" : "sms", to, subject, body);
      db.insert("activities", { type: act.type === "send_email" ? "email" : "sms", subject: subject || body.slice(0, 60), body: `Automated → ${to}\n${body}`, customer_id: ctx.customer_id ?? null, lead_id: ctx.lead_id ?? null, project_id: ctx.project_id ?? null, estimate_id: null, invoice_id: null, user_id: null });
      return `${act.type === "send_email" ? "email" : "sms"} queued`;
    }
  }
}

function linkFor(ctx: TriggerContext) {
  if (ctx.project_id) return `/projects/${ctx.project_id}`;
  if (ctx.estimate_id) return `/estimates/${ctx.estimate_id}`;
  if (ctx.lead_id) return `/leads/${ctx.lead_id}`;
  if (ctx.customer_id) return `/customers/${ctx.customer_id}`;
  return "/";
}
