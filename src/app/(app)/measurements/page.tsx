"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Copy, Plus, Ruler, Trash2 } from "lucide-react";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { custName } from "@/lib/services";
import { measurementCalc, todayISO } from "@/lib/calc";
import { num } from "@/lib/format";
import { SketchPad } from "@/components/sketch";
import { FileGallery, FileUploader } from "@/components/files";
import { Button, Card, CardHeader, EmptyState, Field, Input, NumberInput, PageHeader, Select, Textarea, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { Measurement } from "@/lib/types";

const AREA_TYPES: { key: Measurement["area_type"]; label: string; hint: string }[] = [
  { key: "floor", label: "Floor", hint: "L × W" },
  { key: "shower", label: "Shower", hint: "3 walls × height + pan" },
  { key: "backsplash", label: "Backsplash", hint: "run × height" },
  { key: "countertop", label: "Countertop", hint: "L × depth" },
  { key: "cabinet_run", label: "Cabinet run", hint: "linear ft" },
  { key: "wall", label: "Wall", hint: "L × height" },
  { key: "stairs", label: "Stairs", hint: "units = treads" },
  { key: "other", label: "Other", hint: "" },
];

export default function MeasurementsPage() {
  return (
    <RequirePerm perm="measurements.view">
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
  const [job, setJob] = useState(() => (params.get("project") ? `p:${params.get("project")}` : params.get("lead") ? `l:${params.get("lead")}` : ""));
  const [sel, setSel] = useState<string | null>(params.get("m"));
  const edit = can("measurements.edit");

  const jobs = useMemo(() => [
    ...S.projects.filter((p) => p.stage !== "Closed").map((p) => ({ key: `p:${p.id}`, label: `${p.number} · ${p.name}`, group: "Projects", customer_id: p.customer_id })),
    ...S.leads.filter((l) => l.status === "open").map((l) => ({ key: `l:${l.id}`, label: `${l.title} — ${custName(S.customers.find((c) => c.id === l.customer_id))}`, group: "Leads", customer_id: l.customer_id })),
  ], [S]);
  const current = jobs.find((j) => j.key === job);
  const [kind, jid] = job.split(":");
  const list = S.measurements.filter((m) => (kind === "p" ? m.project_id === jid : kind === "l" ? m.lead_id === jid : false)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const m = S.measurements.find((x) => x.id === sel);
  useEffect(() => {
    if (!sel && list.length) setSel(list[0].id);
  }, [list, sel]);

  const add = () => {
    if (!current) return;
    const n = db.insert("measurements", {
      project_id: kind === "p" ? jid : null, lead_id: kind === "l" ? jid : S.projects.find((p) => p.id === jid)?.lead_id ?? null, customer_id: current.customer_id,
      room: `Area ${list.length + 1}`, area_type: "floor", length: 0, width: 0, height: 0, sqft: 0, lf: 0, units: 0, waste_percent: 10,
      material_spec: "", install_requirements: "", existing_conditions: "", demolition: "", notes: "", shape: [], file_ids: [], measured_by: db.currentUserId, measured_on: todayISO(),
    });
    setSel(n.id);
  };
  const upd = (patch: Partial<Measurement>) => {
    if (!m || !edit) return;
    const next = { ...m, ...patch };
    const c = measurementCalc(next);
    db.update("measurements", m.id, { ...patch, sqft: c.sqft, lf: c.lf });
  };
  const totals = list.reduce((s, x) => ({ sqft: s.sqft + x.sqft, lf: s.lf + x.lf, withWaste: s.withWaste + x.sqft * (1 + x.waste_percent / 100) }), { sqft: 0, lf: 0, withWaste: 0 });

  return (
    <div>
      <PageHeader
        title="Measurements & Site Visits"
        subtitle="Room dimensions, sketches, existing conditions and photos — feeds straight into estimates"
        actions={
          <div className="w-full md:w-96">
            <Select value={job} onChange={(e) => { setJob(e.target.value); setSel(null); router.replace(`/measurements?${e.target.value.startsWith("p") ? "project" : "lead"}=${e.target.value.slice(2)}`); }}>
              <option value="">Select a project or lead…</option>
              <optgroup label="Projects">{jobs.filter((j) => j.group === "Projects").map((j) => <option key={j.key} value={j.key}>{j.label}</option>)}</optgroup>
              <optgroup label="Open leads">{jobs.filter((j) => j.group === "Leads").map((j) => <option key={j.key} value={j.key}>{j.label}</option>)}</optgroup>
            </Select>
          </div>
        }
      />
      {!current ? (
        <Card>
          <EmptyState icon={<Ruler className="h-6 w-6" />} title="Choose a job to measure" body="Pick a project or an open lead above. Measurements recorded on a lead carry into the project when the estimate is approved." />
          <div className="border-t border-stone-100 p-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Recently measured</p>
            <div className="grid gap-2 md:grid-cols-3">
              {[...new Set(S.measurements.map((x) => (x.project_id ? `p:${x.project_id}` : `l:${x.lead_id}`)))].slice(0, 9).map((k) => {
                const j = jobs.find((x) => x.key === k);
                if (!j) return null;
                return <button key={k} onClick={() => setJob(k)} className="rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:border-brass-300 hover:bg-brass-50">{j.label}</button>;
              })}
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
          <Card className="h-fit">
            <CardHeader title="Areas" subtitle={`${list.length} areas · ${num(totals.sqft, 1)} sqft · ${num(totals.lf, 1)} lf`} actions={edit && <Button size="xs" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={add}>Add</Button>} />
            <div className="divide-y divide-stone-100">
              {list.map((x) => (
                <button key={x.id} onClick={() => setSel(x.id)} className={cn("flex w-full items-center justify-between px-4 py-2.5 text-left", sel === x.id ? "bg-brass-50" : "hover:bg-stone-50")}>
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{x.room}</p><p className="text-xs capitalize text-stone-500">{x.area_type.replace("_", " ")}</p></div>
                  <span className="text-right text-xs tabular-nums text-stone-600">{num(x.sqft, 1)} sf<br />{num(x.lf, 1)} lf</span>
                </button>
              ))}
              {!list.length && <EmptyState title="No areas yet" action={edit && <Button size="sm" onClick={add}>Add first area</Button>} />}
            </div>
            {list.length > 0 && (
              <div className="border-t border-stone-100 bg-stone-50/60 px-4 py-3 text-xs text-stone-600">
                <p className="flex justify-between"><span>Total area</span><b className="tabular-nums">{num(totals.sqft, 1)} sqft</b></p>
                <p className="flex justify-between"><span>With waste</span><b className="tabular-nums">{num(totals.withWaste, 1)} sqft</b></p>
                <p className="flex justify-between"><span>Linear footage</span><b className="tabular-nums">{num(totals.lf, 1)} lf</b></p>
                <Link href={kind === "p" ? `/projects/${jid}` : `/leads/${jid}`} className="mt-2 block font-medium text-brass-600">Back to {kind === "p" ? "project" : "lead"} →</Link>
              </div>
            )}
          </Card>

          {m ? (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Room / area" className="md:col-span-2"><Input disabled={!edit} value={m.room} onChange={(e) => upd({ room: e.target.value })} /></Field>
                  <Field label="Area type">
                    <Select disabled={!edit} value={m.area_type} onChange={(e) => upd({ area_type: e.target.value as Measurement["area_type"] })}>
                      {AREA_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Measured on"><Input type="date" disabled={!edit} value={m.measured_on ?? ""} onChange={(e) => upd({ measured_on: e.target.value })} /></Field>
                  <Field label="Length (ft)"><NumberInput disabled={!edit} value={m.length} onChange={(n) => upd({ length: n })} /></Field>
                  <Field label={m.area_type === "countertop" ? "Depth (ft)" : "Width (ft)"}><NumberInput disabled={!edit} value={m.width} onChange={(n) => upd({ width: n })} /></Field>
                  <Field label="Height (ft)"><NumberInput disabled={!edit} value={m.height} onChange={(n) => upd({ height: n })} /></Field>
                  <Field label={m.area_type === "stairs" ? "Treads" : "Units (sinks, boxes…)"}><NumberInput disabled={!edit} value={m.units} onChange={(n) => upd({ units: Math.round(n) })} /></Field>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-ink-900 p-4 text-white md:grid-cols-4">
                  <div><p className="text-[10px] uppercase tracking-wider text-stone-400">Square footage</p><p className="text-xl font-semibold tabular-nums">{num(m.sqft, 2)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-stone-400">Linear footage</p><p className="text-xl font-semibold tabular-nums">{num(m.lf, 2)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-stone-400">Waste %</p><input disabled={!edit} type="number" className="w-20 bg-transparent text-xl font-semibold tabular-nums outline-none" value={m.waste_percent} onChange={(e) => upd({ waste_percent: Number(e.target.value) || 0 })} /></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-stone-400">Order quantity</p><p className="text-xl font-semibold tabular-nums text-brass-300">{num(measurementCalc(m).withWaste, 1)} sf</p></div>
                </div>
                <p className="mt-2 text-xs text-stone-400">{m.shape.length >= 3 ? "Calculated from the sketch below." : `Calculated from dimensions (${AREA_TYPES.find((t) => t.key === m.area_type)?.hint}). Draw a sketch for irregular shapes.`}</p>
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 text-[15px] font-semibold">Sketch</h3>
                <SketchPad key={m.id} points={m.shape} onChange={(shape) => upd({ shape })} disabled={!edit} length={m.length} width={m.width} />
              </Card>
              <Card className="grid gap-4 p-5 md:grid-cols-2">
                <Field label="Material specifications"><Textarea disabled={!edit} value={m.material_spec} onChange={(e) => upd({ material_spec: e.target.value })} placeholder="Tile size, color, grout, slab, edge profile…" /></Field>
                <Field label="Installation requirements"><Textarea disabled={!edit} value={m.install_requirements} onChange={(e) => upd({ install_requirements: e.target.value })} placeholder="Layout pattern, niches, drain location, transitions…" /></Field>
                <Field label="Existing conditions"><Textarea disabled={!edit} value={m.existing_conditions} onChange={(e) => upd({ existing_conditions: e.target.value })} placeholder="Subfloor, moisture, level, existing finishes…" /></Field>
                <Field label="Demolition requirements"><Textarea disabled={!edit} value={m.demolition} onChange={(e) => upd({ demolition: e.target.value })} placeholder="What comes out, disposal, protection…" /></Field>
                <Field label="Notes" className="md:col-span-2"><Textarea disabled={!edit} value={m.notes} onChange={(e) => upd({ notes: e.target.value })} /></Field>
              </Card>
              <Card className="space-y-4 p-5">
                <h3 className="text-[15px] font-semibold">Photos</h3>
                {can("documents.edit") && <FileUploader compact categories={false} meta={{ customer_id: m.customer_id, project_id: m.project_id, measurement_id: m.id, category: "photo", photo_phase: "before" }} />}
                <FileGallery files={S.files.filter((f) => f.measurement_id === m.id)} canEdit={can("documents.edit")} emptyText="No site photos for this area." />
              </Card>
              {edit && (
                <div className="flex justify-end gap-2">
                  <Button icon={<Copy className="h-4 w-4" />} onClick={() => { const { id: _i, created_at: _c, updated_at: _u, ...rest } = m; const n = db.insert("measurements", { ...rest, room: `${m.room} (copy)`, file_ids: [] }); setSel(n.id); }}>Duplicate</Button>
                  <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: `Delete ${m.room}?`, danger: true, confirmLabel: "Delete" })) { db.remove("measurements", m.id); setSel(null); } }}>Delete area</Button>
                </div>
              )}
            </div>
          ) : (
            <Card><EmptyState title="Select or add an area" /></Card>
          )}
        </div>
      )}
    </div>
  );
}
