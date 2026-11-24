import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeOrderTotals, deriveInvoiceStatus, estimateTotals, invoiceTotals, measurementCalc, milestoneAmounts, overlaps, polygonArea,
  polygonPerimeter, projectFinancials, unitPriceFrom,
} from "../src/lib/calc";
import type { EstimateItem, Expense, Invoice, Payment, Project, TimeEntry } from "../src/lib/types";

const item = (p: Partial<EstimateItem>): EstimateItem => ({
  id: Math.random().toString(), created_at: "", estimate_id: "e", category: "tile", section: "", name: "x", description: "", quantity: 1, unit: "SQFT",
  material_cost: 0, labor_cost: 0, markup: 0, unit_price: 0, price_override: false, taxable: true, optional: false, position: 0, ...p,
});

test("unit price = cost × (1 + markup)", () => {
  assert.equal(unitPriceFrom(2, 5, 40), 9.8);
});

test("estimate totals: discount, tax on taxable lines, optional excluded, margin", () => {
  const items = [
    item({ quantity: 100, material_cost: 2, labor_cost: 5, markup: 40 }), // 980, cost 700
    item({ quantity: 1, material_cost: 0, labor_cost: 100, markup: 0, taxable: false, category: "general" }), // 100, cost 100
    item({ quantity: 10, material_cost: 10, labor_cost: 0, markup: 50, optional: true }), // optional 150
  ];
  const t = estimateTotals({ tax_rate: 10, discount_type: "percent", discount_value: 10 }, items);
  assert.equal(t.subtotal, 1080);
  assert.equal(t.optionalTotal, 150);
  assert.equal(t.discount, 108);
  assert.equal(t.taxable, 882); // 980 × 0.9
  assert.equal(t.tax, 88.2);
  assert.equal(t.total, 1060.2);
  assert.equal(t.totalCost, 800);
  assert.equal(t.grossProfit, 172);
  assert.equal(t.margin, 17.7);
  assert.equal(t.byCategory.tile, 980);
});

test("price override wins over markup", () => {
  const t = estimateTotals({ tax_rate: 0, discount_type: "amount", discount_value: 0 }, [item({ quantity: 2, material_cost: 10, markup: 100, price_override: true, unit_price: 15 })]);
  assert.equal(t.subtotal, 30);
});

test("milestones sum exactly to contract", () => {
  const a = milestoneAmounts(17067.07, [30, 40, 30]);
  assert.deepEqual(a, [5120.12, 6826.83, 5120.12]);
  assert.equal(Math.round(a.reduce((s, x) => s + x, 0) * 100) / 100, 17067.07);
});

const inv = (p: Partial<Invoice>): Invoice => ({ id: "i", created_at: "", number: "INV-1", customer_id: "c", project_id: null, milestone_id: null, kind: "standard", status: "sent", issue_date: "2026-01-01", due_date: "2026-01-15", items: [{ id: "l", description: "", quantity: 1, unit: "LS", unit_price: 1000, taxable: true }], tax_rate: 0, discount: 0, notes: "", sent_at: null, external_ref: null, ...p });
const pay = (amount: number): Payment => ({ id: Math.random().toString(), created_at: "", invoice_id: "i", customer_id: "c", project_id: "p", amount, method: "check", date: "2026-01-02", reference: "", notes: "", processor: "manual", external_ref: null });

test("invoice status derivation", () => {
  assert.equal(deriveInvoiceStatus(inv({}), [], "2026-01-10"), "sent");
  assert.equal(deriveInvoiceStatus(inv({}), [pay(400)], "2026-01-10"), "partially_paid");
  assert.equal(deriveInvoiceStatus(inv({}), [pay(400)], "2026-02-01"), "overdue");
  assert.equal(deriveInvoiceStatus(inv({}), [pay(1000)], "2026-02-01"), "paid");
  assert.equal(deriveInvoiceStatus(inv({ status: "draft" }), [pay(1000)], "2026-02-01"), "draft");
  assert.equal(invoiceTotals(inv({ tax_rate: 8.25, discount: 100 })).total, 974.25);
});

test("change order: add, modify, remove", () => {
  const t = changeOrderTotals({ items: [
    { id: "a", action: "add", description: "", quantity: 1, unit: "EA", unit_price: 300, material_cost: 50, labor_cost: 100 },
    { id: "b", action: "modify", description: "", quantity: -5, unit: "SQFT", unit_price: 10, material_cost: 3, labor_cost: 2 },
    { id: "c", action: "remove", description: "", quantity: 10, unit: "LF", unit_price: 10, material_cost: 3, labor_cost: 2 },
  ] });
  assert.equal(t.amount, 150);
  assert.equal(t.cost, 75);
});

test("polygon area/perimeter (L-shaped countertop)", () => {
  const L = [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 10 }, { x: 0, y: 10 }];
  assert.equal(polygonArea(L), 44);
  assert.equal(polygonPerimeter(L), 48);
});

test("measurement auto-calc per area type", () => {
  assert.deepEqual(measurementCalc({ area_type: "floor", length: 10, width: 7, height: 0, shape: [], waste_percent: 10 }), { sqft: 70, lf: 34, withWaste: 77 });
  assert.equal(measurementCalc({ area_type: "shower", length: 6, width: 4, height: 8, shape: [], waste_percent: 0 }).sqft, 152);
  assert.equal(measurementCalc({ area_type: "cabinet_run", length: 18, width: 2, height: 3, shape: [], waste_percent: 0 }).lf, 18);
});

test("crew double-booking overlap", () => {
  assert.equal(overlaps("2026-01-01T08:00:00Z", "2026-01-01T12:00:00Z", "2026-01-01T11:00:00Z", "2026-01-01T13:00:00Z"), true);
  assert.equal(overlaps("2026-01-01T08:00:00Z", "2026-01-01T12:00:00Z", "2026-01-01T12:00:00Z", "2026-01-01T13:00:00Z"), false);
});

test("project financials roll up costs, billing and margin", () => {
  const p = { id: "p", contract_value: 10000, estimated_cost: 6000 } as Project;
  const ex = [{ project_id: "p", category: "material", amount: 3000 }, { project_id: "p", category: "subcontractor", amount: 500 }, { project_id: "p", category: "disposal", amount: 200 }] as Expense[];
  const te = [{ project_id: "p", cost: 1300 }] as TimeEntry[];
  const f = projectFinancials(p, ex, te, [inv({ project_id: "p", items: [{ id: "l", description: "", quantity: 1, unit: "LS", unit_price: 3000, taxable: false }] })], [pay(3000)]);
  assert.equal(f.actualCost, 5000);
  assert.equal(f.actualProfit, 5000);
  assert.equal(f.actualMargin, 50);
  assert.equal(f.invoiced, 3000);
  assert.equal(f.collected, 3000);
  assert.equal(f.unbilled, 7000);
});
