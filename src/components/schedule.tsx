"use client";
import { Plus, Trash2 } from "lucide-react";
import { milestoneAmounts } from "@/lib/calc";
import { money } from "@/lib/format";
import type { PaymentMilestone } from "@/lib/types";
import { Button, Input, NumberInput, cn } from "./ui";

export function ScheduleEditor({ schedule, total, locked, onChange }: { schedule: PaymentMilestone[]; total: number; locked: boolean; onChange: (s: PaymentMilestone[]) => void }) {
  const sum = schedule.reduce((s, m) => s + Number(m.percent), 0);
  const amts = milestoneAmounts(total, schedule.map((m) => m.percent));
  const presets: { label: string; s: [string, number, string][] }[] = [
    { label: "30 / 40 / 30", s: [["Deposit", 30, "Contract signing"], ["Material delivery", 40, "Materials delivered to site"], ["Completion", 30, "Substantial completion"]] },
    { label: "50 / 50", s: [["Deposit", 50, "Contract signing"], ["Completion", 50, "Substantial completion"]] },
    { label: "10 / 40 / 40 / 10", s: [["Deposit", 10, "Contract signing"], ["Material delivery", 40, "Materials delivered"], ["Rough-in complete", 40, "Installation 50% complete"], ["Final", 10, "Final walkthrough"]] },
  ];
  return (
    <div className="space-y-3">
      {!locked && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-stone-500">Presets:</span>
          {presets.map((p) => <Button key={p.label} size="xs" variant="outline" onClick={() => onChange(p.s.map(([label, percent, trigger], i) => ({ id: `m${i + 1}-${Date.now()}`, label, percent, trigger })))}>{p.label}</Button>)}
        </div>
      )}
      <div className="divide-y divide-stone-100 rounded-xl border border-stone-200">
        {schedule.map((m, i) => (
          <div key={m.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2">
            <Input disabled={locked} className="col-span-12 md:col-span-3" value={m.label} onChange={(e) => onChange(schedule.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <Input disabled={locked} className="col-span-12 md:col-span-4" value={m.trigger} onChange={(e) => onChange(schedule.map((x, j) => (j === i ? { ...x, trigger: e.target.value } : x)))} placeholder="Due upon…" />
            <div className="col-span-4 flex items-center gap-1 md:col-span-2"><NumberInput disabled={locked} className="text-right" value={m.percent} onChange={(n) => onChange(schedule.map((x, j) => (j === i ? { ...x, percent: n } : x)))} /><span className="text-sm text-stone-400">%</span></div>
            <span className="col-span-6 text-right text-sm font-semibold tabular-nums md:col-span-2">{money(amts[i])}</span>
            {!locked && <button className="col-span-2 justify-self-end rounded p-1 text-stone-400 hover:text-clay-600 md:col-span-1" onClick={() => onChange(schedule.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
        {!schedule.length && <p className="p-4 text-center text-sm text-stone-400">No milestones — full amount due on completion.</p>}
      </div>
      <div className="flex items-center justify-between">
        {!locked ? <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...schedule, { id: `m${Date.now()}`, label: "Progress payment", percent: Math.max(0, 100 - sum), trigger: "" }])}>Add milestone</Button> : <span />}
        <span className={cn("text-sm font-semibold tabular-nums", Math.abs(sum - 100) > 0.01 && schedule.length ? "text-clay-600" : "text-sage-700")}>{sum}% of {money(total)}</span>
      </div>
    </div>
  );
}

