import { test } from "node:test";
import assert from "node:assert/strict";
import { counterCalc, fmtIn, geometry, newCounter, parseIn, priceQuote, quoteTotalsGeom, toWorld } from "../src/lib/countertop";
import type { CatalogItem, Counter, CountertopQuote } from "../src/lib/types";

test("inch formatting and parsing", () => {
  assert.equal(fmtIn(25.5), '25 1/2"');
  assert.equal(fmtIn(169.5), '169 1/2"');
  assert.equal(fmtIn(63.625), '63 5/8"');
  assert.equal(fmtIn(55.25), '55 1/4"');
  assert.equal(fmtIn(12), '12"');
  assert.equal(parseIn("25 1/2"), 25.5);
  assert.equal(parseIn("25-1/2\""), 25.5);
  assert.equal(parseIn("8' 4\""), 100);
  assert.equal(parseIn("3/4"), 0.75);
  assert.equal(parseIn("abc"), null);
});

const rect = (L: number, D: number): Counter => ({ ...newCounter("rect", 0, 0, "r"), p: { length: L, depth: D }, edges: { 0: { wall: true, splash: "4in" } } });

test("straight counter area, finished edge and splash", () => {
  const c = rect(96, 25.5); // 8' x 25.5"
  const r = counterCalc(c, 18);
  assert.equal(r.sqft, 17); // 96*25.5/144
  assert.equal(r.splash4Lf, 8);
  assert.equal(r.finishedLf, Math.round(((25.5 * 2 + 96) / 12) * 100) / 100);
});

test("U-shape area matches the parametric outline", () => {
  const u: Counter = { ...newCounter("u", 0, 0, "u"), p: { length: 169.5, depth: 25.5, legL: 55.25, legR: 95.5, depthL: 25.5, depthR: 25.5 } };
  const expected = (169.5 * 25.5 + 25.5 * (55.25 - 25.5) + 25.5 * (95.5 - 25.5)) / 144;
  assert.equal(counterCalc(u, 18).sqft, Math.round(expected * 100) / 100);
  assert.equal(geometry(u).edges.length, 8);
});

test("rotation keeps area and moves the shape into place", () => {
  const c = { ...rect(96, 25.5), x: 10, y: 20, rot: 90 as const };
  assert.equal(counterCalc(c, 18).sqft, 17);
  const p = toWorld(c, { x: 0, y: 0 });
  assert.deepEqual(p, { x: 10 + 25.5, y: 20 });
});

test("corners and bumpouts adjust area", () => {
  const base = rect(48, 24);
  const clipped = { ...base, corners: { 2: { type: "clip" as const, size: 6 } } };
  assert.equal(counterCalc(clipped, 18).sqft, Math.round(((48 * 24 - 18) / 144) * 100) / 100);
  const bump = { ...base, edges: { ...base.edges, 2: { curve: 3 } } };
  assert.equal(counterCalc(bump, 18).sqft, Math.round(((48 * 24 + (2 / 3) * 48 * 3) / 144) * 100) / 100);
});

test("quote pricing pulls rates from the catalog", () => {
  const cat = (name: string, m: number, l: number, mk: number, section = ""): CatalogItem => ({ id: name, created_at: "", category: "countertops", section, name, description: "", unit: "SQFT", material_cost: m, labor_cost: l, markup: mk, active: true });
  const catalog = [cat("Quartz countertop (group 2)", 48, 0, 30, "Material"), cat("Countertop fabrication & templating", 0, 14, 40), cat("Countertop installation", 0, 9, 40), cat("Undermount sink cutout", 0, 225, 40), cat("Faucet hole", 0, 35, 40)];
  const c = rect(96, 25.5);
  const q = {
    counters: [c], cutouts: [{ id: "s", counter_id: c.id, kind: "undermount", w: 30, d: 18, x: 48, y: 13, faucet_holes: 1 }], texts: [], splash_height: 18,
    material: { catalog_item_id: "Quartz countertop (group 2)", color: "", thickness: "3cm" }, edge_profile: "eased", options: { tearout: false, waste_percent: 0 }, rates_override: {},
  } as unknown as CountertopQuote;
  assert.equal(quoteTotalsGeom(q).undermount, 1);
  const p = priceQuote(q, catalog);
  const byKey = Object.fromEntries(p.lines.map((l) => [l.key, l]));
  assert.equal(byKey.material.total, Math.round(17 * 62.4 * 100) / 100);
  assert.equal(byKey.undermount.total, 315);
  assert.equal(byKey.faucet.qty, 1);
  assert.ok(byKey.splash4, "4in splash uses fallback rate when not in catalog");
  assert.equal(byKey.edge, undefined, "standard eased edge is not an upgrade");
});
