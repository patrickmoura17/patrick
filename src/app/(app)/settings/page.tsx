"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Database, Download, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { hashPassword } from "@/lib/hash";
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";
import { unitPriceFrom } from "@/lib/calc";
import { download, fmtDateTime, money } from "@/lib/format";
import { exportJSON, importJSON, listBackups, restoreBackup } from "@/lib/backup";
import { ScheduleEditor } from "@/components/schedule";
import { SERVICE_META, SERVICES } from "@/components/status";
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, DataTable, EmptyState, Field, Input, Modal, NumberInput, PageHeader, SearchInput, Select, Tabs, Textarea, Toggle, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { CatalogItem, CompanySettings, Permission, Profile, Role, ServiceCategory, Unit } from "@/lib/types";

type Tab = "company" | "terms" | "catalog" | "templates" | "pipeline" | "users" | "roles" | "audit" | "data";

export default function SettingsPage() {
  return (
    <RequirePerm perm={["settings.manage", "users.manage"]}>
      <Suspense>
        <Inner />
      </Suspense>
    </RequirePerm>
  );
}

function Inner() {
  const params = useSearchParams();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || (can("settings.manage") ? "company" : "users"));
  const tabs: { key: Tab; label: string; perm: Permission }[] = [
    { key: "company", label: "Company & branding", perm: "settings.manage" },
    { key: "terms", label: "Tax, terms & numbering", perm: "settings.manage" },
    { key: "catalog", label: "Pricing catalog", perm: "settings.manage" },
    { key: "templates", label: "Estimate templates", perm: "settings.manage" },
    { key: "pipeline", label: "Sales pipeline", perm: "settings.manage" },
    { key: "users", label: "Users", perm: "users.manage" },
    { key: "roles", label: "Roles & permissions", perm: "users.manage" },
    { key: "audit", label: "Audit log", perm: "settings.manage" },
    { key: "data", label: "Data & backups", perm: "settings.manage" },
  ];
  return (
    <div>
      <PageHeader title="Settings" subtitle="Company configuration, pricing, users and security" />
      <Tabs<Tab> className="mb-5" value={tab} onChange={setTab} tabs={tabs.filter((t) => can(t.perm))} />
      {tab === "company" && <Company />}
      {tab === "terms" && <Terms />}
      {tab === "catalog" && <Catalog />}
      {tab === "templates" && <Templates />}
      {tab === "pipeline" && <Pipeline />}
      {tab === "users" && <Users />}
      {tab === "roles" && <Roles />}
      {tab === "audit" && <Audit />}
      {tab === "data" && <Data />}
    </div>
  );
}

function useCo(): [CompanySettings, (p: Partial<CompanySettings>) => void] {
  const S = useSnapshot();
  const co = S.company_settings[0];
  return [co, (p) => db.update("company_settings", co.id, p)];
}

function Company() {
  const [co, upd] = useCo();
  const { toast } = useToast();
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader title="Company information" subtitle="Appears on proposals, invoices, change orders and the customer portal" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Company name"><Input value={co.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
          <Field label="Tagline"><Input value={co.tagline} onChange={(e) => upd({ tagline: e.target.value })} /></Field>
          <Field label="Phone"><Input value={co.phone} onChange={(e) => upd({ phone: e.target.value })} /></Field>
          <Field label="Email"><Input value={co.email} onChange={(e) => upd({ email: e.target.value })} /></Field>
          <Field label="Website"><Input value={co.website} onChange={(e) => upd({ website: e.target.value })} /></Field>
          <Field label="Contractor license #"><Input value={co.license_number} onChange={(e) => upd({ license_number: e.target.value })} /></Field>
          <Field label="Business address" className="sm:col-span-2"><Input value={co.address} onChange={(e) => upd({ address: e.target.value })} /></Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Logo & branding" />
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-4">
            <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {co.logo_url ? <img src={co.logo_url} alt="logo" className="h-full w-full object-contain" /> : <span className="text-xs text-stone-400">No logo</span>}
            </div>
            <div className="space-y-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-stone-50">
                <Upload className="h-4 w-4" /> Upload logo
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 500 * 1024) return toast("Logo must be under 500 KB", "error");
                  const r = new FileReader();
                  r.onload = () => { upd({ logo_url: r.result as string }); toast("Logo updated"); };
                  r.readAsDataURL(f);
                }} />
              </label>
              {co.logo_url && <button className="block text-xs text-clay-600" onClick={() => upd({ logo_url: null })}>Remove</button>}
            </div>
          </div>
          <Field label="Brand accent color" hint="Used on PDF documents and the customer portal">
            <div className="flex gap-2"><Input type="color" className="h-9 w-14 p-1" value={co.brand_color} onChange={(e) => upd({ brand_color: e.target.value })} /><Input value={co.brand_color} onChange={(e) => upd({ brand_color: e.target.value })} /></div>
          </Field>
        </div>
      </Card>
    </div>
  );
}

function Terms() {
  const [co, upd] = useCo();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Tax & payment defaults" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Sales tax rate (%)"><NumberInput value={co.tax_rate} onChange={(n) => upd({ tax_rate: n })} /></Field>
          <Field label="Default markup (%)"><NumberInput value={co.default_markup} onChange={(n) => upd({ default_markup: n })} /></Field>
          <Field label="Invoice payment terms (days)"><NumberInput value={co.default_payment_terms_days} onChange={(n) => upd({ default_payment_terms_days: Math.round(n) })} /></Field>
          <Field label="Estimate valid for (days)"><NumberInput value={co.estimate_valid_days} onChange={(n) => upd({ estimate_valid_days: Math.round(n) })} /></Field>
          <div className="sm:col-span-2"><Checkbox checked={co.tax_materials_only} onChange={(v) => upd({ tax_materials_only: v })} label="Mark labor-only catalog lines as non-taxable by default" /></div>
        </div>
        <div className="border-t border-stone-100 p-5">
          <p className="mb-3 text-sm font-semibold">Default payment schedule</p>
          <ScheduleEditor schedule={co.default_payment_schedule} total={10000} locked={false} onChange={(s) => upd({ default_payment_schedule: s })} />
          <p className="mt-2 text-xs text-stone-400">Preview based on a $10,000 contract. Every new estimate starts with this schedule.</p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Document templates" />
        <div className="space-y-4 p-5">
          <Field label="Default estimate terms & conditions"><Textarea className="min-h-[160px] text-xs" value={co.estimate_terms} onChange={(e) => upd({ estimate_terms: e.target.value })} /></Field>
          <Field label="Default exclusions"><Textarea className="min-h-[110px] text-xs" value={co.estimate_exclusions} onChange={(e) => upd({ estimate_exclusions: e.target.value })} /></Field>
          <Field label="Invoice footer"><Textarea value={co.invoice_footer} onChange={(e) => upd({ invoice_footer: e.target.value })} /></Field>
        </div>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader title="Document numbering" />
        <div className="grid gap-4 p-5 md:grid-cols-5">
          {(Object.keys(co.number_prefixes) as (keyof CompanySettings["number_prefixes"])[]).map((k) => (
            <div key={k} className="space-y-2">
              <Field label={`${k.replace("_", " ")} prefix`}><Input value={co.number_prefixes[k]} onChange={(e) => upd({ number_prefixes: { ...co.number_prefixes, [k]: e.target.value } })} /></Field>
              <Field label="Next number"><NumberInput value={co.next_numbers[k]} onChange={(n) => upd({ next_numbers: { ...co.next_numbers, [k]: Math.max(1, Math.round(n)) } })} /></Field>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Catalog() {
  const S = useSnapshot();
  const [co] = useCo();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ServiceCategory | "">("");
  const [edit, setEdit] = useState<CatalogItem | "new" | null>(null);
  const rows = S.catalog_items.filter((c) => (!cat || c.category === cat) && (!q || `${c.name} ${c.section}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Card>
      <CardHeader title="Pricing catalog" subtitle={`${S.catalog_items.length} services · used by the estimate builder`} actions={<Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>Add service</Button>} />
      <div className="flex flex-col gap-2 border-b border-stone-100 p-3 md:flex-row">
        <SearchInput value={q} onChange={setQ} className="md:w-64" />
        <Select value={cat} onChange={(e) => setCat(e.target.value as ServiceCategory | "")} className="md:w-48"><option value="">All categories</option>{SERVICES.map((s) => <option key={s} value={s}>{SERVICE_META[s].label}</option>)}</Select>
      </div>
      <DataTable
        rows={rows}
        dense
        pageSize={40}
        onRowClick={(r) => setEdit(r)}
        initialSort={{ key: "cat", dir: "asc" }}
        columns={[
          { key: "cat", header: "Category", sort: (r) => `${r.category}${r.section}${r.name}`, cell: (r) => <span className="flex items-center gap-1.5 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: SERVICE_META[r.category].color }} />{SERVICE_META[r.category].label} · {r.section}</span> },
          { key: "name", header: "Service", sort: (r) => r.name, cell: (r) => <span className={cn("font-medium", !r.active && "text-stone-400 line-through")}>{r.name}</span> },
          { key: "unit", header: "Unit", cell: (r) => r.unit },
          { key: "mat", header: "Material", sort: (r) => r.material_cost, cell: (r) => <span className="tabular-nums">{money(r.material_cost)}</span>, className: "text-right", headerClassName: "text-right" },
          { key: "lab", header: "Labor", sort: (r) => r.labor_cost, cell: (r) => <span className="tabular-nums">{money(r.labor_cost)}</span>, className: "text-right", headerClassName: "text-right" },
          { key: "mk", header: "Markup", sort: (r) => r.markup, cell: (r) => <span className="tabular-nums">{r.markup}%</span>, className: "text-right", headerClassName: "text-right" },
          { key: "price", header: "Sell price", sort: (r) => unitPriceFrom(r.material_cost, r.labor_cost, r.markup), cell: (r) => <span className="font-semibold tabular-nums">{money(unitPriceFrom(r.material_cost, r.labor_cost, r.markup))}</span>, className: "text-right", headerClassName: "text-right" },
        ]}
      />
      {edit && <CatalogModal item={edit === "new" ? null : edit} defaultMarkup={co.default_markup} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function CatalogModal({ item, defaultMarkup, onClose }: { item: CatalogItem | null; defaultMarkup: number; onClose: () => void }) {
  const { toast, confirm } = useToast();
  const [f, setF] = useState<Omit<CatalogItem, "id" | "created_at">>(item ?? { category: "tile", section: "", name: "", description: "", unit: "SQFT", material_cost: 0, labor_cost: 0, markup: defaultMarkup, active: true });
  return (
    <Modal open onClose={onClose} title={item ? "Edit service" : "New catalog service"} footer={<>{item && <Button variant="ghost" className="mr-auto text-clay-600" onClick={async () => { if (await confirm({ title: "Delete service?", body: "Existing estimates keep their lines.", danger: true, confirmLabel: "Delete" })) { db.remove("catalog_items", item.id); onClose(); } }}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { if (!f.name.trim()) return toast("Name required", "error"); if (item) db.update("catalog_items", item.id, f); else db.insert("catalog_items", f); toast("Catalog saved"); onClose(); }}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ServiceCategory })}>{SERVICES.map((s) => <option key={s} value={s}>{SERVICE_META[s].label}</option>)}</Select></Field>
        <Field label="Section"><Input value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} placeholder="Installation" /></Field>
        <Field label="Unit"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Unit })}>{["SQFT", "LF", "EA", "HR", "LS"].map((u) => <option key={u}>{u}</option>)}</Select></Field>
        <Field label="Service name" required className="sm:col-span-3"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Description" className="sm:col-span-3"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Material cost / unit"><NumberInput value={f.material_cost} onChange={(n) => setF({ ...f, material_cost: n })} /></Field>
        <Field label="Labor cost / unit"><NumberInput value={f.labor_cost} onChange={(n) => setF({ ...f, labor_cost: n })} /></Field>
        <Field label="Markup %"><NumberInput value={f.markup} onChange={(n) => setF({ ...f, markup: n })} /></Field>
        <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm sm:col-span-3"><Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active in estimate builder" /><span>Sell price <b className="tabular-nums">{money(unitPriceFrom(f.material_cost, f.labor_cost, f.markup))}</b> / {f.unit}</span></div>
      </div>
    </Modal>
  );
}

function Templates() {
  const S = useSnapshot();
  const { confirm, prompt } = useToast();
  return (
    <Card>
      <CardHeader title="Estimate templates" subtitle="Create templates from any estimate via ⋯ → Save as template" />
      {!S.estimate_templates.length ? <EmptyState title="No templates" /> : (
        <div className="divide-y divide-stone-100">
          {S.estimate_templates.map((t) => {
            const total = t.items.reduce((s, i) => s + i.quantity * (i.price_override ? i.unit_price : unitPriceFrom(i.material_cost, i.labor_cost, i.markup)), 0);
            return (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERVICE_META[t.category]?.color }} />
                <div className="min-w-0 flex-1"><p className="font-medium">{t.name}</p><p className="truncate text-xs text-stone-500">{t.description} · {t.items.length} lines · ~{money(total)} before tax</p></div>
                <Button size="xs" variant="ghost" onClick={async () => { const n = await prompt({ title: "Rename template", initial: t.name }); if (n) db.update("estimate_templates", t.id, { name: n }); }}>Rename</Button>
                <Button size="xs" variant="ghost" className="text-clay-600" onClick={async () => { if (await confirm({ title: "Delete template?", danger: true, confirmLabel: "Delete" })) db.remove("estimate_templates", t.id); }}>Delete</Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function Pipeline() {
  const S = useSnapshot();
  const { toast, confirm } = useToast();
  const stages = [...S.pipeline_stages].sort((a, b) => a.position - b.position);
  const swap = (i: number, j: number) => {
    if (j < 0 || j >= stages.length) return;
    db.update("pipeline_stages", stages[i].id, { position: stages[j].position });
    db.update("pipeline_stages", stages[j].id, { position: stages[i].position });
  };
  return (
    <Card>
      <CardHeader title="Sales pipeline stages" subtitle="Rename, reorder, recolor and set win probability. Leads keep their stage." actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => db.insert("pipeline_stages", { name: "New stage", position: Math.max(...stages.map((s) => s.position)) + 1, color: "#857d70", kind: "open", probability: 30 })}>Add stage</Button>} />
      <div className="divide-y divide-stone-100">
        {stages.map((s, i) => (
          <div key={s.id} className="grid grid-cols-12 items-center gap-2 px-5 py-2.5">
            <div className="col-span-1 flex flex-col">
              <button className="text-stone-400 hover:text-ink-900" onClick={() => swap(i, i - 1)}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button className="text-stone-400 hover:text-ink-900" onClick={() => swap(i, i + 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
            <Input type="color" className="col-span-2 h-8 p-1 md:col-span-1" value={s.color} onChange={(e) => db.update("pipeline_stages", s.id, { color: e.target.value })} />
            <Input className="col-span-9 h-8 md:col-span-5" value={s.name} onChange={(e) => db.update("pipeline_stages", s.id, { name: e.target.value })} />
            <Select className="col-span-5 h-8 text-xs md:col-span-2" value={s.kind} onChange={(e) => db.update("pipeline_stages", s.id, { kind: e.target.value as typeof s.kind })}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></Select>
            <div className="col-span-5 flex items-center gap-1 md:col-span-2"><NumberInput className="h-8 text-right" value={s.probability} onChange={(n) => db.update("pipeline_stages", s.id, { probability: Math.max(0, Math.min(100, Math.round(n))) })} /><span className="text-xs text-stone-400">%</span></div>
            <button className="col-span-2 justify-self-end p-1 text-stone-400 hover:text-clay-600 md:col-span-1" onClick={async () => {
              const n = S.leads.filter((l) => l.stage_id === s.id).length;
              if (n) return toast(`${n} leads are in this stage — move them first`, "error");
              if (await confirm({ title: `Delete “${s.name}”?`, danger: true, confirmLabel: "Delete" })) db.remove("pipeline_stages", s.id);
            }}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Users() {
  const S = useSnapshot();
  const { mode, user: me } = useAuth();
  const [edit, setEdit] = useState<Profile | "new" | null>(null);
  return (
    <Card>
      <CardHeader title="Users" subtitle={mode === "supabase" ? "Users sign up with Supabase Auth; assign their role here." : "Local accounts for this workspace"} actions={<Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>Add user</Button>} />
      <DataTable
        rows={S.profiles}
        onRowClick={(r) => setEdit(r)}
        columns={[
          { key: "name", header: "Name", sort: (r) => r.full_name, cell: (r) => <div className="flex items-center gap-3"><Avatar name={r.full_name} color={r.color} size={30} /><div><p className="font-medium">{r.full_name}{r.id === me?.id && <Badge className="ml-2">You</Badge>}</p><p className="text-xs text-stone-500">{r.email}</p></div></div> },
          { key: "title", header: "Title", cell: (r) => <span className="text-sm text-stone-600">{r.title}</span>, hideOnMobile: true },
          { key: "role", header: "Role", sort: (r) => S.roles.find((x) => x.id === r.role_id)?.name ?? "", cell: (r) => <Badge tone="brass">{S.roles.find((x) => x.id === r.role_id)?.name}</Badge> },
          { key: "status", header: "Status", cell: (r) => <Badge tone={r.active ? "green" : "neutral"}>{r.active ? "Active" : "Disabled"}</Badge> },
        ]}
      />
      {edit && <UserModal profile={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function UserModal({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const S = useSnapshot();
  const { mode, user: me } = useAuth();
  const { toast } = useToast();
  const [f, setF] = useState({ full_name: profile?.full_name ?? "", email: profile?.email ?? "", phone: profile?.phone ?? "", title: profile?.title ?? "", role_id: profile?.role_id ?? S.roles.find((r) => r.key === "field_employee")?.id ?? S.roles[0].id, color: profile?.color ?? "#4f7190", active: profile?.active ?? true, password: "" });
  const save = async () => {
    if (!f.full_name.trim() || !/^\S+@\S+\.\S+$/.test(f.email)) return toast("Name and a valid email are required", "error");
    if (S.profiles.some((p) => p.email.toLowerCase() === f.email.toLowerCase() && p.id !== profile?.id)) return toast("Email already in use", "error");
    const owners = S.profiles.filter((p) => S.roles.find((r) => r.id === p.role_id)?.key === "owner" && p.active);
    if (profile && owners.length === 1 && owners[0].id === profile.id && (S.roles.find((r) => r.id === f.role_id)?.key !== "owner" || !f.active)) return toast("At least one active Owner is required", "error");
    const { password, ...rest } = f;
    if (profile) {
      db.update("profiles", profile.id, { ...rest, ...(password && mode === "local" ? { password_hash: await hashPassword(password) } : {}) });
    } else {
      if (mode === "local" && password.length < 8) return toast("Password must be at least 8 characters", "error");
      if (mode === "supabase") return toast("In cloud mode, invite the user to sign up; their profile appears here automatically.", "info");
      db.insert("profiles", { ...rest, password_hash: await hashPassword(password) });
    }
    toast("User saved");
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={profile ? profile.full_name : "Add user"} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Email" required><Input type="email" value={f.email} disabled={mode === "supabase" && !!profile} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Role"><Select value={f.role_id} onChange={(e) => setF({ ...f, role_id: e.target.value })}>{S.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Avatar color"><Input type="color" className="h-9 p-1" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
        {mode === "local" && <Field label={profile ? "Reset password" : "Password"} hint={profile ? "Leave blank to keep current" : "At least 8 characters"} className="sm:col-span-2"><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>}
        <div className="sm:col-span-2"><Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v || profile?.id === me?.id })} label="Active (can sign in)" /></div>
      </div>
    </Modal>
  );
}

function Roles() {
  const S = useSnapshot();
  const { toast, confirm, prompt } = useToast();
  const [sel, setSel] = useState<string>(S.roles[0]?.id);
  const role = S.roles.find((r) => r.id === sel);
  const toggle = (r: Role, p: Permission) => {
    if (r.key === "owner") return toast("The Owner role always has full access", "info");
    db.update("roles", r.id, { permissions: r.permissions.includes(p) ? r.permissions.filter((x) => x !== p) : [...r.permissions, p] });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit p-2">
        {S.roles.map((r) => (
          <button key={r.id} onClick={() => setSel(r.id)} className={cn("w-full rounded-lg px-3 py-2 text-left", sel === r.id ? "bg-brass-50" : "hover:bg-stone-50")}>
            <p className="text-sm font-medium">{r.name}</p>
            <p className="text-xs text-stone-500">{S.profiles.filter((p) => p.role_id === r.id).length} users · {r.permissions.length}/{ALL_PERMISSIONS.length} permissions</p>
          </button>
        ))}
        <Button size="sm" variant="ghost" className="mt-1 w-full" icon={<Plus className="h-4 w-4" />} onClick={async () => { const n = await prompt({ title: "New role", label: "Role name" }); if (n) { const r = db.insert("roles", { key: n.toLowerCase().replace(/\W+/g, "_"), name: n, description: "", permissions: ["dashboard.view"], system: false }); setSel(r.id); } }}>Custom role</Button>
      </Card>
      {role && (
        <Card>
          <CardHeader title={role.name} subtitle={role.description || "Configure what this role can see and do"} actions={!role.system && <Button size="xs" variant="ghost" className="text-clay-600" onClick={async () => { if (S.profiles.some((p) => p.role_id === role.id)) return toast("Reassign users before deleting this role", "error"); if (await confirm({ title: "Delete role?", danger: true, confirmLabel: "Delete" })) { db.remove("roles", role.id); setSel(S.roles[0].id); } }}>Delete role</Button>} />
          <div className="grid gap-x-8 gap-y-5 p-5 md:grid-cols-2">
            {PERMISSION_GROUPS.map((g) => (
              <div key={g.module}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">{g.module}</p>
                <div className="space-y-1.5">{g.perms.map((p) => <Checkbox key={p.key} checked={role.permissions.includes(p.key)} onChange={() => toggle(role, p.key)} label={p.label} />)}</div>
              </div>
            ))}
          </div>
          <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">Permissions are enforced in the interface and, in cloud mode, by PostgreSQL row-level security policies.</p>
        </Card>
      )}
    </div>
  );
}

function Audit() {
  const S = useSnapshot();
  const [q, setQ] = useState("");
  const [table, setTable] = useState("");
  const logs = useMemo(() => [...S.audit_logs].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((l) => (!table || l.table_name === table) && (!q || l.summary.toLowerCase().includes(q.toLowerCase()))), [S.audit_logs, q, table]);
  return (
    <Card>
      <CardHeader title="Audit log" subtitle="Every create, update and delete on customers, leads, estimates, projects, change orders, invoices, payments, expenses, purchasing, users, roles and settings" />
      <div className="flex flex-col gap-2 border-b border-stone-100 p-3 md:flex-row">
        <SearchInput value={q} onChange={setQ} className="md:w-72" />
        <Select value={table} onChange={(e) => setTable(e.target.value)} className="md:w-52"><option value="">All records</option>{[...new Set(S.audit_logs.map((l) => l.table_name))].sort().map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</Select>
      </div>
      <DataTable
        rows={logs}
        dense
        pageSize={50}
        empty={<EmptyState title="No audit entries yet" body="Changes you make from now on are recorded here." />}
        columns={[
          { key: "at", header: "When", cell: (l) => <span className="whitespace-nowrap text-xs text-stone-500">{fmtDateTime(l.created_at)}</span> },
          { key: "who", header: "User", cell: (l) => <span className="text-xs">{S.profiles.find((p) => p.id === l.user_id)?.full_name ?? "System / customer"}</span> },
          { key: "act", header: "Action", cell: (l) => <Badge tone={l.action === "delete" ? "red" : l.action === "insert" ? "green" : "blue"}>{l.action}</Badge> },
          { key: "sum", header: "Record", cell: (l) => <span className="text-sm">{l.summary}</span> },
          { key: "chg", header: "Changes", cell: (l) => <span className="block max-w-[420px] truncate text-xs text-stone-500" title={l.changes ? JSON.stringify(l.changes) : ""}>{l.changes ? Object.entries(l.changes).map(([k, v]) => `${k}: ${short(v.from)} → ${short(v.to)}`).join(" · ") : "—"}</span>, hideOnMobile: true },
        ]}
      />
    </Card>
  );
}
const short = (v: unknown) => { const s = typeof v === "object" ? JSON.stringify(v) : String(v); return s.length > 28 ? s.slice(0, 28) + "…" : s; };

function Data() {
  const { mode, resetData } = useAuth();
  const { toast, confirm } = useToast();
  const [backups, setBackups] = useState<{ key: string; date: string }[]>([]);
  useEffect(() => {
    if (mode === "local") void listBackups().then(setBackups);
  }, [mode]);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Storage" icon={<Database className="h-4 w-4" />} />
        <div className="space-y-2 p-5 text-sm text-stone-600">
          <p>Mode: <Badge tone={mode === "supabase" ? "green" : "brass"}>{mode === "supabase" ? "Supabase (PostgreSQL cloud)" : "Local (this browser)"}</Badge></p>
          {mode === "local" ? (
            <p>Data is persisted in this browser&apos;s IndexedDB and synced across tabs. To run multi-user with secure auth, role-based row-level security, file storage and realtime updates, set <code className="rounded bg-stone-100 px-1 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="rounded bg-stone-100 px-1 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and apply the migrations in <code className="rounded bg-stone-100 px-1 text-xs">supabase/migrations</code>.</p>
          ) : <p>PostgreSQL with row-level security, Supabase Auth, Storage and Realtime. Daily backups and point-in-time recovery are managed by Supabase.</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Export & import" />
        <div className="flex flex-wrap gap-2 p-5">
          <Button icon={<Download className="h-4 w-4" />} onClick={() => download(`stoneline-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(), "application/json")}>Download full backup (JSON)</Button>
          {mode === "local" && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium shadow-sm hover:bg-stone-50">
              <Upload className="h-4 w-4" /> Restore from file
              <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !(await confirm({ title: "Replace all data with this backup?", body: "Current data will be overwritten.", danger: true, confirmLabel: "Restore" }))) return;
                try { await importJSON(await file.text()); toast("Backup restored"); } catch (x) { toast((x as Error).message, "error"); }
              }} />
            </label>
          )}
        </div>
      </Card>
      {mode === "local" && (
        <>
          <Card>
            <CardHeader title="Automatic daily backups" subtitle="A snapshot is saved once per day; the last 7 are kept" />
            <div className="divide-y divide-stone-100">
              {!backups.length && <p className="p-5 text-sm text-stone-400">No automatic backups yet.</p>}
              {backups.map((b) => (
                <div key={b.key} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span>{b.date}</span>
                  <Button size="xs" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={async () => { if (await confirm({ title: `Restore backup from ${b.date}?`, danger: true, confirmLabel: "Restore" })) { await restoreBackup(b.key); toast("Restored"); } }}>Restore</Button>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Reset workspace" />
            <div className="flex flex-wrap gap-2 p-5">
              <Button onClick={async () => { if (await confirm({ title: "Reload the demo company?", body: "All current data is replaced with fresh demo data.", danger: true, confirmLabel: "Reload demo" })) { await resetData(true); toast("Demo data loaded"); } }}>Reload demo data</Button>
              <Button variant="danger" onClick={async () => { if (await confirm({ title: "Start clean?", body: "Deletes all customers, projects, invoices and history. Keeps your login and company name; roles, pricing catalog, templates and automations return to defaults. Download a backup first.", danger: true, confirmLabel: "Erase data" })) { await resetData(false); toast("Workspace reset"); } }}>Erase all business data</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
