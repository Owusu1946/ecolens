// A minimal promise wrapper over one IndexedDB database. Two stores:
//   kv     – string keys to structured values (the persisted query cache)
//   outbox – queued writes, keyed by their client-generated id
// Kept dependency-free on purpose; the surface we need is small.

const DB_NAME = "ecolens";
const DB_VERSION = 1;
export const KV = "kv";
export const OUTBOX = "outbox";
type Store = typeof KV | typeof OUTBOX;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function run<T>(
  store: Store,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = action(tx.objectStore(store));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const idb = {
  get: <T>(store: Store, key: IDBValidKey) =>
    run<T | undefined>(store, "readonly", (s) => s.get(key)),
  getAll: <T>(store: Store) => run<T[]>(store, "readonly", (s) => s.getAll()),
  keys: (store: Store) => run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()),
  put: (store: Store, value: unknown, key?: IDBValidKey) =>
    run(store, "readwrite", (s) => s.put(value, key)),
  delete: (store: Store, key: IDBValidKey) => run(store, "readwrite", (s) => s.delete(key)),
};
