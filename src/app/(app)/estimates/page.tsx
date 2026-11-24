"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Download, FileSignature, Plus } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { custName } from "@/lib/services";
import { estimateTotals } from "@/lib/calc";
import { download, fmtDate, money, money0, pct, toCSV } from "@/lib/format";
import { NewEstimateModal } from "@/components/modals";
import { EstimateBadge } from "@/components/status";
import { Button, Card, DataTable, EmptyState, PageHeader, SearchInput, Stat, Tabs } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { EstimateStatus } from "@/lib/types";

export default function EstimatesPage() {
  return (
    <RequirePerm perm="estimates.view">
      <Suspense>
        <Inner />
      </Suspense>
    </RequirePerm>
  );
}

type F = "all" | "draft" | "pending" | "approved" | "closed";

function Inner() {
  const S = useSnapshot();
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>("all");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
  }, [params]);

  const rows = useMemo(
    () =>
      S.estimates.map((e) => {
        const t = estimateTotals(e, S.estimate_items.filter((i) => i.estimate_id === e.id));
        return { ...e, total: t.total, margin: t.margin, profit: t.grossProfit, customer: custName(S.customers.find((c) => c.id === e.customer_id)) };
      }),
    [S],
  );
  const groups: Record<F, EstimateStatus[]> = { all: [], draft: ["draft"], pending: ["sent", "viewed", "changes_requested"], approved: ["approved"], closed: ["rejected", "expired"] };
  const shown = rows.filter((r) => (f === "all" || groups[f].includes(r.status)) && (!q || [r.number, r.title, r.customer].some((x) => x.toLowerCase().includes(q.toLowerCase()))));
  const pending = rows.filter((r) => groups.pending.includes(r.status));
  const decided = rows.filter((r) => r.status === "approved" || r.status === "rejected");
  const approved = rows.filter((r) => r.status === "approved");

  return (
    <div>
      <PageHeader
        title="Estimates & Proposals"
        subtitle="Build, send and track proposals through approval"
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => download("estimates.csv", toCSV(shown.map((r) => ({ number: r.number, title: r.title, customer: r.customer, status: r.status, issued: r.issue_date, valid_until: r.valid_until, total: r.total, gross_profit: r.profit, margin_pct: r.margin }))))}>Export</Button>
            {can("estimates.edit") && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New estimate</Button>}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Awaiting response" value={pending.length} sub={money0(pending.reduce((s, r) => s + r.total, 0))} />
        <Stat label="Approved value" value={money0(approved.reduce((s, r) => s + r.total, 0))} sub={`${approved.length} estimates`} />
        <Stat label="Approval rate" value={pct(decided.length ? (approved.length / decided.length) * 100 : 0, 0)} sub={`${decided.length} decided`} />
        <Stat label="Avg. margin (approved)" value={pct(approved.length ? approved.reduce((s, r) => s + r.margin, 0) / approved.length : 0)} />
      </div>
      <Card>
        <div className="flex flex-col gap-2 border-b border-stone-100 px-3 pt-1 md:flex-row md:items-end md:justify-between">
          <Tabs<F>
            className="border-0"
            value={f}
            onChange={setF}
            tabs={[
              { key: "all", label: "All", count: rows.length },
              { key: "draft", label: "Drafts", count: rows.filter((r) => r.status === "draft").length },
              { key: "pending", label: "Pending", count: pending.length },
              { key: "approved", label: "Approved", count: approved.length },
              { key: "closed", label: "Rejected / expired" },
            ]}
          />
          <SearchInput value={q} onChange={setQ} className="pb-2 md:w-64" />
        </div>
        <DataTable
          rows={shown}
          onRowClick={(r) => router.push(`/estimates/${r.id}`)}
          initialSort={{ key: "issued", dir: "desc" }}
          empty={<EmptyState icon={<FileSignature className="h-6 w-6" />} title="No estimates" action={can("estimates.edit") && <Button onClick={() => setOpen(true)}>Create estimate</Button>} />}
          columns={[
            { key: "number", header: "Number", sort: (r) => r.number, cell: (r) => <span className="font-mono text-xs font-semibold">{r.number}</span> },
            { key: "title", header: "Estimate", sort: (r) => r.title, cell: (r) => <div><p className="font-medium">{r.title}</p><p className="text-xs text-stone-500">{r.customer}</p></div> },
            { key: "status", header: "Status", sort: (r) => r.status, cell: (r) => <EstimateBadge s={r.status} /> },
            { key: "issued", header: "Issued", sort: (r) => r.issue_date, cell: (r) => <span className="text-xs text-stone-500">{fmtDate(r.issue_date)}</span>, hideOnMobile: true },
            { key: "valid", header: "Valid until", sort: (r) => r.valid_until, cell: (r) => <span className="text-xs text-stone-500">{fmtDate(r.valid_until)}</span>, hideOnMobile: true },
            { key: "by", header: "Estimator", cell: (r) => <span className="text-xs text-stone-500">{db.get("profiles", r.created_by)?.full_name ?? "—"}</span>, hideOnMobile: true },
            { key: "margin", header: "Margin", sort: (r) => r.margin, cell: (r) => <span className={`tabular-nums ${r.margin < 25 ? "text-clay-600" : "text-sage-700"}`}>{pct(r.margin)}</span>, className: "text-right", headerClassName: "text-right", hideOnMobile: true },
            { key: "total", header: "Total", sort: (r) => r.total, cell: (r) => <span className="font-semibold tabular-nums">{money(r.total)}</span>, className: "text-right", headerClassName: "text-right" },
          ]}
        />
      </Card>
      <NewEstimateModal open={open} onClose={() => { setOpen(false); if (params.get("new")) router.replace("/estimates"); }} />
    </div>
  );
}
