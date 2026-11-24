// Builds the initial database. `config` = everything a brand-new company needs
// (roles, pipeline, catalog, templates, automations, settings). `demo` adds a
// realistic, internally-consistent business history so every screen can be explored.
import { addDaysISO, estimateTotals, milestoneAmounts, round2, todayISO, unitPriceFrom } from "../calc";
import { hashPassword } from "../hash";
import { DEFAULT_ROLES } from "../permissions";
import { emptySnapshot, type Snapshot } from "../backends/types";
import { CATALOG } from "./catalog";
import {
  TABLES, type Automation, type CatalogItem, type CompanySettings, type EstimateItem, type ID,
  type Invoice, type PaymentMilestone, type Project, type ServiceCategory,
} from "../types";

let counter = 0;
const nid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  counter++;
  return `00000000-0000-4000-8000-${counter.toString().padStart(12, "0")}`;
};

// deterministic PRNG for demo history
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export const DEFAULT_SCHEDULE: PaymentMilestone[] = [
  { id: "m1", label: "Deposit", percent: 30, trigger: "Contract signing" },
  { id: "m2", label: "Material delivery", percent: 40, trigger: "Materials delivered to site" },
  { id: "m3", label: "Completion", percent: 30, trigger: "Substantial completion" },
];

export const DEFAULT_TERMS = `1. This proposal is valid for 30 days from the issue date.
2. Payments are due per the payment schedule. Balances over 15 days past due accrue 1.5% monthly interest.
3. Material selections must be finalized before ordering. Special-order materials are non-refundable.
4. Any work not described in this proposal will be handled through a written, signed change order.
5. Customer will provide clear access to work areas, water and electricity.
6. Natural stone varies in color, veining and pattern; such variation is not a defect.
7. Workmanship is warranted for 2 years from completion. Manufacturer warranties apply to materials.`;

export const DEFAULT_EXCLUSIONS = `• Plumbing and electrical work beyond disconnect/reconnect of existing fixtures
• Painting, drywall repair, or wall texture matching
• Moving furniture and appliances (available on request)
• Asbestos or hazardous material testing and abatement
• Structural repairs discovered during demolition (priced by change order)`;

function settings(): Omit<CompanySettings, "id" | "created_at"> {
  return {
    name: "Stoneline Interiors",
    tagline: "Tile · Flooring · Cabinetry · Stone",
    logo_url: null,
    phone: "(512) 555-0148",
    email: "office@stoneline.example",
    website: "stoneline.example",
    address: "2100 Barton Springs Rd, Suite 300, Austin, TX 78704",
    license_number: "TX-RC-448210",
    tax_rate: 8.25,
    tax_materials_only: false,
    default_markup: 40,
    default_payment_terms_days: 15,
    default_payment_schedule: DEFAULT_SCHEDULE,
    estimate_terms: DEFAULT_TERMS,
    estimate_exclusions: DEFAULT_EXCLUSIONS,
    invoice_footer: "Thank you for choosing Stoneline Interiors. Make checks payable to Stoneline Interiors LLC.",
    estimate_valid_days: 30,
    brand_color: "#b08a48",
    number_prefixes: { estimate: "EST-", project: "PRJ-", invoice: "INV-", change_order: "CO-", purchase_order: "PO-" },
    next_numbers: { estimate: 1001, project: 501, invoice: 2001, change_order: 101, purchase_order: 3001 },
  };
}

export const PIPELINE: { name: string; color: string; kind: "open" | "won" | "lost"; probability: number }[] = [
  { name: "New Lead", color: "#6f8fa8", kind: "open", probability: 10 },
  { name: "Contacted", color: "#5b7d9a", kind: "open", probability: 15 },
  { name: "Consultation Scheduled", color: "#4f7190", kind: "open", probability: 25 },
  { name: "Site Visit Completed", color: "#8a7a5c", kind: "open", probability: 35 },
  { name: "Estimate in Progress", color: "#a68a52", kind: "open", probability: 45 },
  { name: "Estimate Sent", color: "#b08a48", kind: "open", probability: 55 },
  { name: "Follow-Up", color: "#c39e5d", kind: "open", probability: 60 },
  { name: "Approved / Won", color: "#4f8a5e", kind: "won", probability: 100 },
  { name: "Lost", color: "#a24630", kind: "lost", probability: 0 },
];

export const DEFAULT_AUTOMATIONS: Omit<Automation, "id" | "created_at" | "run_count" | "last_run_at">[] = [
  { name: "Notify sales team of new leads", description: "When a new lead is created, notify the sales team.", trigger: "lead.created", conditions: [],
    actions: [{ type: "notify", params: { roles: "owner,sales_rep,office_manager", title: "New lead: {{title}}", body: "{{customer}} · {{source}}" } }], active: true },
  { name: "Estimate follow-up reminder", description: "When an estimate is sent, schedule a follow-up task in 3 days.", trigger: "estimate.sent", conditions: [],
    actions: [{ type: "schedule_follow_up", params: { days: 3, title: "Follow up on {{number}} with {{customer}}" } }], active: true },
  { name: "Create project from approved estimate", description: "When an estimate is approved, automatically create the project and mark the lead won.", trigger: "estimate.approved", conditions: [],
    actions: [{ type: "create_project", params: {} }, { type: "notify", params: { roles: "owner,project_manager,office_manager", title: "Estimate approved: {{number}}", body: "{{customer}} · {{total}}" } }], active: true },
  { name: "Notify PM when contract signed", description: "When a contract is signed, notify the project manager.", trigger: "contract.signed", conditions: [],
    actions: [{ type: "notify", params: { roles: "project_manager,owner", title: "Contract signed: {{name}}", body: "Ready for deposit invoice" } }], active: true },
  { name: "Deposit received → advance project", description: "When a deposit is received, move the project to Deposit Received.", trigger: "deposit.received", conditions: [],
    actions: [{ type: "set_project_stage", params: { stage: "Deposit Received" } }, { type: "notify", params: { roles: "project_manager,office_manager", title: "Deposit received: {{project}}", body: "{{amount}} via {{method}}" } }], active: true },
  { name: "Materials ordered → update timeline", description: "When a purchase order is placed for a project, set the project to Materials Ordered.", trigger: "po.ordered", conditions: [],
    actions: [{ type: "set_project_stage", params: { stage: "Materials Ordered", only_if_before: true } }, { type: "log_activity", params: { subject: "Materials ordered ({{number}})" } }], active: true },
  { name: "Materials received → update project", description: "When a purchase order is fully received, set the project to Materials Delivered.", trigger: "po.received", conditions: [],
    actions: [{ type: "set_project_stage", params: { stage: "Materials Delivered", only_if_before: true } }], active: true },
  { name: "Installation reminder to customer", description: "Before a scheduled installation, notify the customer (email/SMS integration ready).", trigger: "event.upcoming_installation", conditions: [],
    actions: [{ type: "send_email", params: { to: "customer", subject: "Your installation is scheduled for {{date}}", body: "Hi {{customer}}, our crew arrives {{date}}." } }, { type: "log_activity", params: { subject: "Installation reminder sent for {{date}}" } }], active: true },
  { name: "Final invoice reminder on completion", description: "When a project is completed, create the final invoice reminder.", trigger: "project.completed", conditions: [],
    actions: [{ type: "create_final_invoice", params: {} }, { type: "notify", params: { roles: "office_manager,owner", title: "Final invoice ready: {{name}}", body: "Project completed — send the final invoice." } }], active: true },
  { name: "Overdue invoice alert", description: "When an invoice becomes overdue, notify the office.", trigger: "invoice.overdue", conditions: [],
    actions: [{ type: "notify", params: { roles: "office_manager,owner", title: "Invoice overdue: {{number}}", body: "{{customer}} · balance {{balance}}", kind: "danger" } }], active: true },
  { name: "Change order approved", description: "When a customer approves a change order, notify the PM.", trigger: "change_order.approved", conditions: [],
    actions: [{ type: "notify", params: { roles: "project_manager,owner", title: "Change order approved: {{number}}", body: "{{amount}} added to contract" } }], active: true },
  { name: "Portal message received", description: "When a customer sends a message in the portal, notify the office.", trigger: "portal.message", conditions: [],
    actions: [{ type: "notify", params: { roles: "office_manager,project_manager,owner", title: "New message from {{customer}}", body: "{{body}}" } }], active: true },
];

export async function buildSeed(opts: { demo: boolean; ownerEmail?: string; ownerPassword?: string; ownerName?: string; companyName?: string }): Promise<Snapshot> {
  const S = emptySnapshot(TABLES);
  const now = new Date().toISOString();
  const today = todayISO();
  const d = (off: number) => addDaysISO(today, off);
  const dt = (off: number, h: number, m = 0) => {
    const x = new Date(d(off) + "T00:00:00");
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const ts = (off: number) => dt(off, 10);
  const push = <T extends keyof Snapshot>(t: T, row: Record<string, unknown>) => {
    const full = { id: nid(), created_at: now, ...row };
    (S[t] as unknown as Record<string, unknown>[]).push(full);
    return full as unknown as Snapshot[T][number];
  };

  // ----- settings & roles
  const cs = settings();
  if (opts.companyName) cs.name = opts.companyName;
  const company = push("company_settings", cs as never);
  const roles: Record<string, ID> = {};
  for (const r of DEFAULT_ROLES) roles[r.key] = push("roles", { ...r, system: true }).id;

  const pw = await hashPassword(opts.ownerPassword || "stoneline");
  const people: { key: string; name: string; email: string; title: string; color: string }[] = opts.demo
    ? [
        { key: "owner", name: "Marco Reyes", email: "owner@stoneline.demo", title: "Owner", color: "#b08a48" },
        { key: "office_manager", name: "Dana Whitfield", email: "office@stoneline.demo", title: "Office Manager", color: "#4f7190" },
        { key: "sales_rep", name: "Luis Ortega", email: "sales@stoneline.demo", title: "Sales Consultant", color: "#4f8a5e" },
        { key: "project_manager", name: "Priya Shah", email: "pm@stoneline.demo", title: "Project Manager", color: "#8a5a9e" },
        { key: "estimator", name: "Ethan Cole", email: "estimator@stoneline.demo", title: "Senior Estimator", color: "#c0583d" },
        { key: "field_employee", name: "Tomas Vega", email: "field@stoneline.demo", title: "Lead Tile Setter", color: "#3e5a74" },
        { key: "subcontractor", name: "Kevin Park", email: "sub@stoneline.demo", title: "Stone Fabricator (Sub)", color: "#675f54" },
      ]
    : [{ key: "owner", name: opts.ownerName || "Owner", email: opts.ownerEmail || "owner@company.com", title: "Owner", color: "#b08a48" }];
  const P: Record<string, ID> = {};
  for (const p of people) {
    P[p.key] = push("profiles", { full_name: p.name, email: p.email, phone: "(512) 555-01" + String(10 + Object.keys(P).length), role_id: roles[p.key], title: p.title, color: p.color, active: true, password_hash: pw }).id;
  }

  const stages = PIPELINE.map((s, i) => push("pipeline_stages", { ...s, position: i }));
  const stage = (name: string) => stages.find((s) => s.name === name)!.id;

  const catalog = CATALOG.map((c) => push("catalog_items", { ...c, active: true })) as CatalogItem[];
  const cat = (name: string) => {
    const c = catalog.find((x) => x.name === name);
    if (!c) throw new Error("catalog item missing: " + name);
    return c;
  };
  const tplItem = (name: string, quantity: number) => {
    const c = cat(name);
    return {
      category: c.category, section: c.section, name: c.name, description: c.description, quantity, unit: c.unit,
      material_cost: c.material_cost, labor_cost: c.labor_cost, markup: c.markup, unit_price: unitPriceFrom(c.material_cost, c.labor_cost, c.markup),
      price_override: false, taxable: true, optional: false,
    };
  };

  push("estimate_templates", { name: "Walk-in shower remodel", category: "tile", description: "Demo to finish: waterproofed walk-in shower with niche.", exclusions: DEFAULT_EXCLUSIONS, terms: DEFAULT_TERMS,
    items: [tplItem("Tile demolition & haul-off", 120), tplItem("Shower pan (mortar bed / pre-slope)", 1), tplItem("Waterproofing membrane", 110), tplItem("Shower wall tile installation", 95), tplItem("Floor tile installation", 40), tplItem("Shower niche", 1), tplItem("Grout & finishing", 135), tplItem("Tile material allowance", 145)] });
  push("estimate_templates", { name: "Kitchen backsplash", category: "tile", description: "Standard 30 sq ft backsplash.", exclusions: DEFAULT_EXCLUSIONS, terms: DEFAULT_TERMS,
    items: [tplItem("Backsplash tile installation", 30), tplItem("Tile material allowance", 33), tplItem("Grout & finishing", 30), tplItem("Metal edge trim (Schluter)", 12)] });
  push("estimate_templates", { name: "Whole-home LVP", category: "flooring", description: "LVP throughout main living areas with baseboards.", exclusions: DEFAULT_EXCLUSIONS, terms: DEFAULT_TERMS,
    items: [tplItem("Floor demolition (carpet/vinyl/laminate)", 1200), tplItem("Subfloor preparation", 1200), tplItem("Luxury vinyl plank (LVP) installation", 1200), tplItem("LVP material", 1320), tplItem("Baseboard installation", 380), tplItem("Transition strips / thresholds", 6)] });
  push("estimate_templates", { name: "Kitchen cabinets + quartz", category: "cabinets", description: "Full kitchen cabinet replacement with quartz tops.", exclusions: DEFAULT_EXCLUSIONS, terms: DEFAULT_TERMS,
    items: [tplItem("Cabinet removal & disposal", 28), tplItem("Shaker cabinet package (per box)", 18), tplItem("Kitchen base cabinet installation", 10), tplItem("Kitchen wall cabinet installation", 8), tplItem("Hardware installation (knobs & pulls)", 32), tplItem("Countertop demolition & removal", 55), tplItem("Quartz countertop (group 2)", 55), tplItem("Countertop fabrication & templating", 55), tplItem("Countertop installation", 55), tplItem("Undermount sink cutout", 1), tplItem("Faucet hole", 2)] });
  push("estimate_templates", { name: "Countertop replacement", category: "countertops", description: "Remove and replace kitchen countertops.", exclusions: DEFAULT_EXCLUSIONS, terms: DEFAULT_TERMS,
    items: [tplItem("Countertop demolition & removal", 45), tplItem("Quartz countertop (group 2)", 45), tplItem("Countertop fabrication & templating", 45), tplItem("Countertop installation", 45), tplItem("Undermount sink cutout", 1), tplItem("Faucet hole", 1), tplItem("Plumbing disconnect / reconnect", 1)] });

  for (const a of DEFAULT_AUTOMATIONS) push("automations", { ...a, run_count: 0, last_run_at: null });

  if (!opts.demo) return S;

  // ======================= DEMO BUSINESS =======================
  const R = rng(42);

  const emp = (name: string, kind: "employee" | "subcontractor", position: string, specialty: ServiceCategory[], rate_type: string, rate: number, extra: Record<string, unknown> = {}) =>
    push("employees", { name, kind, company: kind === "subcontractor" ? `${name.split(" ")[1]} Contracting LLC` : "", position, specialty, phone: `(512) 555-02${10 + S.employees.length}`, email: name.toLowerCase().replace(" ", ".") + "@crew.example", rate_type, rate, availability: [1, 2, 3, 4, 5], insurance_expires: null, license_number: "", license_expires: null, notes: "", active: true, profile_id: null, ...extra });
  const tomas = emp("Tomas Vega", "employee", "Lead Tile Setter", ["tile"], "hourly", 38, { profile_id: P.field_employee });
  const rafael = emp("Rafael Moreno", "employee", "Tile Setter", ["tile"], "hourly", 31);
  const jake = emp("Jake Turner", "employee", "Flooring Installer", ["flooring"], "hourly", 30);
  const andre = emp("Andre Lewis", "employee", "Flooring Installer", ["flooring", "tile"], "hourly", 28, { availability: [1, 2, 3, 4, 5, 6] });
  const sam = emp("Sam Whitaker", "employee", "Cabinet Installer", ["cabinets"], "hourly", 34);
  const kevin = emp("Kevin Park", "subcontractor", "Stone Fabricator", ["countertops"], "per_sqft", 22, { profile_id: P.subcontractor, insurance_expires: d(18), license_number: "FAB-22931", license_expires: d(140) });
  const nina = emp("Nina Alvarez", "subcontractor", "Plumber", ["general"], "contract", 185, { insurance_expires: d(210), license_number: "M-38877", license_expires: d(9) });
  const omar = emp("Omar Haddad", "employee", "Helper / Demo", ["general"], "hourly", 22, { availability: [1, 2, 3, 4, 5, 6] });

  const crewA = push("crews", { name: "Tile Crew A", color: "#b08a48", lead_employee_id: tomas.id, member_ids: [tomas.id, rafael.id, omar.id], specialty: "tile", active: true });
  const crewF = push("crews", { name: "Flooring Crew", color: "#4f7190", lead_employee_id: jake.id, member_ids: [jake.id, andre.id], specialty: "flooring", active: true });
  const crewC = push("crews", { name: "Cabinet & Millwork", color: "#4f8a5e", lead_employee_id: sam.id, member_ids: [sam.id, omar.id], specialty: "cabinets", active: true });
  const crewS = push("crews", { name: "Stone Fabrication", color: "#8a5a9e", lead_employee_id: kevin.id, member_ids: [kevin.id], specialty: "countertops", active: true });

  const sup = (name: string, contact: string, categories: string[], terms: string) =>
    push("suppliers", { name, contact_name: contact, phone: `(512) 555-03${10 + S.suppliers.length}`, email: `orders@${name.toLowerCase().replace(/[^a-z]/g, "")}.example`, address: "Austin, TX", categories, account_number: "ACCT-" + (4400 + S.suppliers.length * 17), payment_terms: terms, notes: "" });
  const sTile = sup("Coastal Tile Supply", "Renee Ortiz", ["Tile", "Grout", "Adhesives"], "Net 30");
  const sStone = sup("Summit Stone Distributors", "Gary Lund", ["Countertops"], "50% deposit, balance on pickup");
  const sWood = sup("Heritage Hardwood Co.", "Molly Chen", ["Flooring", "Underlayment"], "Net 15");
  const sCab = sup("Keystone Cabinetry", "Brian Foss", ["Cabinets"], "Net 30");
  const sPro = sup("ProSet Install Supply", "Alicia Grant", ["Installation Materials", "Adhesives", "Grout", "Tools & Supplies"], "Net 30");

  const inv = (name: string, supplier: ID, category: string, sku: string, manufacturer: string, color: string, finish: string, size: string, quantity: number, unit: string, cost: number, price: number, location: string, reorder_level: number) =>
    push("inventory_items", { name, supplier_id: supplier, category, sku, manufacturer, color, finish, size, quantity, unit, cost, price, location, reorder_level });
  const iPorc = inv("Calacatta Gold Porcelain 24x48", sTile.id, "Tile", "CT-CAL2448", "Daltile", "White / Gold", "Polished", "24x48", 420, "SQFT", 6.8, 9.5, "Warehouse A · Bay 3", 150);
  const iZell = inv("Zellige Handmade 4x4", sTile.id, "Tile", "CT-ZEL44W", "Clé", "Weathered White", "Glossy", "4x4", 64, "SQFT", 18.5, 26, "Warehouse A · Bay 5", 80);
  const iHex = inv("Carrara Hex Mosaic 2\"", sTile.id, "Tile", "CT-HEX2CR", "MSI", "Carrara", "Honed", "12x12 sheet", 85, "SQFT", 11.2, 16, "Warehouse A · Bay 5", 40);
  const iLvp = inv("Coastal Oak LVP 7x48 20mil", sWood.id, "Flooring", "HW-LVP-CO7", "COREtec", "Coastal Oak", "Matte", "7x48", 1650, "SQFT", 3.1, 4.4, "Warehouse B · Rack 1", 500);
  const iOak = inv("White Oak Engineered 7.5\"", sWood.id, "Flooring", "HW-EWO75", "Hallmark", "Natural", "Wire-brushed", "7.5\" x RL", 380, "SQFT", 6.25, 8.9, "Warehouse B · Rack 2", 300);
  inv("Shaker Base Cabinet 36\" White", sCab.id, "Cabinets", "KC-SB36-W", "Keystone", "Bright White", "Painted", "36\"W", 6, "EA", 410, 575, "Warehouse C", 4);
  inv("Shaker Wall Cabinet 30x36 White", sCab.id, "Cabinets", "KC-SW3036-W", "Keystone", "Bright White", "Painted", "30x36", 3, "EA", 285, 399, "Warehouse C", 4);
  const iQuartz = inv("Quartz Slab — Statuario Venato 3cm", sStone.id, "Countertops", "SS-QSV3", "Caesarstone", "Statuario", "Polished", "126x63", 4, "SLAB", 1850, 0, "Yard · Rack 2", 2);
  const iThin = inv("Polymer-Modified Thinset (LFT)", sPro.id, "Adhesives", "PS-LFT50", "Laticrete", "Gray", "", "50 lb", 42, "BAG", 28, 39, "Warehouse A · Shelf 1", 20);
  const iGrout = inv("Sanded Grout — Bright White", sPro.id, "Grout", "PS-GR-BW", "Mapei", "Bright White", "", "25 lb", 9, "BAG", 22, 31, "Warehouse A · Shelf 2", 12);
  inv("Epoxy Grout — Warm Gray", sPro.id, "Grout", "PS-EPX-WG", "Laticrete", "Warm Gray", "", "1 gal", 6, "UNIT", 74, 99, "Warehouse A · Shelf 2", 4);
  const iDitra = inv("DITRA Uncoupling Membrane", sPro.id, "Underlayment", "PS-DITRA", "Schluter", "Orange", "", "54 sq ft roll", 11, "ROLL", 118, 165, "Warehouse A · Shelf 3", 6);
  inv("Underlayment 3mm w/ Vapor Barrier", sWood.id, "Underlayment", "HW-UL3", "FloorMuffler", "", "", "100 sq ft roll", 14, "ROLL", 42, 60, "Warehouse B · Rack 3", 8);
  const iMemb = inv("RedGard Waterproofing", sPro.id, "Installation Materials", "PS-RG35", "Custom", "Pink", "", "3.5 gal", 3, "PAIL", 128, 175, "Warehouse A · Shelf 1", 4);
  inv("Leveling Clip System (500 pk)", sPro.id, "Tools & Supplies", "PS-LCS500", "Raimondi", "", "", "500 ct", 7, "BOX", 64, 0, "Tool Room", 3);
  inv("Schluter Jolly Trim — Brushed Nickel", sPro.id, "Installation Materials", "PS-JOL-BN", "Schluter", "Brushed Nickel", "", "8 ft", 26, "EA", 17, 26, "Warehouse A · Shelf 4", 15);

  // ----- customers
  const sources = ["Google Search", "Referral", "Houzz", "Instagram", "Website", "Home Show", "Builder Partner", "Repeat Customer", "Yelp"];
  const custData: [string, string, string, string, string, string][] = [
    ["Olivia", "Bennett", "Residential", "Westlake Hills", "Referral", ""],
    ["Daniel", "Kim", "Residential", "Tarrytown", "Google Search", ""],
    ["Sofia", "Martinez", "Residential", "Mueller", "Houzz", ""],
    ["Graham", "Whitfield", "Builder", "Lakeway", "Builder Partner", "Whitfield Custom Homes"],
    ["Amelia", "Hart", "Residential", "Travis Heights", "Instagram", ""],
    ["Marcus", "Johnson", "Residential", "Circle C", "Website", ""],
    ["Hannah", "Lee", "Residential", "Bouldin Creek", "Repeat Customer", ""],
    ["Riverside Property", "Group", "Commercial", "East Austin", "Referral", "Riverside Property Group"],
    ["Ethan", "Brooks", "Residential", "Round Rock", "Yelp", ""],
    ["Chloe", "Nguyen", "Residential", "Cedar Park", "Home Show", ""],
    ["James", "O'Connor", "Residential", "Hyde Park", "Google Search", ""],
    ["Isabella", "Rossi", "Residential", "Rollingwood", "Houzz", ""],
    ["Benjamin", "Clarke", "Contractor", "Pflugerville", "Referral", "Clarke Renovations"],
    ["Natalie", "Park", "Residential", "Zilker", "Website", ""],
  ];
  const streets = ["Rockcliff Rd", "Windsor Rd", "Aldrich St", "Lohmans Crossing", "Alta Vista Ave", "Escarpment Blvd", "Kinney Ave", "E 6th St", "Sendero Hills Pkwy", "Brushy Creek Rd", "Avenue F", "Pickwick Ln", "Dessau Rd", "Bluebonnet Ln"];
  const customers = custData.map(([f, l, type, area, src, company], i) => {
    const addr = `${1200 + i * 137} ${streets[i]}, ${area}, Austin, TX 787${String(i + 10).padStart(2, "0")}`;
    return push("customers", {
      first_name: f, last_name: l, company, type, phone: `(512) 555-${String(1100 + i * 37).slice(0, 4)}`,
      email: `${f.toLowerCase().replace(/\s/g, "")}.${l.toLowerCase().replace(/[^a-z]/g, "")}@mail.example`,
      billing_address: addr, project_address: addr, lead_source: src || sources[i % sources.length],
      notes: i === 0 ? "Prefers text messages. Two dogs — keep gate closed." : i === 3 ? "Builder partner: 4–6 spec homes per year. Net 30 terms." : "",
      tags: i === 3 || i === 12 ? ["trade"] : i === 6 ? ["repeat", "vip"] : [],
      portal_token: (nid() + nid()).replace(/-/g, "").slice(0, 48), owner_id: P.sales_rep,
      created_at: ts(-420 + i * 25),
    });
  });
  const C = (i: number) => customers[i];
  const fullName = (i: number) => `${C(i).first_name} ${C(i).last_name}`;

  // ----- leads
  const leadDefs: [number, string, ServiceCategory[], string, string, number, number, number | null][] = [
    // custIdx, title, services, stage, priority, value, createdDaysAgo, followUpOffset
    [0, "Primary bath remodel + walk-in shower", ["tile", "cabinets", "countertops"], "Approved / Won", "high", 38500, 52, null],
    [1, "Whole-home engineered hardwood", ["flooring"], "Approved / Won", "medium", 24800, 44, null],
    [2, "Kitchen cabinets & quartz countertops", ["cabinets", "countertops", "tile"], "Approved / Won", "high", 46200, 38, null],
    [3, "Spec home #14 — tile & LVP package", ["tile", "flooring"], "Approved / Won", "high", 31800, 61, null],
    [4, "Guest bath tile refresh", ["tile"], "Estimate Sent", "medium", 9800, 12, 2],
    [5, "Living areas LVP + baseboards", ["flooring"], "Estimate in Progress", "medium", 14200, 8, 1],
    [6, "Kitchen backsplash + countertop swap", ["tile", "countertops"], "Approved / Won", "medium", 15400, 30, null],
    [7, "Office lobby porcelain flooring", ["tile"], "Site Visit Completed", "high", 52000, 6, 0],
    [8, "Laundry room & mudroom tile", ["tile"], "Consultation Scheduled", "low", 6500, 4, 3],
    [9, "Kitchen remodel — full", ["cabinets", "countertops", "tile", "flooring"], "Contacted", "urgent", 68000, 2, 0],
    [10, "Hall bath vanity + countertop", ["cabinets", "countertops"], "New Lead", "medium", 7800, 1, 1],
    [11, "Marble master vanity tops", ["countertops"], "Follow-Up", "medium", 11200, 21, -1],
    [12, "Sub: 3 bathrooms tile install", ["tile"], "Lost", "medium", 18000, 35, null],
    [13, "Stair treads + upstairs hardwood", ["flooring"], "New Lead", "high", 16500, 0, 2],
  ];
  const leads = leadDefs.map(([ci, title, services, st, priority, value, ago, fu]) =>
    push("leads", {
      customer_id: C(ci).id, title, services, stage_id: stage(st), priority, source: C(ci).lead_source,
      assigned_to: ci % 3 === 0 ? P.estimator : P.sales_rep, estimated_value: value, follow_up_date: fu === null ? null : d(fu),
      lost_reason: st === "Lost" ? "Price — went with lower bid" : "", description: "",
      status: st === "Approved / Won" ? "won" : st === "Lost" ? "lost" : "open",
      converted_at: st === "Approved / Won" ? ts(-ago + 10) : null, inquiry_payload: ci === 13 ? { form: "Website contact form", message: "Looking to replace carpet on stairs with oak treads and do the upstairs bedrooms." } : null,
      created_at: ts(-ago),
    }),
  );

  // ----- estimates (with real line items)
  let estNo = 1001, prjNo = 501, invNo = 2001, coNo = 101, poNo = 3001;
  const makeEstimate = (leadIdx: number, title: string, status: string, ago: number, items: [string, number][], extra: Record<string, unknown> = {}) => {
    const lead = leads[leadIdx];
    const est = push("estimates", {
      number: `EST-${estNo++}`, customer_id: lead.customer_id, lead_id: lead.id, project_id: null, title, status,
      issue_date: d(-ago), valid_until: d(-ago + 30), tax_rate: company.tax_rate, discount_type: "percent", discount_value: 0,
      intro: `Thank you for the opportunity to quote your project. This proposal covers all labor and materials described below, installed to manufacturer specifications by our in-house crews.`,
      customer_notes: "", exclusions: DEFAULT_EXCLUSIONS, terms: DEFAULT_TERMS, payment_schedule: DEFAULT_SCHEDULE,
      timeline: [{ id: "t1", label: "Material ordering & lead time", days: 10 }, { id: "t2", label: "Demolition & preparation", days: 2 }, { id: "t3", label: "Installation", days: 6 }, { id: "t4", label: "Finishing & walkthrough", days: 1 }],
      sent_at: status === "draft" ? null : ts(-ago), responded_at: ["approved", "rejected"].includes(status) ? ts(-ago + 4) : null,
      customer_response: "", signed_name: status === "approved" ? fullName(customers.findIndex((c) => c.id === lead.customer_id)) : "", created_by: P.estimator, created_at: ts(-ago),
      ...extra,
    });
    items.forEach(([name, qty], pos) => {
      const c = cat(name);
      push("estimate_items", {
        estimate_id: est.id, category: c.category, section: c.section, name: c.name, description: c.description, quantity: qty, unit: c.unit,
        material_cost: c.material_cost, labor_cost: c.labor_cost, markup: c.markup, unit_price: unitPriceFrom(c.material_cost, c.labor_cost, c.markup),
        price_override: false, taxable: true, optional: false, position: pos,
      });
    });
    return est;
  };
  const itemsOf = (estId: ID) => S.estimate_items.filter((i) => i.estimate_id === estId) as EstimateItem[];

  const e0 = makeEstimate(0, "Primary Bathroom Remodel", "approved", 45, [
    ["Tile demolition & haul-off", 165], ["Floor preparation & leveling", 70], ["Shower pan (mortar bed / pre-slope)", 1], ["Waterproofing membrane", 140],
    ["Shower wall tile installation", 120], ["Large format tile (24\"+) floor", 70], ["Linear drain installation", 1], ["Shower niche", 2], ["Grout & finishing", 190],
    ["Tile material allowance", 210], ["Bathroom vanity installation", 1], ["Vanity cabinet 36\"", 2], ["Quartz countertop (group 2)", 22], ["Countertop fabrication & templating", 22],
    ["Countertop installation", 22], ["Undermount sink cutout", 2], ["Faucet hole", 2], ["Plumbing disconnect / reconnect", 2], ["Project management & protection", 1],
  ]);
  const e1 = makeEstimate(1, "Whole-Home Engineered Hardwood", "approved", 38, [
    ["Floor demolition (carpet/vinyl/laminate)", 1450], ["Subfloor preparation", 1450], ["Underlayment / moisture barrier", 1450], ["Engineered hardwood installation", 1450],
    ["Engineered hardwood material", 1595], ["Baseboard installation", 420], ["Transition strips / thresholds", 7], ["Dumpster / debris disposal", 1],
  ]);
  const e2 = makeEstimate(2, "Kitchen Cabinets, Quartz & Backsplash", "approved", 30, [
    ["Cabinet removal & disposal", 32], ["Shaker cabinet package (per box)", 21], ["Kitchen base cabinet installation", 12], ["Kitchen wall cabinet installation", 9],
    ["Crown molding & light rail", 38], ["Hardware installation (knobs & pulls)", 38], ["Pull-out / roll-out accessory install", 4], ["Countertop demolition & removal", 62],
    ["Quartz countertop (group 2)", 62], ["Countertop fabrication & templating", 62], ["Countertop installation", 62], ["Undermount sink cutout", 1], ["Faucet hole", 2],
    ["Waterfall edge", 1], ["Backsplash tile installation", 38], ["Tile material allowance", 42], ["Grout & finishing", 38], ["Plumbing disconnect / reconnect", 1],
  ]);
  const e3 = makeEstimate(3, "Spec Home #14 — Tile & LVP Package", "approved", 55, [
    ["Floor preparation & leveling", 400], ["Floor tile installation", 410], ["Shower wall tile installation", 240], ["Waterproofing membrane", 260], ["Shower pan (mortar bed / pre-slope)", 2],
    ["Backsplash tile installation", 34], ["Grout & finishing", 690], ["Luxury vinyl plank (LVP) installation", 1850], ["Underlayment / moisture barrier", 1850], ["Baseboard installation", 610],
  ], { tax_rate: 0, discount_type: "percent", discount_value: 5 });
  const e6 = makeEstimate(6, "Backsplash & Countertop Replacement", "approved", 24, [
    ["Countertop demolition & removal", 48], ["Quartz countertop (group 2)", 48], ["Countertop fabrication & templating", 48], ["Countertop installation", 48], ["Undermount sink cutout", 1],
    ["Faucet hole", 1], ["Backsplash tile installation", 32], ["Tile material allowance", 35], ["Custom pattern premium (herringbone/chevron)", 32], ["Grout & finishing", 32],
  ]);
  makeEstimate(4, "Guest Bath Tile Refresh", "sent", 5, [
    ["Tile demolition & haul-off", 85], ["Waterproofing membrane", 70], ["Shower wall tile installation", 70], ["Floor tile installation", 38], ["Grout & finishing", 108], ["Tile material allowance", 120],
  ]);
  makeEstimate(5, "Living Areas LVP + Baseboards", "draft", 1, [
    ["Floor demolition (carpet/vinyl/laminate)", 820], ["Subfloor preparation", 820], ["Luxury vinyl plank (LVP) installation", 820], ["LVP material", 900], ["Baseboard installation", 260],
  ]);
  makeEstimate(11, "Marble Master Vanity Tops", "changes_requested", 18, [
    ["Countertop demolition & removal", 26], ["Marble countertop", 26], ["Countertop fabrication & templating", 26], ["Countertop installation", 26], ["Undermount sink cutout", 2], ["Faucet hole", 6],
  ], { customer_response: "Can we price quartzite instead of marble, and add a 4\" splash?" });
  makeEstimate(12, "3 Bathrooms Tile Install (Labor Only)", "rejected", 32, [
    ["Shower wall tile installation", 300], ["Floor tile installation", 150], ["Grout & finishing", 450],
  ], { customer_response: "Went with another installer on price." });

  // ----- projects from approved estimates
  const mkProject = (est: typeof e0, leadIdx: number, name: string, stageName: Project["stage"], crew: ID, startOff: number | null, endOff: number | null, members: ID[], health: Project["health"] = "on_track") => {
    const items = itemsOf(est.id);
    const t = estimateTotals(est, items);
    const sched = DEFAULT_SCHEDULE.map((m) => ({ ...m, invoice_id: null as ID | null }));
    const p = push("projects", {
      number: `PRJ-${prjNo++}`, name, customer_id: est.customer_id, estimate_id: est.id, lead_id: leads[leadIdx].id,
      address: customers.find((c) => c.id === est.customer_id)!.project_address, manager_id: P.project_manager, crew_id: crew, member_ids: members,
      services: leads[leadIdx].services, contract_value: t.total, original_contract_value: t.total, estimated_cost: t.totalCost, stage: stageName, health,
      start_date: startOff === null ? null : d(startOff), end_date: endOff === null ? null : d(endOff), completed_at: null, notes: "",
      payment_schedule: sched, signed_name: est.signed_name, signed_at: est.responded_at, created_at: est.responded_at,
    }) as Project;
    (est as { project_id: ID | null }).project_id = p.id;
    return p;
  };
  const p0 = mkProject(e0, 0, "Bennett Primary Bath", "In Progress", crewA.id, -6, 8, [tomas.id, rafael.id, omar.id]);
  const p1 = mkProject(e1, 1, "Kim Residence Hardwood", "Scheduled", crewF.id, 3, 9, [jake.id, andre.id]);
  const p2 = mkProject(e2, 2, "Martinez Kitchen", "Materials Ordered", crewC.id, 12, 24, [sam.id, omar.id, kevin.id], "at_risk");
  const p3 = mkProject(e3, 3, "Whitfield Spec Home #14", "Quality Inspection", crewA.id, -24, -2, [tomas.id, rafael.id, jake.id, andre.id]);
  const p6 = mkProject(e6, 6, "Lee Kitchen Backsplash & Tops", "Deposit Received", crewS.id, 19, 22, [kevin.id, rafael.id]);

  // ----- invoices & payments
  const mkInvoice = (p: Project, kind: Invoice["kind"], milestoneIdx: number | null, status: Invoice["status"], issueOff: number, lines: { description: string; amount: number }[], taxRate = 0) => {
    const issue = d(issueOff);
    const invRow = push("invoices", {
      number: `INV-${invNo++}`, customer_id: p.customer_id, project_id: p.id, milestone_id: milestoneIdx === null ? null : p.payment_schedule[milestoneIdx].id, kind, status,
      issue_date: issue, due_date: addDaysISO(issue, 15), items: lines.map((l, k) => ({ id: `l${k}`, description: l.description, quantity: 1, unit: "LS", unit_price: l.amount, taxable: false })),
      tax_rate: taxRate, discount: 0, notes: "", sent_at: status === "draft" ? null : ts(issueOff), external_ref: null, created_at: ts(issueOff),
    }) as Invoice;
    if (milestoneIdx !== null) p.payment_schedule[milestoneIdx].invoice_id = invRow.id;
    return invRow;
  };
  const pay = (invRow: Invoice, amount: number, off: number, method = "check") =>
    push("payments", { invoice_id: invRow.id, customer_id: invRow.customer_id, project_id: invRow.project_id, amount, method, date: d(off), reference: method === "check" ? `#${1000 + Math.floor(R() * 8999)}` : "", notes: "", processor: "manual", external_ref: null, created_at: ts(off) });
  const ms = (p: Project) => milestoneAmounts(p.contract_value, p.payment_schedule.map((m) => m.percent));

  {
    const a = ms(p0);
    const i1 = mkInvoice(p0, "deposit", 0, "paid", -40, [{ description: "Deposit — 30% of contract (Primary Bathroom Remodel)", amount: a[0] }]); pay(i1, a[0], -38);
    const i2 = mkInvoice(p0, "progress", 1, "paid", -9, [{ description: "Progress payment — material delivery (40%)", amount: a[1] }]); pay(i2, a[1], -7, "ach");
  }
  {
    const a = ms(p1);
    const i1 = mkInvoice(p1, "deposit", 0, "paid", -33, [{ description: "Deposit — 30% of contract (Engineered Hardwood)", amount: a[0] }]); pay(i1, a[0], -31, "card");
    mkInvoice(p1, "progress", 1, "sent", -3, [{ description: "Progress payment — material delivery (40%)", amount: a[1] }]);
  }
  {
    const a = ms(p2);
    const i1 = mkInvoice(p2, "deposit", 0, "paid", -26, [{ description: "Deposit — 30% of contract (Kitchen)", amount: a[0] }]); pay(i1, a[0], -24, "ach");
  }
  {
    const a = ms(p3);
    const i1 = mkInvoice(p3, "deposit", 0, "paid", -50, [{ description: "Deposit — 30% (Spec Home #14)", amount: a[0] }]); pay(i1, a[0], -45);
    const i2 = mkInvoice(p3, "progress", 1, "overdue", -28, [{ description: "Progress — material delivery (40%)", amount: a[1] }]); pay(i2, round2(a[1] / 2), -16);
  }
  {
    const a = ms(p6);
    const i1 = mkInvoice(p6, "deposit", 0, "paid", -20, [{ description: "Deposit — 30% (Backsplash & Countertops)", amount: a[0] }]); pay(i1, a[0], -18, "zelle");
  }

  // ----- historical closed projects for 12-month analytics
  const histNames = ["Lakeline Townhome Floors", "Barton Creek Shower", "Crestview Kitchen Tops", "Allandale Bath Tile", "Brentwood LVP", "Westgate Vanities", "Onion Creek Kitchen", "Del Valle Spec Tile", "Highland Backsplash", "Govalle Flooring", "Shoal Creek Master Bath", "Avery Ranch Cabinets", "Steiner Ranch Quartz", "Windsor Park Hardwood", "Manchaca Bath Remodel", "Dripping Springs Kitchen", "Leander Spec Floors", "Bee Cave Shower Remodel"];
  const svcFor: ServiceCategory[][] = [["flooring"], ["tile"], ["countertops"], ["tile"], ["flooring"], ["cabinets", "countertops"], ["cabinets", "countertops", "tile"], ["tile"], ["tile"], ["flooring"], ["tile", "cabinets"], ["cabinets"], ["countertops"], ["flooring"], ["tile", "countertops"], ["cabinets", "countertops", "tile"], ["flooring"], ["tile"]];
  histNames.forEach((name, k) => {
    const monthsAgo = 11 - Math.floor((k * 11) / histNames.length);
    const endOff = -monthsAgo * 30 - Math.floor(R() * 20) - 5;
    const ci = Math.floor(R() * customers.length);
    const value = round2(6000 + R() * 34000);
    const costRatio = 0.55 + R() * 0.17;
    const p = push("projects", {
      number: `PRJ-${prjNo++}`, name, customer_id: customers[ci].id, estimate_id: null, lead_id: null, address: customers[ci].project_address,
      manager_id: P.project_manager, crew_id: [crewA.id, crewF.id, crewC.id, crewS.id][k % 4], member_ids: [], services: svcFor[k],
      contract_value: value, original_contract_value: value, estimated_cost: round2(value * 0.6), stage: "Closed", health: "on_track",
      start_date: d(endOff - 14), end_date: d(endOff), completed_at: ts(endOff), notes: "", payment_schedule: DEFAULT_SCHEDULE.map((m) => ({ ...m, invoice_id: null })),
      signed_name: fullName(ci), signed_at: ts(endOff - 30), created_at: ts(endOff - 30),
    }) as Project;
    const a = ms(p);
    p.payment_schedule.forEach((m, mi) => {
      const off = endOff - 30 + mi * 15 + (mi === 2 ? 2 : 0);
      const ir = mkInvoice(p, mi === 0 ? "deposit" : mi === 1 ? "progress" : "final", mi, "paid", off, [{ description: `${m.label} (${m.percent}%) — ${name}`, amount: a[mi] }]);
      pay(ir, a[mi], off + 3, ["check", "ach", "card", "zelle"][mi % 4]);
    });
    const cost = round2(value * costRatio);
    push("expenses", { project_id: p.id, supplier_id: [sTile.id, sWood.id, sCab.id, sStone.id][k % 4], employee_id: null, purchase_order_id: null, category: "material", description: "Materials — " + name, amount: round2(cost * 0.48), date: d(endOff - 20), due_date: d(endOff - 5), status: "paid", paid_date: d(endOff - 6), reference: "", created_at: ts(endOff - 20) });
    push("expenses", { project_id: p.id, supplier_id: null, employee_id: null, purchase_order_id: null, category: "labor", description: "Crew labor — " + name, amount: round2(cost * 0.4), date: d(endOff), due_date: null, status: "paid", paid_date: d(endOff), reference: "", created_at: ts(endOff) });
    push("expenses", { project_id: p.id, supplier_id: null, employee_id: null, purchase_order_id: null, category: "disposal", description: "Dumpster & disposal", amount: round2(cost * 0.12), date: d(endOff - 10), due_date: null, status: "paid", paid_date: d(endOff - 10), reference: "", created_at: ts(endOff - 10) });
  });

  // ----- expenses & time on active projects
  const expense = (p: Project, category: string, description: string, amount: number, off: number, status: "paid" | "unpaid", supplier: ID | null = null, employee: ID | null = null) =>
    push("expenses", { project_id: p.id, supplier_id: supplier, employee_id: employee, purchase_order_id: null, category, description, amount, date: d(off), due_date: d(off + 30), status, paid_date: status === "paid" ? d(off + 5) : null, reference: "", created_at: ts(off) });
  expense(p0, "material", "Calacatta porcelain, mosaic & setting materials", 3420.5, -10, "paid", sTile.id);
  expense(p0, "material", "Vanities (2) — Keystone", 1280, -9, "unpaid", sCab.id);
  expense(p0, "subcontractor", "Plumbing disconnect/reconnect — N. Alvarez", 370, -5, "unpaid", null, nina.id);
  expense(p0, "disposal", "Dumpster rental", 525, -6, "paid");
  expense(p3, "material", "Tile, thinset & grout — spec home", 6840, -22, "paid", sTile.id);
  expense(p3, "material", "LVP 1,850 sq ft", 5735, -20, "paid", sWood.id);
  expense(p3, "subcontractor", "Shower pan plumbing (2)", 740, -15, "paid", null, nina.id);
  expense(p2, "material", "Cabinet order 50% deposit", 4305, -12, "paid", sCab.id);
  expense(p2, "material", "Quartz slabs deposit", 3700, -11, "unpaid", sStone.id);
  expense(p1, "material", "Engineered white oak 1,595 sq ft", 9968.75, -6, "unpaid", sWood.id);

  const time = (e: { id: ID; rate: number }, p: Project, off: number, hours: number, sqft = 0, notes = "") =>
    push("time_entries", { employee_id: e.id, project_id: p.id, date: d(off), hours, rate: e.rate, cost: round2(hours * e.rate), sqft_completed: sqft, notes, created_at: ts(off) });
  for (let k = -6; k <= -1; k++) {
    if (new Date(d(k) + "T12:00").getDay() % 6 === 0) continue;
    time(tomas, p0, k, 8.5, k > -3 ? 42 : 0, k <= -5 ? "Demo & prep" : "Setting tile");
    time(rafael, p0, k, 8, k > -3 ? 36 : 0);
    if (k <= -4) time(omar, p0, k, 8, 0, "Demolition & haul-off");
  }
  for (let k = -24; k <= -3; k++) {
    if (new Date(d(k) + "T12:00").getDay() % 6 === 0) continue;
    if (k < -12) { time(tomas, p3, k, 8, 55); time(rafael, p3, k, 8, 48); }
    else { time(jake, p3, k, 8, 210); time(andre, p3, k, 8, 190); }
  }

  // ----- tasks, checklists, punch list, updates
  const task = (p: Project, kind: string, title: string, done: boolean, dueOff: number | null, assignee: ID | null, pos: number) =>
    push("project_tasks", { project_id: p.id, kind, title, assignee_id: assignee, due_date: dueOff === null ? null : d(dueOff), done, done_at: done ? ts(-1) : null, position: pos });
  [["Confirm tile selection & grout color with client", true, -12], ["Order vanities & quartz", true, -10], ["Demolition complete", true, -4], ["Flood test shower pan (24h)", true, -2], ["Set shower walls", false, 1], ["Template vanity tops", false, 2], ["Install vanities & tops", false, 5], ["Final clean & walkthrough", false, 8]].forEach(([t, dn, off], k) =>
    task(p0, "task", t as string, dn as boolean, off as number, k < 2 ? P.project_manager : P.field_employee, k));
  ["Floor protection installed", "Water shut-off located", "Dust barrier up", "Photos: before", "Photos: after", "Customer walkthrough signed"].forEach((t, k) => task(p0, "checklist", t, k < 4, null, null, k));
  ["Confirm hardwood acclimation (72h)", "Move-out of furniture confirmed", "Schedule dumpster delivery"].forEach((t, k) => task(p1, "task", t, k === 0, 1 + k, P.project_manager, k));
  ["Cabinet delivery date confirmation", "Template countertops after cabinet install", "Select backsplash tile with client"].forEach((t, k) => task(p2, "task", t, false, 3 + k * 4, P.project_manager, k));
  ["Grout haze in hall bath corner", "Caulk tub/tile transition — bath 2", "Missing quarter round at pantry", "Touch up baseboard nail holes"].forEach((t, k) => task(p3, "punch", t, k === 3, -1 + k, P.field_employee, k));
  const upd = (p: Project, off: number, body: string, vis: boolean, user: ID) => push("project_updates", { project_id: p.id, date: d(off), body, user_id: user, visible_to_customer: vis, file_ids: [], created_at: ts(off) });
  upd(p0, -6, "Demolition started. Existing tile and mortar bed removed; subfloor in good condition.", true, P.field_employee);
  upd(p0, -4, "Shower pan pre-slope and liner installed. Plumbing inspection passed.", true, P.project_manager);
  upd(p0, -2, "Waterproofing applied and flood test passed (24h). Ready for wall tile.", true, P.field_employee);
  upd(p0, -1, "Started setting 24x48 Calacatta on shower walls. Niches framed.", true, P.field_employee);
  upd(p3, -3, "All tile and LVP complete. Punch walk scheduled with builder.", false, P.project_manager);

  // ----- change orders
  push("change_orders", { number: `CO-${coNo++}`, project_id: p0.id, title: "Add heated floor system", reason: "Customer requested radiant heat during demo walkthrough.", status: "approved",
    items: [{ id: "c1", action: "add", description: "Electric radiant floor mat + thermostat", quantity: 70, unit: "SQFT", unit_price: 18.5, material_cost: 9.5, labor_cost: 3.5 }],
    schedule_impact_days: 1, sent_at: ts(-5), approved_at: ts(-4), signed_name: fullName(0), customer_comment: "" });
  p0.contract_value = round2(p0.contract_value + 70 * 18.5);
  p0.estimated_cost = round2(p0.estimated_cost + 70 * 13);
  push("change_orders", { number: `CO-${coNo++}`, project_id: p2.id, title: "Upgrade to quartzite + remove crown molding", reason: "Selection change at slab yard.", status: "sent",
    items: [
      { id: "c1", action: "modify", description: "Upgrade quartz to Taj Mahal quartzite (difference)", quantity: 62, unit: "SQFT", unit_price: 44, material_cost: 34, labor_cost: 0 },
      { id: "c2", action: "remove", description: "Crown molding & light rail", quantity: 38, unit: "LF", unit_price: 21.7, material_cost: 6.5, labor_cost: 9 },
    ], schedule_impact_days: 5, sent_at: ts(-1), approved_at: null, signed_name: "", customer_comment: "" });

  // ----- purchase orders & stock
  const po = (supplier: ID, p: Project | null, status: string, orderOff: number, expOff: number, items: { item: { id: ID; name: string; unit: string; cost: number }; qty: number; received: number }[], deliveredOff: number | null = null) =>
    push("purchase_orders", { number: `PO-${poNo++}`, supplier_id: supplier, project_id: p?.id ?? null, status, order_date: d(orderOff), expected_date: d(expOff), delivered_date: deliveredOff === null ? null : d(deliveredOff), delivery_address: p?.address ?? company.address,
      items: items.map((x, k) => ({ id: `i${k}`, inventory_item_id: x.item.id, name: x.item.name, quantity: x.qty, unit: x.item.unit, unit_cost: x.item.cost, received: x.received })), shipping: 85, tax: 0, notes: "" });
  po(sTile.id, p0, "received", -14, -10, [{ item: iPorc as never, qty: 220, received: 220 }, { item: iHex as never, qty: 45, received: 45 }, { item: iThin as never, qty: 14, received: 14 }], -10);
  po(sStone.id, p2, "ordered", -11, 6, [{ item: iQuartz as never, qty: 3, received: 0 }]);
  po(sWood.id, p1, "partially_received", -6, 1, [{ item: iOak as never, qty: 1595, received: 1200 }]);
  po(sPro.id, null, "draft", 0, 7, [{ item: iGrout as never, qty: 20, received: 0 }, { item: iMemb as never, qty: 6, received: 0 }, { item: iDitra as never, qty: 6, received: 0 }]);
  const move = (item: { id: ID; cost: number }, p: Project | null, type: string, qty: number, off: number, notes = "") =>
    push("stock_movements", { inventory_item_id: item.id, project_id: p?.id ?? null, purchase_order_id: null, type, quantity: qty, unit_cost: item.cost, date: d(off), notes, created_at: ts(off) });
  move(iPorc as never, p0, "allocate", -210, -8, "Primary bath");
  move(iHex as never, p0, "allocate", -40, -8);
  move(iThin as never, p0, "allocate", -10, -6);
  move(iZell as never, null, "damage", -6, -3, "Broken in transit — claim filed");
  move(iLvp as never, p3, "allocate", -1850, -12);

  // ----- measurements
  const meas = (p: Project | null, lead: ID | null, cust: ID, room: string, area_type: string, L: number, W: number, H: number, sqft: number, lf: number, spec: string, extra: Record<string, unknown> = {}) =>
    push("measurements", { project_id: p?.id ?? null, lead_id: lead, customer_id: cust, room, area_type, length: L, width: W, height: H, sqft, lf, units: 0, waste_percent: 10, material_spec: spec,
      install_requirements: "", existing_conditions: "", demolition: "", notes: "", shape: [], file_ids: [], measured_by: P.estimator, measured_on: d(-48), ...extra });
  meas(p0, leads[0].id, p0.customer_id, "Primary Bath — floor", "floor", 10, 7, 0, 70, 34, "Calacatta Gold 24x48 porcelain, 1/16\" grout", { existing_conditions: "Ceramic tile over mortar bed; minor deflection near toilet.", demolition: "Full tile and mortar bed removal.", shape: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 7 }, { x: 0, y: 7 }] });
  meas(p0, leads[0].id, p0.customer_id, "Walk-in shower", "shower", 6, 4, 8, 152, 16, "Calacatta 24x48 walls, 2\" hex floor", { install_requirements: "Linear drain at back wall; 2 niches at 48\" AFF." });
  meas(p0, leads[0].id, p0.customer_id, "Double vanity top", "countertop", 8, 2, 0, 16, 8, "Quartz 3cm, eased edge, 2 undermount sinks", { units: 2 });
  meas(p2, leads[2].id, p2.customer_id, "Kitchen — L-shaped counter", "countertop", 0, 0, 0, 0, 0, "Quartz 3cm with waterfall island", { shape: [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 2.1 }, { x: 2.1, y: 2.1 }, { x: 2.1, y: 11 }, { x: 0, y: 11 }], sqft: 0, lf: 0 });
  meas(null, leads[7].id, C(7).id, "Lobby", "floor", 42, 28, 0, 1176, 140, "Porcelain 24x24 — client selection pending", { existing_conditions: "VCT over concrete; moisture test required." });
  // fix computed area for drawn shape
  for (const m of S.measurements) {
    if (m.shape.length >= 3) {
      let a = 0, per = 0;
      for (let k = 0; k < m.shape.length; k++) {
        const j = (k + 1) % m.shape.length;
        a += m.shape[k].x * m.shape[j].y - m.shape[j].x * m.shape[k].y;
        per += Math.hypot(m.shape[j].x - m.shape[k].x, m.shape[j].y - m.shape[k].y);
      }
      m.sqft = round2(Math.abs(a) / 2);
      m.lf = round2(per);
    }
  }

  // ----- countertop drawing (CAD-style quote) for the Martinez kitchen
  {
    const quartz = catalog.find((c) => c.name === "Quartz countertop (group 2)");
    const uId = nid(), islandId = nid();
    push("countertop_quotes", {
      name: "Martinez Kitchen", customer_id: e2.customer_id, lead_id: leads[2].id, estimate_id: null, status: "draft", step: 1,
      counters: [
        { id: uId, label: "Perimeter", kind: "u", x: 0, y: 0, rot: 0, flip: false, island: false,
          p: { length: 169.5, depth: 25.5, legL: 55.25, legR: 95.5, depthL: 25.5, depthR: 25.5 },
          edges: { 0: { wall: true, splash: "4in" }, 1: { wall: true, splash: "4in" }, 7: { wall: true, splash: "4in" }, 6: { curve: 3 } },
          corners: { 3: { type: "radius", size: 3 }, 4: { type: "clip", size: 9 } } },
        { id: islandId, label: "Island", kind: "rect", x: 59.5, y: 75, rot: 0, flip: false, island: true,
          p: { length: 50, depth: 32 }, edges: { 2: { curve: 3 } }, corners: {} },
      ],
      cutouts: [
        { id: nid(), counter_id: uId, kind: "undermount", w: 25.5, d: 16, x: 84.75, y: 12.5, faucet_holes: 3 },
        { id: nid(), counter_id: islandId, kind: "cooktop", w: 30, d: 20, x: 25, y: 15, faucet_holes: 0 },
      ],
      texts: [{ id: nid(), x: 58, y: 46, text: "Range wall — 30\" opening" }],
      material: { catalog_item_id: quartz?.id ?? null, color: "Statuario Venato", thickness: "3cm" },
      edge_profile: "eased", splash_height: 18, options: { tearout: true, waste_percent: 0 }, rates_override: {}, revisions: [], notes: "Waterfall option discussed for island — price separately.",
    });
  }

  // ----- calendar
  const ev = (title: string, type: string, dayOff: number, h1: number, h2: number, extra: Record<string, unknown>) =>
    push("events", { title, type, start: dt(dayOff, h1), end: dt(dayOff, h2), all_day: false, project_id: null, customer_id: null, lead_id: null, crew_id: null, employee_ids: [], location: "", notes: "", status: "scheduled", reminder_minutes: 60, ...extra });
  for (let k = 0; k <= 8; k++) {
    const day = new Date(d(k) + "T12:00").getDay();
    if (day === 0 || day === 6) continue;
    ev("Bennett — shower & floor tile", "installation", k, 7, 16, { project_id: p0.id, customer_id: p0.customer_id, crew_id: crewA.id, employee_ids: [tomas.id, rafael.id], location: p0.address, status: "confirmed" });
  }
  for (let k = 3; k <= 9; k++) {
    const day = new Date(d(k) + "T12:00").getDay();
    if (day === 0 || day === 6) continue;
    ev("Kim — engineered hardwood install", "installation", k, 7, 16, { project_id: p1.id, customer_id: p1.customer_id, crew_id: crewF.id, employee_ids: [jake.id, andre.id], location: p1.address });
  }
  ev("Site visit — Riverside lobby", "site_visit", 0, 14, 15, { customer_id: C(7).id, lead_id: leads[7].id, employee_ids: [], location: C(7).project_address, notes: "Bring moisture meter." });
  ev("Consultation — Brooks laundry/mudroom", "estimate", 2, 10, 11, { customer_id: C(8).id, lead_id: leads[8].id, location: C(8).project_address });
  ev("In-home design consult — Nguyen kitchen", "estimate", 1, 16, 17, { customer_id: C(9).id, lead_id: leads[9].id, location: C(9).project_address });
  ev("Quartz slab delivery — Martinez", "delivery", 6, 9, 10, { project_id: p2.id, customer_id: p2.customer_id, location: "Summit Stone yard → shop" });
  ev("Hardwood delivery — Kim", "delivery", 1, 8, 9, { project_id: p1.id, customer_id: p1.customer_id, location: p1.address });
  ev("Punch walk with builder — Spec #14", "inspection", 1, 13, 14, { project_id: p3.id, customer_id: p3.customer_id, crew_id: crewA.id, location: p3.address });
  ev("Template countertops — Bennett vanity", "site_visit", 2, 8, 9, { project_id: p0.id, customer_id: p0.customer_id, crew_id: crewS.id, employee_ids: [kevin.id], location: p0.address });
  ev("Weekly production meeting", "meeting", 4, 7, 8, { location: "Office" });
  ev("Andre — PTO", "time_off", 5, 0, 23, { employee_ids: [andre.id], all_day: true });

  // ----- activities & comms
  const act = (type: string, subject: string, body: string, ci: number, off: number, extra: Record<string, unknown> = {}) =>
    push("activities", { type, subject, body, customer_id: C(ci).id, lead_id: null, project_id: null, estimate_id: null, invoice_id: null, user_id: P.sales_rep, created_at: dt(off, 9 + (Math.abs(off) % 8)), ...extra });
  act("call", "Intro call", "Discussed scope: curbless walk-in shower, double vanity. Budget ~$40k.", 0, -52, { lead_id: leads[0].id });
  act("site_visit", "Site visit & measurements", "Measured bath and shower. Subfloor solid. Recommend linear drain.", 0, -48, { lead_id: leads[0].id, user_id: P.estimator });
  act("email", "Proposal sent", "Sent EST-1001 with 3 tile options.", 0, -45, { estimate_id: e0.id });
  act("system", "Estimate approved", "EST-1001 approved and signed by Olivia Bennett.", 0, -41, { estimate_id: e0.id });
  act("call", "Follow-up call", "Customer reviewing proposal with spouse. Call back Thursday.", 4, -3, { lead_id: leads[4].id });
  act("email", "Inquiry received", "Website form: lobby floor replacement, ~1,200 sq ft, needs weekend work.", 7, -6, { lead_id: leads[7].id });
  act("sms", "Text: confirmed consult", "Confirmed in-home consult for Thursday 4pm.", 9, -1, { lead_id: leads[9].id });
  act("note", "Lost reason", "Chose lower bid. Keep in touch for future commercial work.", 12, -30, { lead_id: leads[12].id });
  act("system", "Change order approved", "CO-101 heated floor approved (+$1,295).", 0, -4, { project_id: p0.id });
  act("system", "Payment received", "ACH payment received for INV-2002.", 0, -7, { project_id: p0.id });
  act("email", "New website inquiry", "Stair treads + upstairs hardwood.", 13, 0, { lead_id: leads[13].id });

  push("messages", { customer_id: p0.customer_id, project_id: p0.id, sender: "customer", user_id: null, body: "The shower walls look amazing! Will the niche shelves be the same tile?", read: false, created_at: dt(-1, 18) });
  push("messages", { customer_id: p0.customer_id, project_id: p0.id, sender: "staff", user_id: P.project_manager, body: "Thank you! Yes — we'll wrap the niches in the same Calacatta with a brushed nickel Schluter edge.", read: true, created_at: dt(0, 8) });

  const note = (title: string, body: string, link: string, kind: string, roleKeys: string[], off = 0) => push("notifications", { user_id: null, role_keys: roleKeys, title, body, link, read_by: [], kind, created_at: dt(off, 8) });
  note("New lead: Stair treads + upstairs hardwood", `${fullName(13)} · Website`, `/leads/${leads[13].id}`, "info", ["owner", "sales_rep", "office_manager"]);
  note("Invoice overdue", `${S.invoices.find((x) => x.status === "overdue")!.number} · Whitfield Custom Homes`, "/finance", "danger", ["owner", "office_manager"]);
  note("Insurance expiring", "Kevin Park's COI expires in 18 days", "/team", "warning", ["owner", "office_manager", "project_manager"]);
  note("Change order awaiting approval", "CO-102 sent to Sofia Martinez", "/change-orders", "info", ["owner", "project_manager"], -1);

  // update counters
  const cs2 = S.company_settings[0] as CompanySettings;
  cs2.next_numbers = { estimate: estNo, project: prjNo, invoice: invNo, change_order: coNo, purchase_order: poNo };
  return S;
}
