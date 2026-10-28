import type { Context as ApiContext } from "@ecolens/api/context";

import { getDb } from "./services";

type ClerkContextAuth = ApiContext["auth"];

function toClerkContextAuth(auth: ClerkContextAuth): ClerkContextAuth {
  return auth ? { userId: auth.userId } : null;
}

import { createClerkClient } from "@clerk/backend";

import { ENV } from "./env.server";

const clerkClient = createClerkClient({
  secretKey: ENV.CLERK_SECRET_KEY,
  publishableKey: ENV.CLERK_PUBLISHABLE_KEY,
});

async function authenticateClerkRequest(request: Request): Promise<ClerkContextAuth> {
  const requestState = await clerkClient.authenticateRequest(request, {
    authorizedParties: [ENV.CORS_ORIGIN],
  });
  return toClerkContextAuth(requestState.toAuth());
}

import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions): Promise<ApiContext> {
  const db = await getDb();
  const clerkAuth = await authenticateClerkRequest(context.req.raw);
  return {
    db,
    auth: clerkAuth,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
