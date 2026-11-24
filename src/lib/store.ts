"use client";
// Client-side data store. Holds a normalized cache of every table, applies
// mutations optimistically, persists them through the active backend and
// applies realtime changes from other users/tabs. All modules read through
// the hooks at the bottom of this file, so every screen shares one source of truth.
import { useMemo, useSyncExternalStore } from "react";
import type { Backend, RemoteChange, Snapshot } from "./backends/types";
import { emptySnapshot } from "./backends/types";
import { TABLES, type ID, type NewRow, type TableName, type Tables } from "./types";

const AUDITED: TableName[] = [
  "customers", "leads", "estimates", "projects", "change_orders", "invoices", "payments",
  "expenses", "purchase_orders", "profiles", "roles", "company_settings", "automations",
];

type Listener = () => void;
type ChangeHook = (c: { table: TableName; before: unknown; after: unknown; origin: "local" | "remote" }) => void;

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

class DataStore {
  private data: Snapshot = emptySnapshot(TABLES);
  private listeners = new Map<TableName, Set<Listener>>();
  private globalListeners = new Set<Listener>();
  private changeHooks = new Set<ChangeHook>();
  backend: Backend | null = null;
  ready = false;
  currentUserId: ID | null = null;
  onError: (msg: string) => void = (m) => console.error(m);

  async init(backend: Backend) {
    this.backend = backend;
    this.data = await backend.load();
    backend.onRemoteChange((c) => this.applyRemote(c));
    this.ready = true;
    TABLES.forEach((t) => this.notify(t));
  }

  async replaceAll(snap: Snapshot) {
    if (!this.backend?.replaceAll) throw new Error("Bulk replace is only available in local mode");
    await this.backend.replaceAll(snap);
    this.data = structuredClone(snap);
    TABLES.forEach((t) => this.notify(t));
  }

  snapshot(): Snapshot {
    return this.data;
  }

  // ----- subscription --------------------------------------------------
  subscribe(table: TableName, fn: Listener) {
    if (!this.listeners.has(table)) this.listeners.set(table, new Set());
    this.listeners.get(table)!.add(fn);
    return () => this.listeners.get(table)!.delete(fn);
  }
  subscribeAll(fn: Listener) {
    this.globalListeners.add(fn);
    return () => this.globalListeners.delete(fn);
  }
  onChange(fn: ChangeHook) {
    this.changeHooks.add(fn);
    return () => this.changeHooks.delete(fn);
  }
  private notify(table: TableName) {
    this.listeners.get(table)?.forEach((l) => l());
    this.globalListeners.forEach((l) => l());
  }

  // ----- reads ---------------------------------------------------------
  all<T extends TableName>(table: T): Tables[T][] {
    return this.data[table];
  }
  get<T extends TableName>(table: T, id: ID | null | undefined): Tables[T] | undefined {
    if (!id) return undefined;
    return (this.data[table] as Tables[T][]).find((r) => r.id === id);
  }
  where<T extends TableName>(table: T, pred: (r: Tables[T]) => boolean): Tables[T][] {
    return (this.data[table] as Tables[T][]).filter(pred);
  }

  // ----- writes --------------------------------------------------------
  insert<T extends TableName>(table: T, row: NewRow<T>): Tables[T] {
    const full = { ...row, id: row.id ?? uid(), created_at: new Date().toISOString() } as unknown as Tables[T];
    this.data = { ...this.data, [table]: [...this.data[table], full] };
    this.notify(table);
    this.persist(() => this.backend!.insert(table, full as unknown as Record<string, unknown>), table, full.id);
    this.audit(table, full.id, "insert", null, full);
    this.emitChange(table, null, full, "local");
    return full;
  }

  update<T extends TableName>(table: T, id: ID, patch: Partial<Tables[T]>): Tables[T] | undefined {
    const rows = this.data[table] as Tables[T][];
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return undefined;
    const before = rows[i];
    const after = { ...before, ...patch, updated_at: new Date().toISOString() } as Tables[T];
    const next = rows.slice();
    next[i] = after;
    this.data = { ...this.data, [table]: next };
    this.notify(table);
    const sent = { ...patch, updated_at: (after as { updated_at?: string }).updated_at };
    this.persist(() => this.backend!.update(table, id, sent as Record<string, unknown>), table, id);
    this.audit(table, id, "update", before, after);
    this.emitChange(table, before, after, "local");
    return after;
  }

  remove<T extends TableName>(table: T, id: ID) {
    const before = this.get(table, id);
    if (!before) return;
    this.data = { ...this.data, [table]: (this.data[table] as Tables[T][]).filter((r) => r.id !== id) };
    this.notify(table);
    this.persist(() => this.backend!.remove(table, id), table, id);
    this.audit(table, id, "delete", before, null);
    this.emitChange(table, before, null, "local");
  }

  private persist(fn: () => Promise<void>, table: TableName, id: ID) {
    if (!this.backend) return;
    fn().catch((e: Error) => {
      this.onError(`Could not save ${table.replace(/_/g, " ")}: ${e.message}`);
      console.error(table, id, e);
    });
  }

  private applyRemote(c: RemoteChange) {
    const rows = this.data[c.table] as unknown as Record<string, unknown>[];
    if (c.type === "delete") {
      const before = rows.find((r) => r.id === c.id);
      if (!before) return;
      this.data = { ...this.data, [c.table]: rows.filter((r) => r.id !== c.id) };
      this.notify(c.table);
      this.emitChange(c.table, before, null, "remote");
      return;
    }
    if (!c.row) return;
    const i = rows.findIndex((r) => r.id === c.row!.id);
    const before = i >= 0 ? rows[i] : null;
    if (before && JSON.stringify(before) === JSON.stringify({ ...before, ...c.row })) return; // echo of our own write
    const next = rows.slice();
    if (i >= 0) next[i] = { ...rows[i], ...c.row };
    else next.push(c.row);
    this.data = { ...this.data, [c.table]: next };
    this.notify(c.table);
    this.emitChange(c.table, before, c.row, "remote");
  }

  private emitChange(table: TableName, before: unknown, after: unknown, origin: "local" | "remote") {
    this.changeHooks.forEach((h) => {
      try {
        h({ table, before, after, origin });
      } catch (e) {
        console.error(e);
      }
    });
  }

  private audit(table: TableName, id: ID, action: "insert" | "update" | "delete", before: unknown, after: unknown) {
    if (!AUDITED.includes(table) || !this.backend || this.backend.serverAudit) return;
    let changes: Record<string, { from: unknown; to: unknown }> | null = null;
    if (action === "update") {
      changes = {};
      const b = before as Record<string, unknown>, a = after as Record<string, unknown>;
      for (const k of Object.keys(a)) {
        if (k === "updated_at" || k === "password_hash") continue;
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changes[k] = { from: b[k], to: a[k] };
      }
      if (!Object.keys(changes).length) return;
    }
    const label = labelOf(after ?? before);
    const row = {
      id: uid(),
      created_at: new Date().toISOString(),
      table_name: table,
      record_id: id,
      action,
      user_id: this.currentUserId,
      summary: `${action} ${table.replace(/_/g, " ")}${label ? ` — ${label}` : ""}`,
      changes,
    };
    const logs = this.data.audit_logs;
    this.data = { ...this.data, audit_logs: [...logs.slice(-2999), row as never] };
    this.notify("audit_logs");
    void this.backend.insert("audit_logs", row);
  }
}

function labelOf(r: unknown): string {
  if (!r || typeof r !== "object") return "";
  const o = r as Record<string, unknown>;
  return String(o.number ?? o.name ?? o.title ?? (o.first_name ? `${o.first_name} ${o.last_name ?? ""}` : "")).trim();
}

export const db = new DataStore();

// ----- React hooks ------------------------------------------------------
export function useTable<T extends TableName>(table: T): Tables[T][] {
  return useSyncExternalStore(
    (fn) => db.subscribe(table, fn),
    () => db.all(table),
    () => db.all(table),
  );
}

export function useRow<T extends TableName>(table: T, id: ID | null | undefined): Tables[T] | undefined {
  const rows = useTable(table);
  return useMemo(() => (id ? rows.find((r) => r.id === id) : undefined), [rows, id]);
}

export function useWhere<T extends TableName>(table: T, pred: (r: Tables[T]) => boolean, deps: unknown[]): Tables[T][] {
  const rows = useTable(table);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => rows.filter(pred), [rows, ...deps]);
}

export function useSettings() {
  const rows = useTable("company_settings");
  return rows[0];
}

/** Whole-database snapshot; re-renders on any change (dashboards, reports). */
export function useSnapshot() {
  return useSyncExternalStore(
    (fn) => db.subscribeAll(fn),
    () => db.snapshot(),
    () => db.snapshot(),
  );
}
