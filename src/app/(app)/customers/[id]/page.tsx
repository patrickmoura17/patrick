"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Copy, ExternalLink, FileSignature, Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus, Receipt, Send, Target, Trash2 } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { createEstimate, createInvoice, custName, deleteCustomer, newPortalToken, sendMessage } from "@/lib/services";
import { estimateTotals, invoiceTotals } from "@/lib/calc";
import { ago, fmtDate, money, money0 } from "@/lib/format";
import { CustomerModal, LeadModal } from "@/components/forms";
import { ActivityTimeline } from "@/components/activity";
import { FileGallery, FileUploader } from "@/components/files";
import { EstimateBadge, InvoiceBadge, PriorityBadge, ServiceChips, StageBadge } from "@/components/status";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, KV, Menu, Stat, Tabs, Textarea, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import { MessageThread } from "@/components/messages";

type Tab = "overview" | "activity" | "leads" | "estimates" | "projects" | "invoices" | "files" | "messages";

export default function CustomerPage() {
  return (
    <RequirePerm perm="customers.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const S = useSnapshot();
  const { can } = useAuth();
  const router = useRouter();
  const { toast, confirm } = useToast();
  const c = S.customers.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>("overview");
  const [edit, setEdit] = useState(false);
  const [newLead, setNewLead] = useState(false);
  const activityFilter = useMemo(() => (a: { customer_id: string | null }) => a.customer_id === id, [id]);

  if (!c) return <Card><EmptyState title="Customer not found" action={<Link href="/customers"><Button>Back to customers</Button></Link>} /></Card>;

  const leads = S.leads.filter((l) => l.customer_id === id);
  const estimates = S.estimates.filter((e) => e.customer_id === id);
  const projects = S.projects.filter((p) => p.customer_id === id);
  const invoices = S.invoices.filter((i) => i.customer_id === id);
  const payments = S.payments.filter((p) => p.customer_id === id);
  const files = S.files.filter((f) => f.customer_id === id);
  const messages = S.messages.filter((m) => m.customer_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ltv = payments.reduce((s, p) => s + p.amount, 0);
  const contracted = projects.reduce((s, p) => s + p.contract_value, 0);
  const balance = invoices.filter((i) => ["sent", "partially_paid", "overdue"].includes(i.status)).reduce((s, i) => s + invoiceTotals(i, S.payments.filter((p) => p.invoice_id === i.id)).balance, 0);
  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/portal/${c.portal_token}` : "";
  const unread = messages.filter((m) => m.sender === "customer" && !m.read).length;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={custName(c)} color="#675f54" size={56} />
          <div>
            <p className="text-xs text-stone-500"><Link href="/customers" className="hover:text-ink-900">Customers</Link> / {c.type}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{custName(c)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              {c.company && <span>{c.company}</span>}
              {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-ink-900"><Phone className="h-3.5 w-3.5" />{c.phone}</a>}
              {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-ink-900"><Mail className="h-3.5 w-3.5" />{c.email}</a>}
              {c.project_address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{c.project_address}</span>}
            </div>
            {c.tags.length > 0 && <div className="mt-2 flex gap-1">{c.tags.map((t) => <Badge key={t} tone="brass">{t}</Badge>)}</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("leads.edit") && <Button icon={<Target className="h-4 w-4" />} onClick={() => setNewLead(true)}>New lead</Button>}
          {can("estimates.edit") && (
            <Button icon={<FileSignature className="h-4 w-4" />} onClick={() => { const e = createEstimate({ customer_id: c.id, lead_id: leads.find((l) => l.status === "open")?.id ?? null }); router.push(`/estimates/${e.id}`); }}>
              New estimate
            </Button>
          )}
          <Menu
            trigger={<Button size="icon"><MoreHorizontal className="h-4 w-4" /></Button>}
            items={[
              ...(can("customers.edit") ? [{ label: "Edit customer", icon: <Pencil />, onClick: () => setEdit(true) }] : []),
              ...(can("finance.edit") ? [{ label: "New invoice", icon: <Receipt />, onClick: () => { const i = createInvoice({ customer_id: c.id }); router.push(`/finance/invoices/${i.id}`); } }] : []),
              { label: "Copy portal link", icon: <Copy />, onClick: () => { void navigator.clipboard.writeText(portalUrl); toast("Portal link copied"); } },
              { label: "Open customer portal", icon: <ExternalLink />, onClick: () => window.open(`/portal/${c.portal_token}`, "_blank") },
              ...(can("customers.edit") ? [{ label: "Regenerate portal link", icon: <Send />, onClick: async () => { if (await confirm({ title: "Regenerate portal link?", body: "The old link will stop working immediately." })) { db.update("customers", c.id, { portal_token: newPortalToken() }); toast("New portal link generated"); } } }] : []),
              ...(can("customers.delete") ? ["divider" as const, { label: "Delete customer", icon: <Trash2 />, danger: true, onClick: async () => {
                if (!(await confirm({ title: `Delete ${custName(c)}?`, body: "Leads, estimates, activity and messages for this customer will be removed. Customers with projects or invoices cannot be deleted.", danger: true, confirmLabel: "Delete" }))) return;
                try { deleteCustomer(c.id); toast("Customer deleted"); router.push("/customers"); } catch (e) { toast((e as Error).message, "error"); }
              } }] : []),
            ]}
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Lifetime value" value={money0(ltv)} sub="Payments received" />
        <Stat label="Contracted" value={money0(contracted)} sub={`${projects.length} project${projects.length === 1 ? "" : "s"}`} />
        <Stat label="Open balance" value={<span className={balance > 0 ? "text-clay-600" : ""}>{money0(balance)}</span>} sub={`${invoices.length} invoices`} />
        <Stat label="Open opportunities" value={leads.filter((l) => l.status === "open").length} sub={money0(leads.filter((l) => l.status === "open").reduce((s, l) => s + l.estimated_value, 0))} />
      </div>

      <Tabs<Tab>
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "activity", label: "Communication" },
          { key: "leads", label: "Leads", count: leads.length },
          { key: "estimates", label: "Estimates", count: estimates.length },
          { key: "projects", label: "Projects", count: projects.length },
          { key: "invoices", label: "Invoices", count: invoices.length },
          { key: "files", label: "Files", count: files.length },
          { key: "messages", label: "Portal messages", count: unread || undefined },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title="Profile" actions={can("customers.edit") && <Button size="xs" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEdit(true)}>Edit</Button>} />
            <dl className="grid gap-4 p-5">
              <KV label="Customer type">{c.type}</KV>
              <KV label="Lead source">{c.lead_source}</KV>
              <KV label="Billing address">{c.billing_address}</KV>
              <KV label="Project address">{c.project_address}</KV>
              <KV label="Customer since">{fmtDate(c.created_at)}</KV>
              <KV label="Account owner">{db.get("profiles", c.owner_id)?.full_name}</KV>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Notes</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-ink-800">{c.notes || <span className="text-stone-400">—</span>}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">Customer portal</dt>
                <dd className="mt-1 flex gap-2">
                  <Button size="xs" icon={<Copy className="h-3 w-3" />} onClick={() => { void navigator.clipboard.writeText(portalUrl); toast("Portal link copied"); }}>Copy link</Button>
                  <Link href={`/portal/${c.portal_token}`} target="_blank"><Button size="xs" icon={<ExternalLink className="h-3 w-3" />}>Open</Button></Link>
                </dd>
              </div>
            </dl>
          </Card>
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader title="Projects" />
              {projects.length ? (
                <div className="divide-y divide-stone-100">
                  {projects.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-stone-500">{p.number} · {fmtDate(p.start_date)}</p>
                      </div>
                      <StageBadge s={p.stage} />
                      <span className="w-24 text-right text-sm font-semibold tabular-nums">{money0(p.contract_value)}</span>
                    </Link>
                  ))}
                </div>
              ) : <EmptyState title="No projects yet" body="Approve an estimate to create a project automatically." />}
            </Card>
            <Card>
              <CardHeader title="Recent communication" actions={<Button size="xs" variant="ghost" onClick={() => setTab("activity")}>View all</Button>} />
              <div className="divide-y divide-stone-100">
                {S.activities.filter((a) => a.customer_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map((a) => (
                  <div key={a.id} className="px-5 py-2.5">
                    <p className="text-sm"><span className="font-medium">{a.subject}</span> <span className="text-xs text-stone-400">· {ago(a.created_at)}</span></p>
                    {a.body && <p className="truncate text-xs text-stone-500">{a.body}</p>}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "activity" && (
        <Card className="p-5">
          <ActivityTimeline filter={activityFilter} link={{ customer_id: c.id }} canLog={can("customers.edit")} />
        </Card>
      )}

      {tab === "leads" && (
        <Card>
          <CardHeader title="Leads" actions={can("leads.edit") && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setNewLead(true)}>New lead</Button>} />
          {!leads.length && <EmptyState title="No leads" />}
          <div className="divide-y divide-stone-100">
            {leads.map((l) => {
              const st = S.pipeline_stages.find((s) => s.id === l.stage_id);
              return (
                <Link key={l.id} href={`/leads/${l.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-stone-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.title}</p>
                    <ServiceChips services={l.services} className="mt-1" />
                  </div>
                  <PriorityBadge p={l.priority} />
                  <Badge tone={l.status === "won" ? "green" : l.status === "lost" ? "red" : "neutral"}>{st?.name}</Badge>
                  <span className="w-24 text-right text-sm font-semibold tabular-nums">{money0(l.estimated_value)}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "estimates" && (
        <Card>
          {!estimates.length && <EmptyState title="No estimates" />}
          <div className="divide-y divide-stone-100">
            {estimates.map((e) => {
              const t = estimateTotals(e, S.estimate_items.filter((i) => i.estimate_id === e.id));
              return (
                <Link key={e.id} href={`/estimates/${e.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.number} · {e.title}</p>
                    <p className="text-xs text-stone-500">Issued {fmtDate(e.issue_date)}</p>
                  </div>
                  <EstimateBadge s={e.status} />
                  <span className="w-28 text-right text-sm font-semibold tabular-nums">{money(t.total)}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "projects" && (
        <Card>
          {!projects.length && <EmptyState title="No projects" />}
          <div className="divide-y divide-stone-100">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.number} · {p.name}</p>
                  <ServiceChips services={p.services} className="mt-1" />
                </div>
                <StageBadge s={p.stage} />
                <span className="w-28 text-right text-sm font-semibold tabular-nums">{money0(p.contract_value)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {tab === "invoices" && (
        <Card>
          {!invoices.length && <EmptyState title="No invoices" />}
          <div className="divide-y divide-stone-100">
            {invoices.sort((a, b) => b.issue_date.localeCompare(a.issue_date)).map((i) => {
              const t = invoiceTotals(i, S.payments.filter((p) => p.invoice_id === i.id));
              return (
                <Link key={i.id} href={`/finance/invoices/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{i.number} <span className="font-normal text-stone-500">· {i.kind}</span></p>
                    <p className="text-xs text-stone-500">Due {fmtDate(i.due_date)}</p>
                  </div>
                  <InvoiceBadge s={i.status} />
                  <div className="w-28 text-right">
                    <p className="text-sm font-semibold tabular-nums">{money(t.total)}</p>
                    {t.balance > 0 && <p className="text-xs tabular-nums text-clay-600">{money(t.balance)} due</p>}
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "files" && (
        <Card className="space-y-5 p-5">
          {can("documents.edit") && <FileUploader meta={{ customer_id: c.id }} />}
          <FileGallery files={files} canEdit={can("documents.edit")} showShare />
        </Card>
      )}

      {tab === "messages" && <MessageThread customerId={c.id} projectId={null} />}

      <CustomerModal open={edit} onClose={() => setEdit(false)} customer={c} />
      <LeadModal open={newLead} onClose={() => setNewLead(false)} presetCustomerId={c.id} onSaved={(l) => router.push(`/leads/${l.id}`)} />
    </div>
  );
}

