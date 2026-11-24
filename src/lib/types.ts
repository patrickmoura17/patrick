// Domain model. Mirrors supabase/migrations/0001_schema.sql one-to-one
// (snake_case columns, uuid string ids, ISO date strings).

export type ID = string;
export type ISODate = string; // yyyy-mm-dd
export type ISODateTime = string;

export type ServiceCategory = "tile" | "flooring" | "cabinets" | "countertops" | "general";
export type Unit = "SQFT" | "LF" | "EA" | "HR" | "LS";
export type CustomerType = "Residential" | "Commercial" | "Builder" | "Contractor";
export type Priority = "low" | "medium" | "high" | "urgent";

export interface BaseRow {
  id: ID;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export interface CompanySettings extends BaseRow {
  name: string;
  tagline: string;
  logo_url: string | null;
  phone: string;
  email: string;
  website: string;
  address: string;
  license_number: string;
  tax_rate: number; // percent
  tax_materials_only: boolean;
  default_markup: number; // percent
  default_payment_terms_days: number;
  default_payment_schedule: PaymentMilestone[];
  estimate_terms: string;
  estimate_exclusions: string;
  invoice_footer: string;
  estimate_valid_days: number;
  brand_color: string;
  number_prefixes: { estimate: string; project: string; invoice: string; change_order: string; purchase_order: string };
  next_numbers: { estimate: number; project: number; invoice: number; change_order: number; purchase_order: number };
}

export type Permission =
  | "dashboard.view"
  | "customers.view" | "customers.edit" | "customers.delete"
  | "leads.view" | "leads.edit"
  | "estimates.view" | "estimates.edit" | "estimates.approve"
  | "projects.view" | "projects.edit"
  | "calendar.view" | "calendar.edit"
  | "measurements.view" | "measurements.edit"
  | "inventory.view" | "inventory.edit"
  | "team.view" | "team.edit"
  | "finance.view" | "finance.edit"
  | "documents.view" | "documents.edit"
  | "automations.manage"
  | "reports.view"
  | "settings.manage" | "users.manage";

export interface Role extends BaseRow {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  system: boolean;
}

export interface Profile extends BaseRow {
  full_name: string;
  email: string;
  phone: string;
  role_id: ID;
  title: string;
  color: string;
  active: boolean;
  password_hash?: string; // local mode only; Supabase Auth owns passwords in cloud mode
}

export interface Customer extends BaseRow {
  first_name: string;
  last_name: string;
  company: string;
  type: CustomerType;
  phone: string;
  email: string;
  billing_address: string;
  project_address: string;
  lead_source: string;
  notes: string;
  tags: string[];
  portal_token: string;
  owner_id: ID | null;
}

export interface PipelineStage extends BaseRow {
  name: string;
  position: number;
  color: string;
  kind: "open" | "won" | "lost";
  probability: number;
}

export interface Lead extends BaseRow {
  customer_id: ID;
  title: string;
  services: ServiceCategory[];
  stage_id: ID;
  priority: Priority;
  source: string;
  assigned_to: ID | null;
  estimated_value: number;
  follow_up_date: ISODate | null;
  lost_reason: string;
  description: string;
  status: "open" | "won" | "lost";
  converted_at: ISODateTime | null;
  inquiry_payload: Record<string, unknown> | null;
}

export type ActivityType = "call" | "email" | "sms" | "meeting" | "note" | "site_visit" | "system" | "portal";
export interface Activity extends BaseRow {
  type: ActivityType;
  subject: string;
  body: string;
  customer_id: ID | null;
  lead_id: ID | null;
  project_id: ID | null;
  estimate_id: ID | null;
  invoice_id: ID | null;
  user_id: ID | null;
}

export interface PaymentMilestone {
  id: string;
  label: string;
  percent: number;
  trigger: string; // e.g. "Contract signing", "Material delivery", "Completion"
  invoice_id?: ID | null;
}

export interface TimelinePhase {
  id: string;
  label: string;
  days: number;
}

export type EstimateStatus = "draft" | "sent" | "viewed" | "changes_requested" | "approved" | "rejected" | "expired";

export interface Estimate extends BaseRow {
  number: string;
  customer_id: ID;
  lead_id: ID | null;
  project_id: ID | null;
  title: string;
  status: EstimateStatus;
  issue_date: ISODate;
  valid_until: ISODate;
  tax_rate: number;
  discount_type: "percent" | "amount";
  discount_value: number;
  intro: string;
  customer_notes: string;
  exclusions: string;
  terms: string;
  payment_schedule: PaymentMilestone[];
  timeline: TimelinePhase[];
  sent_at: ISODateTime | null;
  responded_at: ISODateTime | null;
  customer_response: string;
  signed_name: string;
  created_by: ID | null;
}

export interface EstimateItem extends BaseRow {
  estimate_id: ID;
  category: ServiceCategory;
  section: string;
  name: string;
  description: string;
  quantity: number;
  unit: Unit;
  material_cost: number; // per unit
  labor_cost: number; // per unit
  markup: number; // percent
  unit_price: number; // per unit, sell price
  price_override: boolean;
  taxable: boolean;
  optional: boolean;
  position: number;
}

export interface CatalogItem extends BaseRow {
  category: ServiceCategory;
  section: string;
  name: string;
  description: string;
  unit: Unit;
  material_cost: number;
  labor_cost: number;
  markup: number;
  active: boolean;
}

export interface EstimateTemplate extends BaseRow {
  name: string;
  category: ServiceCategory;
  description: string;
  items: Omit<EstimateItem, "id" | "created_at" | "estimate_id" | "position">[];
  exclusions: string;
  terms: string;
}

export const PROJECT_STAGES = [
  "Contract Signed",
  "Deposit Received",
  "Materials Ordered",
  "Materials Delivered",
  "Ready to Schedule",
  "Scheduled",
  "In Progress",
  "Quality Inspection",
  "Completed",
  "Final Payment",
  "Closed",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export interface Project extends BaseRow {
  number: string;
  name: string;
  customer_id: ID;
  estimate_id: ID | null;
  lead_id: ID | null;
  address: string;
  manager_id: ID | null;
  crew_id: ID | null;
  member_ids: ID[];
  services: ServiceCategory[];
  contract_value: number; // includes approved change orders
  original_contract_value: number;
  estimated_cost: number;
  stage: ProjectStage;
  health: "on_track" | "at_risk" | "delayed" | "on_hold";
  start_date: ISODate | null;
  end_date: ISODate | null;
  completed_at: ISODateTime | null;
  notes: string;
  payment_schedule: PaymentMilestone[];
  signed_name: string;
  signed_at: ISODateTime | null;
}

export interface ProjectTask extends BaseRow {
  project_id: ID;
  kind: "task" | "checklist" | "punch";
  title: string;
  assignee_id: ID | null;
  due_date: ISODate | null;
  done: boolean;
  done_at: ISODateTime | null;
  position: number;
}

export interface ProjectUpdate extends BaseRow {
  project_id: ID;
  date: ISODate;
  body: string;
  user_id: ID | null;
  visible_to_customer: boolean;
  file_ids: ID[];
}

export type FileCategory =
  | "estimate" | "contract" | "invoice" | "change_order" | "receipt" | "spec"
  | "floor_plan" | "photo" | "warranty" | "instructions" | "drawing" | "inspiration" | "other";

export interface FileRecord extends BaseRow {
  name: string;
  mime: string;
  size: number;
  category: FileCategory;
  photo_phase: "before" | "progress" | "after" | null;
  customer_id: ID | null;
  project_id: ID | null;
  estimate_id: ID | null;
  measurement_id: ID | null;
  storage_path: string; // supabase storage path, or idb key in local mode
  url: string | null; // public/signed url (cloud) or null (resolved lazily)
  uploaded_by: ID | null;
  uploaded_by_customer: boolean;
  shared_with_customer: boolean;
  notes: string;
}

export interface ChangeOrderItem {
  id: string;
  action: "add" | "modify" | "remove";
  description: string;
  quantity: number;
  unit: Unit;
  unit_price: number;
  material_cost: number;
  labor_cost: number;
}

export interface ChangeOrder extends BaseRow {
  number: string;
  project_id: ID;
  title: string;
  reason: string;
  status: "draft" | "sent" | "approved" | "rejected";
  items: ChangeOrderItem[];
  schedule_impact_days: number;
  sent_at: ISODateTime | null;
  approved_at: ISODateTime | null;
  signed_name: string;
  customer_comment: string;
}

export interface MeasurementPoint { x: number; y: number }
export interface Measurement extends BaseRow {
  project_id: ID | null;
  lead_id: ID | null;
  customer_id: ID | null;
  room: string;
  area_type: "floor" | "shower" | "backsplash" | "countertop" | "cabinet_run" | "wall" | "stairs" | "other";
  length: number; // ft
  width: number; // ft
  height: number; // ft
  sqft: number;
  lf: number;
  units: number;
  waste_percent: number;
  material_spec: string;
  install_requirements: string;
  existing_conditions: string;
  demolition: string;
  notes: string;
  shape: MeasurementPoint[]; // feet coordinates of polygon
  file_ids: ID[];
  measured_by: ID | null;
  measured_on: ISODate | null;
}

export type EventType = "site_visit" | "estimate" | "installation" | "delivery" | "inspection" | "reminder" | "meeting" | "time_off";
export interface CalendarEvent extends BaseRow {
  title: string;
  type: EventType;
  start: ISODateTime;
  end: ISODateTime;
  all_day: boolean;
  project_id: ID | null;
  customer_id: ID | null;
  lead_id: ID | null;
  crew_id: ID | null;
  employee_ids: ID[];
  location: string;
  notes: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  reminder_minutes: number | null;
}

export interface Crew extends BaseRow {
  name: string;
  color: string;
  lead_employee_id: ID | null;
  member_ids: ID[];
  specialty: ServiceCategory;
  active: boolean;
}

export interface Employee extends BaseRow {
  name: string;
  kind: "employee" | "subcontractor";
  company: string;
  position: string;
  specialty: ServiceCategory[];
  phone: string;
  email: string;
  rate_type: "hourly" | "daily" | "contract" | "per_sqft";
  rate: number;
  availability: number[]; // weekdays available 0=Sun..6=Sat
  insurance_expires: ISODate | null;
  license_number: string;
  license_expires: ISODate | null;
  notes: string;
  active: boolean;
  profile_id: ID | null;
}

export interface TimeEntry extends BaseRow {
  employee_id: ID;
  project_id: ID;
  date: ISODate;
  hours: number;
  rate: number;
  cost: number;
  sqft_completed: number;
  notes: string;
}

export interface Supplier extends BaseRow {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  categories: string[];
  account_number: string;
  payment_terms: string;
  notes: string;
}

export type InventoryCategory =
  | "Tile" | "Flooring" | "Cabinets" | "Countertops" | "Installation Materials"
  | "Adhesives" | "Grout" | "Underlayment" | "Tools & Supplies";

export interface InventoryItem extends BaseRow {
  name: string;
  supplier_id: ID | null;
  category: InventoryCategory;
  sku: string;
  manufacturer: string;
  color: string;
  finish: string;
  size: string;
  quantity: number;
  unit: string;
  cost: number;
  price: number;
  location: string;
  reorder_level: number;
}

export interface POItem {
  id: string;
  inventory_item_id: ID | null;
  name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  received: number;
}

export interface PurchaseOrder extends BaseRow {
  number: string;
  supplier_id: ID;
  project_id: ID | null;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
  order_date: ISODate;
  expected_date: ISODate | null;
  delivered_date: ISODate | null;
  delivery_address: string;
  items: POItem[];
  shipping: number;
  tax: number;
  notes: string;
}

export interface StockMovement extends BaseRow {
  inventory_item_id: ID;
  project_id: ID | null;
  purchase_order_id: ID | null;
  type: "receive" | "allocate" | "return" | "damage" | "adjust";
  quantity: number; // signed change to stock
  unit_cost: number;
  date: ISODate;
  notes: string;
}

export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "void";
export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unit: Unit;
  unit_price: number;
  taxable: boolean;
}
export interface Invoice extends BaseRow {
  number: string;
  customer_id: ID;
  project_id: ID | null;
  milestone_id: string | null;
  kind: "deposit" | "progress" | "final" | "standard" | "change_order";
  status: InvoiceStatus;
  issue_date: ISODate;
  due_date: ISODate;
  items: InvoiceLine[];
  tax_rate: number;
  discount: number;
  notes: string;
  sent_at: ISODateTime | null;
  external_ref: string | null; // QuickBooks id
}

export interface Payment extends BaseRow {
  invoice_id: ID;
  customer_id: ID;
  project_id: ID | null;
  amount: number;
  method: "card" | "ach" | "check" | "cash" | "zelle" | "financing" | "other";
  date: ISODate;
  reference: string;
  notes: string;
  processor: "manual" | "stripe" | "portal";
  external_ref: string | null; // Stripe payment intent id
}

export type ExpenseCategory = "material" | "labor" | "subcontractor" | "equipment" | "disposal" | "permit" | "overhead" | "other";
export interface Expense extends BaseRow {
  project_id: ID | null;
  supplier_id: ID | null;
  employee_id: ID | null;
  purchase_order_id: ID | null;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: ISODate;
  due_date: ISODate | null;
  status: "unpaid" | "paid";
  paid_date: ISODate | null;
  reference: string;
}

export type TriggerKey =
  | "lead.created" | "lead.stage_changed" | "estimate.sent" | "estimate.approved" | "estimate.rejected"
  | "contract.signed" | "payment.received" | "deposit.received" | "po.ordered" | "po.received"
  | "project.stage_changed" | "project.completed" | "event.upcoming_installation"
  | "invoice.overdue" | "change_order.approved" | "portal.message";

export type ActionType =
  | "notify" | "create_task" | "schedule_follow_up" | "create_project" | "set_project_stage"
  | "create_final_invoice" | "log_activity" | "send_email" | "send_sms";

export interface AutomationAction {
  type: ActionType;
  params: Record<string, string | number | boolean>;
}

export interface Automation extends BaseRow {
  name: string;
  description: string;
  trigger: TriggerKey;
  conditions: { field: string; op: "eq" | "neq" | "gt" | "lt" | "contains"; value: string }[];
  actions: AutomationAction[];
  active: boolean;
  run_count: number;
  last_run_at: ISODateTime | null;
}

export interface AutomationRun extends BaseRow {
  automation_id: ID;
  trigger: TriggerKey;
  record_id: ID | null;
  status: "success" | "skipped" | "error";
  detail: string;
}

export interface Notification extends BaseRow {
  user_id: ID | null; // null = everyone in role list
  role_keys: string[];
  title: string;
  body: string;
  link: string;
  read_by: ID[];
  kind: "info" | "success" | "warning" | "danger";
}

export interface Message extends BaseRow {
  customer_id: ID;
  project_id: ID | null;
  sender: "customer" | "staff";
  user_id: ID | null;
  body: string;
  read: boolean;
}

export interface AuditLog extends BaseRow {
  table_name: string;
  record_id: ID;
  action: "insert" | "update" | "delete";
  user_id: ID | null;
  summary: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
}

export interface Tables {
  company_settings: CompanySettings;
  roles: Role;
  profiles: Profile;
  customers: Customer;
  pipeline_stages: PipelineStage;
  leads: Lead;
  activities: Activity;
  estimates: Estimate;
  estimate_items: EstimateItem;
  catalog_items: CatalogItem;
  estimate_templates: EstimateTemplate;
  projects: Project;
  project_tasks: ProjectTask;
  project_updates: ProjectUpdate;
  files: FileRecord;
  change_orders: ChangeOrder;
  measurements: Measurement;
  events: CalendarEvent;
  crews: Crew;
  employees: Employee;
  time_entries: TimeEntry;
  suppliers: Supplier;
  inventory_items: InventoryItem;
  purchase_orders: PurchaseOrder;
  stock_movements: StockMovement;
  invoices: Invoice;
  payments: Payment;
  expenses: Expense;
  automations: Automation;
  automation_runs: AutomationRun;
  notifications: Notification;
  messages: Message;
  audit_logs: AuditLog;
}

export type TableName = keyof Tables;
export const TABLES: TableName[] = [
  "company_settings", "roles", "profiles", "customers", "pipeline_stages", "leads", "activities",
  "estimates", "estimate_items", "catalog_items", "estimate_templates", "projects", "project_tasks",
  "project_updates", "files", "change_orders", "measurements", "events", "crews", "employees",
  "time_entries", "suppliers", "inventory_items", "purchase_orders", "stock_movements", "invoices",
  "payments", "expenses", "automations", "automation_runs", "notifications", "messages", "audit_logs",
];

export type NewRow<T extends TableName> = Omit<Tables[T], "id" | "created_at" | "updated_at"> & { id?: ID };
