import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

import { idb, KV } from "./idb";

// The query cache is saved to IndexedDB per signed-in user so every screen
// opens with the last data it had, even with no connection (docs/stack.md,
// "Offline-first"). Entries never outlive MAX_AGE, and the cache is deleted on
// sign-out and when a different user signs in on the same device.

export const MAX_AGE = 1000 * 60 * 60 * 24 * 7;
const PREFIX = "query-cache:";
const LAST_USER = "ecolens:last-user";

const storage = {
  getItem: (key: string) => idb.get<string>(KV, key).then((v) => v ?? null),
  setItem: (key: string, value: string) => idb.put(KV, value, key).then(() => undefined),
  removeItem: (key: string) => idb.delete(KV, key).then(() => undefined),
};

export function createPersister(userId: string) {
  return createAsyncStoragePersister({ storage, key: `${PREFIX}${userId}`, throttleTime: 1000 });
}

/** The user whose data this device last held; used until Clerk has loaded (or while offline). */
export function readLastUser(): string | null {
  try {
    return localStorage.getItem(LAST_USER);
  } catch {
    return null;
  }
}

export function rememberUser(userId: string) {
  try {
    localStorage.setItem(LAST_USER, userId);
  } catch {
    // Storage unavailable (private mode): persistence still works for this session.
  }
}

/** Delete saved query data, keeping only `keepUserId`'s (if given). */
export async function deleteSavedQueries(keepUserId?: string) {
  const keys = await idb.keys(KV);
  await Promise.all(
    keys
      .filter(
        (k) => typeof k === "string" && k.startsWith(PREFIX) && k !== `${PREFIX}${keepUserId}`,
      )
      .map((k) => idb.delete(KV, k)),
  );
  if (!keepUserId) {
    try {
      localStorage.removeItem(LAST_USER);
    } catch {
      // ignore
    }
  }
}
