"use client";
// Local backend: persists every table to IndexedDB and syncs open tabs through
// BroadcastChannel. Used when Supabase env vars are not configured.
import { idb } from "../idb";
import { TABLES, type TableName } from "../types";
import { emptySnapshot, type Backend, type RemoteChange, type Snapshot } from "./types";

export function createLocalBackend(): Backend {
  let snap: Snapshot = emptySnapshot(TABLES);
  const dirty = new Set<TableName>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("stoneline-os") : null;
  const listeners = new Set<(c: RemoteChange) => void>();
  channel?.addEventListener("message", (e) => {
    const c = e.data as RemoteChange;
    // keep our persisted mirror in step with the other tab
    const rows = snap[c.table] as unknown as Record<string, unknown>[];
    if (c.type === "delete") snap[c.table] = rows.filter((r) => r.id !== c.id) as never;
    else if (c.row) {
      const i = rows.findIndex((r) => r.id === c.row!.id);
      if (i >= 0) rows[i] = c.row;
      else rows.push(c.row);
    }
    listeners.forEach((l) => l(c));
  });

  const flush = async () => {
    timer = null;
    const entries: [string, unknown][] = [...dirty].map((t) => [t, snap[t]]);
    dirty.clear();
    await idb.setMany("tables", entries);
  };
  const schedule = (t: TableName) => {
    dirty.add(t);
    if (!timer) timer = setTimeout(flush, 150);
  };
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      if (timer) void flush();
    });
  }

  const broadcast = (c: RemoteChange) => channel?.postMessage(c);

  return {
    mode: "local",
    serverAudit: false,
    async load() {
      snap = emptySnapshot(TABLES);
      for (const t of TABLES) {
        const rows = await idb.get<unknown[]>("tables", t);
        if (Array.isArray(rows)) snap[t] = rows as never;
      }
      return structuredClone(snap);
    },
    async insert(table, row) {
      (snap[table] as unknown as Record<string, unknown>[]).push(structuredClone(row));
      schedule(table);
      broadcast({ table, type: "upsert", row });
    },
    async update(table, id, patch) {
      const rows = snap[table] as unknown as Record<string, unknown>[];
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return;
      rows[i] = { ...rows[i], ...structuredClone(patch) };
      schedule(table);
      broadcast({ table, type: "upsert", row: rows[i] });
    },
    async remove(table, id) {
      snap[table] = (snap[table] as unknown as Record<string, unknown>[]).filter((r) => r.id !== id) as never;
      schedule(table);
      broadcast({ table, type: "delete", id });
    },
    onRemoteChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async putFile(path, file) {
      await idb.set("blobs", path, file);
    },
    async fileUrl(path) {
      const b = await idb.get<Blob>("blobs", path);
      return b ? URL.createObjectURL(b) : null;
    },
    async removeFile(path) {
      await idb.del("blobs", path);
    },
    async replaceAll(next) {
      snap = structuredClone(next);
      await idb.clear("tables");
      await idb.setMany("tables", TABLES.map((t) => [t, snap[t]]));
    },
  };
}
