"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Download, PackageCheck, Plus, Send, Trash2, Truck } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { nextNumber, placePurchaseOrder, poTotal, receivePurchaseOrder, stockMove } from "@/lib/services";
import { addDaysISO, todayISO } from "@/lib/calc";
import { download, fmtDate, money, money0, num, toCSV } from "@/lib/format";
import { Badge, Button, Card, Checkbox, DataTable, EmptyState, Field, Input, Modal, NumberInput, PageHeader, SearchInput, Select, Stat, Tabs, Textarea, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { InventoryCategory, InventoryItem, POItem, PurchaseOrder, Supplier } from "@/lib/types";

const CATS: InventoryCategory[] = ["Tile", "Flooring", "Cabinets", "Countertops", "Installation Materials", "Adhesives", "Grout", "Underlayment", "Tools & Supplies"];
const PO_TONE = { draft: "neutral", ordered: "blue", partially_received: "amber", received: "green", cancelled: "red" } as const;
type Tab = "items" | "pos" | "suppliers" | "movements";

export default function InventoryPage() {
  return (
    <RequirePerm perm="inventory.view">
      <Suspense>
        <Inner />
      </Suspense>
    </RequirePerm>
  );
}

function Inner() {
  const S = useSnapshot();
  const { can } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "items");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [item, setItem] = useState<InventoryItem | "new" | null>(null);
  const [po, setPo] = useState<string | null>(params.get("po"));
  const [sup, setSup] = useState<Supplier | "new" | null>(null);
  const [adjust, setAdjust] = useState<InventoryItem | null>(null);
  const edit = can("inventory.edit");

  useEffect(() => {
    const id = params.get("item");
    if (id) setItem(S.inventory_items.find((i) => i.id === id) ?? null);
    const np = params.get("newpo");
    if (np && edit && S.suppliers.length) {
      const p = db.insert("purchase_orders", { number: nextNumber("purchase_order"), supplier_id: S.suppliers[0].id, project_id: np, status: "draft", order_date: todayISO(), expected_date: addDaysISO(todayISO(), 7), delivered_date: null, delivery_address: S.projects.find((x) => x.id === np)?.address ?? "", items: [], shipping: 0, tax: 0, notes: "" });
      setTab("pos");
      setPo(p.id);
      router.replace("/inventory?tab=pos");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const items = useMemo(() => S.inventory_items.filter((i) => (!cat || i.category === cat) && (!lowOnly || i.quantity <= i.reorder_level) && (!q || [i.name, i.sku, i.manufacturer, i.color].some((x) => x.toLowerCase().includes(q.toLowerCase())))), [S.inventory_items, cat, lowOnly, q]);
  const low = S.inventory_items.filter((i) => i.quantity <= i.reorder_level);
  const stockValue = S.inventory_items.reduce((s, i) => s + i.quantity * i.cost, 0);
  const openPOs = S.purchase_orders.filter((p) => ["ordered", "partially_received"].includes(p.status));
  const supplierName = (id: string | null) => S.suppliers.find((s) => s.id === id)?.name ?? "—";

  return (
    <div>
      <PageHeader
        title="Materials & Inventory"
        subtitle="Stock, purchasing, suppliers and job material allocation"
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => download("inventory.csv", toCSV(S.inventory_items.map((i) => ({ name: i.name, sku: i.sku, category: i.category, supplier: supplierName(i.supplier_id), manufacturer: i.manufacturer, color: i.color, finish: i.finish, size: i.size, quantity: i.quantity, unit: i.unit, cost: i.cost, price: i.price, value: i.quantity * i.cost, location: i.location, reorder_level: i.reorder_level }))))}>Export</Button>
            {edit && tab === "items" && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setItem("new")}>New item</Button>}
            {edit && tab === "pos" && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { if (!S.suppliers.length) return setSup("new"); const p = db.insert("purchase_orders", { number: nextNumber("purchase_order"), supplier_id: S.suppliers[0].id, project_id: null, status: "draft", order_date: todayISO(), expected_date: addDaysISO(todayISO(), 7), delivered_date: null, delivery_address: S.company_settings[0]?.address ?? "", items: [], shipping: 0, tax: 0, notes: "" }); setPo(p.id); }}>New purchase order</Button>}
            {edit && tab === "suppliers" && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setSup("new")}>New supplier</Button>}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Inventory value" value={money0(stockValue)} sub={`${S.inventory_items.length} SKUs`} />
        <Stat label="Low stock alerts" value={<span className={low.length ? "text-clay-600" : ""}>{low.length}</span>} sub="at or below reorder level" onClick={() => { setTab("items"); setLowOnly(true); }} />
        <Stat label="Open purchase orders" value={openPOs.length} sub={money0(openPOs.reduce((s, p) => s + poTotal(p), 0))} onClick={() => setTab("pos")} />
        <Stat label="Arriving this week" value={openPOs.filter((p) => p.expected_date && p.expected_date <= addDaysISO(todayISO(), 7)).length} sub="deliveries" />
      </div>

      {low.length > 0 && tab === "items" && !lowOnly && (
        <button onClick={() => setLowOnly(true)} className="mb-4 flex w-full items-center gap-2 rounded-xl border border-amberx-100 bg-amberx-50 px-4 py-2.5 text-left text-sm text-amberx-600">
          <AlertTriangle className="h-4 w-4" /> <b>{low.length} items</b> need reordering: {low.slice(0, 3).map((i) => i.name).join(", ")}{low.length > 3 ? "…" : ""}
        </button>
      )}

      <Card>
        <div className="flex flex-col gap-2 border-b border-stone-100 px-3 pt-1 lg:flex-row lg:items-end lg:justify-between">
          <Tabs<Tab> className="border-0" value={tab} onChange={setTab} tabs={[{ key: "items", label: "Items", count: S.inventory_items.length }, { key: "pos", label: "Purchase orders", count: S.purchase_orders.length }, { key: "suppliers", label: "Suppliers", count: S.suppliers.length }, { key: "movements", label: "Stock movements" }]} />
          {tab === "items" && (
            <div className="flex flex-wrap gap-2 pb-2">
              <SearchInput value={q} onChange={setQ} className="w-56" />
              <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-48"><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</Select>
              <Button variant={lowOnly ? "brass" : "secondary"} onClick={() => setLowOnly((v) => !v)}>Low stock</Button>
            </div>
          )}
        </div>

        {tab === "items" && (
          <DataTable
            rows={items}
            onRowClick={(r) => setItem(r)}
            initialSort={{ key: "name", dir: "asc" }}
            empty={<EmptyState icon={<Boxes className="h-6 w-6" />} title="No items" />}
            columns={[
              { key: "name", header: "Product", sort: (r) => r.name, cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-stone-500">{r.sku} · {r.manufacturer}{r.color ? ` · ${r.color}` : ""}{r.finish ? ` · ${r.finish}` : ""}{r.size ? ` · ${r.size}` : ""}</p></div> },
              { key: "cat", header: "Category", sort: (r) => r.category, cell: (r) => <Badge>{r.category}</Badge>, hideOnMobile: true },
              { key: "sup", header: "Supplier", sort: (r) => supplierName(r.supplier_id), cell: (r) => <span className="text-xs text-stone-600">{supplierName(r.supplier_id)}</span>, hideOnMobile: true },
              { key: "loc", header: "Location", cell: (r) => <span className="text-xs text-stone-500">{r.location}</span>, hideOnMobile: true },
              { key: "qty", header: "On hand", sort: (r) => r.quantity, cell: (r) => <span className={cn("font-semibold tabular-nums", r.quantity <= r.reorder_level && "text-clay-600")}>{num(r.quantity)} <span className="text-xs font-normal text-stone-400">{r.unit}</span>{r.quantity <= r.reorder_level && <AlertTriangle className="ml-1 inline h-3.5 w-3.5" />}</span>, className: "text-right", headerClassName: "text-right" },
              { key: "cost", header: "Cost", sort: (r) => r.cost, cell: (r) => <span className="tabular-nums">{money(r.cost)}</span>, className: "text-right", headerClassName: "text-right", hideOnMobile: true },
              { key: "price", header: "Sell", sort: (r) => r.price, cell: (r) => <span className="tabular-nums text-stone-500">{r.price ? money(r.price) : "—"}</span>, className: "text-right", headerClassName: "text-right", hideOnMobile: true },
              { key: "value", header: "Value", sort: (r) => r.quantity * r.cost, cell: (r) => <span className="tabular-nums">{money0(r.quantity * r.cost)}</span>, className: "text-right", headerClassName: "text-right" },
              ...(edit ? [{ key: "act", header: "", cell: (r: InventoryItem) => <Button size="xs" onClick={(e) => { e.stopPropagation(); setAdjust(r); }}>Move</Button> }] : []),
            ]}
          />
        )}

        {tab === "pos" && (
          <DataTable
            rows={S.purchase_orders}
            onRowClick={(r) => setPo(r.id)}
            initialSort={{ key: "date", dir: "desc" }}
            empty={<EmptyState icon={<Truck className="h-6 w-6" />} title="No purchase orders" />}
            columns={[
              { key: "num", header: "PO", sort: (r) => r.number, cell: (r) => <span className="font-mono text-xs font-semibold">{r.number}</span> },
              { key: "sup", header: "Supplier", sort: (r) => supplierName(r.supplier_id), cell: (r) => <div><p className="font-medium">{supplierName(r.supplier_id)}</p><p className="text-xs text-stone-500">{r.items.length} lines{r.project_id ? ` · ${S.projects.find((p) => p.id === r.project_id)?.name}` : " · stock"}</p></div> },
              { key: "status", header: "Status", sort: (r) => r.status, cell: (r) => <Badge tone={PO_TONE[r.status]} dot>{r.status.replace("_", " ")}</Badge> },
              { key: "date", header: "Ordered", sort: (r) => r.order_date, cell: (r) => <span className="text-xs text-stone-500">{fmtDate(r.order_date)}</span>, hideOnMobile: true },
              { key: "eta", header: "Expected", sort: (r) => r.expected_date ?? "", cell: (r) => <span className={cn("text-xs", r.status !== "received" && r.expected_date && r.expected_date < todayISO() ? "font-semibold text-clay-600" : "text-stone-500")}>{fmtDate(r.expected_date)}</span>, hideOnMobile: true },
              { key: "total", header: "Total", sort: (r) => poTotal(r), cell: (r) => <span className="font-semibold tabular-nums">{money(poTotal(r))}</span>, className: "text-right", headerClassName: "text-right" },
            ]}
          />
        )}

        {tab === "suppliers" && (
          <DataTable
            rows={S.suppliers}
            onRowClick={(r) => setSup(r)}
            columns={[
              { key: "name", header: "Supplier", sort: (r) => r.name, cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-stone-500">{r.contact_name}</p></div> },
              { key: "contact", header: "Contact", cell: (r) => <div className="text-xs"><p>{r.phone}</p><p className="text-stone-500">{r.email}</p></div>, hideOnMobile: true },
              { key: "cats", header: "Categories", cell: (r) => <div className="flex flex-wrap gap-1">{r.categories.map((c) => <Badge key={c}>{c}</Badge>)}</div>, hideOnMobile: true },
              { key: "terms", header: "Terms", cell: (r) => <span className="text-xs">{r.payment_terms}</span> },
              { key: "spend", header: "Spend (12 mo)", sort: (r) => S.expenses.filter((e) => e.supplier_id === r.id).reduce((s, e) => s + e.amount, 0), cell: (r) => <span className="tabular-nums">{money0(S.expenses.filter((e) => e.supplier_id === r.id).reduce((s, e) => s + e.amount, 0))}</span>, className: "text-right", headerClassName: "text-right" },
              { key: "ap", header: "Payable", cell: (r) => { const v = S.expenses.filter((e) => e.supplier_id === r.id && e.status === "unpaid").reduce((s, e) => s + e.amount, 0); return <span className={cn("tabular-nums", v > 0 && "text-amberx-600")}>{money0(v)}</span>; }, className: "text-right", headerClassName: "text-right" },
            ]}
          />
        )}

        {tab === "movements" && (
          <DataTable
            rows={[...S.stock_movements].sort((a, b) => b.date.localeCompare(a.date))}
            dense
            columns={[
              { key: "date", header: "Date", cell: (r) => <span className="text-xs">{fmtDate(r.date)}</span> },
              { key: "type", header: "Type", cell: (r) => <Badge tone={r.type === "receive" ? "green" : r.type === "allocate" ? "brass" : r.type === "damage" ? "red" : "neutral"}>{r.type}</Badge> },
              { key: "item", header: "Item", cell: (r) => S.inventory_items.find((i) => i.id === r.inventory_item_id)?.name ?? "—" },
              { key: "proj", header: "Project", cell: (r) => <span className="text-xs text-stone-500">{S.projects.find((p) => p.id === r.project_id)?.name ?? (r.purchase_order_id ? S.purchase_orders.find((p) => p.id === r.purchase_order_id)?.number : "—")}</span>, hideOnMobile: true },
              { key: "qty", header: "Qty", cell: (r) => <span className={cn("font-semibold tabular-nums", r.quantity < 0 ? "text-clay-600" : "text-sage-700")}>{r.quantity > 0 ? "+" : ""}{num(r.quantity)}</span>, className: "text-right", headerClassName: "text-right" },
              { key: "val", header: "Value", cell: (r) => <span className="tabular-nums">{money(Math.abs(r.quantity) * r.unit_cost)}</span>, className: "text-right", headerClassName: "text-right" },
              { key: "notes", header: "Notes", cell: (r) => <span className="text-xs text-stone-500">{r.notes}</span>, hideOnMobile: true },
            ]}
          />
        )}
      </Card>

      {item && <ItemModal item={item === "new" ? null : item} onClose={() => setItem(null)} />}
      {po && <POModal id={po} onClose={() => setPo(null)} />}
      {sup && <SupplierModal supplier={sup === "new" ? null : sup} onClose={() => setSup(null)} />}
      {adjust && <AdjustModal item={adjust} onClose={() => setAdjust(null)} />}
    </div>
  );
}

function ItemModal({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const S = useSnapshot();
  const { can } = useAuth();
  const { toast, confirm } = useToast();
  const [f, setF] = useState<Omit<InventoryItem, "id" | "created_at">>(item ?? { name: "", supplier_id: S.suppliers[0]?.id ?? null, category: "Tile", sku: "", manufacturer: "", color: "", finish: "", size: "", quantity: 0, unit: "SQFT", cost: 0, price: 0, location: "", reorder_level: 0 });
  const save = () => {
    if (!f.name.trim()) return toast("Name is required", "error");
    if (item) db.update("inventory_items", item.id, f);
    else db.insert("inventory_items", f);
    toast("Item saved");
    onClose();
  };
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const edit = can("inventory.edit");
  return (
    <Modal open onClose={onClose} title={item ? item.name : "New inventory item"} size="lg" footer={<>{item && edit && <Button variant="ghost" className="mr-auto text-clay-600" onClick={async () => { if (await confirm({ title: "Delete item?", danger: true, confirmLabel: "Delete" })) { db.remove("inventory_items", item.id); onClose(); } }}>Delete</Button>}<Button onClick={onClose}>Cancel</Button>{edit && <Button variant="primary" onClick={save}>Save</Button>}</>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Product name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="SKU"><Input value={f.sku} onChange={(e) => set("sku", e.target.value)} /></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => set("category", e.target.value as InventoryCategory)}>{CATS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Supplier"><Select value={f.supplier_id ?? ""} onChange={(e) => set("supplier_id", e.target.value || null)}><option value="">—</option>{S.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Manufacturer"><Input value={f.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} /></Field>
        <Field label="Color"><Input value={f.color} onChange={(e) => set("color", e.target.value)} /></Field>
        <Field label="Finish"><Input value={f.finish} onChange={(e) => set("finish", e.target.value)} /></Field>
        <Field label="Size"><Input value={f.size} onChange={(e) => set("size", e.target.value)} /></Field>
        <Field label="Quantity on hand"><NumberInput value={f.quantity} onChange={(n) => set("quantity", n)} /></Field>
        <Field label="Unit"><Select value={f.unit} onChange={(e) => set("unit", e.target.value)}>{["SQFT", "LF", "EA", "BOX", "BAG", "ROLL", "SLAB", "PAIL", "UNIT", "GAL"].map((u) => <option key={u}>{u}</option>)}</Select></Field>
        <Field label="Reorder level"><NumberInput value={f.reorder_level} onChange={(n) => set("reorder_level", n)} /></Field>
        <Field label="Purchase cost"><NumberInput value={f.cost} onChange={(n) => set("cost", n)} /></Field>
        <Field label="Selling price"><NumberInput value={f.price} onChange={(n) => set("price", n)} /></Field>
        <Field label="Warehouse location"><Input value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
      </div>
      {item && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Recent movements</p>
          <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 text-sm">
            {S.stock_movements.filter((m) => m.inventory_item_id === item.id).slice(-8).reverse().map((m) => (
              <div key={m.id} className="flex justify-between px-3 py-2"><span>{fmtDate(m.date)} · {m.type}{m.project_id ? ` · ${S.projects.find((p) => p.id === m.project_id)?.name}` : ""}</span><span className="tabular-nums">{m.quantity > 0 ? "+" : ""}{num(m.quantity)}</span></div>
            ))}
            {!S.stock_movements.some((m) => m.inventory_item_id === item.id) && <p className="p-3 text-center text-stone-400">No movements</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function AdjustModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const S = useSnapshot();
  const { toast } = useToast();
  const [f, setF] = useState({ type: "allocate" as "allocate" | "return" | "damage" | "adjust", qty: 0, project: "", notes: "" });
  return (
    <Modal open onClose={onClose} title={`Stock movement — ${item.name}`} subtitle={`${num(item.quantity)} ${item.unit} on hand`} size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.qty || ((f.type === "allocate" || f.type === "return") && !f.project)} onClick={() => { stockMove(item.id, f.type, f.qty, f.project || null, f.notes); toast("Stock updated"); onClose(); }}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Movement"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}><option value="allocate">Allocate to project (job cost)</option><option value="return">Return from project</option><option value="damage">Damaged / write-off</option><option value="adjust">Count adjustment (+/−)</option></Select></Field>
        {(f.type === "allocate" || f.type === "return") && <Field label="Project"><Select value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}><option value="">Select…</option>{S.projects.filter((p) => p.stage !== "Closed").map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}</Select></Field>}
        <Field label={`Quantity (${item.unit})`} hint={f.type === "adjust" ? "Use a negative number to reduce stock" : undefined}><NumberInput value={f.qty} onChange={(n) => setF({ ...f, qty: n })} /></Field>
        <Field label="Notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function POModal({ id, onClose }: { id: string; onClose: () => void }) {
  const S = useSnapshot();
  const { can } = useAuth();
  const { toast, confirm } = useToast();
  const po = S.purchase_orders.find((p) => p.id === id);
  const [recv, setRecv] = useState<Record<string, number>>({});
  const [toJob, setToJob] = useState(true);
  if (!po) return null;
  const edit = can("inventory.edit") && po.status === "draft";
  const upd = (patch: Partial<PurchaseOrder>) => db.update("purchase_orders", po.id, patch);
  const setLine = (i: number, patch: Partial<POItem>) => upd({ items: po.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const receiving = ["ordered", "partially_received"].includes(po.status) && can("inventory.edit");
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={<span className="flex items-center gap-2">{po.number}<Badge tone={PO_TONE[po.status]} dot>{po.status.replace("_", " ")}</Badge></span>}
      footer={
        <>
          {can("inventory.edit") && po.status === "draft" && <Button variant="ghost" className="mr-auto text-clay-600" onClick={async () => { if (await confirm({ title: "Delete PO?", danger: true, confirmLabel: "Delete" })) { db.remove("purchase_orders", po.id); onClose(); } }}>Delete</Button>}
          {can("inventory.edit") && po.status === "ordered" && <Button onClick={() => upd({ status: "cancelled" })}>Cancel PO</Button>}
          {edit && <Button variant="brass" icon={<Send className="h-4 w-4" />} disabled={!po.items.length} onClick={() => { placePurchaseOrder(po.id); toast("PO placed — project timeline updated"); }}>Place order</Button>}
          {receiving && <Button variant="success" icon={<PackageCheck className="h-4 w-4" />} onClick={() => { const r = Object.fromEntries(po.items.map((it) => [it.id, recv[it.id] ?? Math.max(0, it.quantity - it.received)])); receivePurchaseOrder(po.id, r, toJob); setRecv({}); toast("Delivery received · stock and job costs updated"); }}>Receive delivery</Button>}
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Supplier"><Select disabled={!edit} value={po.supplier_id} onChange={(e) => upd({ supplier_id: e.target.value })}>{S.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Project (optional)"><Select disabled={!edit} value={po.project_id ?? ""} onChange={(e) => upd({ project_id: e.target.value || null, delivery_address: S.projects.find((p) => p.id === e.target.value)?.address ?? po.delivery_address })}><option value="">Stock / warehouse</option>{S.projects.filter((p) => p.stage !== "Closed").map((p) => <option key={p.id} value={p.id}>{p.number} · {p.name}</option>)}</Select></Field>
        <Field label="Order date"><Input type="date" disabled={!edit} value={po.order_date} onChange={(e) => upd({ order_date: e.target.value })} /></Field>
        <Field label="Expected delivery"><Input type="date" disabled={!can("inventory.edit")} value={po.expected_date ?? ""} onChange={(e) => upd({ expected_date: e.target.value || null })} /></Field>
        <Field label="Delivery address" className="md:col-span-4"><Input disabled={!edit} value={po.delivery_address} onChange={(e) => upd({ delivery_address: e.target.value })} /></Field>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-stone-50 text-[10.5px] font-semibold uppercase tracking-wider text-stone-500"><tr><th className="px-3 py-2 text-left">Item</th><th className="w-24 text-right">Qty</th><th className="w-20">Unit</th><th className="w-28 text-right">Unit cost</th><th className="w-28 px-3 text-right">Amount</th><th className="w-24 text-right">Received</th>{receiving && <th className="w-28 px-2 text-right">Receive now</th>}<th className="w-8" /></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {po.items.map((it, i) => (
              <tr key={it.id}>
                <td className="px-3 py-1.5">
                  {edit ? (
                    <Select className="h-8 text-xs" value={it.inventory_item_id ?? ""} onChange={(e) => { const inv = S.inventory_items.find((x) => x.id === e.target.value); setLine(i, inv ? { inventory_item_id: inv.id, name: inv.name, unit: inv.unit, unit_cost: inv.cost } : { inventory_item_id: null }); }}>
                      <option value="">Custom / non-stock item</option>
                      {S.inventory_items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </Select>
                  ) : <span className="font-medium">{it.name}</span>}
                  {edit && !it.inventory_item_id && <Input className="mt-1 h-8 text-xs" placeholder="Description" value={it.name} onChange={(e) => setLine(i, { name: e.target.value })} />}
                </td>
                <td className="px-1"><NumberInput disabled={!edit} className="h-8 text-right" value={it.quantity} onChange={(n) => setLine(i, { quantity: n })} /></td>
                <td className="px-1"><Input disabled={!edit} className="h-8 text-xs" value={it.unit} onChange={(e) => setLine(i, { unit: e.target.value })} /></td>
                <td className="px-1"><NumberInput disabled={!edit} className="h-8 text-right" value={it.unit_cost} onChange={(n) => setLine(i, { unit_cost: n })} /></td>
                <td className="px-3 text-right tabular-nums">{money(it.quantity * it.unit_cost)}</td>
                <td className={cn("text-right tabular-nums", it.received >= it.quantity ? "text-sage-700" : "text-stone-500")}>{num(it.received)}</td>
                {receiving && <td className="px-2"><NumberInput className="h-8 text-right" value={recv[it.id] ?? Math.max(0, it.quantity - it.received)} onChange={(n) => setRecv({ ...recv, [it.id]: n })} /></td>}
                <td>{edit && <button className="p-1 text-stone-400 hover:text-clay-600" onClick={() => upd({ items: po.items.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>}</td>
              </tr>
            ))}
            {!po.items.length && <tr><td colSpan={8} className="py-6 text-center text-stone-400">No lines yet</td></tr>}
          </tbody>
        </table>
      </div>
      {receiving && Object.keys(recv).length === 0 && <p className="mt-2 text-xs text-stone-500">“Receive delivery” receives the remaining quantity on every line unless you change it.</p>}
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          {edit && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => upd({ items: [...po.items, { id: `i${Date.now()}`, inventory_item_id: null, name: "", quantity: 1, unit: "EA", unit_cost: 0, received: 0 }] })}>Add line</Button>}
          {receiving && po.project_id && <Checkbox checked={toJob} onChange={setToJob} label="Delivered direct to job site (allocate to project & post job cost)" />}
        </div>
        <div className="w-full space-y-1.5 rounded-xl bg-stone-50 p-3 text-sm md:w-72">
          <div className="flex items-center justify-between"><span className="text-stone-500">Shipping</span><NumberInput disabled={!edit} className="h-7 w-24 text-right" value={po.shipping} onChange={(n) => upd({ shipping: n })} /></div>
          <div className="flex items-center justify-between"><span className="text-stone-500">Tax</span><NumberInput disabled={!edit} className="h-7 w-24 text-right" value={po.tax} onChange={(n) => upd({ tax: n })} /></div>
          <div className="flex justify-between border-t border-stone-200 pt-1.5 font-semibold"><span>Total</span><span className="tabular-nums">{money(poTotal(po))}</span></div>
        </div>
      </div>
      <Field label="Notes" className="mt-3"><Textarea disabled={!can("inventory.edit")} value={po.notes} onChange={(e) => upd({ notes: e.target.value })} /></Field>
    </Modal>
  );
}

function SupplierModal({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const { can } = useAuth();
  const { toast, confirm } = useToast();
  const [f, setF] = useState<Omit<Supplier, "id" | "created_at">>(supplier ?? { name: "", contact_name: "", phone: "", email: "", address: "", categories: [], account_number: "", payment_terms: "Net 30", notes: "" });
  const edit = can("inventory.edit");
  return (
    <Modal open onClose={onClose} title={supplier ? supplier.name : "New supplier"} size="lg" footer={<>{supplier && edit && <Button variant="ghost" className="mr-auto text-clay-600" onClick={async () => { if (await confirm({ title: "Delete supplier?", danger: true, confirmLabel: "Delete" })) { db.remove("suppliers", supplier.id); onClose(); } }}>Delete</Button>}<Button onClick={onClose}>Cancel</Button>{edit && <Button variant="primary" onClick={() => { if (!f.name.trim()) return toast("Name required", "error"); if (supplier) db.update("suppliers", supplier.id, f); else db.insert("suppliers", f); toast("Supplier saved"); onClose(); }}>Save</Button>}</>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Contact"><Input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Account number"><Input value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value })} /></Field>
        <Field label="Payment terms"><Input value={f.payment_terms} onChange={(e) => setF({ ...f, payment_terms: e.target.value })} /></Field>
        <Field label="Categories" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">{CATS.map((c) => { const on = f.categories.includes(c); return <button key={c} type="button" onClick={() => setF({ ...f, categories: on ? f.categories.filter((x) => x !== c) : [...f.categories, c] })} className={cn("rounded-lg border px-2 py-1 text-xs", on ? "border-brass-400 bg-brass-50 text-brass-700" : "border-stone-200 text-stone-500")}>{c}</button>; })}</div>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
