"use client";
// Branded PDF documents (jsPDF + autotable): proposals, invoices, change orders.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { changeOrderLineAmount, changeOrderTotals, estimateTotals, invoiceTotals, lineTotal, lineUnitPrice, milestoneAmounts } from "./calc";
import { fmtDate, money } from "./format";
import type { ChangeOrder, CompanySettings, Customer, Estimate, EstimateItem, Invoice, Payment, Project } from "./types";

const INK: [number, number, number] = [22, 26, 32];
const MUTED: [number, number, number] = [133, 125, 112];
const LINE: [number, number, number] = [227, 223, 215];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const custLabel = (c?: Customer) => (c ? `${c.first_name} ${c.last_name}`.trim() || c.company : "");

async function loadImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}

async function header(doc: jsPDF, co: CompanySettings, title: string, meta: [string, string][]) {
  const brand = hexToRgb(co.brand_color || "#b08a48");
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 34, "F");
  doc.setFillColor(...brand);
  doc.rect(0, 34, W, 1.2, "F");
  const logo = await loadImage(co.logo_url);
  let x = 14;
  if (logo) {
    try {
      doc.addImage(logo, 14, 7, 20, 20, undefined, "FAST");
      x = 38;
    } catch {
      /* ignore bad logo */
    }
  } else {
    doc.setFillColor(...brand);
    doc.roundedRect(14, 9, 16, 16, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(co.name.slice(0, 1).toUpperCase(), 22, 19.5, { align: "center" });
    x = 35;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(co.name, x, 15.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 192, 180);
  doc.text(co.tagline || "", x, 20.5);
  doc.text([co.phone, co.email, co.website].filter(Boolean).join("  ·  "), x, 25.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...brand);
  doc.text(title.toUpperCase(), W - 14, 16, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(220, 214, 204);
  meta.forEach(([k, v], i) => doc.text(`${k}: ${v}`, W - 14, 22 + i * 4.2, { align: "right" }));
  return 46;
}

function partyBlock(doc: jsPDF, y: number, left: { title: string; lines: string[] }, right: { title: string; lines: string[] }) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.text(left.title.toUpperCase(), 14, y);
  doc.text(right.title.toUpperCase(), W / 2 + 4, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  const l = left.lines.filter(Boolean).flatMap((t) => doc.splitTextToSize(t, W / 2 - 22));
  const r = right.lines.filter(Boolean).flatMap((t) => doc.splitTextToSize(t, W / 2 - 22));
  l.forEach((t, i) => doc.text(t, 14, y + 5 + i * 4.6));
  r.forEach((t, i) => doc.text(t, W / 2 + 4, y + 5 + i * 4.6));
  return y + 8 + Math.max(l.length, r.length) * 4.6;
}

function sectionTitle(doc: jsPDF, y: number, text: string) {
  y = ensure(doc, y, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(text, 14, y);
  doc.setDrawColor(...LINE);
  doc.line(14, y + 2, doc.internal.pageSize.getWidth() - 14, y + 2);
  return y + 7;
}

function paragraph(doc: jsPDF, y: number, text: string, size = 8.8) {
  if (!text?.trim()) return y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(77, 71, 63);
  const lines = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - 28);
  for (const ln of lines) {
    y = ensure(doc, y, 6);
    doc.text(ln, 14, y);
    y += size * 0.47;
  }
  return y + 3;
}

function ensure(doc: jsPDF, y: number, need: number) {
  if (y + need > doc.internal.pageSize.getHeight() - 18) {
    doc.addPage();
    return 20;
  }
  return y;
}

function totalsBox(doc: jsPDF, y: number, rows: [string, string, boolean?][]) {
  const W = doc.internal.pageSize.getWidth();
  y = ensure(doc, y, rows.length * 6 + 8);
  const x = W - 14 - 78;
  rows.forEach(([k, v, strong], i) => {
    const yy = y + i * 6;
    if (strong) {
      doc.setFillColor(244, 242, 238);
      doc.rect(x - 2, yy - 4.3, 80, 7, "F");
    }
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 10.5 : 9);
    doc.setTextColor(...(strong ? INK : MUTED));
    doc.text(k, x, yy);
    doc.setTextColor(...INK);
    doc.text(v, W - 14, yy, { align: "right" });
  });
  return y + rows.length * 6 + 4;
}

function footer(doc: jsPDF, co: CompanySettings) {
  const n = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.line(14, H - 12, W - 14, H - 12);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${co.name} · ${co.address}${co.license_number ? ` · Lic. ${co.license_number}` : ""}`, 14, H - 7);
    doc.text(`Page ${i} of ${n}`, W - 14, H - 7, { align: "right" });
  }
}

function signature(doc: jsPDF, y: number, labelL: string, labelR: string, signedName?: string, signedAt?: string | null) {
  const W = doc.internal.pageSize.getWidth();
  y = ensure(doc, y + 4, 30);
  doc.setDrawColor(...INK);
  doc.line(14, y + 14, W / 2 - 10, y + 14);
  doc.line(W / 2 + 10, y + 14, W - 14, y + 14);
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(labelL, 14, y + 19);
  doc.text(labelR, W / 2 + 10, y + 19);
  if (signedName) {
    doc.setFont("times", "italic");
    doc.setFontSize(15);
    doc.setTextColor(...INK);
    doc.text(signedName, 16, y + 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(signedAt ? fmtDate(signedAt) : "", W / 2 + 12, y + 11);
  }
  return y + 26;
}

const TABLE_STYLE = {
  theme: "plain" as const,
  styles: { font: "helvetica", fontSize: 8.6, textColor: INK, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, lineColor: LINE, lineWidth: { bottom: 0.2 } as never },
  headStyles: { fillColor: [244, 242, 238] as [number, number, number], textColor: MUTED, fontStyle: "bold" as const, fontSize: 7.5 },
  margin: { left: 14, right: 14 },
};

const CAT_LABEL: Record<string, string> = { tile: "Tile", flooring: "Flooring", cabinets: "Cabinets", countertops: "Countertops", general: "General" };

export async function proposalPdf(co: CompanySettings, est: Estimate, items: EstimateItem[], cust: Customer | undefined, preparedBy?: string) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const t = estimateTotals(est, items);
  let y = await header(doc, co, "Proposal", [["No.", est.number], ["Date", fmtDate(est.issue_date)], ["Valid until", fmtDate(est.valid_until)]]);
  y = partyBlock(
    doc, y,
    { title: "Prepared for", lines: [custLabel(cust), cust?.company && cust.company !== custLabel(cust) ? cust.company : "", cust?.project_address ?? "", cust?.phone ?? "", cust?.email ?? ""] },
    { title: "Project", lines: [est.title, preparedBy ? `Prepared by ${preparedBy}` : "", co.license_number ? `License ${co.license_number}` : ""] },
  );
  y = paragraph(doc, y + 2, est.intro);

  const cats = [...new Set(items.sort((a, b) => a.position - b.position).map((i) => i.category))];
  for (const cat of cats) {
    const rows = items.filter((i) => i.category === cat).sort((a, b) => a.position - b.position);
    y = sectionTitle(doc, y + 2, CAT_LABEL[cat] ?? cat);
    autoTable(doc, {
      ...TABLE_STYLE,
      startY: y,
      head: [["Description", "Qty", "Unit", "Unit price", "Amount"]],
      body: rows.map((i) => [
        { content: `${i.name}${i.optional ? "  (optional)" : ""}${i.description ? `\n${i.description}` : ""}`, styles: { textColor: i.optional ? MUTED : INK } },
        String(Number(i.quantity)),
        i.unit,
        money(lineUnitPrice(i)),
        i.optional ? `(${money(lineTotal(i))})` : money(lineTotal(i)),
      ]),
      columnStyles: { 0: { cellWidth: 104 }, 1: { halign: "right" }, 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 0) d.cell.styles.fontSize = 8.6;
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  y = totalsBox(doc, y + 2, [
    ["Subtotal", money(t.subtotal)],
    ...(t.discount ? ([["Discount", `− ${money(t.discount)}`]] as [string, string][]) : []),
    [`Sales tax (${est.tax_rate}%)`, money(t.tax)],
    ["Total investment", money(t.total), true],
    ...(t.optionalTotal ? ([["Optional items (not included)", money(t.optionalTotal)]] as [string, string][]) : []),
  ]);

  if (est.payment_schedule.length) {
    y = sectionTitle(doc, y + 4, "Payment schedule");
    const amts = milestoneAmounts(t.total, est.payment_schedule.map((m) => m.percent));
    autoTable(doc, {
      ...TABLE_STYLE,
      startY: y,
      head: [["Milestone", "Due upon", "%", "Amount"]],
      body: est.payment_schedule.map((m, i) => [m.label, m.trigger, `${m.percent}%`, money(amts[i])]),
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }
  if (est.timeline.length) {
    y = sectionTitle(doc, y + 4, "Project timeline");
    autoTable(doc, {
      ...TABLE_STYLE,
      startY: y,
      head: [["Phase", "Duration"]],
      body: est.timeline.map((p) => [p.label, `${p.days} working day${p.days === 1 ? "" : "s"}`]),
      foot: [["Estimated total", `${est.timeline.reduce((s, p) => s + Number(p.days), 0)} working days`]],
      footStyles: { fontStyle: "bold", textColor: INK, fillColor: [255, 255, 255] },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }
  if (est.customer_notes) {
    y = sectionTitle(doc, y + 4, "Notes");
    y = paragraph(doc, y, est.customer_notes);
  }
  if (est.exclusions) {
    y = sectionTitle(doc, y + 4, "Exclusions");
    y = paragraph(doc, y, est.exclusions);
  }
  if (est.terms) {
    y = sectionTitle(doc, y + 4, "Terms & conditions");
    y = paragraph(doc, y, est.terms, 8);
  }
  y = sectionTitle(doc, y + 4, "Acceptance");
  y = paragraph(doc, y, "By signing below, the customer accepts this proposal, its scope, payment schedule and terms, and authorizes the work to proceed.");
  signature(doc, y, "Customer signature", "Date", est.status === "approved" ? est.signed_name : undefined, est.responded_at);
  footer(doc, co);
  return doc;
}

export async function invoicePdf(co: CompanySettings, inv: Invoice, cust: Customer | undefined, project: Project | undefined, payments: Payment[]) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const t = invoiceTotals(inv, payments);
  let y = await header(doc, co, "Invoice", [["No.", inv.number], ["Issued", fmtDate(inv.issue_date)], ["Due", fmtDate(inv.due_date)]]);
  y = partyBlock(
    doc, y,
    { title: "Bill to", lines: [custLabel(cust), cust?.company && cust.company !== custLabel(cust) ? cust.company : "", cust?.billing_address ?? "", cust?.email ?? ""] },
    { title: "Project", lines: project ? [`${project.number} · ${project.name}`, project.address] : ["—"] },
  );
  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y + 2,
    head: [["Description", "Qty", "Unit", "Rate", "Amount"]],
    body: inv.items.map((l) => [l.description, String(l.quantity), l.unit, money(l.unit_price), money(l.quantity * l.unit_price)]),
    columnStyles: { 0: { cellWidth: 100 }, 1: { halign: "right" }, 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  y = totalsBox(doc, y, [
    ["Subtotal", money(t.subtotal)],
    ...(t.discount ? ([["Discount", `− ${money(t.discount)}`]] as [string, string][]) : []),
    ...(inv.tax_rate ? ([[`Tax (${inv.tax_rate}%)`, money(t.tax)]] as [string, string][]) : []),
    ["Total", money(t.total)],
    ["Paid to date", `− ${money(t.paid)}`],
    ["Balance due", money(t.balance), true],
  ]);
  if (payments.length) {
    y = sectionTitle(doc, y + 4, "Payments received");
    autoTable(doc, {
      ...TABLE_STYLE,
      startY: y,
      head: [["Date", "Method", "Reference", "Amount"]],
      body: payments.map((p) => [fmtDate(p.date), p.method.toUpperCase(), p.reference || "—", money(p.amount)]),
      columnStyles: { 3: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }
  y = paragraph(doc, y + 4, inv.notes);
  if (inv.status === "paid") {
    doc.setTextColor(79, 138, 94);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("PAID", doc.internal.pageSize.getWidth() - 20, 70, { align: "right", angle: 12 });
  }
  footer(doc, co);
  return doc;
}

export async function changeOrderPdf(co: CompanySettings, c: ChangeOrder, project: Project | undefined, cust: Customer | undefined) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const t = changeOrderTotals(c);
  let y = await header(doc, co, "Change Order", [["No.", c.number], ["Date", fmtDate(c.sent_at ?? c.created_at)], ["Project", project?.number ?? ""]]);
  y = partyBlock(
    doc, y,
    { title: "Customer", lines: [custLabel(cust), cust?.project_address ?? ""] },
    { title: "Project", lines: [project?.name ?? "", `Original contract: ${money(project?.original_contract_value ?? 0)}`] },
  );
  y = sectionTitle(doc, y + 2, c.title);
  y = paragraph(doc, y, c.reason);
  autoTable(doc, {
    ...TABLE_STYLE,
    startY: y,
    head: [["Change", "Description", "Qty", "Unit", "Rate", "Amount"]],
    body: c.items.map((i) => [i.action.toUpperCase(), i.description, String(i.quantity), i.unit, money(i.unit_price), money(changeOrderLineAmount(i))]),
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 20 }, 2: { halign: "right" }, 3: { halign: "center" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const before = project ? (c.status === "approved" ? project.contract_value - t.amount : project.contract_value) : 0;
  y = totalsBox(doc, y, [
    ["Contract before this change", money(before)],
    ["This change order", `${t.amount >= 0 ? "+ " : "− "}${money(Math.abs(t.amount))}`],
    ["Revised contract value", money(before + t.amount), true],
    ["Schedule impact", `${c.schedule_impact_days} day(s)`],
  ]);
  y = paragraph(doc, y + 4, "This change order becomes part of the contract upon customer signature. All other terms of the original agreement remain in effect.");
  signature(doc, y, "Customer approval", "Date", c.status === "approved" ? c.signed_name : undefined, c.approved_at);
  footer(doc, co);
  return doc;
}

export function openPdf(doc: jsPDF, filename: string, mode: "download" | "preview" = "download") {
  if (mode === "download") doc.save(filename);
  else window.open(doc.output("bloburl"), "_blank");
}
