import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money = (n: number | null | undefined) => usd.format(Number(n) || 0);
export const money0 = (n: number | null | undefined) => usd0.format(Number(n) || 0);
export const compactMoney = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `$${Math.round(n / 1000)}k`;
  if (a >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return money0(n);
};
export const num = (n: number, d = 0) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const pct = (n: number, d = 1) => `${(Number(n) || 0).toFixed(d)}%`;

const toDate = (v: string | Date) => (typeof v === "string" ? (v.length === 10 ? parseISO(v + "T12:00:00") : parseISO(v)) : v);
export const fmtDate = (v?: string | null, f = "MMM d, yyyy") => (v ? format(toDate(v), f) : "—");
export const fmtDateTime = (v?: string | null) => (v ? format(toDate(v), "MMM d, yyyy · h:mm a") : "—");
export const fmtTime = (v?: string | null) => (v ? format(toDate(v), "h:mm a") : "");
export const ago = (v?: string | null) => (v ? formatDistanceToNowStrict(toDate(v), { addSuffix: true }) : "");

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(filename: string, content: string | Blob, mime = "text/csv") {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
