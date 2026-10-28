import { useSyncExternalStore } from "react";

import { idb, OUTBOX } from "./idb";

// Outbox for writes (docs/stack.md, "Offline-first"). Every workflow action
// (validate, escalate, assign, record action, field report) is saved on the
// device first, shown as pending, and sent in order once there is a
// connection. Each item carries a client-generated id that is also sent as
// `clientMutationId`, so a replay after a dropped response is idempotent on the
// server. The server stays authoritative: a write it rejects (e.g. the alert
// was already closed by someone else) is kept as "failed" with the reason, so
// the user sees it instead of losing it silently.

export type OutboxStatus = "pending" | "syncing" | "failed";

export type OutboxItem = {
  id: string;
  /** Whose write this is; only that user's session may send it. */
  userId: string;
  /** Procedure path in the v1 router, e.g. ["alerts", "validate"]. */
  path: string[];
  input: Record<string, unknown>;
  /** Human-readable description for the sync panel, e.g. "Validate alert WR-0142". */
  label: string;
  createdAt: number;
  attempts: number;
  status: OutboxStatus;
  error?: string;
};

type Sender = {
  userId: string;
  send: (path: string[], input: unknown) => Promise<unknown>;
  onSynced?: (item: OutboxItem) => void;
};

let items: OutboxItem[] = [];
let loaded: Promise<void> | null = null;
let sender: Sender | null = null;
let draining = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit(next: OutboxItem[]) {
  items = next;
  for (const l of listeners) l();
}

function load() {
  loaded ??= idb
    .getAll<OutboxItem>(OUTBOX)
    .then((stored) =>
      // Anything left "syncing" by a closed tab is retried.
      emit(
        stored
          .map((i) => (i.status === "syncing" ? { ...i, status: "pending" as const } : i))
          .sort((a, b) => a.createdAt - b.createdAt),
      ),
    )
    .catch(() => undefined);
  return loaded;
}

async function save(item: OutboxItem) {
  emit(
    items.some((i) => i.id === item.id)
      ? items.map((i) => (i.id === item.id ? item : i))
      : [...items, item],
  );
  await idb.put(OUTBOX, item);
}

async function remove(id: string) {
  emit(items.filter((i) => i.id !== id));
  await idb.delete(OUTBOX, id);
}

/** Network trouble or a server fault: worth retrying later. Anything else is a rejection. */
function isRetryable(error: unknown) {
  if (error instanceof TypeError) return true; // fetch failed
  const status = (error as { status?: number } | null)?.status;
  return status === undefined || status >= 500 || status === 408 || status === 429;
}

export const outbox = {
  /** Queue a write. Returns its id, which is also sent as `clientMutationId`. */
  async enqueue(userId: string, path: string[], input: Record<string, unknown>, label: string) {
    await load();
    const id = crypto.randomUUID();
    await save({
      id,
      userId,
      path,
      input: { ...input, clientMutationId: id },
      label,
      createdAt: Date.now(),
      attempts: 0,
      status: "pending",
    });
    void outbox.drain();
    return id;
  },

  /** Send pending items for the current user, oldest first. Safe to call often. */
  async drain() {
    await load();
    if (draining || !sender || !navigator.onLine) return;
    draining = true;
    clearTimeout(retryTimer);
    const current = sender;
    try {
      for (const item of items.filter(
        (i) => i.userId === current.userId && i.status === "pending",
      )) {
        await save({ ...item, status: "syncing" });
        try {
          await current.send(item.path, item.input);
          await remove(item.id);
          current.onSynced?.(item);
        } catch (error) {
          const attempts = item.attempts + 1;
          if (isRetryable(error)) {
            await save({ ...item, status: "pending", attempts });
            retryTimer = setTimeout(
              () => void outbox.drain(),
              Math.min(60_000, 1000 * 2 ** attempts),
            );
            break;
          }
          await save({
            ...item,
            status: "failed",
            attempts,
            error: error instanceof Error ? error.message : "The server rejected this change.",
          });
        }
      }
    } finally {
      draining = false;
    }
  },

  async retry(id: string) {
    const item = items.find((i) => i.id === id);
    if (item) await save({ ...item, status: "pending", error: undefined });
    void outbox.drain();
  },

  discard: (id: string) => remove(id),

  /** Remove every queued write belonging to a user (e.g. on sign-out). */
  async discardUser(userId: string) {
    await load();
    await Promise.all(items.filter((i) => i.userId === userId).map((i) => remove(i.id)));
  },

  /** Wire the outbox to the signed-in user's API client; null when signed out. */
  setSender(next: Sender | null) {
    sender = next;
    if (next) void outbox.drain();
  },
};

function subscribe(listener: () => void) {
  void load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: OutboxItem[] = [];

/** Queued writes for a user, oldest first. */
export function useOutbox(userId: string | null | undefined) {
  const all = useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );
  return userId ? all.filter((i) => i.userId === userId) : EMPTY;
}
