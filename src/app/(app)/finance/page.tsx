"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Download, Plus, Receipt, Wallet } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { createInvoice, custName, deletePayment } from "@/lib/services";
import { addDaysISO, invoiceTotals, projectFinancials, round2, todayISO } from "@/lib/calc";
import { download, fmtDate, money, money0, pct, toCSV } from "@/lib/format";
import { lastMonths, monthKey, monthLabel } from "@/lib/analytics";
import { RevenueCostChart } from "@/components/charts";
import { InvoiceBadge } from "@/components/status";
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, Field, Input, Modal, NumberInput, PageHeader, SearchInput, Select, Stat, Tabs, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { ExpenseCategory, InvoiceStatus } from "@/lib/types";

type Tab = "overview" | "invoices" | "payments" | "payables";
const EXP_CATS: ExpenseCategory[] = ["material", "labor", "subcontractor", "equipment", "disposal", "permit", "overhead", "other"];

export default function FinancePage() {
  return (
    <RequirePerm perm="finance.view">
      <Suspense>
        <Inner />
      </Suspense>
    </RequirePerm>
  );
}

function Inner() {
  const S = useSnapshot();
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { toast, confirm } = useToast();
  const [tab, setTab] = useState<Tab>(params.get("status") ? "invoices" : "overview");
  const [status, setStatus] = useState<string>(params.get("status") ?? "");
  const [q, setQ] = useState("");
  const [newInv, setNewInv] = useState(false);
  const [newExp, setNewExp] = useState(false);
  useEffect(() => {
    if (params.get("new") === "invoice") setNewInv(true);
  }, [params]);
  const today = todayISO();
  const payFor = (id: string) => S.payments.filter((p) => p.invoice_id === id);

  const invRows = useMemo(() => S.invoices.map((i) => ({ ...i, ...invoiceTotals(i, payFor(i.id)), customer: custName(S.customers.find((c) => c.id === i.customer_id)), project: S.projects.find((p) => p.id === i.project_id) })), [S]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownInv = invRows.filter((r) => (!status || r.status === status) && (!q || [r.number, r.customer, r.project?.name ?? ""].some((x) => x.toLowerCase().includes(q.toLowerCase()))));
  const open = invRows.filter((r) => ["sent", "partially_paid", "overdue"].includes(r.status));
  const ar = round2(open.reduce((s, r) => s + r.balance, 0));
  const ap = round2(S.expenses.filter((e) => e.status === "unpaid").reduce((s, e) => s + e.amount, 0));
  const ytdStart = `${today.slice(0, 4)}-01-01`;
  const revenueYtd = S.payments.filter((p) => p.date >= ytdStart).reduce((s, p) => s + p.amount, 0);
  const costYtd = S.expenses.filter((e) => e.date >= ytdStart).reduce((s, e) => s + e.amount, 0) + S.time_entries.filter((t) => t.date >= ytdStart).reduce((s, t) => s + t.cost, 0);
  const overheadYtd = S.expenses.filter((e) => e.date >= ytdStart && e.category === "overhead").reduce((s, e) => s + e.amount, 0);
  const grossYtd = revenueYtd - (costYtd - overheadYtd);
  const netYtd = revenueYtd - costYtd;

  const aging = [
    { label: "Current", f: (d: number) => d <= 0 },
    { label: "1–30 days", f: (d: number) => d > 0 && d <= 30 },
    { label: "31–60 days", f: (d: number) => d > 30 && d <= 60 },
    { label: "61–90 days", f: (d: number) => d > 60 && d <= 90 },
    { label: "90+ days", f: (d: number) => d > 90 },
  ].map((b) => ({ ...b, value: round2(open.filter((r) => b.f(Math.round((new Date(today).getTime() - new Date(r.due_date).getTime()) / 86400000))).reduce((s, r) => s + r.balance, 0)) }));
  const monthly = lastMonths(12).map((m) => ({
    label: monthLabel(m),
    revenue: round2(S.payments.filter((p) => monthKey(p.date) === m).reduce((s, p) => s + p.amount, 0)),
    booked: round2(S.projects.filter((p) => monthKey(p.signed_at ?? p.created_at) === m).reduce((s, p) => s + p.contract_value, 0)),
    costs: round2(S.expenses.filter((e) => monthKey(e.date) === m).reduce((s, e) => s + e.amount, 0) + S.time_entries.filter((t) => monthKey(t.date) === m).reduce((s, t) => s + t.cost, 0)),
  }));
  const wip = S.projects.filter((p) => !["Closed"].includes(p.stage)).map((p) => ({ p, f: projectFinancials(p, S.expenses, S.time_entries, S.invoices, S.payments) }));

  return (
    <div>
      <PageHeader
        title="Financials"
        subtitle="Invoices, payments, receivables, payables and job profitability"
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => download(tab === "payables" ? "expenses.csv" : tab === "payments" ? "payments.csv" : "invoices.csv", toCSV(tab === "payables" ? S.expenses.map((e) => ({ date: e.date, category: e.category, description: e.description, vendor: S.suppliers.find((s) => s.id === e.supplier_id)?.name ?? "", project: S.projects.find((p) => p.id === e.project_id)?.number ?? "", amount: e.amount, status: e.status, due: e.due_date ?? "" })) : tab === "payments" ? S.payments.map((p) => ({ date: p.date, invoice: S.invoices.find((i) => i.id === p.invoice_id)?.number, customer: custName(S.customers.find((c) => c.id === p.customer_id)), amount: p.amount, method: p.method, reference: p.reference, processor: p.processor })) : invRows.map((r) => ({ number: r.number, customer: r.customer, project: r.project?.number ?? "", kind: r.kind, status: r.status, issued: r.issue_date, due: r.due_date, total: r.total, paid: r.paid, balance: r.balance }))))}>Export CSV</Button>
            {can("finance.edit") && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewExp(true)}>Expense / bill</Button>}
            {can("finance.edit") && <Button variant="primary" icon={<Receipt className="h-4 w-4" />} onClick={() => setNewInv(true)}>New invoice</Button>}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Revenue YTD" value={money0(revenueYtd)} sub="cash collected" />
        <Stat label="Gross profit YTD" value={money0(grossYtd)} sub={pct(revenueYtd ? (grossYtd / revenueYtd) * 100 : 0)} />
        <Stat label="Net profit YTD" value={money0(netYtd)} sub={`${pct(revenueYtd ? (netYtd / revenueYtd) * 100 : 0)} after overhead`} />
        <Stat label="Accounts receivable" value={money0(ar)} sub={<span className="text-clay-600">{money0(open.filter((r) => r.status === "overdue").reduce((s, r) => s + r.balance, 0))} overdue</span>} onClick={() => { setTab("invoices"); setStatus(""); }} />
        <Stat label="Accounts payable" value={money0(ap)} sub={`${S.expenses.filter((e) => e.status === "unpaid").length} unpaid bills`} onClick={() => setTab("payables")} />
      </div>
      <Tabs<Tab> className="mb-5" value={tab} onChange={setTab} tabs={[{ key: "overview", label: "Overview" }, { key: "invoices", label: "Invoices", count: S.invoices.length }, { key: "payments", label: "Payments", count: S.payments.length }, { key: "payables", label: "Payables & expenses" }]} />

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Cash flow" subtitle="Collected vs. booked vs. job costs · 12 months" />
            <div className="px-3 py-4"><RevenueCostChart data={monthly} /></div>
          </Card>
          <Card>
            <CardHeader title="Receivables aging" subtitle={`${money(ar)} outstanding`} />
            <div className="space-y-3 p-5">
              {aging.map((b, i) => (
                <div key={b.label}>
                  <div className="flex justify-between text-sm"><span className="text-stone-600">{b.label}</span><span className="font-semibold tabular-nums">{money(b.value)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-stone-100"><div className="h-full rounded-full" style={{ width: `${ar ? (b.value / ar) * 100 : 0}%`, background: i === 0 ? "#4f8a5e" : i === 1 ? "#d08a16" : "#a24630" }} /></div>
                </div>
              ))}
              <div className="border-t border-stone-100 pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Largest open balances</p>
                {open.sort((a, b) => b.balance - a.balance).slice(0, 5).map((r) => (
                  <button key={r.id} onClick={() => router.push(`/finance/invoices/${r.id}`)} className="flex w-full items-center justify-between py-1 text-left text-sm hover:text-brass-700">
                    <span className="truncate">{r.number} · {r.customer}</span><span className="flex items-center gap-2"><InvoiceBadge s={r.status} /><span className="tabular-nums">{money0(r.balance)}</span></span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
          <Card className="xl:col-span-3">
            <CardHeader title="Work in progress" subtitle="Contract, billing and cost position of every open project" />
            <DataTable
              rows={wip.map((x) => ({ id: x.p.id, ...x }))}
              onRowClick={(r) => router.push(`/projects/${r.id}`)}
              dense
              columns={[
                { key: "p", header: "Project", sort: (r) => r.p.name, cell: (r) => <div><p className="font-medium">{r.p.name}</p><p className="text-xs text-stone-500">{r.p.number} · {r.p.stage}</p></div> },
                { key: "c", header: "Contract", sort: (r) => r.f.contract, cell: (r) => <span className="tabular-nums">{money0(r.f.contract)}</span>, className: "text-right", headerClassName: "text-right" },
                { key: "i", header: "Invoiced", sort: (r) => r.f.invoiced, cell: (r) => <span className="tabular-nums">{money0(r.f.invoiced)}</span>, className: "text-right", headerClassName: "text-right" },
                { key: "col", header: "Collected", sort: (r) => r.f.collected, cell: (r) => <span className="tabular-nums text-sage-700">{money0(r.f.collected)}</span>, className: "text-right", headerClassName: "text-right" },
                { key: "u", header: "Unbilled", sort: (r) => r.f.unbilled, cell: (r) => <span className="tabular-nums text-stone-500">{money0(r.f.unbilled)}</span>, className: "text-right", headerClassName: "text-right", hideOnMobile: true },
                { key: "ec", header: "Est. cost", sort: (r) => r.f.estimatedCost, cell: (r) => <span className="tabular-nums">{money0(r.f.estimatedCost)}</span>, className: "text-right", headerClassName: "text-right", hideOnMobile: true },
                { key: "ac", header: "Actual cost", sort: (r) => r.f.actualCost, cell: (r) => <span className={cn("tabular-nums", r.f.actualCost > r.f.estimatedCost && "text-clay-600")}>{money0(r.f.actualCost)}</span>, className: "text-right", headerClassName: "text-right", hideOnMobile: true },
                { key: "m", header: "Est. margin", sort: (r) => r.f.estimatedMargin, cell: (r) => <span className="tabular-nums">{pct(r.f.estimatedMargin)}</span>, className: "text-right", headerClassName: "text-right" },
              ]}
            />
          </Card>
        </div>
      )}

      {tab === "invoices" && (
        <Card>
          <div className="flex flex-col gap-2 border-b border-stone-100 p-3 md:flex-row">
            <SearchInput value={q} onChange={setQ} className="md:w-72" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="md:w-48">
              <option value="">All statuses</option>
              {(["draft", "sent", "partially_paid", "paid", "overdue", "void"] as InvoiceStatus[]).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </Select>
          </div>
          <DataTable
            rows={shownInv}
            onRowClick={(r) => router.push(`/finance/invoices/${r.id}`)}
            initialSort={{ key: "issued", dir: "desc" }}
            empty={<EmptyState icon={<Receipt className="h-6 w-6" />} title="No invoices" />}
            columns={[
              { key: "num", header: "Invoice", sort: (r) => r.number, cell: (r) => <div><p className="font-mono text-xs font-semibold">{r.number}</p><p className="text-[11px] capitalize text-stone-500">{r.kind.replace("_", " ")}</p></div> },
              { key: "cust", header: "Customer", sort: (r) => r.customer, cell: (r) => <div><p className="font-medium">{r.customer}</p><p className="text-xs text-stone-500">{r.project?.name ?? "—"}</p></div> },
              { key: "status", header: "Status", sort: (r) => r.status, cell: (r) => <InvoiceBadge s={r.status} /> },
              { key: "issued", header: "Issued", sort: (r) => r.issue_date, cell: (r) => <span className="text-xs text-stone-500">{fmtDate(r.issue_date)}</span>, hideOnMobile: true },
              { key: "due", header: "Due", sort: (r) => r.due_date, cell: (r) => <span className={cn("text-xs", r.status === "overdue" ? "font-semibold text-clay-600" : "text-stone-500")}>{fmtDate(r.due_date)}</span>, hideOnMobile: true },
              { key: "total", header: "Total", sort: (r) => r.total, cell: (r) => <span className="tabular-nums">{money(r.total)}</span>, className: "text-right", headerClassName: "text-right" },
              { key: "bal", header: "Balance", sort: (r) => r.balance, cell: (r) => <span className={cn("font-semibold tabular-nums", r.balance > 0 && r.status !== "draft" ? "text-ink-900" : "text-stone-400")}>{money(r.balance)}</span>, className: "text-right", headerClassName: "text-right" },
            ]}
          />
        </Card>
      )}

      {tab === "payments" && (
        <Card>
          <DataTable
            rows={S.payments}
            initialSort={{ key: "date", dir: "desc" }}
            onRowClick={(r) => router.push(`/finance/invoices/${r.invoice_id}`)}
            empty={<EmptyState icon={<Wallet className="h-6 w-6" />} title="No payments recorded" />}
            columns={[
              { key: "date", header: "Date", sort: (r) => r.date, cell: (r) => <span className="text-xs">{fmtDate(r.date)}</span> },
              { key: "cust", header: "Customer", cell: (r) => custName(S.customers.find((c) => c.id === r.customer_id)) },
              { key: "inv", header: "Invoice", cell: (r) => <span className="font-mono text-xs">{S.invoices.find((i) => i.id === r.invoice_id)?.number}</span> },
              { key: "method", header: "Method", sort: (r) => r.method, cell: (r) => <Badge>{r.method}</Badge> },
              { key: "ref", header: "Reference", cell: (r) => <span className="text-xs text-stone-500">{r.reference || "—"}{r.processor !== "manual" ? ` · ${r.processor}` : ""}</span>, hideOnMobile: true },
              { key: "amt", header: "Amount", sort: (r) => r.amount, cell: (r) => <span className="font-semibold tabular-nums text-sage-700">{money(r.amount)}</span>, className: "text-right", headerClassName: "text-right" },
              ...(can("finance.edit") ? [{ key: "del", header: "", cell: (r: { id: string }) => <button className="text-xs text-stone-400 hover:text-clay-600" onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: "Delete payment?", body: "The invoice balance and status are recalculated.", danger: true, confirmLabel: "Delete" })) { deletePayment(r.id); toast("Payment deleted"); } }}>Delete</button> }] : []),
            ]}
          />
        </Card>
      )}

      {tab === "payables" && (
        <Card>
          <DataTable
            rows={S.expenses}
            initialSort={{ key: "date", dir: "desc" }}
            columns={[
              { key: "date", header: "Date", sort: (r) => r.date, cell: (r) => <span className="text-xs">{fmtDate(r.date)}</span> },
              { key: "desc", header: "Description", sort: (r) => r.description, cell: (r) => <div><p className="font-medium">{r.description}</p><p className="text-xs text-stone-500">{S.suppliers.find((s) => s.id === r.supplier_id)?.name ?? S.employees.find((e) => e.id === r.employee_id)?.name ?? "—"}{r.project_id ? ` · ${S.projects.find((p) => p.id === r.project_id)?.number}` : " · overhead"}</p></div> },
              { key: "cat", header: "Category", sort: (r) => r.category, cell: (r) => <Badge>{r.category}</Badge>, hideOnMobile: true },
              { key: "due", header: "Due", sort: (r) => r.due_date ?? "", cell: (r) => <span className={cn("text-xs", r.status === "unpaid" && r.due_date && r.due_date < today ? "font-semibold text-clay-600" : "text-stone-500")}>{fmtDate(r.due_date)}</span>, hideOnMobile: true },
              { key: "status", header: "Status", sort: (r) => r.status, cell: (r) => <button disabled={!can("finance.edit")} onClick={() => db.update("expenses", r.id, { status: r.status === "paid" ? "unpaid" : "paid", paid_date: r.status === "paid" ? null : today })}><Badge tone={r.status === "paid" ? "green" : "amber"}>{r.status}</Badge></button> },
              { key: "amt", header: "Amount", sort: (r) => r.amount, cell: (r) => <span className="font-semibold tabular-nums">{money(r.amount)}</span>, className: "text-right", headerClassName: "text-right" },
            ]}
          />
        </Card>
      )}
      <NewInvoiceModal open={newInv} onClose={() => { setNewInv(false); if (params.get("new")) router.replace("/finance"); }} />
      <ExpenseModal open={newExp} onClose={() => setNewExp(false)} />
    </div>
  );
}

function NewInvoiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const S = useSnapshot();
  const router = useRouter();
  const [cust, setCust] = useState("");
  const [proj, setProj] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="New invoice" subtitle="For contract milestones, use “Create invoice” on the project's payment schedule." size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!cust} onClick={() => { const i = createInvoice({ customer_id: cust, project_id: proj || null, tax_rate: proj ? 0 : S.company_settings[0]?.tax_rate }); onClose(); router.push(`/finance/invoices/${i.id}`); }}>Create</Button></>}>
      <div className="space-y-3">
        <Field label="Customer" required><Select value={cust} onChange={(e) => { setCust(e.target.value); setProj(""); }}><option value="">Select…</option>{S.customers.map((c) => <option key={c.id} value={c.id}>{custName(c)}</option>)}</Select></Field>
        <Field label="Project"><Select value={proj} onChange={(e) => setProj(e.target.value)}><option value="">None (service / small job)</option>{S.projects.filter((p) => p.customer_id === cust).map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}

function ExpenseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const S = useSnapshot();
  const { toast } = useToast();
  const [f, setF] = useState({ category: "material" as ExpenseCategory, description: "", amount: 0, supplier_id: "", employee_id: "", project_id: "", date: todayISO(), due_date: addDaysISO(todayISO(), 30), status: "unpaid" as "unpaid" | "paid", reference: "" });
  return (
    <Modal open={open} onClose={onClose} title="Record expense / vendor bill" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.description || f.amount <= 0} onClick={() => { db.insert("expenses", { ...f, supplier_id: f.supplier_id || null, employee_id: f.employee_id || null, project_id: f.project_id || null, purchase_order_id: null, paid_date: f.status === "paid" ? f.date : null }); toast("Expense recorded"); onClose(); }}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ExpenseCategory })}>{EXP_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        <Field label="Amount"><NumberInput value={f.amount} onChange={(n) => setF({ ...f, amount: n })} /></Field>
        <Field label="Description" className="sm:col-span-2"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Vendor"><Select value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })}><option value="">—</option>{S.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Subcontractor / employee"><Select value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}><option value="">—</option>{S.employees.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Project (job cost)" className="sm:col-span-2"><Select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}><option value="">Company overhead</option>{S.projects.filter((p) => p.stage !== "Closed").map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}</Select></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Due date"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "paid" | "unpaid" })}><option value="unpaid">Unpaid (payable)</option><option value="paid">Paid</option></Select></Field>
        <Field label="Reference / bill #"><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
