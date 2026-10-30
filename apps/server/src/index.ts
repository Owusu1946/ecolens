import { runFirms } from "@ecolens/api/ingest/firms";
import { routers } from "@ecolens/api/routers/index";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { initLogger } from "evlog";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { authenticateClerkRequest, createContext } from "./context";
import { ENV } from "./env.server";
import { connect, publish, topicsForPath } from "./realtime";
import { getDb } from "./services";

initLogger({
  env: { service: "ecolens-server" },
});

const app = new Hono<EvlogVariables>();

app.use(evlog());

app.use(
  "/*",
  cors({
    origin: ENV.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

const logError = (error: unknown) => {
  console.error(error);
};

// One RPC handler (web app) and one OpenAPI handler (REST + docs) per API version.
// /v1/rpc/*        typed RPC used by the web app
// /v1/*            REST endpoints; reference docs at /v1, spec at /v1/spec.json
const versions = Object.entries(routers).map(([version, router]) => ({
  prefix: `/${version}` as const,
  rpc: new RPCHandler(router, { interceptors: [onError(logError)] }),
  openapi: new OpenAPIHandler(router, {
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: {
          info: { title: "Ecolens API", version },
        },
      }),
    ],
    interceptors: [onError(logError)],
  }),
}));

// Real-time channel. Browsers can't set headers on a WebSocket, so the Clerk
// session token comes as a query parameter and is checked like a bearer token.
app.get("/v1/realtime", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Unauthorized", 401);
  const auth = await authenticateClerkRequest(
    new Request(c.req.url, { headers: { Authorization: `Bearer ${token}` } }),
  );
  if (!auth?.userId) return c.text("Unauthorized", 401);
  return connect(ENV, c.req.raw);
});

app.use("/*", async (c, next) => {
  const version = versions.find(
    ({ prefix }) => c.req.path === prefix || c.req.path.startsWith(`${prefix}/`),
  );
  if (!version) {
    return next();
  }

  const context = await createContext({ context: c });

  try {
    const rpcResult = await version.rpc.handle(c.req.raw, {
      prefix: `${version.prefix}/rpc`,
      context: context,
    });

    if (rpcResult.matched) {
      // A successful write: tell connected clients what to refresh.
      if (rpcResult.response.ok) {
        c.executionCtx.waitUntil(publish(ENV, topicsForPath(c.req.path)));
      }
      return c.newResponse(rpcResult.response.body, rpcResult.response);
    }

    const apiResult = await version.openapi.handle(c.req.raw, {
      prefix: version.prefix,
      context: context,
    });

    if (apiResult.matched) {
      return c.newResponse(apiResult.response.body, apiResult.response);
    }

    await next();
  } finally {
    c.executionCtx.waitUntil(context.db.$client.end());
  }
});

app.get("/", (c) => {
  return c.text("OK");
});

// Observe → Analyse: the cron enqueues a job per live source; the queue
// consumer runs it, so a failed run is retried and then kept in the DLQ.
type IngestJob = { source: "firms" };

export default {
  fetch: app.fetch,

  async scheduled(_controller: ScheduledController, env: Env) {
    if (env.FIRMS_MAP_KEY) await env.INGEST_QUEUE.send({ source: "firms" } satisfies IngestJob);
  },

  async queue(batch: MessageBatch<IngestJob>, env: Env) {
    for (const message of batch.messages) {
      const db = getDb();
      try {
        if (message.body.source === "firms" && env.FIRMS_MAP_KEY) {
          const result = await runFirms(db, env.FIRMS_MAP_KEY);
          console.log("ingest firms", result);
          if (result.opened || result.extended)
            await publish(env, ["alerts", "dashboard", "audit"]);
        }
        message.ack();
      } catch (error) {
        console.error("ingest failed", message.body, error);
        message.retry({ delaySeconds: 300 });
      } finally {
        await db.$client.end();
      }
    }
  },
} satisfies ExportedHandler<Env, IngestJob>;

export { RealtimeChannel } from "./realtime";
