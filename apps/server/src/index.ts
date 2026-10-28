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

import { createContext } from "./context";
import { ENV } from "./env.server";

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

export default app;
