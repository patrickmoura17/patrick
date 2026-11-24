"use client";
import { useMemo, useState } from "react";
import { GitPullRequestArrow, Plus } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { createChangeOrder, custName } from "@/lib/services";
import { changeOrderTotals } from "@/lib/calc";
import { fmtDate, money } from "@/lib/format";
import { ChangeOrderEditor, CO_TONE } from "@/components/change-order";
import { Badge, Button, Card, DataTable, EmptyState, Field, Modal, PageHeader, Select, Stat, Tabs, cn } from "@/components/ui";
import { RequirePerm } from "@/components/gate";

export default function ChangeOrdersPage() {
  return (
    <RequirePerm perm="projects.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const S = useSnapshot();
  const { can } = useAuth();
  const [tab, setTab] = useState<"all" | "draft" | "sent" | "approved" | "rejected">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const [proj, setProj] = useState("");
  const rows = useMemo(() => S.change_orders.map((c) => ({ ...c, ...changeOrderTotals(c), project: S.projects.find((p) => p.id === c.project_id) })), [S]);
  const shown = rows.filter((r) => tab === "all" || r.status === tab);
  const approved = rows.filter((r) => r.status === "approved");
  return (
    <div>
      <PageHeader title="Change Orders" subtitle="Scope changes with customer approval and full history" actions={can("projects.edit") && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setPick(true)}>New change order</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Awaiting approval" value={rows.filter((r) => r.status === "sent").length} sub={money(rows.filter((r) => r.status === "sent").reduce((s, r) => s + r.amount, 0))} />
        <Stat label="Approved value" value={money(approved.reduce((s, r) => s + r.amount, 0))} sub={`${approved.length} change orders`} />
        <Stat label="Approved profit impact" value={money(approved.reduce((s, r) => s + r.profit, 0))} />
        <Stat label="Drafts" value={rows.filter((r) => r.status === "draft").length} />
      </div>
      <Card>
        <div className="px-3 pt-1">
          <Tabs value={tab} onChange={setTab} className="border-0" tabs={(["all", "draft", "sent", "approved", "rejected"] as const).map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), count: k === "all" ? rows.length : rows.filter((r) => r.status === k).length }))} />
        </div>
        <DataTable
          rows={shown}
          onRowClick={(r) => setOpen(r.id)}
          initialSort={{ key: "date", dir: "desc" }}
          empty={<EmptyState icon={<GitPullRequestArrow className="h-6 w-6" />} title="No change orders" />}
          columns={[
            { key: "number", header: "Number", sort: (r) => r.number, cell: (r) => <span className="font-mono text-xs font-semibold">{r.number}</span> },
            { key: "title", header: "Change", cell: (r) => <div><p className="font-medium">{r.title}</p><p className="text-xs text-stone-500">{r.project?.number} · {r.project?.name} · {custName(db.get("customers", r.project?.customer_id))}</p></div> },
            { key: "status", header: "Status", sort: (r) => r.status, cell: (r) => <Badge tone={CO_TONE[r.status]} dot>{r.status}</Badge> },
            { key: "days", header: "Schedule", cell: (r) => <span className="text-xs text-stone-500">{r.schedule_impact_days ? `+${r.schedule_impact_days} days` : "—"}</span>, hideOnMobile: true },
            { key: "date", header: "Created", sort: (r) => r.created_at, cell: (r) => <span className="text-xs text-stone-500">{fmtDate(r.created_at)}</span>, hideOnMobile: true },
            { key: "amount", header: "Amount", sort: (r) => r.amount, cell: (r) => <span className={cn("font-semibold tabular-nums", r.amount < 0 && "text-clay-600")}>{r.amount >= 0 ? "+" : ""}{money(r.amount)}</span>, className: "text-right", headerClassName: "text-right" },
          ]}
        />
      </Card>
      {open && <ChangeOrderEditor co={S.change_orders.find((c) => c.id === open) ?? null} onClose={() => setOpen(null)} />}
      <Modal open={pick} onClose={() => setPick(false)} title="New change order" size="sm" footer={<><Button onClick={() => setPick(false)}>Cancel</Button><Button variant="primary" disabled={!proj} onClick={() => { const c = createChangeOrder(proj); setPick(false); setOpen(c.id); }}>Create</Button></>}>
        <Field label="Project">
          <Select value={proj} onChange={(e) => setProj(e.target.value)}>
            <option value="">Select project…</option>
            {S.projects.filter((p) => !["Closed"].includes(p.stage)).map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}
