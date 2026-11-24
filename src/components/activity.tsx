"use client";
// Communication history: timeline + quick logger (call / email / SMS / meeting / note).
import { useMemo, useState } from "react";
import { Mail, MessageSquare, Phone, StickyNote, Users, Ruler, Cog, Home } from "lucide-react";
import { db, useTable } from "@/lib/store";
import { logActivity } from "@/lib/services";
import { ago, fmtDateTime } from "@/lib/format";
import type { Activity, ActivityType, ID } from "@/lib/types";
import { Button, cn, Segmented, Textarea, Input } from "./ui";

const META: Record<ActivityType, { icon: React.ElementType; label: string; cls: string }> = {
  call: { icon: Phone, label: "Call", cls: "bg-sage-50 text-sage-600" },
  email: { icon: Mail, label: "Email", cls: "bg-slateblue-50 text-slateblue-600" },
  sms: { icon: MessageSquare, label: "SMS", cls: "bg-purple-50 text-purple-600" },
  meeting: { icon: Users, label: "Meeting", cls: "bg-brass-50 text-brass-600" },
  note: { icon: StickyNote, label: "Note", cls: "bg-amberx-50 text-amberx-600" },
  site_visit: { icon: Ruler, label: "Site visit", cls: "bg-brass-50 text-brass-700" },
  system: { icon: Cog, label: "System", cls: "bg-stone-100 text-stone-500" },
  portal: { icon: Home, label: "Portal", cls: "bg-sage-50 text-sage-700" },
};

export function ActivityTimeline({ filter, canLog = true, link }: { filter: (a: Activity) => boolean; canLog?: boolean; link: Partial<Pick<Activity, "customer_id" | "lead_id" | "project_id">> }) {
  const all = useTable("activities");
  const rows = useMemo(() => all.filter(filter).sort((a, b) => b.created_at.localeCompare(a.created_at)), [all, filter]);
  const [type, setType] = useState<ActivityType>("call");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [show, setShow] = useState<"all" | "comms">("all");
  const shown = show === "comms" ? rows.filter((r) => r.type !== "system") : rows;
  return (
    <div className="space-y-4">
      {canLog && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
          <Segmented
            value={type}
            onChange={setType}
            options={(["call", "email", "sms", "meeting", "site_visit", "note"] as ActivityType[]).map((t) => {
              const I = META[t].icon;
              return { key: t, label: <><I className="h-3.5 w-3.5" /><span className="hidden sm:inline">{META[t].label}</span></> };
            })}
          />
          <Input className="mt-2" placeholder={`${META[type].label} subject (e.g. "Discussed tile selections")`} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea className="mt-2 min-h-[64px]" placeholder="Details…" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="primary"
              disabled={!subject.trim() && !body.trim()}
              onClick={() => {
                logActivity({ type, subject: subject.trim() || META[type].label, body, ...link });
                setSubject("");
                setBody("");
              }}
            >
              Log {META[type].label.toLowerCase()}
            </Button>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Segmented value={show} onChange={setShow} options={[{ key: "all", label: "All activity" }, { key: "comms", label: "Communication only" }]} />
      </div>
      <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-stone-200">
        {!shown.length && <p className="py-6 text-center text-sm text-stone-400">No activity yet.</p>}
        {shown.map((a) => {
          const m = META[a.type] ?? META.note;
          const u = a.user_id ? db.get("profiles", a.user_id) : undefined;
          return (
            <li key={a.id} className="relative flex gap-3">
              <span className={cn("relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white", m.cls)}>
                <m.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-sm font-medium text-ink-900">{a.subject}</p>
                  <span className="text-xs text-stone-400" title={fmtDateTime(a.created_at)}>{ago(a.created_at)}</span>
                </div>
                <p className="text-xs text-stone-500">{u?.full_name ?? (a.type === "portal" ? "Customer (portal)" : "System")}</p>
                {a.body && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">{a.body}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function useActivityFilter(key: "customer_id" | "lead_id" | "project_id", id: ID) {
  return useMemo(() => (a: Activity) => a[key] === id, [key, id]);
}
