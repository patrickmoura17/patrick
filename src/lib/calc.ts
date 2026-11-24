// Pure business calculations shared by every module (and unit-tested in tests/).
import type {
  ChangeOrder, ChangeOrderItem, Estimate, EstimateItem, Expense, Invoice, InvoiceLine,
  MeasurementPoint, Payment, Project, TimeEntry,
} from "./types";

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Sell price per unit from cost + markup. */
export function unitPriceFrom(material: number, labor: number, markupPct: number) {
  return round2((Number(material) + Number(labor)) * (1 + Number(markupPct) / 100));
}

export function lineUnitPrice(i: Pick<EstimateItem, "material_cost" | "labor_cost" | "markup" | "unit_price" | "price_override">) {
  return i.price_override ? Number(i.unit_price) : unitPriceFrom(i.material_cost, i.labor_cost, i.markup);
}

export function lineTotal(i: Pick<EstimateItem, "quantity" | "material_cost" | "labor_cost" | "markup" | "unit_price" | "price_override">) {
  return round2(Number(i.quantity) * lineUnitPrice(i));
}

export function lineCost(i: Pick<EstimateItem, "quantity" | "material_cost" | "labor_cost">) {
  return round2(Number(i.quantity) * (Number(i.material_cost) + Number(i.labor_cost)));
}

export interface EstimateTotals {
  subtotal: number;
  optionalTotal: number;
  materialCost: number;
  laborCost: number;
  totalCost: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  grossProfit: number;
  margin: number; // percent of (subtotal - discount)
  byCategory: Record<string, number>;
}

export function estimateTotals(
  est: Pick<Estimate, "tax_rate" | "discount_type" | "discount_value">,
  items: EstimateItem[],
): EstimateTotals {
  const included = items.filter((i) => !i.optional);
  const subtotal = round2(included.reduce((s, i) => s + lineTotal(i), 0));
  const optionalTotal = round2(items.filter((i) => i.optional).reduce((s, i) => s + lineTotal(i), 0));
  const materialCost = round2(included.reduce((s, i) => s + i.quantity * i.material_cost, 0));
  const laborCost = round2(included.reduce((s, i) => s + i.quantity * i.labor_cost, 0));
  const totalCost = round2(materialCost + laborCost);
  const discount = round2(
    est.discount_type === "percent" ? (subtotal * Number(est.discount_value || 0)) / 100 : Number(est.discount_value || 0),
  );
  const taxableBase = included.filter((i) => i.taxable).reduce((s, i) => s + lineTotal(i), 0);
  // discount is spread proportionally across taxable and non-taxable lines
  const taxable = round2(subtotal > 0 ? taxableBase * (1 - discount / subtotal) : 0);
  const tax = round2((taxable * Number(est.tax_rate || 0)) / 100);
  const net = round2(subtotal - discount);
  const total = round2(net + tax);
  const grossProfit = round2(net - totalCost);
  const margin = net > 0 ? round2((grossProfit / net) * 100) : 0;
  const byCategory: Record<string, number> = {};
  for (const i of included) byCategory[i.category] = round2((byCategory[i.category] || 0) + lineTotal(i));
  return { subtotal, optionalTotal, materialCost, laborCost, totalCost, discount, taxable, tax, total, grossProfit, margin, byCategory };
}

export function invoiceTotals(inv: Pick<Invoice, "items" | "tax_rate" | "discount">, payments: Payment[] = []) {
  const subtotal = round2(inv.items.reduce((s: number, l: InvoiceLine) => s + l.quantity * l.unit_price, 0));
  const taxableBase = inv.items.filter((l) => l.taxable).reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const discount = round2(inv.discount || 0);
  const taxable = subtotal > 0 ? taxableBase * (1 - discount / subtotal) : 0;
  const tax = round2((taxable * (inv.tax_rate || 0)) / 100);
  const total = round2(subtotal - discount + tax);
  const paid = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
  const balance = round2(total - paid);
  return { subtotal, discount, tax, total, paid, balance };
}

/** Derives the correct invoice status from payments and due date. Draft/void are sticky. */
export function deriveInvoiceStatus(inv: Invoice, payments: Payment[], today = todayISO()): Invoice["status"] {
  if (inv.status === "void" || inv.status === "draft") return inv.status;
  const t = invoiceTotals(inv, payments);
  if (t.total > 0 && t.balance <= 0.004) return "paid";
  if (inv.due_date < today) return "overdue";
  if (t.paid > 0) return "partially_paid";
  return "sent";
}

export function changeOrderLineAmount(i: ChangeOrderItem) {
  const sign = i.action === "remove" ? -1 : 1;
  return round2(sign * i.quantity * i.unit_price);
}
export function changeOrderLineCost(i: ChangeOrderItem) {
  const sign = i.action === "remove" ? -1 : 1;
  return round2(sign * i.quantity * (i.material_cost + i.labor_cost));
}
export function changeOrderTotals(co: Pick<ChangeOrder, "items">) {
  const amount = round2(co.items.reduce((s, i) => s + changeOrderLineAmount(i), 0));
  const cost = round2(co.items.reduce((s, i) => s + changeOrderLineCost(i), 0));
  return { amount, cost, profit: round2(amount - cost) };
}

export interface ProjectFinancials {
  contract: number;
  estimatedCost: number;
  estimatedProfit: number;
  estimatedMargin: number;
  materialCost: number;
  laborCost: number;
  subcontractorCost: number;
  otherCost: number;
  actualCost: number;
  actualProfit: number;
  actualMargin: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  unbilled: number;
  costProgress: number; // actual vs estimated %
}

export function projectFinancials(
  p: Project,
  expenses: Expense[],
  time: TimeEntry[],
  invoices: Invoice[],
  payments: Payment[],
): ProjectFinancials {
  const ex = expenses.filter((e) => e.project_id === p.id);
  const materialCost = round2(ex.filter((e) => e.category === "material").reduce((s, e) => s + e.amount, 0));
  const subcontractorCost = round2(ex.filter((e) => e.category === "subcontractor").reduce((s, e) => s + e.amount, 0));
  const laborExp = ex.filter((e) => e.category === "labor").reduce((s, e) => s + e.amount, 0);
  const laborTime = time.filter((t) => t.project_id === p.id).reduce((s, t) => s + t.cost, 0);
  const laborCost = round2(laborExp + laborTime);
  const otherCost = round2(
    ex.filter((e) => !["material", "subcontractor", "labor"].includes(e.category)).reduce((s, e) => s + e.amount, 0),
  );
  const actualCost = round2(materialCost + laborCost + subcontractorCost + otherCost);
  const invs = invoices.filter((i) => i.project_id === p.id && i.status !== "void" && i.status !== "draft");
  const invoiced = round2(invs.reduce((s, i) => s + invoiceTotals(i).total, 0));
  const collected = round2(payments.filter((x) => x.project_id === p.id).reduce((s, x) => s + x.amount, 0));
  const contract = round2(p.contract_value);
  const estimatedProfit = round2(contract - p.estimated_cost);
  return {
    contract,
    estimatedCost: round2(p.estimated_cost),
    estimatedProfit,
    estimatedMargin: contract > 0 ? round2((estimatedProfit / contract) * 100) : 0,
    materialCost,
    laborCost,
    subcontractorCost,
    otherCost,
    actualCost,
    actualProfit: round2(contract - actualCost),
    actualMargin: contract > 0 ? round2(((contract - actualCost) / contract) * 100) : 0,
    invoiced,
    collected,
    outstanding: round2(invoiced - collected),
    unbilled: round2(Math.max(0, contract - invoiced)),
    costProgress: p.estimated_cost > 0 ? round2((actualCost / p.estimated_cost) * 100) : 0,
  };
}

/** Polygon area (shoelace) in square units. */
export function polygonArea(pts: MeasurementPoint[]) {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return round2(Math.abs(a) / 2);
}

export function polygonPerimeter(pts: MeasurementPoint[], closed = true) {
  if (pts.length < 2) return 0;
  let p = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % pts.length;
    p += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
  }
  return round2(p);
}

/** Measurement auto-calculation by area type (rect dims or drawn shape). */
export function measurementCalc(m: {
  area_type: string; length: number; width: number; height: number; shape: MeasurementPoint[]; waste_percent: number;
}) {
  const L = Number(m.length) || 0, W = Number(m.width) || 0, H = Number(m.height) || 0;
  let sqft = 0, lf = 0;
  if (m.shape && m.shape.length >= 3) {
    sqft = polygonArea(m.shape);
    lf = polygonPerimeter(m.shape);
  } else {
    switch (m.area_type) {
      case "shower":
        // three walls to height + floor pan
        sqft = (2 * L + W) * H + L * W;
        lf = 2 * L + W;
        break;
      case "backsplash":
      case "wall":
        sqft = L * (H || W);
        lf = L;
        break;
      case "countertop":
        sqft = L * W;
        lf = L; // run length (edge)
        break;
      case "cabinet_run":
        sqft = 0;
        lf = L;
        break;
      default:
        sqft = L * W;
        lf = 2 * (L + W);
    }
  }
  sqft = round2(sqft);
  lf = round2(lf);
  const withWaste = round2(sqft * (1 + (Number(m.waste_percent) || 0) / 100));
  return { sqft, lf, withWaste };
}

/** Splits a contract amount across payment milestones; last milestone absorbs rounding. */
export function milestoneAmounts(total: number, percents: number[]) {
  const out: number[] = [];
  let acc = 0;
  percents.forEach((p, i) => {
    if (i === percents.length - 1) out.push(round2(total - acc));
    else {
      const v = round2((total * p) / 100);
      out.push(v);
      acc = round2(acc + v);
    }
  });
  return out;
}

export function todayISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/** Two time ranges overlap? */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}
