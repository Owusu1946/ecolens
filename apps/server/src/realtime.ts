import { DurableObject } from "cloudflare:workers";

// Real-time updates (brief section 11; docs/stack.md, "Realtime"). One channel
// for the pilot, holding the open WebSockets with hibernation, so idle
// connections cost nothing. Messages name topics only ("alerts",
// "incidents", ...), never records or ids: clients refetch through the API,
// which applies each person's permissions, so nothing sensitive travels here.

export type Topic =
  | "alerts"
  | "incidents"
  | "fieldReports"
  | "reports"
  | "dashboard"
  | "audit"
  | "admin"
  | "ingest";

export class RealtimeChannel extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the object.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/publish" && request.method === "POST") {
      const { topics } = (await request.json()) as { topics: Topic[] };
      const message = JSON.stringify({ type: "changed", topics, at: Date.now() });
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message);
        } catch {
          // A socket closing mid-send is dropped by the runtime.
        }
      }
      return new Response(null, { status: 204 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage() {
    // Clients only listen; anything other than the auto-answered ping is ignored.
  }

  webSocketClose(socket: WebSocket, code: number) {
    socket.close(code, "closing");
  }
}

const channel = (env: Env) => env.REALTIME.get(env.REALTIME.idFromName("pilot"));

/** Tell connected clients which topics changed. Never throws. */
export async function publish(env: Env, topics: Topic[]) {
  if (topics.length === 0) return;
  try {
    await channel(env).fetch("https://realtime/publish", {
      method: "POST",
      body: JSON.stringify({ topics: [...new Set(topics)] }),
    });
  } catch (error) {
    console.error("realtime publish", error);
  }
}

export const connect = (env: Env, request: Request) => channel(env).fetch(request);

// Which topics a successful write changes, by RPC path (router/procedure).
const WRITES: Record<string, Topic[]> = {
  "alerts/startReview": ["alerts", "dashboard", "audit"],
  "alerts/validate": ["alerts", "fieldReports", "dashboard", "audit"],
  "alerts/requestVerification": ["alerts", "fieldReports", "dashboard", "audit"],
  "incidents/escalate": ["incidents", "alerts", "dashboard", "audit"],
  "incidents/assign": ["incidents", "dashboard", "audit"],
  "incidents/acknowledge": ["incidents", "dashboard", "audit"],
  "incidents/recordAction": ["incidents", "dashboard", "audit"],
  "incidents/close": ["incidents", "dashboard", "audit"],
  "fieldReports/create": ["fieldReports", "alerts", "dashboard", "audit"],
  "fieldReports/uploadPhoto": ["fieldReports"],
  "reports/generate": ["reports", "dashboard", "audit"],
  "reports/publish": ["reports", "audit"],
  "dashboard/feedback": ["dashboard"],
  "ingest/runFirms": ["alerts", "dashboard", "ingest", "audit"],
  "admin/invite": ["admin", "audit"],
  "admin/revokeInvitation": ["admin", "audit"],
  "admin/setRole": ["admin", "audit"],
  "admin/remove": ["admin", "audit"],
};

/** Topics for an RPC request path such as `/v1/rpc/alerts/validate`. */
export function topicsForPath(path: string): Topic[] {
  const match = path.match(/^\/v\d+\/rpc\/(.+)$/);
  return (match && WRITES[match[1] as string]) || [];
}
