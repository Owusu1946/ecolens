"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/**
 * Who the caller is acting as: institution, role, permissions and dashboard,
 * as decided by the API. Saved with the rest of the query cache, so the shell
 * knows the role offline; it is refreshed whenever Clerk has a session.
 */
export function useMe() {
  const { isLoaded, isSignedIn, orgId } = useAuth();
  return useQuery({
    ...orpc.session.me.queryOptions(),
    enabled: isLoaded && !!isSignedIn && !!orgId,
  });
}
