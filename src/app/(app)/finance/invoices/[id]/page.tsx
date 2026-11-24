"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Copy, CreditCard, Download, Eye, MoreHorizontal, Plus, Send, Trash2 } from "lucide-react";
import { db, useSettings, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { custName, deletePayment, recordPayment, refreshInvoiceStatus, sendInvoice } from "@/lib/services";
import { invoiceTotals, todayISO } from "@/lib/calc";
import { fmtDate, money } from "@/lib/format";
import { invoicePdf, openPdf } from "@/lib/pdf";
import { InvoiceBadge } from "@/components/status";
import { Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, Menu, Modal, NumberInput, Select, Textarea, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { Invoice, InvoiceLine, Payment, Unit } from "@/lib/types";

export default function InvoicePage() {
  return (
    <RequirePerm perm="finance.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const S = useSnapshot();
  const co = useSettings();
  const { can } = useAuth();
  const router = useRouter();
  const { toast, confirm } = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const inv = S.invoices.find((i) => i.id === id);
  if (!inv || !co) return <Card><EmptyState title="Invoice not found" action={<Link href="/finance"><Button>Back</Button></Link>} /></Card>;
  const pays = S.payments.filter((p) => p.invoice_id === id).sort((a, b) => a.date.localeCompare(b.date));
  const t = invoiceTotals(inv, pays);
  const c = S.customers.find((x) => x.id === inv.customer_id);
  const p = S.projects.find((x) => x.id === inv.project_id);
  const editable = inv.status === "draft" && can("finance.edit");
  const upd = (patch: Partial<Invoice>) => editable && db.update("invoices", inv.id, patch);
  const setLine = (i: number, patch: Partial<InvoiceLine>) => upd({ items: inv.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const pdf = async (mode: "download" | "preview") => openPdf(await invoicePdf(co, inv, c, p, pays), `${inv.number}.pdf`, mode);
  const portal = c ? `${window.location.origin}/portal/${c.portal_token}?invoice=${inv.id}` : "";

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs text-stone-500"><Link href="/finance?status=" className="hover:text-ink-900">Financials</Link> / Invoices</p>
          <h1 className="mt-0.5 flex items-center gap-3 text-2xl font-semibold tracking-tight">{inv.number} <InvoiceBadge s={inv.status} /></h1>
          <p className="mt-1 text-sm text-stone-500"><Link href={`/customers/${c?.id}`} className="font-medium text-ink-800 hover:underline">{custName(c)}</Link>{p && <> · <Link href={`/projects/${p.id}`} className="hover:underline">{p.number} {p.name}</Link></>} · <span className="capitalize">{inv.kind.replace("_", " ")}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Eye className="h-4 w-4" />} onClick={() => void pdf("preview")}>Preview</Button>
          <Button icon={<Download className="h-4 w-4" />} onClick={() => void pdf("download")}>PDF</Button>
          {can("finance.edit") && inv.status === "draft" && <Button variant="brass" icon={<Send className="h-4 w-4" />} disabled={t.total <= 0} onClick={() => { sendInvoice(inv.id); void navigator.clipboard?.writeText(portal).catch(() => {}); toast("Invoice sent · portal link copied"); }}>Send invoice</Button>}
          {can("finance.edit") && ["sent", "partially_paid", "overdue"].includes(inv.status) && <Button variant="success" icon={<CreditCard className="h-4 w-4" />} onClick={() => setPayOpen(true)}>Record payment</Button>}
          <Menu
            trigger={<Button size="icon"><MoreHorizontal className="h-4 w-4" /></Button>}
            items={[
              { label: "Copy portal payment link", icon: <Copy />, onClick: () => { void navigator.clipboard.writeText(portal); toast("Copied"); } },
              ...(can("finance.edit") && inv.status !== "draft" && inv.status !== "void" ? [{ label: "Revert to draft", icon: <Trash2 />, disabled: pays.length > 0, onClick: () => db.update("invoices", inv.id, { status: "draft" }) }] : []),
              ...(can("finance.edit") && inv.status !== "void" ? [{ label: "Void invoice", icon: <Ban />, danger: true, disabled: pays.length > 0, onClick: async () => { if (await confirm({ title: `Void ${inv.number}?`, danger: true, confirmLabel: "Void" })) { db.update("invoices", inv.id, { status: "void" }); if (p && inv.milestone_id) db.update("projects", p.id, { payment_schedule: p.payment_schedule.map((m) => (m.id === inv.milestone_id ? { ...m, invoice_id: null } : m)) }); } } }] : []),
              ...(can("finance.edit") && inv.status === "draft" ? [{ label: "Delete draft", icon: <Trash2 />, danger: true, onClick: async () => { if (await confirm({ title: "Delete draft invoice?", danger: true, confirmLabel: "Delete" })) { if (p && inv.milestone_id) db.update("projects", p.id, { payment_schedule: p.payment_schedule.map((m) => (m.id === inv.milestone_id ? { ...m, invoice_id: null } : m)) }); db.remove("invoices", inv.id); router.push("/finance?status="); } } }] : []),
            ]}
          />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card>
          <div className="grid gap-4 border-b border-stone-100 p-5 md:grid-cols-4">
            <Field label="Issue date"><Input type="date" disabled={!editable} value={inv.issue_date} onChange={(e) => upd({ issue_date: e.target.value })} /></Field>
            <Field label="Due date"><Input type="date" disabled={!can("finance.edit") || inv.status === "void"} value={inv.due_date} onChange={(e) => { db.update("invoices", inv.id, { due_date: e.target.value }); refreshInvoiceStatus(inv.id); }} /></Field>
            <Field label="Type"><Select disabled={!editable} value={inv.kind} onChange={(e) => upd({ kind: e.target.value as Invoice["kind"] })}>{["deposit", "progress", "final", "standard", "change_order"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</Select></Field>
            <Field label="Bill to"><Input disabled value={c?.billing_address ?? ""} /></Field>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-[10.5px] font-semibold uppercase tracking-wider text-stone-400"><tr><th className="px-5 py-2 text-left">Description</th><th className="w-20 text-right">Qty</th><th className="w-20">Unit</th><th className="w-28 text-right">Rate</th><th className="w-16 text-center">Tax</th><th className="w-28 px-5 text-right">Amount</th><th className="w-8" /></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {inv.items.map((l, i) => (
                  <tr key={l.id}>
                    <td className="px-5 py-2"><Input disabled={!editable} className="h-8" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description" /></td>
                    <td className="px-1"><NumberInput disabled={!editable} className="h-8 text-right" value={l.quantity} onChange={(n) => setLine(i, { quantity: n })} /></td>
                    <td className="px-1"><Select disabled={!editable} className="h-8 text-xs" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value as Unit })}>{["LS", "EA", "SQFT", "LF", "HR"].map((u) => <option key={u}>{u}</option>)}</Select></td>
                    <td className="px-1"><NumberInput disabled={!editable} className="h-8 text-right" value={l.unit_price} onChange={(n) => setLine(i, { unit_price: n })} /></td>
                    <td className="text-center"><input type="checkbox" disabled={!editable} className="accent-brass-500" checked={l.taxable} onChange={(e) => setLine(i, { taxable: e.target.checked })} /></td>
                    <td className="px-5 text-right font-semibold tabular-nums">{money(l.quantity * l.unit_price)}</td>
                    <td>{editable && <button className="p-1 text-stone-400 hover:text-clay-600" onClick={() => upd({ items: inv.items.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editable && <div className="px-5 py-2"><Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => upd({ items: [...inv.items, { id: `l${Date.now()}`, description: "", quantity: 1, unit: "LS", unit_price: 0, taxable: true }] })}>Add line</Button></div>}
          <div className="grid gap-4 border-t border-stone-100 p-5 md:grid-cols-2">
            <Field label="Notes / footer"><Textarea disabled={!editable} value={inv.notes} onChange={(e) => upd({ notes: e.target.value })} /></Field>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-stone-500">Subtotal</span><span className="tabular-nums">{money(t.subtotal)}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">Discount</span><NumberInput disabled={!editable} className="h-8 w-28 text-right" value={inv.discount} onChange={(n) => upd({ discount: Math.max(0, n) })} /></div>
              <div className="flex items-center justify-between"><span className="text-stone-500">Tax rate %</span><NumberInput disabled={!editable} className="h-8 w-28 text-right" value={inv.tax_rate} onChange={(n) => upd({ tax_rate: Math.max(0, n) })} /></div>
              <div className="flex justify-between"><span className="text-stone-500">Tax</span><span className="tabular-nums">{money(t.tax)}</span></div>
              <div className="flex justify-between border-t border-stone-100 pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{money(t.total)}</span></div>
              <div className="flex justify-between text-sage-700"><span>Paid</span><span className="tabular-nums">− {money(t.paid)}</span></div>
              <div className="flex justify-between rounded-lg bg-ink-900 px-3 py-2 text-base font-semibold text-white"><span>Balance due</span><span className="tabular-nums">{money(t.balance)}</span></div>
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Payments" actions={can("finance.edit") && ["sent", "partially_paid", "overdue"].includes(inv.status) && <Button size="xs" onClick={() => setPayOpen(true)}>Record</Button>} />
            {!pays.length ? <EmptyState title="No payments yet" /> : (
              <div className="divide-y divide-stone-100">
                {pays.map((x) => (
                  <div key={x.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <div className="flex-1"><p className="font-medium tabular-nums">{money(x.amount)}</p><p className="text-xs text-stone-500">{fmtDate(x.date)} · {x.method.toUpperCase()}{x.reference ? ` · ${x.reference}` : ""}{x.processor !== "manual" ? ` · ${x.processor}` : ""}</p></div>
                    {can("finance.edit") && <button className="text-stone-300 hover:text-clay-600" onClick={async () => { if (await confirm({ title: "Delete payment?", danger: true, confirmLabel: "Delete" })) deletePayment(x.id); }}><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5 text-xs text-stone-500">
            <p className="mb-1 font-semibold uppercase tracking-wider">Integrations</p>
            <p>Stripe payment: {pays.some((x) => x.processor === "stripe") ? "received" : "available via customer portal when Stripe keys are configured"}.</p>
            <p className="mt-1">QuickBooks sync: {inv.external_ref ? `linked (${inv.external_ref})` : "not synced"}.</p>
          </Card>
        </div>
      </div>
      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} invoiceId={inv.id} balance={t.balance} />
    </div>
  );
}

function PaymentModal({ open, onClose, invoiceId, balance }: { open: boolean; onClose: () => void; invoiceId: string; balance: number }) {
  const { toast } = useToast();
  const [f, setF] = useState({ amount: balance, method: "check" as Payment["method"], date: todayISO(), reference: "", notes: "" });
  const [full, setFull] = useState(true);
  return (
    <Modal open={open} onClose={onClose} title="Record payment" size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="success" onClick={() => { try { recordPayment({ invoice_id: invoiceId, ...f, amount: full ? balance : f.amount }); toast("Payment recorded"); onClose(); } catch (e) { toast((e as Error).message, "error"); } }}>Save payment</Button></>}>
      <div className="space-y-3">
        <Checkbox checked={full} onChange={setFull} label={`Pay full balance (${money(balance)})`} />
        {!full && <Field label="Amount"><NumberInput value={f.amount} onChange={(n) => setF({ ...f, amount: n })} /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Method"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as Payment["method"] })}>{["check", "ach", "card", "cash", "zelle", "financing", "other"].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select></Field>
          <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <Field label="Reference (check #, transaction id)"><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <p className={cn("text-xs text-stone-500")}>Deposits automatically advance the project to “Deposit Received”.</p>
      </div>
    </Modal>
  );
}
