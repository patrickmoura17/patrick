"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Download, Plus, Users } from "lucide-react";
import { useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { custName } from "@/lib/services";
import { invoiceTotals } from "@/lib/calc";
import { download, fmtDate, money0, toCSV } from "@/lib/format";
import { CUSTOMER_TYPES, CustomerModal } from "@/components/forms";
import { Avatar, Badge, Button, Card, DataTable, EmptyState, PageHeader, SearchInput, Select } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { Customer } from "@/lib/types";

export default function CustomersPage() {
  return (
    <RequirePerm perm="customers.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const S = useSnapshot();
  const { can } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return S.customers
      .filter((c) => (!type || c.type === type) && (!source || c.lead_source === source))
      .filter((c) => !s || [custName(c), c.company, c.email, c.phone, c.project_address, c.tags.join(" ")].some((x) => x.toLowerCase().includes(s)))
      .map((c) => {
        const projects = S.projects.filter((p) => p.customer_id === c.id);
        const ltv = S.payments.filter((p) => p.customer_id === c.id).reduce((a, p) => a + p.amount, 0);
        const balance = S.invoices.filter((i) => i.customer_id === c.id && ["sent", "partially_paid", "overdue"].includes(i.status)).reduce((a, i) => a + invoiceTotals(i, S.payments.filter((p) => p.invoice_id === i.id)).balance, 0);
        const openLeads = S.leads.filter((l) => l.customer_id === c.id && l.status === "open").length;
        return { ...c, projects: projects.length, ltv, balance, openLeads, contract: projects.reduce((a, p) => a + p.contract_value, 0) };
      });
  }, [S, q, type, source]);
  const sources = [...new Set(S.customers.map((c) => c.lead_source).filter(Boolean))].sort();

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${S.customers.length} customers · ${money0(rows.reduce((s, r) => s + r.ltv, 0))} lifetime revenue`}
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => download("customers.csv", toCSV(rows.map((r) => ({ name: custName(r), company: r.company, type: r.type, email: r.email, phone: r.phone, billing_address: r.billing_address, project_address: r.project_address, source: r.lead_source, projects: r.projects, lifetime_value: r.ltv, balance: r.balance, created: r.created_at.slice(0, 10) }))))}>
              Export
            </Button>
            {can("customers.edit") && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New customer</Button>}
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-2 border-b border-stone-100 p-3 md:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, email, phone, address, tag…" className="md:max-w-sm md:flex-1" />
          <div className="flex gap-2">
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40">
              <option value="">All types</option>
              {CUSTOMER_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
            <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-44">
              <option value="">All sources</option>
              {sources.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
        </div>
        <DataTable
          rows={rows}
          onRowClick={(r) => router.push(`/customers/${r.id}`)}
          initialSort={{ key: "ltv", dir: "desc" }}
          empty={<EmptyState icon={<Users className="h-6 w-6" />} title="No customers found" body="Adjust filters or add your first customer." />}
          columns={[
            { key: "name", header: "Customer", sort: (r) => custName(r), cell: (r) => (
              <div className="flex items-center gap-3">
                <Avatar name={custName(r)} color="#857d70" size={32} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{custName(r)}</p>
                  <p className="truncate text-xs text-stone-500">{r.company || r.email}</p>
                </div>
              </div>
            ) },
            { key: "type", header: "Type", sort: (r) => r.type, cell: (r) => <Badge tone={r.type === "Residential" ? "neutral" : r.type === "Builder" ? "brass" : "blue"}>{r.type}</Badge>, hideOnMobile: true },
            { key: "phone", header: "Contact", cell: (r) => <div className="text-xs"><p>{r.phone}</p><p className="text-stone-500">{r.email}</p></div>, hideOnMobile: true },
            { key: "source", header: "Source", sort: (r) => r.lead_source, cell: (r) => <span className="text-stone-600">{r.lead_source}</span>, hideOnMobile: true },
            { key: "projects", header: "Projects", sort: (r) => r.projects, cell: (r) => <span className="tabular-nums">{r.projects}{r.openLeads ? <span className="ml-1.5 text-xs text-brass-600">+{r.openLeads} lead</span> : null}</span> },
            { key: "ltv", header: "Lifetime value", sort: (r) => r.ltv, cell: (r) => <span className="font-semibold tabular-nums">{money0(r.ltv)}</span>, className: "text-right", headerClassName: "text-right" },
            { key: "balance", header: "Balance", sort: (r) => r.balance, cell: (r) => <span className={`tabular-nums ${r.balance > 0 ? "text-clay-600" : "text-stone-400"}`}>{money0(r.balance)}</span>, className: "text-right", headerClassName: "text-right", hideOnMobile: true },
            { key: "created", header: "Since", sort: (r) => r.created_at, cell: (r) => <span className="text-xs text-stone-500">{fmtDate(r.created_at)}</span>, hideOnMobile: true },
          ]}
        />
      </Card>
      <CustomerModal open={open} onClose={() => setOpen(false)} onSaved={(c: Customer) => router.push(`/customers/${c.id}`)} />
    </div>
  );
}
