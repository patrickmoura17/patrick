import type { TableName, Tables } from "../types";

export type Snapshot = { [T in TableName]: Tables[T][] };

export interface RemoteChange {
  table: TableName;
  type: "upsert" | "delete";
  row?: Record<string, unknown>;
  id?: string;
}

export interface Backend {
  mode: "local" | "supabase";
  /** Whether the server writes audit logs itself (DB trigger). */
  serverAudit: boolean;
  load(): Promise<Snapshot>;
  insert(table: TableName, row: Record<string, unknown>): Promise<void>;
  update(table: TableName, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  onRemoteChange(cb: (c: RemoteChange) => void): () => void;
  putFile(path: string, file: Blob): Promise<void>;
  fileUrl(path: string): Promise<string | null>;
  removeFile(path: string): Promise<void>;
  /** Local mode only: replace all data (seed/reset/import). */
  replaceAll?(snap: Snapshot): Promise<void>;
}

export function emptySnapshot(tables: TableName[]): Snapshot {
  const s = {} as Record<string, unknown[]>;
  for (const t of tables) s[t] = [];
  return s as Snapshot;
}
