"use client";
// Change order editor: add / modify / remove scope with live contract recalculation.
import { useState } from "react";
import { CheckCircle2, Download, Plus, Send, Trash2, XCircle } from "lucide-react";
import { db, useSettings, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { custName, respondChangeOrder, sendChangeOrder } from "@/lib/services";
import { changeOrderLineAmount, changeOrderTotals, round2 } from "@/lib/calc";
import { fmtDateTime, money } from "@/lib/format";
import { changeOrderPdf, openPdf } from "@/lib/pdf";
import type { ChangeOrder, ChangeOrderItem, Unit } from "@/lib/types";
import { Badge, Button, Field, Input, Modal, NumberInput, Select, Textarea, cn, useToast } from "./ui";

export const CO_TONE = { draft: "neutral", sent: "blue", approved: "green", rejected: "red" } as const;

export function ChangeOrderEditor({ co, onClose }: { co: ChangeOrder | null; onClose: () => void }) {
  const S = useSnapshot();
  const settings = useSettings();
  const { can } = useAuth();
  const { toast, confirm, prompt } = useToast();
  const [pick, setPick] = useState("");
  const live = co ? S.change_orders.find((c) => c.id === co.id) ?? co : null;
  if (!live) return null;
  const p = S.projects.find((x) => x.id === live.project_id);
  const cust = p ? S.customers.find((c) => c.id === p.customer_id) : undefined;
  const editable = live.status === "draft" && can("projects.edit");
  const t = changeOrderTotals(live);
  const upd = (patch: Partial<ChangeOrder>) => editable && db.update("change_orders", live.id, patch);
  const setItem = (i: number, patch: Partial<ChangeOrderItem>) => upd({ items: live.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const estItems = p?.estimate_id ? S.estimate_items.filter((i) => i.estimate_id === p.estimate_id) : [];
  const baseContract = live.status === "approved" ? (p?.contract_value ?? 0) - t.amount : p?.contract_value ?? 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={<span className="flex items-center gap-2">{live.number} <Badge tone={CO_TONE[live.status]} dot>{live.status}</Badge></span>}
      subtitle={`${p?.number} · ${p?.name} · ${custName(cust)}`}
      footer={
        <>
          <Button className="mr-auto" icon={<Download className="h-4 w-4" />} onClick={async () => settings && openPdf(await changeOrderPdf(settings, live, p, cust), `${live.number}.pdf`)}>PDF</Button>
          {editable && <Button variant="ghost" className="text-clay-600" onClick={async () => { if (await confirm({ title: "Delete change order?", danger: true, confirmLabel: "Delete" })) { db.remove("change_orders", live.id); onClose(); } }}>Delete</Button>}
          {editable && <Button variant="brass" icon={<Send className="h-4 w-4" />} disabled={!live.items.length} onClick={() => { sendChangeOrder(live.id); toast("Sent to customer portal for approval"); }}>Send for approval</Button>}
          {live.status === "sent" && can("projects.edit") && (
            <>
              <Button icon={<XCircle className="h-4 w-4" />} onClick={async () => { const r = await prompt({ title: "Reason", label: "Customer comment" }); if (r !== null) respondChangeOrder(live.id, "rejected", "", r, "staff"); }}>Rejected</Button>
              <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={async () => { const n = await prompt({ title: "Customer approval", label: "Signed by", initial: custName(cust) }); if (n) { respondChangeOrder(live.id, "approved", n, "", "staff"); toast("Approved · contract updated"); } }}>Record approval</Button>
            </>
          )}
          {live.status === "sent" && <Button onClick={() => db.update("change_orders", live.id, { status: "draft" })}>Back to draft</Button>}
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field label="Title"><Input disabled={!editable} value={live.title} onChange={(e) => upd({ title: e.target.value })} /></Field>
            <Field label="Schedule impact (days)"><NumberInput disabled={!editable} value={live.schedule_impact_days} onChange={(n) => upd({ schedule_impact_days: Math.round(n) })} /></Field>
          </div>
          <Field label="Reason / description"><Textarea disabled={!editable} value={live.reason} onChange={(e) => upd({ reason: e.target.value })} /></Field>
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-stone-50 text-[10.5px] font-semibold uppercase tracking-wider text-stone-500">
                <tr><th className="px-2 py-2 text-left">Change</th><th className="px-2 text-left">Description</th><th className="w-20 px-1 text-right">Qty</th><th className="w-20 px-1">Unit</th><th className="w-24 px-1 text-right">Price/unit</th><th className="w-24 px-1 text-right">Cost/unit</th><th className="w-24 px-2 text-right">Amount</th><th className="w-8" /></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {live.items.map((it, i) => (
                  <tr key={it.id}>
                    <td className="px-2 py-1.5">
                      <Select disabled={!editable} className={cn("h-8 w-28 text-xs font-semibold", it.action === "remove" ? "text-clay-600" : it.action === "add" ? "text-sage-700" : "text-slateblue-600")} value={it.action} onChange={(e) => setItem(i, { action: e.target.value as ChangeOrderItem["action"] })}>
                        <option value="add">Add work</option><option value="modify">Modify</option><option value="remove">Remove</option>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5"><Input disabled={!editable} className="h-8" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></td>
                    <td className="px-1"><NumberInput disabled={!editable} className="h-8 text-right" value={it.quantity} onChange={(n) => setItem(i, { quantity: n })} /></td>
                    <td className="px-1"><Select disabled={!editable} className="h-8 text-xs" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value as Unit })}>{["SQFT", "LF", "EA", "HR", "LS"].map((u) => <option key={u}>{u}</option>)}</Select></td>
                    <td className="px-1"><NumberInput disabled={!editable} className="h-8 text-right" value={it.unit_price} onChange={(n) => setItem(i, { unit_price: n })} /></td>
                    <td className="px-1"><NumberInput disabled={!editable} className="h-8 text-right" value={round2(it.material_cost + it.labor_cost)} onChange={(n) => setItem(i, { material_cost: n, labor_cost: 0 })} /></td>
                    <td className={cn("px-2 text-right font-semibold tabular-nums", changeOrderLineAmount(it) < 0 && "text-clay-600")}>{money(changeOrderLineAmount(it))}</td>
                    <td>{editable && <button className="p-1 text-stone-400 hover:text-clay-600" onClick={() => upd({ items: live.items.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>}</td>
                  </tr>
                ))}
                {!live.items.length && <tr><td colSpan={8} className="py-6 text-center text-sm text-stone-400">No changes yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {editable && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => upd({ items: [...live.items, { id: `c${Date.now()}`, action: "add", description: "", quantity: 1, unit: "SQFT", unit_price: 0, material_cost: 0, labor_cost: 0 }] })}>Add new work</Button>
              {estItems.length > 0 && (
                <div className="flex flex-1 gap-2">
                  <Select className="h-8 text-xs" value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">Modify / remove an existing contract line…</option>
                    {estItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit})</option>)}
                  </Select>
                  <Button size="sm" disabled={!pick} onClick={() => {
                    const src = estItems.find((i) => i.id === pick)!;
                    const price = src.price_override ? src.unit_price : round2((src.material_cost + src.labor_cost) * (1 + src.markup / 100));
                    upd({ items: [...live.items, { id: `c${Date.now()}`, action: "modify", description: `${src.name} — quantity adjustment`, quantity: 0, unit: src.unit, unit_price: price, material_cost: src.material_cost, labor_cost: src.labor_cost }] });
                    setPick("");
                  }}>Adjust</Button>
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-stone-400">Modify lines: enter the quantity difference (use a negative quantity to reduce). Remove lines subtract from the contract.</p>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl bg-stone-50 p-4 text-sm">
            <div className="flex justify-between py-1"><span className="text-stone-500">Current contract</span><span className="tabular-nums">{money(baseContract)}</span></div>
            <div className="flex justify-between py-1"><span className="text-stone-500">This change</span><span className={cn("font-semibold tabular-nums", t.amount < 0 ? "text-clay-600" : "text-sage-700")}>{t.amount >= 0 ? "+" : ""}{money(t.amount)}</span></div>
            <div className="mt-1 flex justify-between border-t border-stone-200 pt-2 font-semibold"><span>Revised contract</span><span className="tabular-nums">{money(baseContract + t.amount)}</span></div>
            <div className="mt-3 flex justify-between text-xs"><span className="text-stone-500">Cost impact</span><span className="tabular-nums">{money(t.cost)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-stone-500">Profit impact</span><span className="tabular-nums">{money(t.profit)}</span></div>
          </div>
          <div className="space-y-1 text-xs text-stone-500">
            {live.sent_at && <p>Sent {fmtDateTime(live.sent_at)}</p>}
            {live.approved_at && <p className="text-sage-700">Approved by <b className="font-serif italic">{live.signed_name}</b> · {fmtDateTime(live.approved_at)}</p>}
            {live.customer_comment && <p>Customer: “{live.customer_comment}”</p>}
            {live.status === "draft" && <p>Customer approval is required before this change is added to the contract.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
