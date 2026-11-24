"use client";
// Design-system primitives (shadcn-style API, zero runtime deps).
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { X, Search, ChevronDown, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import React, { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

// ---------------------------------------------------------------- Button
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "brass" | "outline" | "success";
type BtnSize = "xs" | "sm" | "md" | "lg" | "icon";
export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean; icon?: React.ReactNode }>(
  ({ className, variant = "secondary", size = "md", loading, icon, children, disabled, ...p }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/60 disabled:pointer-events-none disabled:opacity-50 select-none",
        {
          primary: "bg-ink-900 text-white hover:bg-ink-700 shadow-sm",
          brass: "bg-brass-500 text-white hover:bg-brass-600 shadow-sm",
          secondary: "bg-white text-ink-900 border border-stone-200 hover:bg-stone-50 hover:border-stone-300 shadow-sm",
          outline: "border border-stone-300 text-ink-800 hover:bg-stone-100",
          ghost: "text-stone-600 hover:bg-stone-100 hover:text-ink-900",
          danger: "bg-clay-600 text-white hover:bg-clay-700 shadow-sm",
          success: "bg-sage-600 text-white hover:bg-sage-700 shadow-sm",
        }[variant],
        { xs: "h-7 px-2 text-xs", sm: "h-8 px-3 text-[13px]", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-sm", icon: "h-8 w-8 p-0" }[size],
        className,
      )}
      {...p}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

// ---------------------------------------------------------------- Inputs
const inputCls =
  "w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-ink-900 placeholder:text-stone-400 shadow-[inset_0_1px_1px_rgba(0,0,0,.02)] transition focus:border-brass-400 focus:outline-none focus:ring-2 focus:ring-brass-300/30 disabled:bg-stone-50 disabled:text-stone-500";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(inputCls, "h-9", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(inputCls, "min-h-[80px] py-2 leading-relaxed", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(inputCls, "h-9 appearance-none pr-8", className)} {...p}>
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
  </div>
));
Select.displayName = "Select";

export function NumberInput({ value, onChange, className, step = "any", ...p }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value ?? 0));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value ?? 0));
  }, [value]);
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(String(value ?? 0));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className={cn("tabular-nums", className)}
      {...p}
    />
  );
}

export function Label({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500", className)}>
      {children}
    </label>
  );
}

export function Field({ label, children, className, hint, error, required }: { label: string; children: React.ReactNode; className?: string; hint?: string; error?: string; required?: boolean }) {
  return (
    <div className={className}>
      <Label>
        {label}
        {required && <span className="ml-0.5 text-clay-500">*</span>}
      </Label>
      {children}
      {error ? <p className="mt-1 text-xs text-clay-600">{error}</p> : hint ? <p className="mt-1 text-xs text-stone-400">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; className?: string }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ink-800", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-stone-300 accent-brass-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm" aria-pressed={checked}>
      <span className={cn("relative h-5 w-9 rounded-full transition", checked ? "bg-sage-500" : "bg-stone-300")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      {label && <span className="text-ink-800">{label}</span>}
    </button>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}

// ---------------------------------------------------------------- Surfaces
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-stone-200/80 bg-white shadow-card", className)} {...p}>
      {children}
    </div>
  );
}
export function CardHeader({ title, subtitle, actions, className, icon }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-3.5", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-stone-400">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; breadcrumb?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1.5 text-xs text-stone-500">{breadcrumb}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Badge
export type Tone = "neutral" | "brass" | "blue" | "green" | "red" | "amber" | "purple" | "dark";
export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        {
          neutral: "bg-stone-100 text-stone-600 ring-stone-200",
          brass: "bg-brass-50 text-brass-700 ring-brass-200",
          blue: "bg-slateblue-50 text-slateblue-700 ring-slateblue-100",
          green: "bg-sage-50 text-sage-700 ring-sage-100",
          red: "bg-clay-50 text-clay-700 ring-clay-100",
          amber: "bg-amberx-50 text-amberx-600 ring-amberx-100",
          purple: "bg-purple-50 text-purple-700 ring-purple-100",
          dark: "bg-ink-800 text-white ring-ink-700",
        }[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

export function Avatar({ name, color, size = 28, className }: { name: string; color?: string; size?: number; className?: string }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  return (
    <span
      title={name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: color || "#675f54" }}
    >
      {ini}
    </span>
  );
}

export function Progress({ value, className, tone = "brass" }: { value: number; className?: string; tone?: "brass" | "green" | "red" | "blue" }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-stone-100", className)}>
      <div className={cn("h-full rounded-full transition-all", { brass: "bg-brass-500", green: "bg-sage-500", red: "bg-clay-500", blue: "bg-slateblue-500" }[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 rounded-xl bg-stone-100 p-3 text-stone-400">{icon}</div>}
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-stone-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, icon, trend, className, onClick }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; trend?: { value: string; up: boolean } | null; className?: string; onClick?: () => void }) {
  return (
    <Card className={cn("p-4", onClick && "cursor-pointer transition hover:border-stone-300 hover:shadow-pop", className)} onClick={onClick}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
        {icon && <span className="rounded-lg bg-stone-100 p-1.5 text-stone-500">{icon}</span>}
      </div>
      <p className="mt-2 text-[22px] font-semibold tabular-nums tracking-tight text-ink-900">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
        {trend && <span className={cn("font-semibold", trend.up ? "text-sage-600" : "text-clay-600")}>{trend.up ? "▲" : "▼"} {trend.value}</span>}
        {sub}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Tabs
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { key: T; label: React.ReactNode; count?: number }[]; value: T; onChange: (k: T) => void; className?: string }) {
  return (
    <div className={cn("scrollbar-none flex gap-1 overflow-x-auto border-b border-stone-200", className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition",
            value === t.key ? "border-brass-500 text-ink-900" : "border-transparent text-stone-500 hover:text-ink-800",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", value === t.key ? "bg-brass-100 text-brass-700" : "bg-stone-100 text-stone-500")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, className }: { options: { key: T; label: React.ReactNode }[]; value: T; onChange: (k: T) => void; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg border border-stone-200 bg-stone-100/70 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition", value === o.key ? "bg-white text-ink-900 shadow-sm" : "text-stone-500 hover:text-ink-800")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Modal / Drawer
export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        className={cn(
          "relative flex max-h-[92vh] w-full animate-rise flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-2xl",
          { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" }[size],
        )}
      >
        <div className="flex items-start justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-ink-900" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 bg-stone-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Dropdown menu
export function Menu({ trigger, items, align = "right" }: { trigger: React.ReactNode; items: ({ label: React.ReactNode; onClick: () => void; icon?: React.ReactNode; danger?: boolean; disabled?: boolean } | "divider")[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div className={cn("absolute z-40 mt-1 min-w-[190px] animate-rise rounded-xl border border-stone-200 bg-white p-1 shadow-pop", align === "right" ? "right-0" : "left-0")}>
          {items.map((it, i) =>
            it === "divider" ? (
              <div key={i} className="my-1 h-px bg-stone-100" />
            ) : (
              <button
                key={i}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition disabled:opacity-40", it.danger ? "text-clay-600 hover:bg-clay-50" : "text-ink-800 hover:bg-stone-100")}
              >
                {it.icon && <span className="text-stone-400 [&>svg]:h-4 [&>svg]:w-4">{it.icon}</span>}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Toasts & confirm
type ToastT = { id: number; msg: string; tone: "success" | "error" | "info" };
const ToastCtx = createContext<{ toast: (msg: string, tone?: ToastT["tone"]) => void; confirm: (o: ConfirmOpts) => Promise<boolean>; prompt: (o: PromptOpts) => Promise<string | null> }>({
  toast: () => {},
  confirm: async () => false,
  prompt: async () => null,
});
type ConfirmOpts = { title: string; body?: string; confirmLabel?: string; danger?: boolean };
type PromptOpts = { title: string; label?: string; placeholder?: string; initial?: string; confirmLabel?: string; multiline?: boolean };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastT[]>([]);
  const [conf, setConf] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [prm, setPrm] = useState<(PromptOpts & { resolve: (v: string | null) => void; value: string }) | null>(null);
  const toast = useCallback((msg: string, tone: ToastT["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConf({ ...o, resolve })), []);
  const prompt = useCallback((o: PromptOpts) => new Promise<string | null>((resolve) => setPrm({ ...o, resolve, value: o.initial ?? "" })), []);
  const value = useMemo(() => ({ toast, confirm, prompt }), [toast, confirm, prompt]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-sm animate-rise items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-pop",
              t.tone === "success" ? "bg-ink-900" : t.tone === "error" ? "bg-clay-600" : "bg-slateblue-600",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", t.tone === "success" ? "bg-sage-500" : "bg-white/70")} />
            {t.msg}
          </div>
        ))}
      </div>
      <Modal
        open={!!conf}
        onClose={() => {
          conf?.resolve(false);
          setConf(null);
        }}
        title={conf?.title}
        size="sm"
        footer={
          <>
            <Button
              onClick={() => {
                conf?.resolve(false);
                setConf(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant={conf?.danger ? "danger" : "primary"}
              onClick={() => {
                conf?.resolve(true);
                setConf(null);
              }}
            >
              {conf?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-stone-600">{conf?.body}</p>
      </Modal>
      <Modal
        open={!!prm}
        onClose={() => {
          prm?.resolve(null);
          setPrm(null);
        }}
        title={prm?.title}
        size="sm"
        footer={
          <>
            <Button
              onClick={() => {
                prm?.resolve(null);
                setPrm(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                prm?.resolve(prm.value);
                setPrm(null);
              }}
            >
              {prm?.confirmLabel ?? "Save"}
            </Button>
          </>
        }
      >
        {prm && (
          <Field label={prm.label ?? "Value"}>
            {prm.multiline ? (
              <Textarea autoFocus value={prm.value} placeholder={prm.placeholder} onChange={(e) => setPrm({ ...prm, value: e.target.value })} />
            ) : (
              <Input
                autoFocus
                value={prm.value}
                placeholder={prm.placeholder}
                onChange={(e) => setPrm({ ...prm, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    prm.resolve(prm.value);
                    setPrm(null);
                  }
                }}
              />
            )}
          </Field>
        )}
      </Modal>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- Data table
export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sort?: (row: T) => string | number;
  className?: string;
  headerClassName?: string;
  hideOnMobile?: boolean;
}

export function DataTable<T extends { id: string }>({ rows, columns, onRowClick, empty, initialSort, pageSize = 25, dense }: { rows: T[]; columns: Column<T>[]; onRowClick?: (r: T) => void; empty?: React.ReactNode; initialSort?: { key: string; dir: "asc" | "desc" }; pageSize?: number; dense?: boolean }) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);
  useEffect(() => setPage(0), [rows.length]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const shown = sorted.slice(page * pageSize, page * pageSize + pageSize);
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/70">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn("whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-500", c.hideOnMobile && "hidden md:table-cell", c.headerClassName)}
                >
                  {c.sort ? (
                    <button className="inline-flex items-center gap-1 hover:text-ink-900" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "asc" ? "desc" : "asc" }))}>
                      {c.header}
                      {sort?.key === c.key ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {shown.map((r) => (
              <tr key={r.id} onClick={() => onRowClick?.(r)} className={cn("transition", onRowClick && "cursor-pointer hover:bg-brass-50/40")}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 text-ink-800", dense ? "py-2" : "py-3", c.hideOnMobile && "hidden md:table-cell", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2.5 text-xs text-stone-500">
          <span>
            {page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}
          </span>
          <div className="flex gap-1">
            <Button size="xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Prev
            </Button>
            <Button size="xs" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function KV({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-ink-900">{children || <span className="text-stone-400">—</span>}</dd>
    </div>
  );
}
