"use client";
import { useMemo, useState } from "react";
import { FileText, FolderOpen, Grid2x2, List } from "lucide-react";
import { db, useSettings, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { custName } from "@/lib/services";
import { fmtDate } from "@/lib/format";
import { changeOrderPdf, invoicePdf, openPdf, proposalPdf } from "@/lib/pdf";
import { FILE_CATEGORIES, FileGallery, FileUploader, fmtSize, Lightbox } from "@/components/files";
import { Badge, Card, DataTable, EmptyState, PageHeader, SearchInput, Segmented, Select } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { FileRecord } from "@/lib/types";

export default function DocumentsPage() {
  return (
    <RequirePerm perm="documents.view">
      <Inner />
    </RequirePerm>
  );
}

type Doc = { id: string; name: string; kind: string; customer: string; project: string; date: string; size: string; file?: FileRecord; generate?: () => Promise<void> };

function Inner() {
  const S = useSnapshot();
  const co = useSettings();
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [cust, setCust] = useState("");
  const [proj, setProj] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [open, setOpen] = useState<FileRecord | null>(null);

  // Uploaded files + system-generated documents (estimates, invoices, change orders) in one index
  const docs: Doc[] = useMemo(() => {
    const out: Doc[] = S.files.map((f) => ({
      id: f.id, name: f.name, kind: f.category, customer: custName(S.customers.find((c) => c.id === f.customer_id)), project: S.projects.find((p) => p.id === f.project_id)?.name ?? "",
      date: f.created_at, size: fmtSize(f.size), file: f,
    }));
    if (co) {
      S.estimates.filter((e) => e.status !== "draft").forEach((e) => out.push({ id: `est-${e.id}`, name: `${e.number} Proposal — ${e.title}.pdf`, kind: "estimate", customer: custName(S.customers.find((c) => c.id === e.customer_id)), project: S.projects.find((p) => p.id === e.project_id)?.name ?? "", date: e.issue_date, size: "PDF",
        generate: async () => openPdf(await proposalPdf(co, e, db.where("estimate_items", (i) => i.estimate_id === e.id), db.get("customers", e.customer_id)), "", "preview") }));
      S.invoices.filter((i) => i.status !== "draft").forEach((i) => out.push({ id: `inv-${i.id}`, name: `${i.number} Invoice.pdf`, kind: "invoice", customer: custName(S.customers.find((c) => c.id === i.customer_id)), project: S.projects.find((p) => p.id === i.project_id)?.name ?? "", date: i.issue_date, size: "PDF",
        generate: async () => openPdf(await invoicePdf(co, i, db.get("customers", i.customer_id), db.get("projects", i.project_id), db.where("payments", (p) => p.invoice_id === i.id)), "", "preview") }));
      S.change_orders.filter((c) => c.status !== "draft").forEach((c) => { const p = S.projects.find((x) => x.id === c.project_id); out.push({ id: `co-${c.id}`, name: `${c.number} Change Order — ${c.title}.pdf`, kind: "change_order", customer: custName(S.customers.find((x) => x.id === p?.customer_id)), project: p?.name ?? "", date: c.sent_at ?? c.created_at, size: "PDF",
        generate: async () => openPdf(await changeOrderPdf(co, c, p, db.get("customers", p?.customer_id)), "", "preview") }); });
      S.projects.filter((p) => p.signed_at && p.estimate_id).forEach((p) => { const e = S.estimates.find((x) => x.id === p.estimate_id); if (e) out.push({ id: `ctr-${p.id}`, name: `${p.number} Signed Contract.pdf`, kind: "contract", customer: custName(S.customers.find((c) => c.id === p.customer_id)), project: p.name, date: p.signed_at!, size: "PDF",
        generate: async () => openPdf(await proposalPdf(co, e, db.where("estimate_items", (i) => i.estimate_id === e.id), db.get("customers", e.customer_id)), "", "preview") }); });
    }
    return out;
  }, [S, co]);

  const shown = docs.filter((d) => (!cat || d.kind === cat) && (!cust || d.customer === cust) && (!proj || d.project === proj) && (!q || `${d.name} ${d.customer} ${d.project}`.toLowerCase().includes(q.toLowerCase())));
  const counts = FILE_CATEGORIES.map((c) => ({ ...c, n: docs.filter((d) => d.kind === c.key).length }));

  return (
    <div>
      <PageHeader title="Document Center" subtitle="Every contract, proposal, invoice, receipt, spec, plan and photo — organized by customer and project" />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-4">
          <Card className="p-2">
            <button onClick={() => setCat("")} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${!cat ? "bg-brass-50 font-semibold text-brass-800" : "hover:bg-stone-50"}`}><span className="flex items-center gap-2"><FolderOpen className="h-4 w-4" />All documents</span><span className="text-xs tabular-nums text-stone-500">{docs.length}</span></button>
            {counts.filter((c) => c.n).map((c) => (
              <button key={c.key} onClick={() => setCat(c.key)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${cat === c.key ? "bg-brass-50 font-semibold text-brass-800" : "text-stone-600 hover:bg-stone-50"}`}><span>{c.label}</span><span className="text-xs tabular-nums text-stone-500">{c.n}</span></button>
            ))}
          </Card>
          {can("documents.edit") && (
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Upload</p>
              <UploadPanel />
            </Card>
          )}
        </div>
        <Card>
          <div className="flex flex-col gap-2 border-b border-stone-100 p-3 xl:flex-row">
            <SearchInput value={q} onChange={setQ} className="xl:w-64" />
            <Select value={cust} onChange={(e) => setCust(e.target.value)} className="xl:w-48"><option value="">All customers</option>{[...new Set(docs.map((d) => d.customer).filter((x) => x && x !== "—"))].sort().map((c) => <option key={c}>{c}</option>)}</Select>
            <Select value={proj} onChange={(e) => setProj(e.target.value)} className="xl:w-56"><option value="">All projects</option>{[...new Set(docs.map((d) => d.project).filter(Boolean))].sort().map((c) => <option key={c}>{c}</option>)}</Select>
            <Segmented className="xl:ml-auto" value={view} onChange={setView} options={[{ key: "list", label: <List className="h-4 w-4" /> }, { key: "grid", label: <Grid2x2 className="h-4 w-4" /> }]} />
          </div>
          {view === "grid" ? (
            <div className="p-4"><FileGallery files={shown.filter((d) => d.file).map((d) => d.file!)} canEdit={can("documents.edit")} showShare emptyText="No uploaded files match. Generated PDFs are listed in list view." /></div>
          ) : (
            <DataTable
              rows={shown}
              initialSort={{ key: "date", dir: "desc" }}
              onRowClick={(d) => (d.file ? setOpen(d.file) : void d.generate?.())}
              empty={<EmptyState icon={<FileText className="h-6 w-6" />} title="No documents match" />}
              columns={[
                { key: "name", header: "Name", sort: (d) => d.name, cell: (d) => <div className="flex items-center gap-2.5"><FileText className="h-4 w-4 shrink-0 text-stone-400" /><span className="font-medium">{d.name}</span>{!d.file && <Badge tone="brass">Generated</Badge>}</div> },
                { key: "kind", header: "Type", sort: (d) => d.kind, cell: (d) => <Badge>{FILE_CATEGORIES.find((c) => c.key === d.kind)?.label ?? d.kind}</Badge>, hideOnMobile: true },
                { key: "customer", header: "Customer", sort: (d) => d.customer, cell: (d) => <span className="text-xs">{d.customer}</span>, hideOnMobile: true },
                { key: "project", header: "Project", sort: (d) => d.project, cell: (d) => <span className="text-xs text-stone-500">{d.project || "—"}</span>, hideOnMobile: true },
                { key: "date", header: "Date", sort: (d) => d.date, cell: (d) => <span className="text-xs text-stone-500">{fmtDate(d.date)}</span> },
                { key: "size", header: "Size", cell: (d) => <span className="text-xs text-stone-500">{d.size}</span>, hideOnMobile: true },
              ]}
            />
          )}
        </Card>
      </div>
      <Lightbox f={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function UploadPanel() {
  const S = useSnapshot();
  const [cust, setCust] = useState("");
  const [proj, setProj] = useState("");
  return (
    <div className="space-y-2">
      <Select value={cust} onChange={(e) => { setCust(e.target.value); setProj(""); }}><option value="">No customer</option>{S.customers.map((c) => <option key={c.id} value={c.id}>{custName(c)}</option>)}</Select>
      <Select value={proj} onChange={(e) => setProj(e.target.value)} disabled={!cust}><option value="">No project</option>{S.projects.filter((p) => p.customer_id === cust).map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}</Select>
      <FileUploader compact meta={{ customer_id: cust || null, project_id: proj || null, category: "other" }} />
    </div>
  );
}
