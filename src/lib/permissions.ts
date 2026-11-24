import type { Permission } from "./types";

export const PERMISSION_GROUPS: { module: string; perms: { key: Permission; label: string }[] }[] = [
  { module: "Dashboard", perms: [{ key: "dashboard.view", label: "View dashboard & KPIs" }] },
  {
    module: "Customers",
    perms: [
      { key: "customers.view", label: "View customers" },
      { key: "customers.edit", label: "Create & edit customers" },
      { key: "customers.delete", label: "Delete customers" },
    ],
  },
  { module: "Leads", perms: [{ key: "leads.view", label: "View pipeline" }, { key: "leads.edit", label: "Manage leads" }] },
  {
    module: "Estimates",
    perms: [
      { key: "estimates.view", label: "View estimates" },
      { key: "estimates.edit", label: "Build estimates" },
      { key: "estimates.approve", label: "Mark approved / convert" },
    ],
  },
  { module: "Projects", perms: [{ key: "projects.view", label: "View projects" }, { key: "projects.edit", label: "Manage projects & change orders" }] },
  { module: "Calendar", perms: [{ key: "calendar.view", label: "View calendar" }, { key: "calendar.edit", label: "Schedule" }] },
  { module: "Measurements", perms: [{ key: "measurements.view", label: "View" }, { key: "measurements.edit", label: "Record measurements" }] },
  { module: "Inventory", perms: [{ key: "inventory.view", label: "View materials" }, { key: "inventory.edit", label: "Purchasing & stock" }] },
  { module: "Team", perms: [{ key: "team.view", label: "View team" }, { key: "team.edit", label: "Manage team & labor" }] },
  { module: "Finance", perms: [{ key: "finance.view", label: "View financials" }, { key: "finance.edit", label: "Invoices, payments, expenses" }] },
  { module: "Documents", perms: [{ key: "documents.view", label: "View documents" }, { key: "documents.edit", label: "Upload & delete" }] },
  { module: "Automations", perms: [{ key: "automations.manage", label: "Manage automations" }] },
  { module: "Reports", perms: [{ key: "reports.view", label: "View reports" }] },
  { module: "Administration", perms: [{ key: "settings.manage", label: "Company settings" }, { key: "users.manage", label: "Users & roles" }] },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

const view = (m: string[]) => m.map((x) => `${x}.view` as Permission);

export const DEFAULT_ROLES: { key: string; name: string; description: string; permissions: Permission[] }[] = [
  { key: "owner", name: "Owner / Administrator", description: "Full access to every module and setting.", permissions: ALL_PERMISSIONS },
  {
    key: "office_manager",
    name: "Office Manager",
    description: "Runs the office: customers, scheduling, billing and purchasing.",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "users.manage" && p !== "settings.manage" && p !== "customers.delete"),
  },
  {
    key: "sales_rep",
    name: "Sales Representative",
    description: "Leads, customers, estimates and appointments.",
    permissions: [
      "dashboard.view", "customers.view", "customers.edit", "leads.view", "leads.edit", "estimates.view", "estimates.edit",
      "calendar.view", "calendar.edit", "measurements.view", "measurements.edit", "documents.view", "documents.edit", "projects.view", "reports.view",
    ],
  },
  {
    key: "project_manager",
    name: "Project Manager",
    description: "Projects, crews, schedule, materials and change orders.",
    permissions: [
      "dashboard.view", "customers.view", "projects.view", "projects.edit", "calendar.view", "calendar.edit", "measurements.view",
      "measurements.edit", "inventory.view", "inventory.edit", "team.view", "team.edit", "documents.view", "documents.edit",
      "estimates.view", "finance.view", "reports.view",
    ],
  },
  {
    key: "estimator",
    name: "Estimator",
    description: "Measurements, pricing catalog and proposals.",
    permissions: [
      "dashboard.view", "customers.view", "leads.view", "estimates.view", "estimates.edit", "measurements.view", "measurements.edit",
      "calendar.view", "documents.view", "documents.edit", "inventory.view", "projects.view",
    ],
  },
  {
    key: "field_employee",
    name: "Field Employee",
    description: "Assigned projects, schedule, photos and daily logs.",
    permissions: [...view(["projects", "calendar", "measurements", "documents"]), "documents.edit"],
  },
  {
    key: "subcontractor",
    name: "Subcontractor",
    description: "Read-only access to assigned project details and schedule.",
    permissions: view(["projects", "calendar", "documents"]),
  },
];
