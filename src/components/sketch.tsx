"use client";
// Room / countertop / shower sketch pad. Points are stored in feet; area and
// perimeter are computed live (shoelace formula) and fed back to the measurement.
import { useRef, useState } from "react";
import { Eraser, Grid3x3, Square, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { polygonArea, polygonPerimeter, round2 } from "@/lib/calc";
import type { MeasurementPoint } from "@/lib/types";
import { Button } from "./ui";

export function SketchPad({ points, onChange, disabled, length, width }: { points: MeasurementPoint[]; onChange: (p: MeasurementPoint[]) => void; disabled?: boolean; length: number; width: number }) {
  const [span, setSpan] = useState(() => Math.max(16, Math.ceil(Math.max(...points.map((p) => Math.max(p.x, p.y)), length, width, 10) / 4) * 4 + 4));
  const [snap, setSnap] = useState(0.5);
  const [dragI, setDragI] = useState<number | null>(null);
  const [hover, setHover] = useState<MeasurementPoint | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const W = 640, H = 420;
  const scale = W / span; // px per foot
  const spanY = H / scale;
  const toFt = (e: React.MouseEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W / scale - 1;
    const y = ((e.clientY - r.top) / r.height) * H / scale - 1;
    return { x: Math.max(0, round2(Math.round(x / snap) * snap)), y: Math.max(0, round2(Math.round(y / snap) * snap)) };
  };
  const px = (p: MeasurementPoint) => ({ x: (p.x + 1) * scale, y: (p.y + 1) * scale });
  const closed = points.length >= 3;
  const area = polygonArea(points);
  const per = polygonPerimeter(points, closed);
  const grid: React.ReactNode[] = [];
  for (let f = 0; f <= span; f++) grid.push(<line key={`v${f}`} x1={(f + 1) * scale} y1={0} x2={(f + 1) * scale} y2={H} stroke={f % 5 === 0 ? "#e3dfd7" : "#f1eee9"} strokeWidth={1} />);
  for (let f = 0; f <= spanY; f++) grid.push(<line key={`h${f}`} x1={0} y1={(f + 1) * scale} x2={W} y2={(f + 1) * scale} stroke={f % 5 === 0 ? "#e3dfd7" : "#f1eee9"} strokeWidth={1} />);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="xs" disabled={disabled || !points.length} icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => onChange(points.slice(0, -1))}>Undo</Button>
        <Button size="xs" disabled={disabled || !points.length} icon={<Eraser className="h-3.5 w-3.5" />} onClick={() => onChange([])}>Clear</Button>
        <Button size="xs" disabled={disabled || !(length > 0 && width > 0)} icon={<Square className="h-3.5 w-3.5" />} onClick={() => onChange([{ x: 0, y: 0 }, { x: length, y: 0 }, { x: length, y: width }, { x: 0, y: width }])}>Rectangle from L × W</Button>
        <Button size="xs" disabled={disabled} onClick={() => onChange([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 2.1 }, { x: 2.1, y: 2.1 }, { x: 2.1, y: 10 }, { x: 0, y: 10 }])}>L-shape</Button>
        <span className="mx-1 h-4 w-px bg-stone-200" />
        <Button size="icon" className="h-7 w-7" onClick={() => setSpan((s) => Math.max(8, s - 4))}><ZoomIn className="h-3.5 w-3.5" /></Button>
        <Button size="icon" className="h-7 w-7" onClick={() => setSpan((s) => Math.min(120, s + 4))}><ZoomOut className="h-3.5 w-3.5" /></Button>
        <Button size="xs" icon={<Grid3x3 className="h-3.5 w-3.5" />} onClick={() => setSnap((s) => (s === 0.5 ? 1 / 12 : s === 1 / 12 ? 1 : 0.5))}>Snap {snap === 1 ? "1 ft" : snap === 0.5 ? "6 in" : "1 in"}</Button>
        <span className="ml-auto text-xs tabular-nums text-stone-500">{area > 0 ? <><b className="text-ink-900">{area} sqft</b> · {per} lf perimeter</> : "Click on the grid to place corners"}</span>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-xl border border-stone-200 bg-white"
        style={{ cursor: disabled ? "default" : "crosshair" }}
        onMouseMove={(e) => {
          const p = toFt(e);
          setHover(p);
          if (dragI !== null && !disabled) onChange(points.map((q, i) => (i === dragI ? p : q)));
        }}
        onMouseLeave={() => { setHover(null); setDragI(null); }}
        onMouseUp={() => setDragI(null)}
        onClick={(e) => {
          if (disabled || dragI !== null) return;
          const p = toFt(e);
          if (points.some((q) => q.x === p.x && q.y === p.y)) return;
          onChange([...points, p]);
        }}
      >
        {grid}
        {points.length > 1 && (
          <polygon
            points={points.map((p) => `${px(p).x},${px(p).y}`).join(" ")}
            fill={closed ? "rgba(176,138,72,.14)" : "none"}
            stroke="#946f39"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        {points.map((p, i) => {
          if (points.length < 2 || (i === points.length - 1 && !closed)) return null;
          const q = points[(i + 1) % points.length];
          const a = px(p), b = px(q);
          const len = round2(Math.hypot(q.x - p.x, q.y - p.y));
          const ft = Math.floor(len), inch = Math.round((len - ft) * 12);
          return (
            <g key={`l${i}`}>
              <rect x={(a.x + b.x) / 2 - 26} y={(a.y + b.y) / 2 - 9} width={52} height={18} rx={4} fill="#161a20" opacity={0.85} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">{ft}&apos;{inch ? ` ${inch}"` : ""}</text>
            </g>
          );
        })}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={px(p).x}
            cy={px(p).y}
            r={6}
            fill={i === 0 ? "#b08a48" : "#fff"}
            stroke="#946f39"
            strokeWidth={2}
            style={{ cursor: disabled ? "default" : "move" }}
            onMouseDown={(e) => { e.stopPropagation(); if (!disabled) setDragI(i); }}
            onClick={(e) => e.stopPropagation()}
          />
        ))}
        {hover && !disabled && dragI === null && <circle cx={px(hover).x} cy={px(hover).y} r={3} fill="#946f39" opacity={0.5} />}
        <text x={8} y={H - 8} fontSize={10} fill="#a8a093">1 square = 1 ft · bold line = 5 ft{hover ? ` · cursor ${hover.x}', ${hover.y}'` : ""}</text>
      </svg>
    </div>
  );
}
