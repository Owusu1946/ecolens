import { useEffect, useSyncExternalStore } from "react";

import { getClerkAuthToken } from "@/utils/clerk-auth";
import { getQueryClient, orpc } from "@/utils/orpc";

// Real-time updates (brief section 11). The server names the topics a write
// changed; this refreshes the matching cached queries so every open screen
// shows it without a reload. Messages carry no data: refetches go through the
// API, which applies the person's permissions. After any reconnect everything
// is refreshed, so nothing missed while offline is lost.

type Topic =
  | "alerts"
  | "incidents"
  | "fieldReports"
  | "reports"
  | "dashboard"
  | "audit"
  | "admin"
  | "ingest";

const KEYS: Record<Topic, readonly unknown[][]> = {
  alerts: [orpc.alerts.key(), orpc.map.key()],
  incidents: [orpc.incidents.key()],
  fieldReports: [orpc.fieldReports.key()],
  reports: [orpc.reports.key()],
  dashboard: [orpc.dashboard.key()],
  audit: [orpc.audit.key()],
  admin: [orpc.admin.key()],
  ingest: [orpc.ingest.key()],
};

const BATCH_MS = 300;
const MAX_BACKOFF_MS = 60_000;
const PING_MS = 25_000;

let connected = false;
const listeners = new Set<() => void>();
function setConnected(next: boolean) {
  if (connected === next) return;
  connected = next;
  for (const l of listeners) l();
}

/** Whether live updates are flowing right now. */
export function useRealtimeConnected() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => connected,
    () => false,
  );
}

/** Keep a live connection while `enabled` (signed in, with an institution, online). */
export function useRealtime(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const queryClient = getQueryClient();
    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let flush: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<Topic>();

    const refresh = () => {
      for (const topic of pending) {
        for (const queryKey of KEYS[topic] ?? []) void queryClient.invalidateQueries({ queryKey });
      }
      pending.clear();
    };

    async function open() {
      const token = await getClerkAuthToken();
      if (stopped || !token) return schedule();
      const base = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "") ?? "";
      const url = `${base.replace(/^http/, "ws")}/v1/realtime?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(url);
      socket.onopen = () => {
        // Catch up on anything missed while disconnected.
        if (attempt > 0) void queryClient.invalidateQueries();
        attempt = 0;
        setConnected(true);
        ping = setInterval(
          () => socket?.readyState === WebSocket.OPEN && socket.send("ping"),
          PING_MS,
        );
      };
      socket.onmessage = (event) => {
        if (event.data === "pong") return;
        try {
          const message = JSON.parse(String(event.data)) as { type: string; topics?: Topic[] };
          if (message.type !== "changed") return;
          for (const t of message.topics ?? []) pending.add(t);
          clearTimeout(flush);
          flush = setTimeout(refresh, BATCH_MS);
        } catch {
          // Ignore anything that isn't ours.
        }
      };
      socket.onclose = () => {
        clearInterval(ping);
        setConnected(false);
        socket = null;
        schedule();
      };
    }

    function schedule() {
      if (stopped) return;
      attempt += 1;
      const delay =
        Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt, 6)) * (0.5 + Math.random() / 2);
      retry = setTimeout(() => void open(), delay);
    }

    void open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(flush);
      clearInterval(ping);
      socket?.close();
      setConnected(false);
    };
  }, [enabled]);
}
