"use client";
// Customer-portal data adapter. Local mode reads/writes the same store as the
// staff app (and runs the same services/automations). Supabase mode uses the
// token-scoped security-definer RPCs in 0002_security.sql — anonymous visitors
// never get direct table access.
import { bootData } from "./auth";
import { createSupabaseBackend, getSupabase, supabaseConfigured } from "./backends/supabase";
import { db, uid } from "./store";
import { intakeInquiry, markEstimateViewed, recordPayment, respondChangeOrder, respondEstimate, sendMessage, signContract } from "./services";
import { uploadFiles } from "@/components/files";
import type {
  CalendarEvent, ChangeOrder, CompanySettings, Customer, Estimate, EstimateItem, FileRecord, Invoice, Lead, Message, Payment, Project, ProjectUpdate,
} from "./types";

// internal reminders, meetings and time off are never shown to customers
const CUSTOMER_EVENT_TYPES = ["site_visit", "estimate", "installation", "delivery", "inspection"];

export interface PortalData {
  company: CompanySettings;
  customer: Customer;
  estimates: Estimate[];
  estimate_items: EstimateItem[];
  projects: Project[];
  change_orders: ChangeOrder[];
  invoices: Invoice[];
  payments: Payment[];
  updates: ProjectUpdate[];
  files: FileRecord[];
  events: Pick<CalendarEvent, "id" | "title" | "type" | "start" | "end" | "project_id" | "status">[];
  messages: Message[];
}

export interface PortalApi {
  load(): Promise<PortalData>;
  respondEstimate(id: string, action: "approved" | "rejected" | "changes_requested", name: string, comment: string): Promise<void>;
  viewedEstimate(id: string): Promise<void>;
  respondChangeOrder(id: string, action: "approved" | "rejected", name: string, comment: string): Promise<void>;
  signContract(projectId: string, name: string): Promise<void>;
  sendMessage(projectId: string | null, body: string): Promise<void>;
  pay(invoiceId: string, amount: number): Promise<void>;
  upload(projectId: string | null, files: FileList): Promise<void>;
  fileUrl(f: FileRecord): Promise<string | null>;
  subscribe(cb: () => void): () => void;
}

export function portalApi(token: string): PortalApi {
  if (supabaseConfigured()) {
    const sb = getSupabase();
    const backend = createSupabaseBackend();
    const call = async (fn: string, args: Record<string, unknown>) => {
      const { error } = await sb.rpc(fn, { p_token: token, ...args });
      if (error) throw new Error(error.message);
    };
    return {
      async load() {
        const { data, error } = await sb.rpc("portal_get", { p_token: token });
        if (error) throw new Error(error.message);
        return data as PortalData;
      },
      respondEstimate: (id, action, name, comment) => call("portal_respond_estimate", { p_estimate: id, p_action: action, p_name: name, p_comment: comment }),
      viewedEstimate: async () => {},
      respondChangeOrder: (id, action, name, comment) => call("portal_respond_change_order", { p_co: id, p_action: action, p_name: name, p_comment: comment }),
      signContract: (projectId, name) => call("portal_sign_contract", { p_project: projectId, p_name: name }),
      sendMessage: (projectId, body) => call("portal_send_message", { p_project: projectId, p_body: body }),
      pay: (invoiceId, amount) => call("portal_pay_invoice", { p_invoice: invoiceId, p_amount: amount, p_reference: `portal-${Date.now()}` }),
      async upload(projectId, files) {
        for (const f of Array.from(files)) {
          const path = `portal/${token}/${uid()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
          await backend.putFile(path, f);
          await call("portal_register_file", { p_project: projectId, p_name: f.name, p_mime: f.type, p_size: f.size, p_path: path });
        }
      },
      fileUrl: (f) => backend.fileUrl(f.storage_path),
      subscribe: () => () => {},
    };
  }

  const customer = () => {
    const c = db.all("customers").find((x) => x.portal_token === token);
    if (!c) throw new Error("This portal link is invalid or has expired.");
    return c;
  };
  return {
    async load() {
      await bootData();
      const c = customer();
      const S = db.snapshot();
      const estimates = S.estimates.filter((e) => e.customer_id === c.id && e.status !== "draft");
      const projects = S.projects.filter((p) => p.customer_id === c.id);
      const pids = new Set(projects.map((p) => p.id));
      return {
        company: S.company_settings[0],
        customer: c,
        estimates,
        estimate_items: S.estimate_items.filter((i) => estimates.some((e) => e.id === i.estimate_id)),
        projects,
        change_orders: S.change_orders.filter((x) => pids.has(x.project_id) && x.status !== "draft"),
        invoices: S.invoices.filter((i) => i.customer_id === c.id && i.status !== "draft"),
        payments: S.payments.filter((p) => p.customer_id === c.id),
        updates: S.project_updates.filter((u) => pids.has(u.project_id) && u.visible_to_customer),
        files: S.files.filter((f) => f.customer_id === c.id && (f.shared_with_customer || f.uploaded_by_customer)),
        events: S.events.filter((e) => e.customer_id === c.id && e.status !== "cancelled" && CUSTOMER_EVENT_TYPES.includes(e.type)),
        messages: S.messages.filter((m) => m.customer_id === c.id),
      };
    },
    async respondEstimate(id, action, name, comment) {
      const e = db.get("estimates", id);
      if (!e || e.customer_id !== customer().id) throw new Error("Not available");
      if (!["sent", "viewed", "changes_requested"].includes(e.status)) throw new Error("This proposal can no longer be changed.");
      respondEstimate(id, action, name, comment, "customer");
    },
    async viewedEstimate(id) {
      const e = db.get("estimates", id);
      if (e && e.customer_id === customer().id) markEstimateViewed(id);
    },
    async respondChangeOrder(id, action, name, comment) {
      const co = db.get("change_orders", id);
      const p = co ? db.get("projects", co.project_id) : undefined;
      if (!co || p?.customer_id !== customer().id || co.status !== "sent") throw new Error("Not available");
      respondChangeOrder(id, action, name, comment, "customer");
    },
    async signContract(projectId, name) {
      if (db.get("projects", projectId)?.customer_id !== customer().id) throw new Error("Not available");
      signContract(projectId, name, "customer");
    },
    async sendMessage(projectId, body) {
      sendMessage(customer().id, projectId, body, "customer");
    },
    async pay(invoiceId, amount) {
      const inv = db.get("invoices", invoiceId);
      if (!inv || inv.customer_id !== customer().id) throw new Error("Not available");
      recordPayment({ invoice_id: invoiceId, amount, method: "card", reference: `portal-${Date.now().toString(36)}`, processor: "portal", notes: "Paid through customer portal" });
    },
    async upload(projectId, files) {
      await uploadFiles(files, { customer_id: customer().id, project_id: projectId, category: "inspiration", uploaded_by_customer: true, shared_with_customer: true });
      db.insert("notifications", { user_id: null, role_keys: ["owner", "office_manager", "project_manager", "sales_rep"], title: `${customer().first_name} uploaded ${files.length} file(s)`, body: "Customer portal", link: `/customers/${customer().id}`, read_by: [], kind: "info" });
    },
    fileUrl: (f) => db.backend!.fileUrl(f.storage_path),
    subscribe: (cb) => db.subscribeAll(cb),
  };
}

/** Public website inquiry intake. */
export async function submitInquiry(f: Parameters<typeof intakeInquiry>[0]): Promise<Lead | null> {
  if (supabaseConfigured()) {
    const { error } = await getSupabase().rpc("submit_inquiry", { p_payload: f });
    if (error) throw new Error(error.message);
    return null;
  }
  await bootData();
  if (!db.all("company_settings").length) throw new Error("This workspace hasn't been set up yet.");
  return intakeInquiry(f);
}
