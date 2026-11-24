"use client";
// Step-by-step countertop drawing & quote builder (tablet friendly).
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, CircleHelp, Copy, FileDown, FlipHorizontal2, Hand, History, Plus, Redo2, RotateCw, Save, Trash2, Type, Undo2, X, ZoomIn, ZoomOut,
  Maximize, Check, FileSignature, LayoutGrid,
} from "lucide-react";
import { db, useSettings, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { countertopQuoteToEstimate, custName } from "@/lib/services";
import {
  CUTOUT_DEFAULTS, EDGE_PROFILES, fmtIn, geometry, localBounds, newCounter, newIsland, parseIn, priceQuote, deltaToLocal,
} from "@/lib/countertop";
import { money } from "@/lib/format";
import { countertopQuotePdf, openPdf } from "@/lib/pdf";
import { CountertopCanvas, type CanvasHandle, type Selection } from "@/components/countertop-canvas";
import { Badge, Button, Checkbox, Field, Input, Modal, NumberInput, Select, Textarea, cn, useToast } from "@/components/ui";
import type { Counter, CountertopQuote, Cutout, QuoteDrawing } from "@/lib/types";

const STEPS = ["Counter Dimensions", "Curves & Bumpouts", "Splash & Edge", "Sink & Cooktop", "Color & Edge", "Price Details"];
const HELP = [
  "Add counters with “Other Counter” (straight run, L-shape, U-shape or island). Drag a counter to position it. Tap any highlighted dimension to type an exact size — fractions like 25 1/2 or feet like 8' 4\" work.",
  "Tap an edge to add a curve or bumpout (positive bulges out, negative cuts in). Tap a corner handle to radius or clip it.",
  "Tap an edge to mark it as a wall edge (blue) and choose its backsplash: none, 4\" or full height. All other edges are finished with the selected edge profile.",
  "Select a counter, then add sinks or a cooktop. Drag cutouts into position; set size and faucet holes in the panel.",
  "Choose the material, color, thickness and edge profile.",
  "Review square footage and pricing. Adjust any rate, then send the quote to an estimate or download the PDF.",
];
const MAX_HISTORY = 80;

type Doc = Omit<CountertopQuote, "id" | "created_at" | "updated_at" | "revisions">;

export default function QuoteBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const S = useSnapshot();
  const q = S.countertop_quotes.find((x) => x.id === id);
  if (!q) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-100"><p className="text-sm text-stone-500">Quote not found.</p><Link href="/countertops"><Button>Back to quotes</Button></Link></div>;
  return <Builder key={q.id} initial={q} />;
}

function Builder({ initial }: { initial: CountertopQuote }) {
  const S = useSnapshot();
  const co = useSettings();
  const { can } = useAuth();
  const router = useRouter();
  const { toast, prompt, confirm } = useToast();
  const canvas = useRef<CanvasHandle>(null);
  const editable = can("estimates.edit");
  const strip = (q: CountertopQuote): Doc => {
    const { id: _i, created_at: _c, updated_at: _u, revisions: _r, ...rest } = q;
    return rest;
  };
  const [doc, setDoc] = useState<Doc>(() => strip(initial));
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [sel, setSel] = useState<Selection>(null);
  const [pan, setPan] = useState(false);
  const [help, setHelp] = useState(false);
  const [revOpen, setRevOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dragBase = useRef<Doc | null>(null);
  const step = doc.step;

  // ---- persistence (debounced autosave)
  const docRef = useRef(doc);
  const persist = useCallback(() => {
    db.update("countertop_quotes", initial.id, docRef.current);
    setDirty(false);
  }, [initial.id]);
  useEffect(() => {
    if (!dirty || !editable) return;
    const t = setTimeout(persist, 700);
    return () => clearTimeout(t);
  }, [doc, dirty, persist, editable]);
  useEffect(() => () => { if (editable) db.update("countertop_quotes", initial.id, docRef.current); }, [initial.id, editable]);

  /** Apply a change with undo history. `transient` = live drag (history recorded on drag end). */
  const change = useCallback((fn: (d: Doc) => Doc, transient = false) => {
    if (!editable) return;
    const d = docRef.current;
    const next = fn(d);
    if (transient) {
      if (!dragBase.current) dragBase.current = d;
    } else {
      const base = dragBase.current ?? d;
      dragBase.current = null;
      setPast((p) => [...p.slice(-MAX_HISTORY), base]);
      setFuture([]);
    }
    docRef.current = next;
    setDoc(next);
    setDirty(true);
  }, [editable]);
  const goStep = (n: number) => {
    setSel(null);
    const next = { ...docRef.current, step: n };
    docRef.current = next;
    setDoc(next);
    if (editable) setDirty(true);
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [doc, ...f]);
    docRef.current = { ...past[past.length - 1], step: doc.step };
    setDoc(docRef.current);
    setPast((p) => p.slice(0, -1));
    setDirty(true);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, doc]);
    docRef.current = { ...future[0], step: doc.step };
    setDoc(docRef.current);
    setFuture((f) => f.slice(1));
    setDirty(true);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); removeSelected(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const setCounter = (cid: string, patch: Partial<Counter> | ((c: Counter) => Partial<Counter>), transient = false) =>
    change((d) => ({ ...d, counters: d.counters.map((c) => (c.id === cid ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c)) }), transient);
  const setCutout = (xid: string, patch: Partial<Cutout>, transient = false) =>
    change((d) => ({ ...d, cutouts: d.cutouts.map((x) => (x.id === xid ? { ...x, ...patch } : x)) }), transient);
  const removeSelected = () => {
    if (!sel) return;
    if (sel.kind === "counter") change((d) => ({ ...d, counters: d.counters.filter((c) => c.id !== sel.id), cutouts: d.cutouts.filter((x) => x.counter_id !== sel.id) }));
    if (sel.kind === "cutout") change((d) => ({ ...d, cutouts: d.cutouts.filter((x) => x.id !== sel.id) }));
    if (sel.kind === "text") change((d) => ({ ...d, texts: d.texts.filter((x) => x.id !== sel.id) }));
    setSel(null);
  };

  const addCounter = (kind: "rect" | "l" | "u" | "island") => {
    const c0 = canvas.current?.center() ?? { x: 60, y: 40 };
    const label = kind === "island" ? `Island ${doc.counters.filter((c) => c.island).length + 1}` : `Counter ${doc.counters.filter((c) => !c.island).length + 1}`;
    const c = kind === "island" ? newIsland(0, 0, label) : newCounter(kind, 0, 0, label);
    const b = localBounds(c);
    c.x = Math.round(c0.x - b.w / 2);
    c.y = Math.round(c0.y - b.h / 2);
    change((d) => ({ ...d, counters: [...d.counters, c] }));
    setSel({ kind: "counter", id: c.id });
  };
  const addText = async () => {
    const t = await prompt({ title: "Add text", label: "Label", placeholder: "e.g. Range 30\"" });
    if (!t) return;
    const c0 = canvas.current?.center() ?? { x: 0, y: 0 };
    const tid = crypto.randomUUID();
    change((d) => ({ ...d, texts: [...d.texts, { id: tid, x: c0.x, y: c0.y, text: t }] }));
  };
  const addCutout = (kind: Cutout["kind"]) => {
    const cid = sel && "id" in sel ? (sel.kind === "cutout" ? doc.cutouts.find((x) => x.id === sel.id)?.counter_id : sel.kind === "text" ? undefined : sel.id) : doc.counters[0]?.id;
    const c = doc.counters.find((x) => x.id === cid) ?? doc.counters[0];
    if (!c) return toast("Draw a counter first", "error");
    const def = CUTOUT_DEFAULTS[kind];
    const x: Cutout = { id: crypto.randomUUID(), counter_id: c.id, kind, w: def.w, d: def.d, x: Math.round(c.p.length / 2), y: Math.round(c.p.depth / 2 + 1), faucet_holes: def.holes };
    change((d) => ({ ...d, cutouts: [...d.cutouts, x] }));
    setSel({ kind: "cutout", id: x.id });
  };

  const editDimension = async (cid: string, i: number) => {
    const c = doc.counters.find((x) => x.id === cid);
    if (!c) return;
    const e = geometry(c).edges[i];
    if (!e.param) return;
    const v = await prompt({ title: "Edit dimension", label: `Length (inches — e.g. 25 1/2 or 8' 4")`, initial: fmtIn(e.len).replace('"', "") });
    if (v === null) return;
    const n = parseIn(v);
    if (n === null || n <= 0) return toast("Couldn't read that measurement", "error");
    const key = e.param;
    const minDepth = Math.max(c.p.depth, c.p.depthL ?? 0, c.p.depthR ?? 0);
    if ((key === "legL" || key === "legR") && n <= minDepth) return toast("Leg must be longer than the counter depth", "error");
    setCounter(cid, (cc) => ({ p: { ...cc.p, [key]: Math.round(n * 8) / 8 } }));
  };

  const priced = useMemo(() => priceQuote({ ...initial, ...doc } as CountertopQuote, S.catalog_items), [doc, S.catalog_items, initial]);
  const tax = co?.tax_rate ?? 0;
  const cust = S.customers.find((c) => c.id === doc.customer_id);
  const materials = S.catalog_items.filter((c) => c.category === "countertops" && c.section === "Material" && c.active);
  const quote = S.countertop_quotes.find((x) => x.id === initial.id) ?? initial;
  const selCounter = sel && sel.kind !== "cutout" && sel.kind !== "text" ? doc.counters.find((c) => c.id === sel.id) : undefined;
  const selCutout = sel?.kind === "cutout" ? doc.cutouts.find((x) => x.id === sel.id) : undefined;

  const pdf = async () => {
    const png = await canvas.current!.exportPng();
    const mat = S.catalog_items.find((c) => c.id === doc.material.catalog_item_id);
    const d = await countertopQuotePdf(co!, doc, cust, priced, png, tax, mat?.name ?? "Material TBD", EDGE_PROFILES.find((e) => e.key === doc.edge_profile)?.label ?? "");
    openPdf(d, `${doc.name.replace(/\W+/g, "-")}-countertop-quote.pdf`);
  };
  const toEstimate = async () => {
    if (!priced.lines.length) return toast("Nothing to price yet — draw a counter and choose a material", "error");
    persist();
    try {
      const est = countertopQuoteToEstimate(initial.id, priced.lines);
      toast(`Quote lines added to ${est.number}`);
      if (await confirm({ title: `Open ${est.number}?`, body: "The countertop lines are in the estimate, grouped under this quote. Re-sending replaces them.", confirmLabel: "Open estimate" })) router.push(`/estimates/${est.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const exit = () => {
    if (editable) persist();
    router.push(doc.estimate_id ? `/estimates/${doc.estimate_id}` : "/countertops");
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-stone-100">
      {/* ===== top bar ===== */}
      <header className="flex items-stretch bg-ink-900 text-white">
        <button onClick={exit} className="hidden items-center px-3 text-stone-400 hover:text-white md:flex" aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 md:px-2">
          <span className="text-sm font-medium uppercase tracking-[0.14em] text-brass-300">Quote:</span>
          <button disabled={!editable} onClick={async () => { const n = await prompt({ title: "Quote name", initial: doc.name }); if (n) change((d) => ({ ...d, name: n })); }} className="truncate text-left text-lg font-semibold hover:text-brass-200">{doc.name}</button>
          <span className="hidden truncate text-sm text-stone-400 lg:inline">· {custName(cust)}</span>
          {dirty ? <Badge className="hidden bg-white/10 text-stone-300 ring-white/10 sm:inline-flex">Saving…</Badge> : <Badge tone="green" className="hidden sm:inline-flex">Saved</Badge>}
        </div>
        <TopBtn icon={<CircleHelp />} label="Help" onClick={() => setHelp(true)} />
        <TopBtn icon={<Undo2 />} label="Undo" disabled={!past.length} onClick={undo} />
        <TopBtn icon={<Redo2 />} label="Redo" disabled={!future.length} onClick={redo} />
        <TopBtn icon={<History />} label="Revisions" onClick={() => setRevOpen(true)} />
        <TopBtn icon={<Save />} label="Save" disabled={!editable} onClick={() => { persist(); toast("Quote saved"); }} />
        <TopBtn icon={<X />} label="Exit" onClick={exit} />
      </header>

      {/* ===== step bar ===== */}
      <nav className="grid grid-cols-6 border-b border-ink-950 bg-ink-800">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => goStep(i + 1)}
            className={cn("flex items-center justify-center gap-2 border-r border-ink-950/60 px-1 py-2 text-left transition last:border-0 md:justify-start md:px-4", step === i + 1 ? "bg-brass-500 text-white" : "text-stone-300 hover:bg-ink-700")}
          >
            <span className={cn("text-xl font-light tabular-nums md:text-2xl", step === i + 1 ? "text-white" : "text-stone-400")}>{i + 1}</span>
            <span className="hidden text-[12.5px] font-medium leading-tight sm:block">{s}</span>
          </button>
        ))}
      </nav>

      {/* ===== body ===== */}
      {step === 6 ? (
        <PriceStep doc={doc} change={change} priced={priced} tax={tax} onPdf={() => void pdf()} onEstimate={() => void toEstimate()} estimateNumber={S.estimates.find((e) => e.id === doc.estimate_id)?.number} editable={editable}
          canvasSlot={<div className="h-[340px] overflow-hidden rounded-xl border border-stone-200"><CountertopCanvas ref={canvas} doc={doc} step={6} sel={null} panMode={true} onSelect={() => {}} onMoveCounter={() => {}} onMoveCutout={() => {}} onMoveText={() => {}} onEditDimension={() => {}} onEditText={() => {}} /></div>} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <CountertopCanvas
              ref={canvas}
              doc={doc}
              step={step}
              sel={sel}
              panMode={pan}
              onSelect={setSel}
              onMoveCounter={(cid, x, y, done) => setCounter(cid, { x, y }, !done)}
              onMoveCutout={(xid, dx, dy, done) => {
                const base = (dragBase.current ?? doc).cutouts.find((x) => x.id === xid);
                const c = doc.counters.find((cc) => cc.id === base?.counter_id);
                if (!base || !c) return;
                const l = deltaToLocal(c, { x: dx, y: dy });
                setCutout(xid, { x: Math.round((base.x + l.x) * 4) / 4, y: Math.round((base.y + l.y) * 4) / 4 }, !done);
              }}
              onMoveText={(tid, x, y, done) => change((d) => ({ ...d, texts: d.texts.map((t) => (t.id === tid ? { ...t, x, y } : t)) }), !done)}
              onEditDimension={(cid, i) => void editDimension(cid, i)}
              onEditText={async (tid) => { const t = doc.texts.find((x) => x.id === tid); const v = await prompt({ title: "Edit text", initial: t?.text }); if (v !== null) change((d) => ({ ...d, texts: v ? d.texts.map((x) => (x.id === tid ? { ...x, text: v } : x)) : d.texts.filter((x) => x.id !== tid) })); }}
            />
          </div>
          {/* ===== right rail ===== */}
          <aside className="flex w-[250px] shrink-0 flex-col border-l border-stone-200 bg-stone-50 md:w-[280px]">
            <div className="flex-1 overflow-y-auto p-3">
              <Inspector step={step} doc={doc} sel={sel} selCounter={selCounter} selCutout={selCutout} change={change} setCounter={setCounter} setCutout={setCutout} addCutout={addCutout} remove={removeSelected} setSel={setSel} materials={materials} priced={priced} />
            </div>
            <div className="space-y-1.5 border-t border-stone-200 p-3">
              <RailBtn icon={<Type />} label="Text" onClick={() => void addText()} disabled={!editable} />
              <OtherCounter onAdd={addCounter} disabled={!editable} />
              <div className="grid grid-cols-2 gap-1.5">
                <RailBtn icon={<ZoomIn />} label="Zoom In" onClick={() => canvas.current?.zoom(1.25)} />
                <RailBtn icon={<ZoomOut />} label="Zoom Out" onClick={() => canvas.current?.zoom(0.8)} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <RailBtn icon={<Maximize />} label="Reset Zoom" onClick={() => canvas.current?.reset()} />
                <RailBtn icon={<Hand />} label="Pan" active={pan} onClick={() => setPan((v) => !v)} />
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ===== footer summary ===== */}
      <footer className="flex items-center gap-4 border-t border-stone-200 bg-white px-4 py-2 text-xs text-stone-600">
        <span><b className="tabular-nums text-ink-900">{priced.geom.sqft.toFixed(2)}</b> sq ft</span>
        <span className="hidden sm:inline"><b className="tabular-nums text-ink-900">{priced.geom.finishedLf.toFixed(1)}</b> LF finished edge</span>
        <span className="hidden md:inline">{priced.geom.undermount + priced.geom.dropIn} sinks · {priced.geom.cooktops} cooktops · {priced.geom.faucetHoles} holes</span>
        <span className="ml-auto">Quote <b className="tabular-nums text-ink-900">{money(priced.subtotal)}</b> + tax</span>
        {step < 6 && <Button size="xs" variant="brass" onClick={() => goStep(step + 1)}>Next: {STEPS[step]} →</Button>}
      </footer>

      <Modal open={help} onClose={() => setHelp(false)} title={`Step ${step}: ${STEPS[step - 1]}`} size="sm" footer={<Button variant="primary" onClick={() => setHelp(false)}>Got it</Button>}>
        <p className="text-sm leading-relaxed text-stone-600">{HELP[step - 1]}</p>
        <p className="mt-3 text-xs text-stone-400">Shortcuts: ⌘/Ctrl+Z undo · ⌘/Ctrl+Shift+Z redo · Delete removes the selection · scroll to zoom · drag the background to deselect, or enable Pan.</p>
      </Modal>
      <Revisions open={revOpen} onClose={() => setRevOpen(false)} quote={quote} current={{ counters: doc.counters, cutouts: doc.cutouts, texts: doc.texts }}
        onRestore={(d) => { change((x) => ({ ...x, ...d })); setRevOpen(false); toast("Revision restored — undo to go back"); }} editable={editable} />
    </div>
  );
}

function TopBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex w-14 flex-col items-center justify-center gap-0.5 border-l border-white/10 text-stone-200 transition hover:bg-white/10 disabled:opacity-35 md:w-[72px] [&>svg]:h-5 [&>svg]:w-5">
      {icon}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}

function RailBtn({ icon, label, onClick, disabled, active }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium shadow-sm transition disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4", active ? "bg-brass-500 text-white" : "bg-ink-800 text-white hover:bg-ink-700")}>
      {icon}{label}
    </button>
  );
}

function OtherCounter({ onAdd, disabled }: { onAdd: (k: "rect" | "l" | "u" | "island") => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const shapes: { k: "rect" | "l" | "u" | "island"; label: string; svg: string }[] = [
    { k: "rect", label: "Straight", svg: "M2 6h20v6H2z" },
    { k: "l", label: "L-shape", svg: "M2 4h20v16h-6V10H2z" },
    { k: "u", label: "U-shape", svg: "M2 4h20v16h-5V10H7v10H2z" },
    { k: "island", label: "Island", svg: "M4 7h16v10H4z" },
  ];
  return (
    <div>
      <RailBtn icon={<Plus />} label="Other Counter" onClick={() => setOpen((o) => !o)} disabled={disabled} active={open} />
      {open && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {shapes.map((s) => (
            <button key={s.k} onClick={() => { onAdd(s.k); setOpen(false); }} className="flex flex-col items-center gap-1 rounded-lg border border-stone-200 bg-white p-2 text-[11px] font-medium hover:border-brass-400 hover:bg-brass-50">
              <svg viewBox="0 0 24 24" className="h-7 w-7"><path d={s.svg} fill="#faf6ee" stroke="#946f39" strokeWidth="1.3" /></svg>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type InspectorProps = {
  step: number; doc: Doc; sel: Selection; selCounter?: Counter; selCutout?: Cutout;
  change: (fn: (d: Doc) => Doc, transient?: boolean) => void;
  setCounter: (id: string, p: Partial<Counter> | ((c: Counter) => Partial<Counter>)) => void;
  setCutout: (id: string, p: Partial<Cutout>) => void;
  addCutout: (k: Cutout["kind"]) => void; remove: () => void; setSel: (s: Selection) => void;
  materials: { id: string; name: string; material_cost: number; labor_cost: number; markup: number }[];
  priced: ReturnType<typeof priceQuote>;
};

function H({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">{children}</p>;
}

function InchField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const [t, setT] = useState(fmtIn(value).replace('"', ""));
  useEffect(() => setT(fmtIn(value).replace('"', "")), [value]);
  return (
    <Field label={label}>
      <Input className="h-8 tabular-nums" value={t} onChange={(e) => setT(e.target.value)} onBlur={() => { const n = parseIn(t); if (n && n > 0) onChange(Math.round(n * 8) / 8); else setT(fmtIn(value).replace('"', "")); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
    </Field>
  );
}

function Inspector(p: InspectorProps) {
  const { step, doc, sel, selCounter: c, selCutout: x } = p;
  if (step === 1) {
    if (!c) return <Hint text="Select a counter to edit it, or add one with “Other Counter”. Tap a highlighted dimension on the drawing to type an exact size." list={doc.counters} onPick={(id) => p.setSel({ kind: "counter", id })} />;
    const P = c.p;
    const setP = (k: keyof Counter["p"], v: number) => p.setCounter(c.id, (cc) => ({ p: { ...cc.p, [k]: v } }));
    return (
      <div className="space-y-3">
        <H>{c.kind === "rect" ? (c.island ? "Island" : "Straight counter") : c.kind === "l" ? "L-shaped counter" : "U-shaped counter"}</H>
        <Field label="Label"><Input className="h-8" value={c.label} onChange={(e) => p.setCounter(c.id, { label: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <InchField label={c.kind === "rect" ? "Length" : "Back length"} value={P.length} onChange={(n) => setP("length", n)} />
          <InchField label={c.kind === "rect" ? "Depth" : "Back depth"} value={P.depth} onChange={(n) => setP("depth", n)} />
          {c.kind === "u" && <InchField label="Left leg" value={P.legL ?? 60} onChange={(n) => setP("legL", n)} />}
          {c.kind === "u" && <InchField label="Left depth" value={P.depthL ?? P.depth} onChange={(n) => setP("depthL", n)} />}
          {c.kind !== "rect" && <InchField label="Right leg" value={P.legR ?? 60} onChange={(n) => setP("legR", n)} />}
          {c.kind !== "rect" && <InchField label="Right depth" value={P.depthR ?? P.depth} onChange={(n) => setP("depthR", n)} />}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" icon={<RotateCw className="h-4 w-4" />} onClick={() => p.setCounter(c.id, (cc) => ({ rot: (((cc.rot + 90) % 360) as Counter["rot"]) }))}>Rotate</Button>
          {c.kind !== "rect" ? <Button size="sm" icon={<FlipHorizontal2 className="h-4 w-4" />} onClick={() => p.setCounter(c.id, (cc) => ({ flip: !cc.flip }))}>Mirror</Button> : (
            <Button size="sm" onClick={() => p.setCounter(c.id, (cc): Partial<Counter> => ({ island: !cc.island, edges: cc.island ? { 0: { wall: true, splash: "4in" } } : ({} as Counter["edges"]) }))}>{c.island ? "Wall counter" : "Make island"}</Button>
          )}
          <Button size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => p.change((d) => ({ ...d, counters: [...d.counters, { ...c, id: crypto.randomUUID(), label: `${c.label} copy`, x: c.x + 12, y: c.y + 12 }] }))}>Duplicate</Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={p.remove}>Delete</Button>
        </div>
        <CounterStats c={c} priced={p.priced} />
      </div>
    );
  }
  if (step === 2) {
    if (sel?.kind === "edge" && c) {
      const cur = c.edges[sel.i]?.curve ?? 0;
      const setCurve = (v: number) => p.setCounter(c.id, (cc) => ({ edges: { ...cc.edges, [sel.i]: { ...cc.edges[sel.i], curve: v } } }));
      return (
        <div className="space-y-3">
          <H>Curve / bumpout · edge {sel.i + 1}</H>
          <InchField label="Depth (+ out / − in)" value={cur} onChange={setCurve} />
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 2, 4, 6, 10, -3].map((v) => <Button key={v} size="xs" variant={cur === v ? "brass" : "secondary"} onClick={() => setCurve(v)}>{v === 0 ? "Straight" : `${v > 0 ? "+" : ""}${v}"`}</Button>)}
          </div>
          <p className="text-xs text-stone-500">Positive values create a bumpout or radiused island end; negative values create a concave cut.</p>
        </div>
      );
    }
    if (sel?.kind === "corner" && c) {
      const k = c.corners[sel.i] ?? { type: "none", size: 0 };
      const setK = (patch: Partial<typeof k>) => p.setCounter(c.id, (cc) => ({ corners: { ...cc.corners, [sel.i]: { ...k, ...patch } } }));
      return (
        <div className="space-y-3">
          <H>Corner {sel.i + 1}</H>
          <div className="grid grid-cols-3 gap-1.5">
            {(["none", "radius", "clip"] as const).map((t) => <Button key={t} size="xs" variant={k.type === t ? "brass" : "secondary"} onClick={() => setK({ type: t, size: t === "none" ? 0 : k.size || (t === "radius" ? 3 : 9) })}>{t === "none" ? "Square" : t === "radius" ? "Radius" : "Clip"}</Button>)}
          </div>
          {k.type !== "none" && <InchField label={k.type === "radius" ? "Radius" : "Clip length"} value={k.size} onChange={(n) => setK({ size: n })} />}
          {k.type === "radius" && <div className="grid grid-cols-4 gap-1">{[0.5, 1, 3, 6].map((v) => <Button key={v} size="xs" onClick={() => setK({ size: v })}>{fmtIn(v)}</Button>)}</div>}
        </div>
      );
    }
    return <Hint text="Tap an edge of the drawing to add a curve or bumpout, or tap a corner handle to radius or clip it." />;
  }
  if (step === 3) {
    const splashH = (
      <div className="mt-4 space-y-2 border-t border-stone-200 pt-3">
        <InchField label="Full-height splash height" value={doc.splash_height} onChange={(n) => p.change((d) => ({ ...d, splash_height: n }))} />
        <p className="text-xs text-stone-500"><span className="mr-1 inline-block h-0.5 w-4 bg-[#2a78d6] align-middle" />wall edge · <span className="mr-1 inline-block w-4 border-t border-dashed border-[#c98a14] align-middle" />finished edge</p>
      </div>
    );
    if (sel?.kind === "edge" && c) {
      const a = c.edges[sel.i] ?? {};
      const setA = (patch: Partial<typeof a>) => p.setCounter(c.id, (cc) => ({ edges: { ...cc.edges, [sel.i]: { ...a, ...patch } } }));
      return (
        <div className="space-y-3">
          <H>Edge {sel.i + 1} · {fmtIn(geometry(c).edges[sel.i].len)}</H>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant={a.wall ? "brass" : "secondary"} onClick={() => setA({ wall: true, splash: a.splash ?? "4in" })}>Wall</Button>
            <Button size="sm" variant={!a.wall ? "brass" : "secondary"} onClick={() => setA({ wall: false })}>Finished edge</Button>
          </div>
          {a.wall && (
            <Field label="Backsplash">
              <div className="grid grid-cols-3 gap-1.5">
                {(["none", "4in", "full"] as const).map((s) => <Button key={s} size="xs" variant={(a.splash ?? "none") === s ? "brass" : "secondary"} onClick={() => setA({ splash: s })}>{s === "none" ? "None" : s === "4in" ? '4"' : "Full"}</Button>)}
              </div>
            </Field>
          )}
          {splashH}
        </div>
      );
    }
    return <div><Hint text="Tap an edge to mark it as a wall (with or without backsplash) or as a finished, polished edge." />{splashH}</div>;
  }
  if (step === 4) {
    return (
      <div className="space-y-3">
        <H>Add to {c?.label ?? (x ? doc.counters.find((cc) => cc.id === x.counter_id)?.label : doc.counters[0]?.label) ?? "counter"}</H>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(CUTOUT_DEFAULTS) as Cutout["kind"][]).map((k) => <Button key={k} size="xs" onClick={() => p.addCutout(k)}>+ {CUTOUT_DEFAULTS[k].label}</Button>)}
        </div>
        {x ? (
          <div className="space-y-3 border-t border-stone-200 pt-3">
            <H>{CUTOUT_DEFAULTS[x.kind].label}</H>
            <div className="grid grid-cols-2 gap-2">
              <InchField label="Width" value={x.w} onChange={(n) => p.setCutout(x.id, { w: n })} />
              <InchField label="Depth" value={x.d} onChange={(n) => p.setCutout(x.id, { d: n })} />
            </div>
            {x.kind !== "cooktop" && (
              <Field label="Faucet / accessory holes">
                <div className="grid grid-cols-6 gap-1">{[0, 1, 2, 3, 4, 5].map((n) => <Button key={n} size="xs" variant={x.faucet_holes === n ? "brass" : "secondary"} onClick={() => p.setCutout(x.id, { faucet_holes: n })}>{n}</Button>)}</div>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" onClick={() => { const cc = doc.counters.find((k) => k.id === x.counter_id); if (cc) p.setCutout(x.id, { x: cc.p.length / 2 }); }}>Center on run</Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={p.remove}>Delete</Button>
            </div>
            <p className="text-xs text-stone-500">Drag the cutout on the drawing to position it. Faucet holes are placed on the wall side.</p>
          </div>
        ) : <Hint text="Select a counter, then add a sink or cooktop. Tap a cutout to change its size." />}
      </div>
    );
  }
  // step 5
  const mat = p.materials.find((m) => m.id === doc.material.catalog_item_id);
  return (
    <div className="space-y-4">
      <div>
        <H>Material</H>
        <div className="space-y-1.5">
          {p.materials.map((m) => {
            const on = m.id === doc.material.catalog_item_id;
            const price = Math.round((m.material_cost + m.labor_cost) * (1 + m.markup / 100) * 100) / 100;
            return (
              <button key={m.id} onClick={() => p.change((d) => ({ ...d, material: { ...d.material, catalog_item_id: m.id } }))} className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm", on ? "border-brass-400 bg-brass-50" : "border-stone-200 bg-white hover:border-stone-300")}>
                <span className="flex items-center gap-2">{on && <Check className="h-4 w-4 text-brass-600" />}{m.name.replace(" countertop", "")}</span>
                <span className="text-xs tabular-nums text-stone-500">{money(price)}/sf</span>
              </button>
            );
          })}
          {!p.materials.length && <p className="text-xs text-stone-500">Add countertop materials (section “Material”) in Settings → Pricing catalog.</p>}
        </div>
      </div>
      <Field label="Color / slab name"><Input className="h-8" value={doc.material.color} onChange={(e) => p.change((d) => ({ ...d, material: { ...d.material, color: e.target.value } }))} placeholder="e.g. Calacatta Laza" /></Field>
      <Field label="Thickness">
        <div className="grid grid-cols-2 gap-1.5">{(["2cm", "3cm"] as const).map((t) => <Button key={t} size="sm" variant={doc.material.thickness === t ? "brass" : "secondary"} onClick={() => p.change((d) => ({ ...d, material: { ...d.material, thickness: t } }))}>{t}</Button>)}</div>
      </Field>
      <div>
        <H>Edge profile</H>
        <div className="grid grid-cols-2 gap-1.5">
          {EDGE_PROFILES.map((e) => (
            <button key={e.key} onClick={() => p.change((d) => ({ ...d, edge_profile: e.key }))} className={cn("flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-medium", doc.edge_profile === e.key ? "border-brass-400 bg-brass-50" : "border-stone-200 bg-white")}>
              <EdgeIcon k={e.key} />
              {e.label.replace(" (standard)", "")}
              {e.premium && <span className="text-[10px] text-brass-600">upgrade</span>}
            </button>
          ))}
        </div>
      </div>
      {mat && <p className="text-xs text-stone-500">{p.priced.geom.sqft.toFixed(2)} sf of {mat.name.replace(" countertop", "")} · {p.priced.geom.finishedLf.toFixed(1)} LF of {EDGE_PROFILES.find((e) => e.key === doc.edge_profile)?.label.toLowerCase()} edge</p>}
    </div>
  );
}

function EdgeIcon({ k }: { k: string }) {
  const d: Record<string, string> = {
    eased: "M4 6h14q2 0 2 2v8q0 2-2 2H4",
    half_bevel: "M4 6h12l4 4v8H4",
    bullnose: "M4 6h10a6 6 0 0 1 0 12H4",
    half_bullnose: "M4 6h10a6 6 0 0 1 6 6v6H4",
    ogee: "M4 6h12q4 0 2 4t2 4v4H4",
    mitered: "M4 6h16v18h-3V9H4",
  };
  return <svg viewBox="0 0 24 26" className="h-7 w-7"><path d={d[k] ?? d.eased} fill="#ece9e3" stroke="#675f54" strokeWidth="1.2" /></svg>;
}

function CounterStats({ c, priced }: { c: Counter; priced: ReturnType<typeof priceQuote> }) {
  const s = priced.geom.per.find((x) => x.c.id === c.id)?.calc;
  if (!s) return null;
  return (
    <div className="rounded-lg bg-white p-3 text-xs text-stone-600 ring-1 ring-stone-200">
      <p className="flex justify-between"><span>Area</span><b className="tabular-nums">{s.sqft.toFixed(2)} sf</b></p>
      <p className="flex justify-between"><span>Finished edge</span><b className="tabular-nums">{s.finishedLf.toFixed(1)} LF</b></p>
      <p className="flex justify-between"><span>Wall / splash</span><b className="tabular-nums">{s.wallLf.toFixed(1)} LF</b></p>
    </div>
  );
}

function Hint({ text, list, onPick }: { text: string; list?: Counter[]; onPick?: (id: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-white p-3 text-xs leading-relaxed text-stone-500 ring-1 ring-stone-200">{text}</p>
      {list && list.length > 0 && (
        <div className="space-y-1">
          {list.map((c) => <button key={c.id} onClick={() => onPick?.(c.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white"><LayoutGrid className="h-3.5 w-3.5 text-stone-400" />{c.label}</button>)}
        </div>
      )}
    </div>
  );
}

function PriceStep({ doc, change, priced, tax, onPdf, onEstimate, estimateNumber, editable, canvasSlot }: { doc: Doc; change: (fn: (d: Doc) => Doc) => void; priced: ReturnType<typeof priceQuote>; tax: number; onPdf: () => void; onEstimate: () => void; estimateNumber?: string; editable: boolean; canvasSlot: React.ReactNode }) {
  const taxAmt = Math.round(priced.subtotal * tax) / 100;
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {canvasSlot}
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-500"><tr><th className="px-4 py-2 text-left">Item</th><th className="text-right">Qty</th><th className="px-2">Unit</th><th className="w-32 text-right">Price</th><th className="px-4 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {priced.lines.map((l) => (
                  <tr key={l.key}>
                    <td className="px-4 py-2">{l.label}</td>
                    <td className="text-right tabular-nums">{l.qty}</td>
                    <td className="px-2 text-center text-xs text-stone-500">{l.unit}</td>
                    <td className="py-1"><NumberInput disabled={!editable} className={cn("h-8 text-right", doc.rates_override[l.key] !== undefined && "border-slateblue-400/60 bg-slateblue-50/50")} value={l.price} onChange={(n) => change((d) => ({ ...d, rates_override: { ...d.rates_override, [l.key]: n } }))} /></td>
                    <td className="px-4 text-right font-semibold tabular-nums">{money(l.total)}</td>
                  </tr>
                ))}
                {!priced.lines.length && <tr><td colSpan={5} className="py-8 text-center text-stone-400">Draw counters and choose a material to price this quote.</td></tr>}
              </tbody>
            </table>
          </div>
          {Object.keys(doc.rates_override).length > 0 && <button className="text-xs font-medium text-slateblue-600" onClick={() => change((d) => ({ ...d, rates_override: {} }))}>Reset all prices to the pricing catalog</button>}
        </div>
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="bg-ink-900 px-5 py-4 text-white">
              <p className="text-[11px] uppercase tracking-wider text-stone-400">Countertop quote total</p>
              <p className="text-3xl font-semibold tabular-nums">{money(priced.subtotal + taxAmt)}</p>
            </div>
            <div className="space-y-1.5 p-5 text-sm">
              <p className="flex justify-between"><span className="text-stone-500">Subtotal</span><span className="tabular-nums">{money(priced.subtotal)}</span></p>
              <p className="flex justify-between"><span className="text-stone-500">Tax ({tax}%)</span><span className="tabular-nums">{money(taxAmt)}</span></p>
              <p className="flex justify-between border-t border-stone-100 pt-2 text-xs"><span className="text-stone-500">Job cost</span><span className="tabular-nums">{money(priced.cost)}</span></p>
              <p className="flex justify-between text-xs"><span className="text-stone-500">Gross margin</span><span className={cn("font-semibold tabular-nums", priced.margin < 25 ? "text-clay-600" : "text-sage-700")}>{priced.margin}%</span></p>
            </div>
            <div className="space-y-2 border-t border-stone-100 p-4">
              <Button variant="brass" className="w-full" icon={<FileSignature className="h-4 w-4" />} disabled={!editable} onClick={onEstimate}>{estimateNumber ? `Update ${estimateNumber}` : "Send to estimate"}</Button>
              <Button className="w-full" icon={<FileDown className="h-4 w-4" />} onClick={onPdf}>Download quote PDF</Button>
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
            <Checkbox checked={doc.options.tearout} onChange={(v) => change((d) => ({ ...d, options: { ...d.options, tearout: v } }))} label="Include tear-out of existing tops" />
            <Field label="Material waste / yield allowance %"><NumberInput disabled={!editable} value={doc.options.waste_percent} onChange={(n) => change((d) => ({ ...d, options: { ...d.options, waste_percent: Math.max(0, n) } }))} /></Field>
            <Field label="Notes on quote"><Textarea disabled={!editable} value={doc.notes} onChange={(e) => change((d) => ({ ...d, notes: e.target.value }))} placeholder="Seams, overhangs, appliance specs…" /></Field>
          </div>
        </div>
      </div>
    </div>
  );
}

function Revisions({ open, onClose, quote, current, onRestore, editable }: { open: boolean; onClose: () => void; quote: CountertopQuote; current: QuoteDrawing; onRestore: (d: QuoteDrawing) => void; editable: boolean }) {
  const { prompt, confirm } = useToast();
  return (
    <Modal open={open} onClose={onClose} title="Revisions" subtitle="Save named versions of the drawing and restore any of them." size="sm"
      footer={<><Button onClick={onClose}>Close</Button>{editable && <Button variant="primary" onClick={async () => { const n = await prompt({ title: "Save revision", label: "Name", initial: `Revision ${quote.revisions.length + 1}` }); if (n) db.update("countertop_quotes", quote.id, { revisions: [...quote.revisions, { id: crypto.randomUUID(), name: n, at: new Date().toISOString(), data: structuredClone(current) }] }); }}>Save current as revision</Button>}</>}>
      {!quote.revisions.length ? <p className="py-6 text-center text-sm text-stone-400">No saved revisions yet.</p> : (
        <div className="divide-y divide-stone-100 rounded-xl border border-stone-200">
          {[...quote.revisions].reverse().map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.name}</p><p className="text-xs text-stone-500">{new Date(r.at).toLocaleString()} · {r.data.counters.length} counters</p></div>
              {editable && <Button size="xs" onClick={() => onRestore(structuredClone(r.data))}>Restore</Button>}
              {editable && <button className="p-1 text-stone-400 hover:text-clay-600" onClick={async () => { if (await confirm({ title: "Delete revision?", danger: true, confirmLabel: "Delete" })) db.update("countertop_quotes", quote.id, { revisions: quote.revisions.filter((x) => x.id !== r.id) }); }}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
