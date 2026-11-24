"use client";
import { useMemo, useState } from "react";
import { Download, FileDown } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useSettings, useSnapshot } from "@/lib/store";
import { computeAnalytics, inRange, lastMonths, monthKey, monthLabel, projectCategorySplit } from "@/lib/analytics";
import { addDaysISO, invoiceTotals, lineCost, lineTotal, round2, todayISO } from "@/lib/calc";
import { custName } from "@/lib/services";
import { download, fmtDate, money, money0, pct, toCSV } from "@/lib/format";
import { CHART_SERVICE_ORDER, SERVICE_META } from "@/components/status";
import { DonutChart, FunnelBars, HBarChart, LegendList, ProfitBars, RevenueCostChart, SimpleBars } from "@/components/charts";
import { Button, Card, CardHeader, Input, PageHeader, Segmented, Stat } from "@/components/ui";
import { RequirePerm } from "@/components/gate";

type Range = "30" | "90" | "ytd" | "365" | "custom";

export default function ReportsPage() {
  return (
    <RequirePerm perm="reports.view">
      <Inner />
    </RequirePerm>
  );
}

interface Report {
  key: string;
  title: string;
  subtitle: string;
  rows: Record<string, string | number>[];
  chart?: React.ReactNode;
  wide?: boolean;
}

function Inner() {
  const S = useSnapshot();
  const co = useSettings();
  const today = todayISO();
  const [range, setRange] = useState<Range>("365");
  const [custom, setCustom] = useState({ from: addDaysISO(today, -180), to: today });
  const from = range === "custom" ? custom.from : range === "ytd" ? `${today.slice(0, 4)}-01-01` : addDaysISO(today, -Number(range));
  const to = range === "custom" ? custom.to : today;
  const A = useMemo(() => computeAnalytics(S, from, to), [S, from, to]);

  const reports: Report[] = useMemo(() => {
    const pays = S.payments.filter((p) => inRange(p.date, from, to));
    const months = lastMonths(12, new Date(to + "T12:00:00")).filter((m) => m >= monthKey(from));
    const monthly = months.map((m) => ({
      label: monthLabel(m),
      month: m,
      revenue: round2(pays.filter((p) => monthKey(p.date) === m).reduce((s, p) => s + p.amount, 0)),
      booked: round2(A.projectsInRange.filter((p) => monthKey(p.signed_at ?? p.created_at) === m).reduce((s, p) => s + p.contract_value, 0)),
      costs: round2(S.expenses.filter((e) => monthKey(e.date) === m && inRange(e.date, from, to)).reduce((s, e) => s + e.amount, 0) + S.time_entries.filter((t) => monthKey(t.date) === m && inRange(t.date, from, to)).reduce((s, t) => s + t.cost, 0)),
    }));
    const byCustomer = Object.entries(pays.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.customer_id]: (acc[p.customer_id] ?? 0) + p.amount }), {}))
      .map(([id, v]) => ({ name: custName(S.customers.find((c) => c.id === id)), value: round2(v), projects: S.projects.filter((p) => p.customer_id === id).length }))
      .sort((a, b) => b.value - a.value);
    const catRows = CHART_SERVICE_ORDER.filter((c) => A.byCat[c]).map((c) => ({ name: SERVICE_META[c].label, value: A.byCat[c], color: SERVICE_META[c].color }));

    // best performing services: estimated margin per category from approved estimates in range
    const svc: Record<string, { revenue: number; cost: number; jobs: Set<string> }> = {};
    A.projectsInRange.forEach((p) => {
      const items = p.estimate_id ? S.estimate_items.filter((i) => i.estimate_id === p.estimate_id && !i.optional) : [];
      if (items.length) items.forEach((i) => { svc[i.category] ??= { revenue: 0, cost: 0, jobs: new Set() }; svc[i.category].revenue += lineTotal(i); svc[i.category].cost += lineCost(i); svc[i.category].jobs.add(p.id); });
      else Object.entries(projectCategorySplit(S, p.id)).forEach(([k, v]) => { svc[k] ??= { revenue: 0, cost: 0, jobs: new Set() }; svc[k].revenue += v; svc[k].cost += v * (p.estimated_cost / Math.max(1, p.contract_value)); svc[k].jobs.add(p.id); });
    });
    const svcRows = CHART_SERVICE_ORDER.filter((k) => svc[k]).map((k) => ({ service: SERVICE_META[k].label, projects: svc[k].jobs.size, revenue: round2(svc[k].revenue), gross_profit: round2(svc[k].revenue - svc[k].cost), margin_pct: svc[k].revenue ? round2(((svc[k].revenue - svc[k].cost) / svc[k].revenue) * 100) : 0 })).sort((a, b) => b.margin_pct - a.margin_pct);

    const overdue = S.invoices.filter((i) => i.status === "overdue").map((i) => {
      const t = invoiceTotals(i, S.payments.filter((p) => p.invoice_id === i.id));
      return { invoice: i.number, customer: custName(S.customers.find((c) => c.id === i.customer_id)), due: i.due_date, days_overdue: Math.round((new Date(today).getTime() - new Date(i.due_date).getTime()) / 86400000), balance: t.balance };
    });
    const estInRange = S.estimates.filter((e) => inRange(e.issue_date, from, to));
    const estStatus = ["draft", "sent", "viewed", "changes_requested", "approved", "rejected"].map((s) => ({ status: s.replace("_", " "), count: estInRange.filter((e) => e.status === s).length }));
    const profit = A.finished.map(({ p, f }) => ({ project: `${p.number} ${p.name}`, contract: f.contract, est_cost: f.estimatedCost, actual_cost: f.actualCost, est_profit: f.estimatedProfit, actual_profit: f.actualProfit, est_margin: f.estimatedMargin, actual_margin: f.actualMargin, labor_pct: f.contract ? round2(((f.laborCost + f.subcontractorCost) / f.contract) * 100) : 0, material_pct: f.contract ? round2((f.materialCost / f.contract) * 100) : 0 }));
    const sourceRows = Object.entries(A.sources).map(([k, v]) => ({ source: k, leads: v.leads, won: v.won, conversion_pct: v.leads ? round2((v.won / v.leads) * 100) : 0, won_value: round2(v.value) })).sort((a, b) => b.won_value - a.won_value || b.leads - a.leads);
    const sizeBuckets = [["< $10k", 0, 10000], ["$10–25k", 10000, 25000], ["$25–50k", 25000, 50000], ["$50k+", 50000, Infinity]] as const;

    return [
      { key: "monthly", title: "Revenue by month", subtitle: "Collected, booked and job costs", wide: true, rows: monthly.map((m) => ({ month: m.month, collected: m.revenue, booked: m.booked, job_costs: m.costs })), chart: <RevenueCostChart data={monthly} height={260} /> },
      { key: "category", title: "Revenue by service category", subtitle: "Booked contract value", rows: catRows.map((c) => ({ category: c.name, booked: c.value })), chart: catRows.length ? <div className="grid items-center gap-4 sm:grid-cols-2"><DonutChart data={catRows} height={190} /><LegendList data={catRows} /></div> : null },
      { key: "services", title: "Best-performing services", subtitle: "Estimated gross margin by service on booked work", rows: svcRows, chart: <HBarChart data={svcRows.map((r) => ({ name: r.service, value: r.margin_pct, color: SERVICE_META[CHART_SERVICE_ORDER.find((k) => SERVICE_META[k].label === r.service)!].color }))} fmt={(n) => `${n.toFixed(1)}%`} height={Math.max(150, svcRows.length * 42)} /> },
      { key: "customers", title: "Revenue by customer", subtitle: "Top customers by payments", rows: byCustomer.map((c) => ({ customer: c.name, collected: c.value, projects: c.projects })), chart: <HBarChart data={byCustomer.slice(0, 8)} height={280} /> },
      { key: "sales", title: "Revenue by salesperson", subtitle: "Won value and conversion by assigned rep", rows: A.reps.map((r) => ({ rep: r.name, leads: r.leads, won: r.won, win_rate_pct: r.rate, won_value: r.wonValue })), chart: <HBarChart data={A.reps.map((r) => ({ name: r.name, value: r.wonValue }))} height={Math.max(120, A.reps.length * 44)} /> },
      { key: "size", title: "Average project size", subtitle: `${A.projectsInRange.length} projects · avg ${money0(A.avgProject)}`, rows: sizeBuckets.map(([l, lo, hi]) => ({ size: l, projects: A.projectsInRange.filter((p) => p.contract_value >= lo && p.contract_value < hi).length })), chart: <SimpleBars data={sizeBuckets.map(([l, lo, hi]) => ({ label: l, value: A.projectsInRange.filter((p) => p.contract_value >= lo && p.contract_value < hi).length }))} name="Projects" fmt={(n) => String(n)} height={200} /> },
      { key: "funnel", title: "Lead conversion rate", subtitle: `${pct(A.conversion)} win rate on decided leads`, rows: A.funnel.map((f) => ({ stage: f.stage, leads: f.count })), chart: <FunnelBars data={A.funnel} /> },
      { key: "estimates", title: "Estimate approval rate", subtitle: `${pct(A.approvalRate)} approved of decided estimates`, rows: estStatus, chart: <SimpleBars data={estStatus.map((e) => ({ label: e.status, value: e.count }))} name="Estimates" fmt={(n) => String(n)} height={200} /> },
      { key: "profit", title: "Project profitability", subtitle: "Estimated vs. actual on completed projects", wide: true, rows: profit, chart: <ProfitBars data={A.finished.slice(-12).map(({ p, f }) => ({ name: p.name.split(" ")[0], estimated: f.estimatedProfit, actual: f.actualProfit }))} height={260} /> },
      { key: "sources", title: "Customer acquisition sources", subtitle: "Lead volume, conversion and value by source", rows: sourceRows, chart: <HBarChart data={sourceRows.map((r) => ({ name: r.source, value: r.leads }))} fmt={(n) => String(n)} height={Math.max(160, sourceRows.length * 34)} /> },
      { key: "overdue", title: "Overdue invoices", subtitle: `${overdue.length} invoices · ${money0(overdue.reduce((s, o) => s + o.balance, 0))}`, rows: overdue },
    ];
  }, [S, A, from, to, today]);

  const exportCSV = (r: Report) => download(`${r.key}-${from}-to-${to}.csv`, toCSV(r.rows));
  const exportPDF = (only?: Report) => {
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`${co?.name ?? ""} — Business Report`, 14, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`${fmtDate(from)} – ${fmtDate(to)} · generated ${fmtDate(today)}`, 14, 24);
    doc.setTextColor(20);
    autoTable(doc, { startY: 30, theme: "plain", styles: { fontSize: 9 }, body: [["Collected", money(A.collected), "Lead conversion", pct(A.conversion)], ["Average project", money(A.avgProject), "Estimate approval", pct(A.approvalRate)], ["Labor cost %", pct(A.laborPct), "Material cost %", pct(A.materialPct)], ["Est. profit (completed)", money(A.estProfit), "Actual profit (completed)", money(A.actProfit)]] });
    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    for (const r of only ? [only] : reports) {
      if (!r.rows.length) continue;
      if (y > 230) { doc.addPage(); y = 18; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(r.title, 14, y);
      const cols = Object.keys(r.rows[0]);
      autoTable(doc, {
        startY: y + 3, theme: "striped", headStyles: { fillColor: [22, 26, 32] }, styles: { fontSize: 8 },
        head: [cols.map((c) => c.replace(/_/g, " "))],
        body: r.rows.map((row) => cols.map((c) => (typeof row[c] === "number" && /revenue|collected|booked|cost|profit|value|contract|balance/.test(c) ? money(row[c] as number) : String(row[c])))),
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
    doc.save(`report-${only?.key ?? "full"}-${from}-to-${to}.pdf`);
  };

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle={`${fmtDate(from)} – ${fmtDate(to)}`}
        actions={
          <>
            <Segmented value={range} onChange={setRange} options={[{ key: "30", label: "30d" }, { key: "90", label: "90d" }, { key: "ytd", label: "YTD" }, { key: "365", label: "12 mo" }, { key: "custom", label: "Custom" }]} />
            {range === "custom" && <><Input type="date" className="w-40" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /><Input type="date" className="w-40" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></>}
            <Button variant="primary" icon={<FileDown className="h-4 w-4" />} onClick={() => exportPDF()}>Export PDF</Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Collected" value={money0(A.collected)} />
        <Stat label="Avg project" value={money0(A.avgProject)} />
        <Stat label="Lead conversion" value={pct(A.conversion, 0)} />
        <Stat label="Estimate approval" value={pct(A.approvalRate, 0)} />
        <Stat label="Labor cost %" value={pct(A.laborPct)} />
        <Stat label="Material cost %" value={pct(A.materialPct)} />
        <Stat label="Est. profit" value={money0(A.estProfit)} sub="completed jobs" />
        <Stat label="Actual profit" value={<span className={A.actProfit < A.estProfit ? "text-amberx-600" : "text-sage-700"}>{money0(A.actProfit)}</span>} sub="completed jobs" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.key} className={r.wide ? "xl:col-span-2" : ""}>
            <CardHeader title={r.title} subtitle={r.subtitle} actions={<><Button size="xs" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCSV(r)}>CSV</Button><Button size="xs" variant="ghost" icon={<FileDown className="h-3.5 w-3.5" />} onClick={() => exportPDF(r)}>PDF</Button></>} />
            {r.chart && <div className="px-4 pt-4">{r.chart}</div>}
            <ReportTable rows={r.rows} />
          </Card>
        ))}
      </div>
    </div>
  );
}

function ReportTable({ rows }: { rows: Record<string, string | number>[] }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="p-6 text-center text-sm text-stone-400">No data in this period.</p>;
  const cols = Object.keys(rows[0]);
  const isMoney = (c: string) => /revenue|collected|booked|cost|profit|value|contract|balance/.test(c);
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <div className="p-4">
      <div className="overflow-x-auto rounded-lg border border-stone-100">
        <table className="w-full text-xs">
          <thead className="bg-stone-50"><tr>{cols.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-semibold uppercase tracking-wider text-stone-500">{c.replace(/_/g, " ").replace(" pct", " %")}</th>)}</tr></thead>
          <tbody className="divide-y divide-stone-100">
            {shown.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className="whitespace-nowrap px-3 py-1.5 tabular-nums">{typeof r[c] === "number" ? (isMoney(c) ? money0(r[c] as number) : c.endsWith("pct") || c.includes("margin") ? `${(r[c] as number).toFixed(1)}%` : (r[c] as number).toLocaleString()) : r[c]}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && <button className="mt-2 text-xs font-medium text-brass-600" onClick={() => setAll((v) => !v)}>{all ? "Show less" : `Show all ${rows.length} rows`}</button>}
    </div>
  );
}
