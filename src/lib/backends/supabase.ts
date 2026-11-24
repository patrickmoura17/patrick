"use client";
// Supabase backend: PostgreSQL via PostgREST, Realtime for live updates,
// Storage for files. RLS (supabase/migrations/0002_security.sql) enforces roles.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TABLES, type TableName } from "../types";
import { emptySnapshot, type Backend, type RemoteChange } from "./types";

let client: SupabaseClient | null = null;

export function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

// Tables written only by server triggers or never cached client-side in full.
const READ_ONLY: TableName[] = ["audit_logs"];

export function createSupabaseBackend(): Backend {
  const sb = getSupabase();
  const listeners = new Set<(c: RemoteChange) => void>();
  let subscribed = false;

  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  const subscribe = () => {
    if (subscribed) return;
    subscribed = true;
    const ch = sb.channel("db-changes");
    for (const t of TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (payload) => {
        const c: RemoteChange =
          payload.eventType === "DELETE"
            ? { table: t, type: "delete", id: (payload.old as { id: string }).id }
            : { table: t, type: "upsert", row: payload.new as Record<string, unknown> };
        listeners.forEach((l) => l(c));
      });
    }
    ch.subscribe();
  };

  return {
    mode: "supabase",
    serverAudit: true,
    async load() {
      const snap = emptySnapshot(TABLES);
      await Promise.all(
        TABLES.map(async (t) => {
          const rows: unknown[] = [];
          const page = 1000;
          for (let from = 0; ; from += page) {
            let q = sb.from(t).select("*").range(from, from + page - 1);
            if (t === "audit_logs" || t === "automation_runs") q = q.order("created_at", { ascending: false }).limit(500);
            const { data, error } = await q;
            if (error) {
              // RLS denies a whole module for this role: treat as empty
              if (error.code === "42501") break;
              throw new Error(`${t}: ${error.message}`);
            }
            rows.push(...(data || []));
            if (!data || data.length < page || t === "audit_logs" || t === "automation_runs") break;
          }
          snap[t] = rows as never;
        }),
      );
      subscribe();
      return snap;
    },
    async insert(table, row) {
      if (READ_ONLY.includes(table)) return;
      const clean = { ...row };
      delete (clean as Record<string, unknown>).password_hash;
      const { error } = await sb.from(table).insert(clean);
      check(error);
    },
    async update(table, id, patch) {
      if (READ_ONLY.includes(table)) return;
      const { error } = await sb.from(table).update(patch).eq("id", id);
      check(error);
    },
    async remove(table, id) {
      const { error } = await sb.from(table).delete().eq("id", id);
      check(error);
    },
    onRemoteChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async putFile(path, file) {
      const { error } = await sb.storage.from("files").upload(path, file, { upsert: true });
      check(error);
    },
    async fileUrl(path) {
      const { data } = await sb.storage.from("files").createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
    async removeFile(path) {
      await sb.storage.from("files").remove([path]);
    },
  };
}
