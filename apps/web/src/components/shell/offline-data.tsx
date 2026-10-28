"use client";

import { useAuth } from "@clerk/nextjs";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect, useMemo, useState } from "react";

import { useOnline } from "@/hooks/use-network";
import { outbox } from "@/lib/offline/outbox";
import {
  createPersister,
  deleteSavedQueries,
  MAX_AGE,
  readLastUser,
  rememberUser,
} from "@/lib/offline/query-cache";
import { client, getQueryClient } from "@/utils/orpc";

// Bump when a change to cached data shapes means old saved data must be dropped.
const CACHE_VERSION = "v1";
const SYNC_INTERVAL_MS = 30_000;

/**
 * The signed-in user whose data the app shows. Falls back to the last user on
 * this device while Clerk is loading or the network is down, so the app opens
 * with saved data instead of waiting on the connection.
 */
export function useDataUser() {
  const { isLoaded, userId } = useAuth();
  const online = useOnline();
  const [lastUser] = useState(readLastUser);
  if (userId) return userId;
  return isLoaded && online ? null : lastUser;
}

type Procedure = (input: unknown) => Promise<unknown>;

function resolveProcedure(path: string[]): Procedure {
  const target = path.reduce<unknown>(
    (node, key) => (node as Record<string, unknown> | undefined)?.[key],
    client,
  );
  if (typeof target !== "function") throw new Error(`Unknown procedure: ${path.join(".")}`);
  return target as Procedure;
}

/** Saves the query cache per user and replays queued writes when online. */
export function OfflineData({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const { isLoaded, userId } = useAuth();
  const dataUser = useDataUser();
  const persister = useMemo(() => (dataUser ? createPersister(dataUser) : null), [dataUser]);

  // A different person signed in on this device: drop the previous user's saved data.
  useEffect(() => {
    if (!isLoaded || !userId) return;
    if (readLastUser() !== userId) void deleteSavedQueries(userId);
    rememberUser(userId);
  }, [isLoaded, userId]);

  // Writes are only sent with the session of the user who made them.
  useEffect(() => {
    if (!userId) return;
    outbox.setSender({
      userId,
      send: (path, input) => resolveProcedure(path)(input),
      onSynced: () => void queryClient.invalidateQueries(),
    });
    const drain = () => void outbox.drain();
    const onVisible = () => document.visibilityState === "visible" && drain();
    window.addEventListener("online", drain);
    window.addEventListener("focus", drain);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(drain, SYNC_INTERVAL_MS);
    return () => {
      outbox.setSender(null);
      window.removeEventListener("online", drain);
      window.removeEventListener("focus", drain);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [userId, queryClient]);

  if (!dataUser || !persister) return children;

  return (
    <PersistQueryClientProvider
      key={dataUser}
      client={queryClient}
      persistOptions={{ persister, maxAge: MAX_AGE, buster: CACHE_VERSION }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
