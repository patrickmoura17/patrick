// Business analytics derived from the live database snapshot (dashboard + reports).
import { estimateTotals, invoiceTotals, projectFinancials, round2, todayISO } from "./calc";
import type { Snapshot } from "./backends/types";
import type { ServiceCategory } from "./types";

export function monthKey(iso: string) {
  return iso.slice(0, 7);
}
export function lastMonths(n: number, ref = new Date()) {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
export const monthLabel = (k: string) => new Date(k + "-15T12:00:00").toLocaleString("en-US", { month: "short" });

export function inRange(iso: string | null | undefined, from: string, to: string) {
  return !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
}

/** Contract value per service category for a project (from its estimate lines when available). */
export function projectCategorySplit(S: Snapshot, projectId: string): Record<string, number> {
  const p = S.projects.find((x) => x.id === projectId);
  if (!p) return {};
  const est = p.estimate_id ? S.estimates.find((e) => e.id === p.estimate_id) : undefined;
  if (est) {
    const t = estimateTotals(est, S.estimate_items.filter((i) => i.estimate_id === est.id));
    const sum = Object.values(t.byCategory).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(t.byCategory)) out[k] = round2((v / sum) * p.contract_value);
      return out;
    }
  }
  const svcs = p.services.length ? p.services : (["general"] as ServiceCategory[]);
  return Object.fromEntries(svcs.map((s) => [s, round2(p.contract_value / svcs.length)]));
}

export function computeAnalytics(S: Snapshot, from: string, to: string) {
  const today = todayISO();
  const payInRange = S.payments.filter((p) => inRange(p.date, from, to));
  const collected = round2(payInRange.reduce((s, p) => s + p.amount, 0));
  const totalCollectedAllTime = round2(S.payments.reduce((s, p) => s + p.amount, 0));
  const thisMonth = monthKey(today);
  const revenueThisMonth = round2(S.payments.filter((p) => monthKey(p.date) === thisMonth).reduce((s, p) => s + p.amount, 0));
  const prevMonthKey = lastMonths(2)[0];
  const revenuePrevMonth = round2(S.payments.filter((p) => monthKey(p.date) === prevMonthKey).reduce((s, p) => s + p.amount, 0));

  const openInvoices = S.invoices.filter((i) => ["sent", "partially_paid", "overdue"].includes(i.status));
  const outstanding = round2(openInvoices.reduce((s, i) => s + invoiceTotals(i, S.payments.filter((p) => p.invoice_id === i.id)).balance, 0));
  const overdue = S.invoices.filter((i) => i.status === "overdue");
  const overdueAmount = round2(overdue.reduce((s, i) => s + invoiceTotals(i, S.payments.filter((p) => p.invoice_id === i.id)).balance, 0));

  const activeStages = ["Contract Signed", "Deposit Received", "Materials Ordered", "Materials Delivered", "Ready to Schedule", "Scheduled", "In Progress", "Quality Inspection"];
  const active = S.projects.filter((p) => ["In Progress", "Quality Inspection"].includes(p.stage));
  const upcoming = S.projects.filter((p) => activeStages.slice(0, 6).includes(p.stage));
  const openProjects = S.projects.filter((p) => activeStages.includes(p.stage));
  const totalProjectValue = round2(openProjects.reduce((s, p) => s + p.contract_value, 0));

  const leadsInRange = S.leads.filter((l) => inRange(l.created_at, from, to));
  const decided = S.leads.filter((l) => l.status !== "open" && inRange(l.created_at, from, to));
  const won = decided.filter((l) => l.status === "won");
  const conversion = decided.length ? round2((won.length / decided.length) * 100) : 0;

  const projectsInRange = S.projects.filter((p) => inRange(p.signed_at ?? p.created_at, from, to));
  const avgProject = projectsInRange.length ? round2(projectsInRange.reduce((s, p) => s + p.contract_value, 0) / projectsInRange.length) : 0;

  const fin = S.projects.map((p) => ({ p, f: projectFinancials(p, S.expenses, S.time_entries, S.invoices, S.payments) }));
  const finished = fin.filter(({ p }) => ["Completed", "Final Payment", "Closed", "Quality Inspection"].includes(p.stage) && inRange(p.completed_at ?? p.end_date ?? p.created_at, from, to));
  const estProfit = round2(finished.reduce((s, x) => s + x.f.estimatedProfit, 0));
  const actProfit = round2(finished.reduce((s, x) => s + x.f.actualProfit, 0));

  const estimatesPending = S.estimates.filter((e) => ["sent", "viewed", "changes_requested"].includes(e.status));
  const pendingValue = round2(estimatesPending.reduce((s, e) => s + estimateTotals(e, S.estimate_items.filter((i) => i.estimate_id === e.id)).total, 0));
  const estDecided = S.estimates.filter((e) => ["approved", "rejected"].includes(e.status) && inRange(e.issue_date, from, to));
  const approvalRate = estDecided.length ? round2((estDecided.filter((e) => e.status === "approved").length / estDecided.length) * 100) : 0;

  // monthly revenue (collected) and booked (contracts signed)
  const months = lastMonths(12);
  const monthly = months.map((m) => {
    const rev = S.payments.filter((p) => monthKey(p.date) === m).reduce((s, p) => s + p.amount, 0);
    const booked = S.projects.filter((p) => monthKey(p.signed_at ?? p.created_at) === m).reduce((s, p) => s + p.contract_value, 0);
    const costs = S.expenses.filter((e) => monthKey(e.date) === m).reduce((s, e) => s + e.amount, 0) + S.time_entries.filter((t) => monthKey(t.date) === m).reduce((s, t) => s + t.cost, 0);
    return { month: m, label: monthLabel(m), revenue: round2(rev), booked: round2(booked), costs: round2(costs) };
  });

  // revenue by category (booked contract value in range)
  const byCat: Record<string, number> = {};
  projectsInRange.forEach((p) => {
    for (const [k, v] of Object.entries(projectCategorySplit(S, p.id))) byCat[k] = round2((byCat[k] || 0) + v);
  });

  // funnel
  const stages = [...S.pipeline_stages].sort((a, b) => a.position - b.position);
  const openStages = stages.filter((s) => s.kind !== "lost");
  const funnel = openStages.map((st) => ({
    stage: st.name,
    color: st.color,
    // leads that reached at least this stage (current position >= stage)
    count: leadsInRange.filter((l) => {
      const cur = stages.find((s) => s.id === l.stage_id);
      if (!cur) return false;
      if (cur.kind === "lost") return false;
      return cur.position >= st.position;
    }).length,
  }));
  const pipelineValue = round2(S.leads.filter((l) => l.status === "open").reduce((s, l) => {
    const st = stages.find((x) => x.id === l.stage_id);
    return s + l.estimated_value * ((st?.probability ?? 0) / 100);
  }, 0));

  // sales by rep (won value)
  const reps = S.profiles.map((u) => {
    const ls = S.leads.filter((l) => l.assigned_to === u.id && inRange(l.created_at, from, to));
    const w = ls.filter((l) => l.status === "won");
    const wonValue = w.reduce((s, l) => {
      const proj = S.projects.find((p) => p.lead_id === l.id);
      return s + (proj?.contract_value ?? l.estimated_value);
    }, 0);
    return { id: u.id, name: u.full_name, leads: ls.length, won: w.length, wonValue: round2(wonValue), rate: ls.length ? round2((w.length / Math.max(1, ls.filter((l) => l.status !== "open").length)) * 100) : 0 };
  }).filter((r) => r.leads > 0);

  // sources
  const sources: Record<string, { leads: number; won: number; value: number }> = {};
  leadsInRange.forEach((l) => {
    const k = l.source || "Unknown";
    sources[k] ??= { leads: 0, won: 0, value: 0 };
    sources[k].leads++;
    if (l.status === "won") {
      sources[k].won++;
      sources[k].value += S.projects.find((p) => p.lead_id === l.id)?.contract_value ?? l.estimated_value;
    }
  });

  // cost percentages on projects finished in range
  const totalContract = finished.reduce((s, x) => s + x.f.contract, 0);
  const laborPct = totalContract ? round2((finished.reduce((s, x) => s + x.f.laborCost + x.f.subcontractorCost, 0) / totalContract) * 100) : 0;
  const materialPct = totalContract ? round2((finished.reduce((s, x) => s + x.f.materialCost, 0) / totalContract) * 100) : 0;

  return {
    collected, totalCollectedAllTime, revenueThisMonth, revenuePrevMonth, outstanding, overdue, overdueAmount, active, upcoming, openProjects, totalProjectValue,
    leadsInRange, conversion, avgProject, estProfit, actProfit, estimatesPending, pendingValue, approvalRate, monthly, byCat, funnel, pipelineValue,
    reps, sources, fin, finished, laborPct, materialPct, projectsInRange,
  };
}
