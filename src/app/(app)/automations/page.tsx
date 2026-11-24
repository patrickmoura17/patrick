"use client";
import { useState } from "react";
import { ArrowRight, Bolt, Mail, MessageSquare, Plus, Trash2, Workflow } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { ACTIONS, TRIGGERS } from "@/lib/automation";
import { ago, fmtDateTime } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea, Toggle, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { Automation, AutomationAction, TriggerKey } from "@/lib/types";

export default function AutomationsPage() {
  return (
    <RequirePerm perm="automations.manage">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const S = useSnapshot();
  const [tab, setTab] = useState<"rules" | "log" | "integrations">("rules");
  const [edit, setEdit] = useState<Automation | "new" | null>(null);
  const runs = [...S.automation_runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div>
      <PageHeader title="Automations" subtitle="When something happens → do something. Runs on every module automatically." actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit("new")}>New automation</Button>} />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[{ key: "rules", label: "Rules", count: S.automations.length }, { key: "log", label: "Run history", count: runs.length }, { key: "integrations", label: "Email & SMS" }]} />
      {tab === "rules" && (
        <div className="grid gap-3 lg:grid-cols-2">
          {S.automations.map((a) => {
            const trig = TRIGGERS.find((t) => t.key === a.trigger);
            return (
              <Card key={a.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-brass-50 p-2 text-brass-600"><Bolt className="h-4 w-4" /></div>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(a)}>
                    <p className="font-semibold">{a.name}</p>
                    <p className="mt-0.5 text-xs text-stone-500">{a.description}</p>
                  </button>
                  <Toggle checked={a.active} onChange={(v) => db.update("automations", a.id, { active: v })} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge tone="blue">When: {trig?.label ?? a.trigger}</Badge>
                  {a.conditions.length > 0 && <Badge tone="amber">{a.conditions.length} condition{a.conditions.length > 1 ? "s" : ""}</Badge>}
                  <ArrowRight className="h-3 w-3 text-stone-400" />
                  {a.actions.map((x, i) => <Badge key={i} tone="brass">{ACTIONS.find((y) => y.type === x.type)?.label ?? x.type}</Badge>)}
                </div>
                <p className="mt-3 text-[11px] text-stone-400">Ran {a.run_count} time{a.run_count === 1 ? "" : "s"}{a.last_run_at ? ` · last ${ago(a.last_run_at)}` : ""}</p>
              </Card>
            );
          })}
          {!S.automations.length && <Card className="lg:col-span-2"><EmptyState icon={<Workflow className="h-6 w-6" />} title="No automations" /></Card>}
        </div>
      )}
      {tab === "log" && (
        <Card>
          {!runs.length ? <EmptyState title="No runs yet" body="Runs appear here as leads, estimates, payments and projects move through the system." /> : (
            <div className="divide-y divide-stone-100">
              {runs.slice(0, 200).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Badge tone={r.status === "success" ? "green" : r.status === "error" ? "red" : "neutral"}>{r.status}</Badge>
                  <span className="min-w-0 flex-1 truncate"><b className="font-medium">{S.automations.find((a) => a.id === r.automation_id)?.name ?? "Deleted automation"}</b> <span className="text-stone-500">· {r.detail}</span></span>
                  <span className="text-xs text-stone-400">{fmtDateTime(r.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      {tab === "integrations" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-slateblue-600" /><h3 className="font-semibold">Email delivery</h3><Badge>Ready to connect</Badge></div>
            <p className="mt-2 text-sm text-stone-600">“Send email” actions are queued through a single delivery hook (<code className="rounded bg-stone-100 px-1 text-xs">setDeliver()</code> in <code className="rounded bg-stone-100 px-1 text-xs">src/lib/automation.ts</code>). Connect Resend, Postmark or SendGrid through a Supabase Edge Function. Until then every message is logged on the customer&apos;s communication history.</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-purple-600" /><h3 className="font-semibold">SMS delivery</h3><Badge>Ready to connect</Badge></div>
            <p className="mt-2 text-sm text-stone-600">“Send SMS” actions use the same hook — plug in Twilio or Telnyx. Customer phone numbers are resolved from the CRM automatically.</p>
          </Card>
        </div>
      )}
      {edit && <Editor auto={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Editor({ auto, onClose }: { auto: Automation | null; onClose: () => void }) {
  const { toast, confirm } = useToast();
  const [f, setF] = useState<Omit<Automation, "id" | "created_at">>(auto ?? { name: "", description: "", trigger: "lead.created", conditions: [], actions: [{ type: "notify", params: { roles: "owner", title: "", body: "" } }], active: true, run_count: 0, last_run_at: null });
  const trig = TRIGGERS.find((t) => t.key === f.trigger)!;
  const setAction = (i: number, a: AutomationAction) => setF({ ...f, actions: f.actions.map((x, j) => (j === i ? a : x)) });
  return (
    <Modal open onClose={onClose} title={auto ? "Edit automation" : "New automation"} size="lg" footer={<>{auto && <Button variant="ghost" className="mr-auto text-clay-600" onClick={async () => { if (await confirm({ title: "Delete automation?", danger: true, confirmLabel: "Delete" })) { db.remove("automations", auto.id); onClose(); } }}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { if (!f.name.trim()) return toast("Name required", "error"); if (!f.actions.length) return toast("Add at least one action", "error"); if (auto) db.update("automations", auto.id, f); else db.insert("automations", f); toast("Automation saved"); onClose(); }}>Save</Button></>}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
        <div className="rounded-xl border border-slateblue-100 bg-slateblue-50/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slateblue-700">When</p>
          <Select value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value as TriggerKey })}>{TRIGGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
          <p className="mt-2 text-xs text-stone-500">Available variables: {trig.vars.map((v) => <code key={v} className="mr-1 rounded bg-white px-1">{`{{${v}}}`}</code>)}</p>
          <div className="mt-3 space-y-2">
            {f.conditions.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Select className="h-8 text-xs" value={c.field} onChange={(e) => setF({ ...f, conditions: f.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>{trig.vars.map((v) => <option key={v}>{v}</option>)}</Select>
                <Select className="h-8 w-32 text-xs" value={c.op} onChange={(e) => setF({ ...f, conditions: f.conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as typeof c.op } : x)) })}><option value="eq">equals</option><option value="neq">not equal</option><option value="contains">contains</option><option value="gt">greater than</option><option value="lt">less than</option></Select>
                <Input className="h-8 text-xs" value={c.value} onChange={(e) => setF({ ...f, conditions: f.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                <button className="p-1 text-stone-400 hover:text-clay-600" onClick={() => setF({ ...f, conditions: f.conditions.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button size="xs" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setF({ ...f, conditions: [...f.conditions, { field: trig.vars[0], op: "eq", value: "" }] })}>Add condition</Button>
          </div>
        </div>
        <div className="rounded-xl border border-brass-200 bg-brass-50/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brass-700">Then</p>
          <div className="space-y-3">
            {f.actions.map((a, i) => {
              const def = ACTIONS.find((x) => x.type === a.type)!;
              return (
                <div key={i} className="rounded-lg border border-stone-200 bg-white p-3">
                  <div className="flex gap-2">
                    <Select className="h-8 text-xs" value={a.type} onChange={(e) => setAction(i, { type: e.target.value as AutomationAction["type"], params: {} })}>{ACTIONS.map((x) => <option key={x.type} value={x.type}>{x.label}</option>)}</Select>
                    <button className="p-1 text-stone-400 hover:text-clay-600" onClick={() => setF({ ...f, actions: f.actions.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2 grid gap-2">
                    {def.params.map((p) => (
                      p.key === "body" ? <Textarea key={p.key} className="min-h-[56px] text-xs" placeholder={p.label} value={String(a.params[p.key] ?? "")} onChange={(e) => setAction(i, { ...a, params: { ...a.params, [p.key]: e.target.value } })} />
                        : <Input key={p.key} className="h-8 text-xs" placeholder={p.placeholder ?? p.label} value={String(a.params[p.key] ?? "")} onChange={(e) => setAction(i, { ...a, params: { ...a.params, [p.key]: e.target.value } })} />
                    ))}
                  </div>
                </div>
              );
            })}
            <Button size="xs" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setF({ ...f, actions: [...f.actions, { type: "notify", params: { roles: "owner", title: "", body: "" } }] })}>Add action</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
