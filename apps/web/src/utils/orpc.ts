import type { V1RouterClient } from "@ecolens/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { environmentManager, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getClerkAuthToken } from "@/utils/clerk-auth";

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
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
