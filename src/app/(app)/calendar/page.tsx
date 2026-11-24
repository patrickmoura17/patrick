"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { db, useSnapshot } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { EventModal, findConflicts } from "@/components/modals";
import { EVENT_META } from "@/components/status";
import { Button, Card, PageHeader, Segmented, Select, cn, useToast } from "@/components/ui";
import { RequirePerm } from "@/components/gate";
import type { CalendarEvent } from "@/lib/types";

type View = "month" | "week" | "day" | "crews";

export default function CalendarPage() {
  return (
    <RequirePerm perm="calendar.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const S = useSnapshot();
  const { can, user, role } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(new Date());
  const [type, setType] = useState("");
  const [crew, setCrew] = useState("");
  const [mine, setMine] = useState(role?.key === "field_employee" || role?.key === "subcontractor");
  const [edit, setEdit] = useState<CalendarEvent | null>(null);
  const [preset, setPreset] = useState<Partial<CalendarEvent> | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const me = S.employees.find((e) => e.profile_id === user?.id);

  const events = useMemo(() => S.events.filter((e) => {
    if (type && e.type !== type) return false;
    if (crew && e.crew_id !== crew) return false;
    if (mine && me) {
      const crewMembers = S.crews.find((c) => c.id === e.crew_id)?.member_ids ?? [];
      if (!e.employee_ids.includes(me.id) && !crewMembers.includes(me.id)) return false;
    }
    return true;
  }), [S, type, crew, mine, me]);
  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    events.forEach((e) => { if (e.status !== "cancelled" && (e.crew_id || e.employee_ids.length) && findConflicts(e, S.events).length) ids.add(e.id); });
    return ids;
  }, [events, S.events]);

  const onDay = (d: Date) => events.filter((e) => isSameDay(new Date(e.start), d) || (new Date(e.start) < d && new Date(e.end) > addDays(d, 1))).sort((a, b) => a.start.localeCompare(b.start));
  const moveTo = (id: string, day: Date, crewId?: string | null) => {
    const ev = db.get("events", id);
    if (!ev || !can("calendar.edit")) return;
    const s = new Date(ev.start);
    const dur = new Date(ev.end).getTime() - s.getTime();
    const ns = new Date(day);
    ns.setHours(s.getHours(), s.getMinutes(), 0, 0);
    const patch: Partial<CalendarEvent> = { start: ns.toISOString(), end: new Date(ns.getTime() + dur).toISOString() };
    if (crewId !== undefined) patch.crew_id = crewId;
    const conflicts = findConflicts({ ...ev, ...patch }, S.events);
    db.update("events", id, patch);
    toast(conflicts.length ? `Rescheduled — ⚠ conflicts with ${conflicts[0].title}` : "Rescheduled", conflicts.length ? "error" : "success");
  };
  const nav = (dir: number) => setCursor((c) => (view === "month" ? addMonths(c, dir) : addDays(c, dir * (view === "day" ? 1 : 7))));
  const title = view === "month" ? format(cursor, "MMMM yyyy") : view === "day" ? format(cursor, "EEEE, MMMM d") : `${format(startOfWeek(cursor, { weekStartsOn: 1 }), "MMM d")} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), "MMM d, yyyy")}`;
  const newAt = (d: Date, hour = 9, crewId?: string) => {
    if (!can("calendar.edit")) return;
    const s = new Date(d);
    s.setHours(hour, 0, 0, 0);
    setPreset({ start: s.toISOString(), end: new Date(s.getTime() + 3600000 * (hour < 9 ? 8 : 1)).toISOString(), crew_id: crewId ?? null, type: crewId ? "installation" : "site_visit" });
  };

  const Chip = ({ e, compact }: { e: CalendarEvent; compact?: boolean }) => {
    const cr = S.crews.find((c) => c.id === e.crew_id);
    return (
      <button
        draggable={can("calendar.edit")}
        onDragStart={(ev) => { ev.stopPropagation(); setDrag(e.id); }}
        onClick={(ev) => { ev.stopPropagation(); setEdit(e); }}
        className={cn("group flex w-full items-start gap-1.5 overflow-hidden rounded-md border-l-[3px] bg-white px-1.5 py-1 text-left shadow-sm ring-1 ring-stone-200 transition hover:ring-stone-300", e.status === "cancelled" && "opacity-40 line-through", conflictIds.has(e.id) && "ring-2 ring-clay-500")}
        style={{ borderLeftColor: EVENT_META[e.type]?.color }}
        title={`${e.title}${conflictIds.has(e.id) ? " — scheduling conflict" : ""}`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-semibold leading-tight text-ink-900">{conflictIds.has(e.id) && <AlertTriangle className="mr-0.5 inline h-3 w-3 text-clay-600" />}{e.title}</p>
          {!compact && <p className="truncate text-[10.5px] text-stone-500">{e.all_day ? "All day" : format(new Date(e.start), "h:mma").toLowerCase()}{cr ? ` · ${cr.name}` : ""}</p>}
        </div>
        {cr && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cr.color }} />}
      </button>
    );
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor, { weekStartsOn: 1 }), i));
  const today = new Date();

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Installations, site visits, estimates, deliveries and crew assignments"
        actions={can("calendar.edit") && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setPreset({})}>New event</Button>}
      />
      <Card className="mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2">
          <Button size="icon" onClick={() => nav(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <Button size="icon" onClick={() => nav(1)}><ChevronRight className="h-4 w-4" /></Button>
          <h2 className="ml-2 text-base font-semibold">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40">
            <option value="">All types</option>
            {Object.entries(EVENT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select value={crew} onChange={(e) => setCrew(e.target.value)} className="w-40">
            <option value="">All crews</option>
            {S.crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {me && <Button size="sm" variant={mine ? "brass" : "secondary"} onClick={() => setMine((v) => !v)}>My schedule</Button>}
          <Segmented value={view} onChange={setView} options={[{ key: "day", label: "Day" }, { key: "week", label: "Week" }, { key: "month", label: "Month" }, { key: "crews", label: "Crews" }]} />
        </div>
      </Card>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
        {Object.entries(EVENT_META).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded-sm" style={{ background: v.color }} />{v.label}</span>)}
        {conflictIds.size > 0 && <span className="flex items-center gap-1 font-medium text-clay-600"><AlertTriangle className="h-3.5 w-3.5" />{conflictIds.size} double-booked</span>}
      </div>

      {view === "month" && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {(() => {
              const days: Date[] = [];
              for (let d = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }); d <= endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }); d = addDays(d, 1)) days.push(d);
              return days.map((d) => {
                const list = onDay(d);
                return (
                  <div key={d.toISOString()} onDoubleClick={() => newAt(d)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) moveTo(drag, d); setDrag(null); }} className={cn("min-h-[118px] border-b border-r border-stone-100 p-1.5", !isSameMonth(d, cursor) && "bg-stone-50/70")}>
                    <button onClick={() => { setCursor(d); setView("day"); }} className={cn("mb-1 grid h-6 w-6 place-items-center rounded-full text-xs font-semibold", isSameDay(d, today) ? "bg-brass-500 text-white" : isSameMonth(d, cursor) ? "text-ink-800 hover:bg-stone-100" : "text-stone-400")}>{format(d, "d")}</button>
                    <div className="space-y-1">
                      {list.slice(0, 3).map((e) => <Chip key={e.id} e={e} compact />)}
                      {list.length > 3 && <button onClick={() => { setCursor(d); setView("day"); }} className="px-1 text-[11px] font-medium text-stone-500 hover:text-ink-900">+{list.length - 3} more</button>}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </Card>
      )}

      {(view === "week" || view === "day") && (
        <Card className="overflow-x-auto">
          <div className={cn("grid", view === "week" ? "min-w-[900px] grid-cols-7" : "grid-cols-1")}>
            {(view === "week" ? weekDays : [startOfDay(cursor)]).map((d) => {
              const list = onDay(d);
              return (
                <div key={d.toISOString()} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) moveTo(drag, d); setDrag(null); }} className="min-h-[520px] border-r border-stone-100 last:border-0">
                  <div className={cn("sticky top-0 border-b border-stone-100 px-3 py-2.5", isSameDay(d, today) && "bg-brass-50")}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">{format(d, "EEE")}</p>
                    <p className={cn("text-xl font-semibold tabular-nums", isSameDay(d, today) && "text-brass-700")}>{format(d, "d")}</p>
                  </div>
                  <div className="space-y-1.5 p-2" onDoubleClick={() => newAt(d)}>
                    {list.map((e) => (
                      view === "day" ? (
                        <div key={e.id} className="flex gap-3">
                          <span className="w-20 shrink-0 pt-1 text-right text-xs tabular-nums text-stone-500">{e.all_day ? "All day" : `${format(new Date(e.start), "h:mm a")}`}</span>
                          <div className="flex-1"><Chip e={e} /></div>
                        </div>
                      ) : <Chip key={e.id} e={e} />
                    ))}
                    {!list.length && <p className="py-6 text-center text-[11px] text-stone-300">Double-click to add</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {view === "crews" && (
        <Card className="overflow-x-auto">
          <div className="min-w-[1000px]">
            <div className="grid grid-cols-[200px_repeat(7,1fr)] border-b border-stone-200 bg-stone-50">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Crew / employee</div>
              {weekDays.map((d) => <div key={d.toISOString()} className={cn("px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500", isSameDay(d, today) && "text-brass-700")}>{format(d, "EEE d")}</div>)}
            </div>
            {[...S.crews.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, color: c.color, crew: true, members: c.member_ids })), ...S.employees.filter((e) => e.active && !S.crews.some((c) => c.member_ids.includes(e.id))).map((e) => ({ id: e.id, name: e.name, color: "#a8a093", crew: false, members: [e.id] }))].map((row) => (
              <div key={row.id} className="grid grid-cols-[200px_repeat(7,1fr)] border-b border-stone-100">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{row.name}</p>{row.crew && <p className="truncate text-[11px] text-stone-500">{row.members.map((m) => S.employees.find((e) => e.id === m)?.name.split(" ")[0]).join(", ")}</p>}</div>
                </div>
                {weekDays.map((d) => {
                  const list = onDay(d).filter((e) => (row.crew ? e.crew_id === row.id : e.employee_ids.includes(row.id)));
                  const off = row.members.some((m) => !S.employees.find((e) => e.id === m)?.availability.includes(d.getDay()));
                  return (
                    <div key={d.toISOString()} onDoubleClick={() => newAt(d, 7, row.crew ? row.id : undefined)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) moveTo(drag, d, row.crew ? row.id : undefined); setDrag(null); }} className={cn("min-h-[64px] space-y-1 border-l border-stone-100 p-1", off && "bg-stone-50", isSameDay(d, today) && "bg-brass-50/50")}>
                      {list.map((e) => <Chip key={e.id} e={e} compact />)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      )}

      <EventModal open={!!edit || !!preset} onClose={() => { setEdit(null); setPreset(null); }} event={edit} preset={preset ?? undefined} />
    </div>
  );
}
