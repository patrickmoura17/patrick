"use client";
import { Badge, type Tone } from "./ui";
import { titleCase } from "@/lib/format";
import type { EstimateStatus, InvoiceStatus, Priority, ProjectStage, ServiceCategory } from "@/lib/types";
import { Bath, ChefHat, Grid3x3, Layers, Wrench } from "lucide-react";

export const SERVICE_META: Record<ServiceCategory, { label: string; color: string; tone: Tone; icon: React.ReactNode }> = {
  tile: { label: "Tile", color: "#c98a14", tone: "brass", icon: <Grid3x3 className="h-3.5 w-3.5" /> },
  flooring: { label: "Flooring", color: "#2a78d6", tone: "blue", icon: <Layers className="h-3.5 w-3.5" /> },
  cabinets: { label: "Cabinets", color: "#1baf7a", tone: "green", icon: <ChefHat className="h-3.5 w-3.5" /> },
  countertops: { label: "Countertops", color: "#eb6834", tone: "purple", icon: <Bath className="h-3.5 w-3.5" /> },
  general: { label: "General", color: "#857d70", tone: "neutral", icon: <Wrench className="h-3.5 w-3.5" /> },
};
export const SERVICES: ServiceCategory[] = ["tile", "flooring", "cabinets", "countertops", "general"];

export function ServiceChips({ services, className }: { services: ServiceCategory[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
      {services.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: SERVICE_META[s]?.color }} />
          {SERVICE_META[s]?.label ?? s}
        </span>
      ))}
    </div>
  );
}

const EST: Record<EstimateStatus, Tone> = { draft: "neutral", sent: "blue", viewed: "purple", changes_requested: "amber", approved: "green", rejected: "red", expired: "neutral" };
export const EstimateBadge = ({ s }: { s: EstimateStatus }) => <Badge tone={EST[s]} dot>{titleCase(s)}</Badge>;

const INV: Record<InvoiceStatus, Tone> = { draft: "neutral", sent: "blue", partially_paid: "amber", paid: "green", overdue: "red", void: "neutral" };
export const InvoiceBadge = ({ s }: { s: InvoiceStatus }) => <Badge tone={INV[s]} dot>{titleCase(s)}</Badge>;

const PRI: Record<Priority, Tone> = { low: "neutral", medium: "blue", high: "amber", urgent: "red" };
export const PriorityBadge = ({ p }: { p: Priority }) => <Badge tone={PRI[p]}>{p}</Badge>;

export const STAGE_TONE: Record<ProjectStage, Tone> = {
  "Contract Signed": "neutral",
  "Deposit Received": "brass",
  "Materials Ordered": "amber",
  "Materials Delivered": "amber",
  "Ready to Schedule": "blue",
  Scheduled: "blue",
  "In Progress": "purple",
  "Quality Inspection": "purple",
  Completed: "green",
  "Final Payment": "green",
  Closed: "dark",
};
export const StageBadge = ({ s }: { s: ProjectStage }) => <Badge tone={STAGE_TONE[s]} dot>{s}</Badge>;

export const HEALTH: Record<string, { label: string; tone: Tone }> = {
  on_track: { label: "On track", tone: "green" },
  at_risk: { label: "At risk", tone: "amber" },
  delayed: { label: "Delayed", tone: "red" },
  on_hold: { label: "On hold", tone: "neutral" },
};

export const EVENT_META: Record<string, { label: string; color: string }> = {
  installation: { label: "Installation", color: "#b08a48" },
  site_visit: { label: "Site visit", color: "#4f7190" },
  estimate: { label: "Estimate appt.", color: "#4f8a5e" },
  delivery: { label: "Delivery", color: "#d08a16" },
  inspection: { label: "Inspection", color: "#8a5a9e" },
  reminder: { label: "Reminder", color: "#857d70" },
  meeting: { label: "Meeting", color: "#3b4450" },
  time_off: { label: "Time off", color: "#a8a093" },
};

/** Validated categorical order for charts (adjacent pairs pass CVD checks). */
export const CHART_SERVICE_ORDER: ServiceCategory[] = ["flooring", "countertops", "cabinets", "tile", "general"];
