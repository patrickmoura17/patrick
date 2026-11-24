// Countertop drawing geometry + pricing engine (pure, unit-tested).
// All lengths are inches. Shapes are parametric (rect / L / U) so every
// dimension label can be edited directly; corners (radius / clip), curved
// edges (bumpouts), wall/splash edges and cutouts layer on top.
import type { CatalogItem, Counter, CounterKind, CountertopQuote, Cutout } from "./types";

export interface Pt { x: number; y: number }
export interface EdgeInfo { i: number; a: Pt; b: Pt; len: number; param: keyof Counter["p"] | null; label: string }
export interface ShapeGeom { pts: Pt[]; edges: EdgeInfo[]; sign: 1 | -1 }

const r8 = (n: number) => Math.round(n * 8) / 8;

/** Local (untransformed) outline for each parametric shape, clockwise on screen. */
function localOutline(c: Counter): { pts: Pt[]; params: (keyof Counter["p"] | null)[] } {
  const p = c.p;
  if (c.kind === "l") {
    const A = p.length, B = p.legR ?? 60, D1 = p.depth, D2 = p.depthR ?? p.depth;
    return {
      pts: [{ x: 0, y: 0 }, { x: A, y: 0 }, { x: A, y: B }, { x: A - D2, y: B }, { x: A - D2, y: D1 }, { x: 0, y: D1 }],
      params: ["length", "legR", "depthR", null, null, "depth"],
    };
  }
  if (c.kind === "u") {
    const A = p.length, L1 = p.legL ?? 60, L2 = p.legR ?? 60, Db = p.depth, Dl = p.depthL ?? p.depth, Dr = p.depthR ?? p.depth;
    return {
      pts: [{ x: 0, y: 0 }, { x: A, y: 0 }, { x: A, y: L2 }, { x: A - Dr, y: L2 }, { x: A - Dr, y: Db }, { x: Dl, y: Db }, { x: Dl, y: L1 }, { x: 0, y: L1 }],
      params: ["length", "legR", "depthR", null, null, null, "depthL", "legL"],
    };
  }
  return {
    pts: [{ x: 0, y: 0 }, { x: p.length, y: 0 }, { x: p.length, y: p.depth }, { x: 0, y: p.depth }],
    params: ["length", "depth", null, null],
  };
}

export function localBounds(c: Counter) {
  const { pts } = localOutline(c);
  return { w: Math.max(...pts.map((p) => p.x)), h: Math.max(...pts.map((p) => p.y)) };
}

/** Local → world: optional horizontal flip, rotation about the local origin box, then translate. */
export function toWorld(c: Counter, p: Pt): Pt {
  const { w, h } = localBounds(c);
  let x = c.flip ? w - p.x : p.x;
  let y = p.y;
  switch (c.rot) {
    case 90: [x, y] = [h - y, x]; break;
    case 180: [x, y] = [w - x, h - y]; break;
    case 270: [x, y] = [y, w - x]; break;
  }
  return { x: c.x + x, y: c.y + y };
}

/** World delta → local delta (for dragging cutouts on rotated counters). */
export function deltaToLocal(c: Counter, d: Pt): Pt {
  let { x, y } = d;
  switch (c.rot) {
    case 90: [x, y] = [y, -x]; break;
    case 180: [x, y] = [-x, -y]; break;
    case 270: [x, y] = [-y, x]; break;
  }
  if (c.flip) x = -x;
  return { x, y };
}

export function geometry(c: Counter): ShapeGeom {
  const { pts: local, params } = localOutline(c);
  const pts = local.map((p) => toWorld(c, p));
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  const sign = a2 >= 0 ? 1 : -1;
  const edges = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return { i, a, b, len, param: params[i], label: fmtIn(len) };
  });
  return { pts, edges, sign };
}

export function outwardNormal(e: { a: Pt; b: Pt; len: number }, sign: 1 | -1): Pt {
  const dx = (e.b.x - e.a.x) / e.len, dy = (e.b.y - e.a.y) / e.len;
  return sign > 0 ? { x: dy, y: -dx } : { x: -dy, y: dx };
}

export function isConvex(g: ShapeGeom, i: number) {
  const n = g.pts.length;
  const p0 = g.pts[(i - 1 + n) % n], p1 = g.pts[i], p2 = g.pts[(i + 1) % n];
  const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
  return Math.sign(cross) === g.sign;
}

/** SVG path for the counter including corner treatments and curved edges. */
export function outlinePath(c: Counter): string {
  const g = geometry(c);
  const n = g.pts.length;
  const corner = (i: number) => c.corners[i] ?? { type: "none", size: 0 };
  const trim = (i: number) => {
    const k = corner(i);
    if (k.type === "none" || !k.size) return 0;
    const prev = g.edges[(i - 1 + n) % n], next = g.edges[i];
    return Math.min(k.size, prev.len / 2, next.len / 2);
  };
  const along = (a: Pt, b: Pt, d: number): Pt => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: a.x + ((b.x - a.x) * d) / L, y: a.y + ((b.y - a.y) * d) / L };
  };
  let d = "";
  for (let i = 0; i < n; i++) {
    const e = g.edges[i];
    const start = along(e.a, e.b, trim(i));
    const end = along(e.b, e.a, trim((i + 1) % n));
    if (i === 0) d += `M ${start.x} ${start.y} `;
    const bulge = c.edges[i]?.curve ?? 0;
    if (bulge) {
      const nrm = outwardNormal(e, g.sign);
      const mx = (start.x + end.x) / 2 + nrm.x * bulge * 2, my = (start.y + end.y) / 2 + nrm.y * bulge * 2;
      d += `Q ${mx} ${my} ${end.x} ${end.y} `;
    } else d += `L ${end.x} ${end.y} `;
    // corner at end vertex
    const j = (i + 1) % n;
    const t = trim(j);
    if (t) {
      const ne = g.edges[j];
      const after = along(ne.a, ne.b, t);
      if (corner(j).type === "clip") d += `L ${after.x} ${after.y} `;
      else {
        const sweep = isConvex(g, j) === (g.sign > 0) ? 1 : 0;
        d += `A ${t} ${t} 0 0 ${sweep} ${after.x} ${after.y} `;
      }
    }
  }
  return d + "Z";
}

export interface CounterCalc {
  sqft: number;
  finishedLf: number;
  splash4Lf: number;
  splashFullSqft: number;
  wallLf: number;
  radiusCorners: number;
  clipCorners: number;
}

export function counterCalc(c: Counter, splashHeight: number): CounterCalc {
  const g = geometry(c);
  const n = g.pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += g.pts[i].x * g.pts[j].y - g.pts[j].x * g.pts[i].y;
  }
  area = Math.abs(area) / 2;
  let finished = 0, splash4 = 0, splashFull = 0, wall = 0, radius = 0, clip = 0;
  g.edges.forEach((e, i) => {
    const attr = c.edges[i] ?? {};
    const s = attr.curve ?? 0;
    area += (2 / 3) * e.len * s; // parabolic bumpout (+ out / − in)
    const len = s ? e.len * (1 + (8 / 3) * (s / e.len) ** 2) : e.len;
    if (attr.wall) {
      wall += len;
      if (attr.splash === "4in") splash4 += len;
      if (attr.splash === "full") splashFull += (len * splashHeight) / 144;
    } else finished += len;
  });
  for (let i = 0; i < n; i++) {
    const k = c.corners[i];
    if (!k || k.type === "none" || !k.size) continue;
    const sgn = isConvex(g, i) ? -1 : 1;
    if (k.type === "clip") { clip++; area += sgn * (k.size * k.size) / 2; }
    else { radius++; area += sgn * k.size * k.size * (1 - Math.PI / 4); }
  }
  return {
    sqft: Math.round((area / 144) * 100) / 100,
    finishedLf: Math.round((finished / 12) * 100) / 100,
    splash4Lf: Math.round((splash4 / 12) * 100) / 100,
    splashFullSqft: Math.round(splashFull * 100) / 100,
    wallLf: Math.round((wall / 12) * 100) / 100,
    radiusCorners: radius,
    clipCorners: clip,
  };
}

export function quoteTotalsGeom(q: Pick<CountertopQuote, "counters" | "cutouts" | "splash_height">) {
  const per = q.counters.map((c) => ({ c, calc: counterCalc(c, q.splash_height) }));
  const sum = (k: keyof CounterCalc) => Math.round(per.reduce((s, x) => s + x.calc[k], 0) * 100) / 100;
  const cut = (kinds: Cutout["kind"][]) => q.cutouts.filter((x) => kinds.includes(x.kind)).length;
  return {
    per,
    sqft: sum("sqft"),
    finishedLf: sum("finishedLf"),
    splash4Lf: sum("splash4Lf"),
    splashFullSqft: sum("splashFullSqft"),
    radiusCorners: sum("radiusCorners"),
    clipCorners: sum("clipCorners"),
    undermount: cut(["undermount", "farm", "vanity", "bar"]),
    dropIn: cut(["drop_in"]),
    cooktops: cut(["cooktop"]),
    faucetHoles: q.cutouts.reduce((s, x) => s + (x.faucet_holes || 0), 0),
  };
}

// ---------------------------------------------------------------- pricing
export const EDGE_PROFILES: { key: string; label: string; premium: boolean }[] = [
  { key: "eased", label: "Eased (standard)", premium: false },
  { key: "half_bevel", label: "Half bevel", premium: false },
  { key: "bullnose", label: "Full bullnose", premium: true },
  { key: "half_bullnose", label: "Half bullnose", premium: true },
  { key: "ogee", label: "Ogee", premium: true },
  { key: "mitered", label: "Mitered (thick look)", premium: true },
];

/** Price-list keys → catalog item names, with fallbacks if the catalog lacks them. */
export const PRICE_KEYS: { key: string; label: string; catalog: string; unit: "SQFT" | "LF" | "EA"; fallback: [number, number, number] }[] = [
  { key: "fabrication", label: "Fabrication & templating", catalog: "Countertop fabrication & templating", unit: "SQFT", fallback: [0, 14, 40] },
  { key: "install", label: "Installation", catalog: "Countertop installation", unit: "SQFT", fallback: [0, 9, 40] },
  { key: "tearout", label: "Tear-out & disposal", catalog: "Countertop demolition & removal", unit: "SQFT", fallback: [0, 6, 40] },
  { key: "edge", label: "Edge profile upgrade", catalog: "Edge profile upgrade (ogee/bevel)", unit: "LF", fallback: [0, 18, 40] },
  { key: "splash4", label: "4\" backsplash", catalog: "4\" matching backsplash", unit: "LF", fallback: [9, 12, 35] },
  { key: "splashFull", label: "Full-height backsplash", catalog: "Full-height slab backsplash", unit: "SQFT", fallback: [48, 16, 30] },
  { key: "undermount", label: "Undermount sink cutout", catalog: "Undermount sink cutout", unit: "EA", fallback: [0, 225, 40] },
  { key: "dropIn", label: "Drop-in sink cutout", catalog: "Drop-in sink cutout", unit: "EA", fallback: [0, 110, 40] },
  { key: "cooktop", label: "Cooktop cutout", catalog: "Cooktop cutout", unit: "EA", fallback: [0, 175, 40] },
  { key: "faucet", label: "Faucet / accessory holes", catalog: "Faucet hole", unit: "EA", fallback: [0, 35, 40] },
  { key: "corner", label: "Radius / clipped corners", catalog: "Radius / clipped corner", unit: "EA", fallback: [0, 45, 40] },
];

export interface PriceLine { key: string; label: string; qty: number; unit: "SQFT" | "LF" | "EA"; material: number; labor: number; markup: number; price: number; total: number; catalog: string }

export function priceQuote(q: CountertopQuote, catalog: CatalogItem[]) {
  const g = quoteTotalsGeom(q);
  const mat = catalog.find((c) => c.id === q.material.catalog_item_id);
  const thick = q.material.thickness === "2cm" ? 0.85 : 1;
  const waste = 1 + (q.options.waste_percent || 0) / 100;
  const lines: PriceLine[] = [];
  const add = (key: string, label: string, qty: number, unit: PriceLine["unit"], m: number, l: number, mk: number, catalogName: string) => {
    if (qty <= 0) return;
    const ov = q.rates_override[key];
    const price = ov ?? Math.round((m + l) * (1 + mk / 100) * 100) / 100;
    lines.push({ key, label, qty: Math.round(qty * 100) / 100, unit, material: m, labor: l, markup: mk, price, total: Math.round(qty * price * 100) / 100, catalog: catalogName });
  };
  if (mat) {
    add("material", `${mat.name}${q.material.color ? ` — ${q.material.color}` : ""} (${q.material.thickness})`, g.sqft * waste, "SQFT", mat.material_cost * thick, mat.labor_cost, mat.markup, mat.name);
  }
  for (const k of PRICE_KEYS) {
    const qty =
      k.key === "fabrication" || k.key === "install" ? g.sqft
      : k.key === "tearout" ? (q.options.tearout ? g.sqft : 0)
      : k.key === "edge" ? (EDGE_PROFILES.find((e) => e.key === q.edge_profile)?.premium ? g.finishedLf : 0)
      : k.key === "splash4" ? g.splash4Lf
      : k.key === "splashFull" ? g.splashFullSqft
      : k.key === "undermount" ? g.undermount
      : k.key === "dropIn" ? g.dropIn
      : k.key === "cooktop" ? g.cooktops
      : k.key === "faucet" ? g.faucetHoles
      : k.key === "corner" ? g.radiusCorners + g.clipCorners
      : 0;
    const ci = catalog.find((c) => c.name === k.catalog);
    const [m, l, mk] = ci ? [ci.material_cost, ci.labor_cost, ci.markup] : k.fallback;
    const label = k.key === "edge" ? `Edge profile — ${EDGE_PROFILES.find((e) => e.key === q.edge_profile)?.label}` : k.label;
    add(k.key, label, qty, k.unit, k.key === "splashFull" && mat ? mat.material_cost * thick : m, l, mk, k.catalog);
  }
  const subtotal = Math.round(lines.reduce((s, x) => s + x.total, 0) * 100) / 100;
  const cost = Math.round(lines.reduce((s, x) => s + x.qty * (x.material + x.labor), 0) * 100) / 100;
  return { geom: g, lines, subtotal, cost, margin: subtotal > 0 ? Math.round(((subtotal - cost) / subtotal) * 1000) / 10 : 0 };
}

// ---------------------------------------------------------------- inches
/** 25.5 → 25 1/2" (nearest 1/8) */
export function fmtIn(n: number) {
  const v = r8(Math.abs(n));
  let whole = Math.floor(v + 1e-9);
  let eighths = Math.round((v - whole) * 8);
  if (eighths === 8) { whole++; eighths = 0; }
  let num = eighths, den = 8;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  return `${n < 0 ? "-" : ""}${whole}${num ? ` ${num}/${den}` : ""}"`;
}

/** Parses 25 1/2 · 25-1/2 · 25.5 · 2' 1 1/2" · 3/4 → inches, or null. */
export function parseIn(s: string): number | null {
  const t = s.trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'");
  if (!t) return null;
  let total = 0;
  let rest = t;
  const ft = rest.match(/^(\d+(?:\.\d+)?)\s*'\s*/);
  if (ft) {
    total += parseFloat(ft[1]) * 12;
    rest = rest.slice(ft[0].length);
  }
  rest = rest.replace(/"/g, "").trim();
  if (!rest) return ft ? total : null;
  const m = rest.match(/^(\d+(?:\.\d+)?)?(?:[\s-]+)?(?:(\d+)\/(\d+))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  if (m[1]) total += parseFloat(m[1]);
  if (m[2] && m[3] && Number(m[3]) !== 0) total += Number(m[2]) / Number(m[3]);
  return total;
}

// ---------------------------------------------------------------- factories
export function newCounter(kind: CounterKind, x: number, y: number, label: string): Counter {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
  const base = { id, label, kind, x, y, rot: 0 as const, flip: false, corners: {}, island: false };
  if (kind === "l") return { ...base, p: { length: 120, depth: 25.5, legR: 84, depthR: 25.5 }, edges: { 0: { wall: true, splash: "4in" }, 1: { wall: true, splash: "4in" } } };
  if (kind === "u") return { ...base, p: { length: 144, depth: 25.5, legL: 60, legR: 84, depthL: 25.5, depthR: 25.5 }, edges: { 0: { wall: true, splash: "4in" }, 1: { wall: true, splash: "4in" }, 7: { wall: true, splash: "4in" } } };
  return { ...base, p: { length: 96, depth: 25.5 }, edges: { 0: { wall: true, splash: "4in" } } };
}

export function newIsland(x: number, y: number, label: string): Counter {
  const c = newCounter("rect", x, y, label);
  return { ...c, island: true, p: { length: 72, depth: 36 }, edges: {} };
}

export const CUTOUT_DEFAULTS: Record<Cutout["kind"], { w: number; d: number; label: string; holes: number }> = {
  undermount: { w: 30, d: 18, label: "Undermount sink", holes: 3 },
  drop_in: { w: 33, d: 22, label: "Drop-in sink", holes: 3 },
  farm: { w: 33, d: 20, label: "Farmhouse sink", holes: 1 },
  vanity: { w: 17, d: 14, label: "Vanity sink", holes: 3 },
  bar: { w: 15, d: 15, label: "Bar / prep sink", holes: 1 },
  cooktop: { w: 30, d: 20, label: "Cooktop", holes: 0 },
};
