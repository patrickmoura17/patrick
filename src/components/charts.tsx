"use client";
// Chart primitives (Recharts) following the dataviz method: thin marks, rounded
// data-ends, recessive grid, one axis, hover tooltips, legends for 2+ series.
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { compactMoney, money } from "@/lib/format";

const AXIS = { stroke: "#a8a093", fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid stroke="#ece9e3" strokeDasharray="0" vertical={false} />;

function Tip({ active, payload, label, fmt = money }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; fmt?: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-pop">
      {label && <p className="mb-1 font-semibold text-ink-900">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-stone-600">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span className="flex-1">{p.name}</span>
          <span className="font-semibold tabular-nums text-ink-900">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function RevenueChart({ data, height = 260 }: { data: { label: string; revenue: number; costs?: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b08a48" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#b08a48" stopOpacity={0} />
          </linearGradient>
        </defs>
        {GRID}
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={compactMoney} width={56} />
        <Tooltip content={<Tip />} cursor={{ stroke: "#cfc9be", strokeWidth: 1 }} />
        <Area type="monotone" dataKey="revenue" name="Collected" stroke="#946f39" strokeWidth={2} fill="url(#rev)" activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
        {data[0] && "costs" in data[0] && <Line type="monotone" dataKey="costs" name="Costs" stroke="#4f7190" strokeWidth={2} dot={false} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RevenueCostChart({ data, height = 280 }: { data: { label: string; revenue: number; costs: number; booked: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={compactMoney} width={56} />
        <Tooltip content={<Tip />} cursor={{ stroke: "#cfc9be" }} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#675f54" }} />
        <Line type="monotone" dataKey="revenue" name="Collected" stroke="#c98a14" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="booked" name="Booked" stroke="#2a78d6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="costs" name="Job costs" stroke="#eb6834" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 220, center }: { data: { name: string; value: number; color: string }[]; height?: number; center?: { label: string; value: string } }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={1.5} stroke="#fff" strokeWidth={2}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<Tip fmt={(n) => `${money(n)} · ${total ? ((n / total) * 100).toFixed(0) : 0}%`} />} />
        </PieChart>
      </ResponsiveContainer>
      {center && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-stone-500">{center.label}</span>
          <span className="text-lg font-semibold tabular-nums text-ink-900">{center.value}</span>
        </div>
      )}
    </div>
  );
}

export function LegendList({ data, fmt = money }: { data: { name: string; value: number; color: string }[]; fmt?: (n: number) => string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.name} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
          <span className="flex-1 text-stone-600">{d.name}</span>
          <span className="font-semibold tabular-nums text-ink-900">{fmt(d.value)}</span>
          <span className="w-10 text-right text-xs tabular-nums text-stone-400">{total ? Math.round((d.value / total) * 100) : 0}%</span>
        </li>
      ))}
    </ul>
  );
}

export function FunnelBars({ data }: { data: { stage: string; count: number; color: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const prev = i > 0 ? data[i - 1].count : null;
        const rate = prev ? Math.round((d.count / Math.max(1, prev)) * 100) : null;
        return (
          <div key={d.stage} className="group flex items-center gap-3" title={`${d.stage}: ${d.count}`}>
            <span className="w-40 shrink-0 truncate text-xs text-stone-600">{d.stage}</span>
            <div className="h-6 flex-1 rounded bg-stone-50">
              <div className="flex h-full items-center rounded-r px-2 transition-all group-hover:opacity-90" style={{ width: `${Math.max(4, (d.count / max) * 100)}%`, background: "#c39e5d" }}>
                <span className="text-[11px] font-semibold tabular-nums text-ink-900">{d.count}</span>
              </div>
            </div>
            <span className="w-10 text-right text-[11px] tabular-nums text-stone-400">{rate !== null ? `${rate}%` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

export function HBarChart({ data, height = 260, fmt = compactMoney, color = "#c98a14" }: { data: { name: string; value: number; color?: string }[]; height?: number; fmt?: (n: number) => string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid stroke="#ece9e3" horizontal={false} />
        <XAxis type="number" {...AXIS} tickFormatter={fmt} />
        <YAxis type="category" dataKey="name" {...AXIS} width={130} tick={{ fill: "#4d473f", fontSize: 12 }} />
        <Tooltip content={<Tip fmt={(n) => (fmt === compactMoney ? money(n) : fmt(n))} />} cursor={{ fill: "#f4f2ee" }} />
        <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color ?? color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProfitBars({ data, height = 280 }: { data: { name: string; estimated: number; actual: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2} barCategoryGap="24%">
        {GRID}
        <XAxis dataKey="name" {...AXIS} interval={0} tick={{ fontSize: 10, fill: "#857d70" }} />
        <YAxis {...AXIS} tickFormatter={compactMoney} width={56} />
        <Tooltip content={<Tip />} cursor={{ fill: "#f4f2ee" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
        <Bar dataKey="estimated" name="Estimated profit" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="actual" name="Actual profit" fill="#c98a14" radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleBars({ data, height = 220, name = "Value", fmt = compactMoney }: { data: { label: string; value: number }[]; height?: number; name?: string; fmt?: (n: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={fmt} width={56} />
        <Tooltip content={<Tip fmt={(n) => (fmt === compactMoney ? money(n) : fmt(n))} />} cursor={{ fill: "#f4f2ee" }} />
        <Bar dataKey="value" name={name} fill="#c98a14" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
