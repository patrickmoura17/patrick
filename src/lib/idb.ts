// Minimal promise wrapper around IndexedDB (two object stores: tables, blobs).
const DB_NAME = "stoneline-os";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("tables")) db.createObjectStore("tables");
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const req = fn(s);
        t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const idb = {
  get: <T>(store: string, key: string) => tx<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>),
  set: (store: string, key: string, value: unknown) => tx(store, "readwrite", (s) => s.put(value, key)),
  del: (store: string, key: string) => tx(store, "readwrite", (s) => s.delete(key)),
  clear: (store: string) => tx(store, "readwrite", (s) => s.clear()),
  setMany: (store: string, entries: [string, unknown][]) =>
    tx(store, "readwrite", (s) => {
      for (const [k, v] of entries) s.put(v, k);
    }),
};
