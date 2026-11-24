"use client";
// Automatic daily backups (local mode) + JSON export/import. In Supabase mode,
// the database is protected by Supabase's managed daily backups / PITR and the
// JSON export is available to admins as an extra portable copy.
import { idb } from "./idb";
import { db } from "./store";
import { todayISO } from "./calc";
import { TABLES } from "./types";
import type { Snapshot } from "./backends/types";

const KEEP = 7;

export async function autoBackup() {
  if (db.backend?.mode !== "local") return;
  const key = `backup:${todayISO()}`;
  const existing = await idb.get("meta", key);
  if (existing) return;
  await idb.set("meta", key, { at: new Date().toISOString(), data: db.snapshot() });
  const list = await listBackups();
  for (const b of list.slice(KEEP)) await idb.del("meta", b.key);
}

export async function listBackups(): Promise<{ key: string; date: string }[]> {
  const out: { key: string; date: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `backup:${todayISO(d)}`;
    if (await idb.get("meta", key)) out.push({ key, date: key.slice(7) });
  }
  return out;
}

export async function restoreBackup(key: string) {
  const b = await idb.get<{ data: Snapshot }>("meta", key);
  if (!b) throw new Error("Backup not found");
  await db.replaceAll(b.data);
}

export function exportJSON() {
  return JSON.stringify({ app: "stoneline-os", version: 1, exported_at: new Date().toISOString(), data: db.snapshot() });
}

export async function importJSON(text: string) {
  const parsed = JSON.parse(text);
  const data = parsed.data ?? parsed;
  for (const t of TABLES) if (!Array.isArray(data[t])) data[t] = [];
  if (!data.company_settings.length || !data.roles.length || !data.profiles.length) throw new Error("File is missing company settings, roles or users");
  await db.replaceAll(data as Snapshot);
}
