import type { V1RouterClient } from "@ecolens/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { environmentManager, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { MAX_AGE } from "@/lib/offline/query-cache";
import { getClerkAuthToken } from "@/utils/clerk-auth";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Kept at least as long as the saved copy, or restored data would be dropped.
        gcTime: MAX_AGE,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Losing the connection is expected; the shell already shows it and the
        // cached data stays on screen.
        if (!navigator.onLine || error instanceof TypeError) return;
        // Only shout when there is nothing on screen to fall back on.
        if (query.state.data !== undefined) return;
        toast.error(error.message, {
          action: { label: "Retry", onClick: () => void query.invalidate() },
        });
      },
    }),
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (environmentManager.isServer()) {
    return createQueryClient();
  }

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

export const link = new RPCLink({
  url: `${process.env.NEXT_PUBLIC_SERVER_URL!.replace(/\/$/, "")}/v1/rpc`,
  headers: async () => {
    if (typeof window !== "undefined") {
      const token = await getClerkAuthToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    }

    const { auth } = await import("@clerk/nextjs/server");
    const clerkAuth = await auth();
    const token = await clerkAuth.getToken();

    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});

export const client: V1RouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
