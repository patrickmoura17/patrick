"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Copy, PenTool, Plus, Trash2 } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { custName } from "@/lib/services";
import { priceQuote } from "@/lib/countertop";
import { fmtDate, money } from "@/lib/format";
import { Badge, Button, Card, DataTable, EmptyState, PageHeader, SearchInput, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import { NewQuoteModal } from "@/components/new-quote";

export default function CountertopsPage() {
  return (
    <RequirePerm perm="estimates.view">
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
  const { confirm } = useToast();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (params.get("new")) setOpen(true);
  }, [params]);
  const rows = useMemo(() => S.countertop_quotes.map((x) => {
    const p = priceQuote(x, S.catalog_items);
    return { ...x, sqft: p.geom.sqft, total: p.subtotal, customer: custName(S.customers.find((c) => c.id === x.customer_id)), materialName: S.catalog_items.find((c) => c.id === x.material.catalog_item_id)?.name.replace(" countertop", "") ?? "—" };
  }).filter((r) => !q || `${r.name} ${r.customer}`.toLowerCase().includes(q.toLowerCase())), [S, q]);

  return (
    <div>
      <PageHeader
        title="Countertop Quotes"
        subtitle="Draw countertops to scale, add sinks and edges, and price instantly from your catalog"
        actions={can("estimates.edit") && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New countertop quote</Button>}
      />
      <Card>
        <div className="border-b border-stone-100 p-3"><SearchInput value={q} onChange={setQ} className="md:w-72" /></div>
        <DataTable
          rows={rows}
          onRowClick={(r) => router.push(`/countertop-quote/${r.id}`)}
          initialSort={{ key: "updated", dir: "desc" }}
          empty={<EmptyState icon={<PenTool className="h-6 w-6" />} title="No countertop quotes yet" body="Draw a kitchen or vanity in minutes — the quote prices itself." action={can("estimates.edit") && <Button variant="primary" onClick={() => setOpen(true)}>Draw a quote</Button>} />}
          columns={[
            { key: "name", header: "Quote", sort: (r) => r.name, cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-stone-500">{r.customer}</p></div> },
            { key: "counters", header: "Counters", cell: (r) => <span className="text-xs text-stone-600">{r.counters.length} counters · {r.cutouts.length} cutouts</span>, hideOnMobile: true },
            { key: "material", header: "Material", sort: (r) => r.materialName, cell: (r) => <span className="text-xs">{r.materialName}{r.materialName !== "—" && ` · ${r.material.thickness}`}</span>, hideOnMobile: true },
            { key: "est", header: "Estimate", cell: (r) => { const e = S.estimates.find((x) => x.id === r.estimate_id); return e ? <Badge tone="blue">{e.number}</Badge> : <span className="text-xs text-stone-400">—</span>; } },
            { key: "updated", header: "Updated", sort: (r) => r.updated_at ?? r.created_at, cell: (r) => <span className="text-xs text-stone-500">{fmtDate(r.updated_at ?? r.created_at)}</span>, hideOnMobile: true },
            { key: "sqft", header: "Sq ft", sort: (r) => r.sqft, cell: (r) => <span className="tabular-nums">{r.sqft.toFixed(1)}</span>, className: "text-right", headerClassName: "text-right" },
            { key: "total", header: "Quote", sort: (r) => r.total, cell: (r) => <span className="font-semibold tabular-nums">{money(r.total)}</span>, className: "text-right", headerClassName: "text-right" },
            ...(can("estimates.edit") ? [{ key: "act", header: "", cell: (r: (typeof rows)[number]) => (
              <div className="flex justify-end gap-1">
                <button title="Duplicate" className="rounded p-1 text-stone-400 hover:text-ink-900" onClick={(e) => { e.stopPropagation(); const { id: _i, created_at: _c, updated_at: _u, sqft: _s, total: _t, customer: _cu, materialName: _m, ...rest } = r; db.insert("countertop_quotes", { ...rest, name: `${r.name} (copy)`, estimate_id: null, revisions: [] }); }}><Copy className="h-4 w-4" /></button>
                <button title="Delete" className="rounded p-1 text-stone-400 hover:text-clay-600" onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: `Delete “${r.name}”?`, danger: true, confirmLabel: "Delete" })) db.remove("countertop_quotes", r.id); }}><Trash2 className="h-4 w-4" /></button>
              </div>
            ) }] : []),
          ]}
        />
      </Card>
      <NewQuoteModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

