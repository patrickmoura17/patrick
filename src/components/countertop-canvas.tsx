"use client";
// Interactive countertop drawing surface. World units are inches; strokes use
// non-scaling-stroke and text is sized per zoom so it reads the same at any scale.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CUTOUT_DEFAULTS, fmtIn, geometry, outlinePath, outwardNormal, toWorld, type Pt } from "@/lib/countertop";
import type { Counter, Cutout, QuoteDrawing } from "@/lib/types";

export type Selection =
  | { kind: "counter"; id: string }
  | { kind: "edge"; id: string; i: number }
  | { kind: "corner"; id: string; i: number }
  | { kind: "cutout"; id: string }
  | { kind: "text"; id: string }
  | null;

export interface CanvasHandle {
  zoom: (f: number) => void;
  reset: () => void;
  center: () => Pt;
  exportPng: () => Promise<string>;
}

interface Props {
  doc: QuoteDrawing;
  step: number;
  sel: Selection;
  panMode: boolean;
  onSelect: (s: Selection) => void;
  onMoveCounter: (id: string, x: number, y: number, done: boolean) => void;
  onMoveCutout: (id: string, dx: number, dy: number, done: boolean) => void;
  onMoveText: (id: string, x: number, y: number, done: boolean) => void;
  onEditDimension: (counterId: string, edgeIndex: number) => void;
  onEditText: (id: string) => void;
}

const WALL = "#2a78d6";
const CUT = "#eb6834";
const LINE = "#3f7150";

export function contentBounds(doc: QuoteDrawing) {
  const pts = doc.counters.flatMap((c) => geometry(c).pts);
  doc.texts.forEach((t) => pts.push({ x: t.x, y: t.y }));
  if (!pts.length) return { x: -20, y: -20, w: 240, h: 160 };
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  const pad = 30;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export const CountertopCanvas = forwardRef<CanvasHandle, Props>(function CountertopCanvas(props, ref) {
  const { doc, step, sel, panMode } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(() => {
    const b = contentBounds(doc);
    return { x: b.x, y: b.y, w: Math.max(b.w, 200) };
  });
  const drag = useRef<null | { type: "pan" | "counter" | "cutout" | "text"; id?: string; start: Pt; orig: Pt; client: Pt; moved: boolean }>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const scale = Math.max(size.w, 1) / view.w; // px per inch
  const vh = Math.max(size.h, 1) / scale;
  const px = (n: number) => n / scale; // pixels → inches

  const fit = useCallback(() => {
    const b = contentBounds(doc);
    const aspect = size.h / size.w;
    const w = Math.max(b.w, b.h / aspect, 120);
    setView({ x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - (w * aspect) / 2, w });
  }, [doc, size]);

  // keep the drawing fitted to the container until the user zooms or pans
  const userView = useRef(false);
  useEffect(() => {
    if (!userView.current && size.w > 0 && size.h > 0) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  useImperativeHandle(ref, () => ({
    zoom: (f) => { userView.current = true; setView((v) => {
      const cx = v.x + v.w / 2, cy = v.y + (v.w * size.h) / size.w / 2;
      const w = Math.min(2000, Math.max(24, v.w / f));
      return { x: cx - w / 2, y: cy - (w * size.h) / size.w / 2, w };
    }); },
    reset: () => { userView.current = false; fit(); },
    center: () => ({ x: view.x + view.w / 2, y: view.y + vh / 2 }),
    exportPng: async () => {
      // render the fitted drawing at screen scale, capture it, then restore the user's view
      const prev = view;
      fit();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 60));
      const clone = svg.current!.cloneNode(true) as SVGSVGElement;
      clone.querySelectorAll("[data-ui]").forEach((n) => n.remove());
      const W = size.w * 2, H = size.h * 2;
      clone.setAttribute("width", String(W));
      clone.setAttribute("height", String(H));
      setView(prev);
      const xml = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      return cv.toDataURL("image/png");
    },
  }));

  const toIn = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: view.y + ((e.clientY - r.top) / r.height) * vh };
  };
  const snap = (n: number) => Math.round(n * 4) / 4;

  const onPointerDown = (e: React.PointerEvent, type: "pan" | "counter" | "cutout" | "text", id?: string, orig: Pt = { x: 0, y: 0 }) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { type: panMode ? "pan" : type, id, start: toIn(e), orig, client: { x: e.clientX, y: e.clientY }, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.type === "pan") {
      const dx = ((e.clientX - d.client.x) / size.w) * view.w, dy = ((e.clientY - d.client.y) / size.h) * vh;
      d.client = { x: e.clientX, y: e.clientY };
      userView.current = true;
      setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      return;
    }
    const p = toIn(e);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.type === "counter" && d.id) props.onMoveCounter(d.id, snap(d.orig.x + dx), snap(d.orig.y + dy), false);
    if (d.type === "cutout" && d.id) props.onMoveCutout(d.id, dx, dy, false);
    if (d.type === "text" && d.id) props.onMoveText(d.id, snap(d.orig.x + dx), snap(d.orig.y + dy), false);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      if (d.type === "pan") props.onSelect(null);
      return;
    }
    const p = toIn(e);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.type === "counter" && d.id) props.onMoveCounter(d.id, snap(d.orig.x + dx), snap(d.orig.y + dy), true);
    if (d.type === "cutout" && d.id) props.onMoveCutout(d.id, dx, dy, true);
    if (d.type === "text" && d.id) props.onMoveText(d.id, snap(d.orig.x + dx), snap(d.orig.y + dy), true);
  };
  const onWheel = (e: React.WheelEvent) => {
    const p = toIn(e);
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    userView.current = true;
    setView((v) => {
      const w = Math.min(2000, Math.max(24, v.w / f));
      const k = w / v.w;
      return { x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w };
    });
  };

  const fs = px(11.5);
  const grid = Math.pow(10, Math.ceil(Math.log10(px(28))));

  return (
    <div ref={wrap} className="relative h-full w-full touch-none select-none overflow-hidden bg-white">
      {size.w > 0 && <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${vh}`}
        width={size.w}
        height={size.h}
        className={panMode ? "cursor-grab active:cursor-grabbing" : "cursor-default"}
        onPointerDown={(e) => onPointerDown(e, "pan")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        fontFamily="Inter Variable, Inter, system-ui, sans-serif"
      >
        <defs data-ui>
          <pattern id="ctgrid" width={grid} height={grid} patternUnits="userSpaceOnUse">
            <path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="#f1eee9" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </pattern>
        </defs>
        <rect data-ui x={view.x} y={view.y} width={view.w} height={vh} fill="url(#ctgrid)" />

        {doc.counters.map((c) => <CounterShape key={c.id} {...props} c={c} fs={fs} px={px} onDown={onPointerDown} />)}

        {doc.texts.map((t) => (
          <text
            key={t.id}
            x={t.x}
            y={t.y}
            fontSize={fs * 1.15}
            fill={sel?.kind === "text" && sel.id === t.id ? "#946f39" : "#161a20"}
            fontWeight={600}
            style={{ cursor: "move" }}
            onPointerDown={(e) => { props.onSelect({ kind: "text", id: t.id }); onPointerDown(e, "text", t.id, { x: t.x, y: t.y }); }}
            onDoubleClick={() => props.onEditText(t.id)}
          >
            {t.text}
          </text>
        ))}
        {!doc.counters.length && (
          <text data-ui x={view.x + view.w / 2} y={view.y + vh / 2} textAnchor="middle" fontSize={px(15)} fill="#a8a093">
            Add a counter with “Other Counter” to start drawing
          </text>
        )}
      </svg>}
    </div>
  );
});

function CounterShape({ c, doc, step, sel, fs, px, onDown, onSelect, onEditDimension }: { c: Counter; doc: QuoteDrawing; step: number; sel: Selection; fs: number; px: (n: number) => number; onDown: (e: React.PointerEvent, type: "counter" | "cutout", id: string, orig?: Pt) => void } & Props) {
  const g = geometry(c);
  const selected = sel && "id" in sel && sel.id === c.id && sel.kind !== "cutout" && sel.kind !== "text";
  const path = outlinePath(c);
  const cutouts = doc.cutouts.filter((x) => x.counter_id === c.id);
  const editEdges = step === 2 || step === 3;
  return (
    <g>
      <path
        d={path}
        fill={selected ? "rgba(176,138,72,.08)" : "rgba(79,138,94,.035)"}
        stroke={LINE}
        strokeWidth={selected ? 2.25 : 1.5}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: step === 1 ? "move" : "pointer" }}
        onPointerDown={(e) => {
          onSelect({ kind: "counter", id: c.id });
          if (step === 1) onDown(e, "counter", c.id, { x: c.x, y: c.y });
          else e.stopPropagation();
        }}
      />
      {/* wall / splash edges */}
      {g.edges.map((e, i) => {
        const a = c.edges[i];
        if (!a?.wall) return null;
        const n = outwardNormal(e, g.sign);
        const o = px(2.5);
        return (
          <g key={`w${i}`}>
            <line x1={e.a.x + n.x * o} y1={e.a.y + n.y * o} x2={e.b.x + n.x * o} y2={e.b.y + n.y * o} stroke={WALL} strokeWidth={a.splash === "full" ? 4 : 2.5} vectorEffect="non-scaling-stroke" strokeDasharray={a.splash === "none" || !a.splash ? "6 4" : undefined} />
          </g>
        );
      })}
      {/* edge hit targets (curves, splash/edge) */}
      {editEdges &&
        g.edges.map((e, i) => {
          const on = sel?.kind === "edge" && sel.id === c.id && sel.i === i;
          return (
            <line
              data-ui
              key={`h${i}`}
              x1={e.a.x}
              y1={e.a.y}
              x2={e.b.x}
              y2={e.b.y}
              stroke={on ? "#c39e5d" : "transparent"}
              strokeWidth={on ? 6 : 16}
              strokeOpacity={on ? 0.7 : 1}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: "pointer" }}
              onPointerDown={(ev) => { ev.stopPropagation(); onSelect({ kind: "edge", id: c.id, i }); }}
            />
          );
        })}
      {/* finished-edge highlight in Splash & Edge step */}
      {step === 3 &&
        g.edges.map((e, i) => (!c.edges[i]?.wall ? <line data-ui key={`f${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke="#c98a14" strokeWidth={1.5} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null))}
      {/* corner handles */}
      {step === 2 &&
        g.pts.map((p, i) => {
          const on = sel?.kind === "corner" && sel.id === c.id && sel.i === i;
          const k = c.corners[i];
          return (
            <circle
              data-ui
              key={`c${i}`}
              cx={p.x}
              cy={p.y}
              r={px(on ? 8 : 6)}
              fill={on ? "#b08a48" : k && k.type !== "none" ? "#e5d2ad" : "#fff"}
              stroke="#946f39"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: "pointer" }}
              onPointerDown={(ev) => { ev.stopPropagation(); onSelect({ kind: "corner", id: c.id, i }); }}
            />
          );
        })}
      {/* dimensions */}
      {g.edges.map((e, i) => {
        const n = outwardNormal(e, g.sign);
        const off = px(c.edges[i]?.wall ? 26 : 20) + Math.max(0, c.edges[i]?.curve ?? 0);
        const a = { x: e.a.x + n.x * off, y: e.a.y + n.y * off }, b = { x: e.b.x + n.x * off, y: e.b.y + n.y * off };
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const vertical = Math.abs(e.b.x - e.a.x) < Math.abs(e.b.y - e.a.y);
        const editable = step === 1 && !!e.param;
        const label = fmtIn(e.len);
        const tw = px(label.length * 6.6 + 8);
        const t = px(4);
        const ux = (e.b.x - e.a.x) / e.len, uy = (e.b.y - e.a.y) / e.len;
        return (
          <g key={`d${i}`} style={{ cursor: editable ? "pointer" : "default" }} onPointerDown={(ev) => { if (editable) { ev.stopPropagation(); onEditDimension(c.id, i); } }}>
            <line x1={e.a.x + n.x * px(4)} y1={e.a.y + n.y * px(4)} x2={a.x + n.x * px(4)} y2={a.y + n.y * px(4)} stroke="#cfc9be" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={e.b.x + n.x * px(4)} y1={e.b.y + n.y * px(4)} x2={b.x + n.x * px(4)} y2={b.y + n.y * px(4)} stroke="#cfc9be" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#a8a093" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <path d={`M ${a.x} ${a.y} l ${ux * t + n.x * t / 2} ${uy * t + n.y * t / 2} M ${a.x} ${a.y} l ${ux * t - n.x * t / 2} ${uy * t - n.y * t / 2} M ${b.x} ${b.y} l ${-ux * t + n.x * t / 2} ${-uy * t + n.y * t / 2} M ${b.x} ${b.y} l ${-ux * t - n.x * t / 2} ${-uy * t - n.y * t / 2}`} stroke="#a8a093" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
            <g transform={`translate(${mx} ${my}) ${vertical ? "rotate(-90)" : ""}`}>
              <rect data-ui={editable ? undefined : "1"} x={-tw / 2} y={-px(8)} width={tw} height={px(16)} rx={px(3)} fill={editable ? "#faf6ee" : "#fff"} stroke={editable ? "#d4b67f" : "none"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text textAnchor="middle" dominantBaseline="central" fontSize={fs} fill="#35312c">{label}</text>
            </g>
          </g>
        );
      })}
      {/* counter label */}
      {(() => {
        const b = g.pts.reduce((s, p) => ({ x: s.x + p.x / g.pts.length, y: s.y + p.y / g.pts.length }), { x: 0, y: 0 });
        return c.label ? <text x={c.kind === "rect" ? b.x : g.pts[0].x + px(10)} y={c.kind === "rect" ? b.y + (cutouts.length ? px(30) : 0) : g.pts[0].y + px(18)} textAnchor={c.kind === "rect" ? "middle" : "start"} fontSize={fs * 0.95} fill="#857d70" pointerEvents="none">{c.label}{c.island ? " (island)" : ""}</text> : null;
      })()}
      {cutouts.map((x) => <CutoutShape key={x.id} x={x} c={c} sel={sel} step={step} px={px} fs={fs} onSelect={onSelect} onDown={onDown} />)}
    </g>
  );
}

function CutoutShape({ x, c, sel, step, px, fs, onSelect, onDown }: { x: Cutout; c: Counter; sel: Selection; step: number; px: (n: number) => number; fs: number; onSelect: (s: Selection) => void; onDown: (e: React.PointerEvent, type: "counter" | "cutout", id: string, orig?: Pt) => void }) {
  const center = toWorld(c, { x: x.x, y: x.y });
  const rotated = c.rot === 90 || c.rot === 270;
  const w = rotated ? x.d : x.w, h = rotated ? x.w : x.d;
  const on = sel?.kind === "cutout" && sel.id === x.id;
  // faucet holes sit on the wall side (local -y) of the sink
  const holeLocal = (k: number, n: number) => ({ x: x.x + (k - (n - 1) / 2) * 2.5, y: x.y - x.d / 2 - 2 });
  return (
    <g
      style={{ cursor: step === 4 ? "move" : "pointer" }}
      onPointerDown={(e) => {
        onSelect({ kind: "cutout", id: x.id });
        if (step === 4) onDown(e, "cutout", x.id, { x: x.x, y: x.y });
        else e.stopPropagation();
      }}
    >
      <rect x={center.x - w / 2} y={center.y - h / 2} width={w} height={h} rx={x.kind === "cooktop" ? 1.5 : 3} fill={on ? "rgba(235,104,52,.12)" : "#fff"} stroke={CUT} strokeWidth={on ? 2.25 : 1.5} vectorEffect="non-scaling-stroke" />
      {x.kind === "cooktop" ? (
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j], k) => (
          <circle key={k} cx={center.x + (i * w) / 4.2} cy={center.y + (j * h) / 4.2} r={Math.min(w, h) / 7} fill="none" stroke={CUT} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        ))
      ) : (
        <>
          {Array.from({ length: x.faucet_holes }).map((_, k) => {
            const p = toWorld(c, holeLocal(k, x.faucet_holes));
            return <circle key={k} cx={p.x} cy={p.y} r={0.75} fill="#fff" stroke={CUT} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />;
          })}
          <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="central" fontSize={fs * 0.9} fill={CUT}>{fmtIn(x.w)}</text>
        </>
      )}
      {on && step === 4 && <text data-ui x={center.x} y={center.y + h / 2 + px(14)} textAnchor="middle" fontSize={fs * 0.85} fill="#857d70">{CUTOUT_DEFAULTS[x.kind].label}</text>}
    </g>
  );
}
