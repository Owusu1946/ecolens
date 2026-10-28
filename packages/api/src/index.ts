import { ORPCError, os } from "@orpc/server";

import { hasPermission, type Permission, parseClerkRole, type Role } from "./auth/roles";
import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.auth?.userId) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      auth: context.auth,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

// Who is acting: the signed-in user, the institution (Clerk organization) they
// are acting for, and their role there. Every audited write records this.
export type Actor = {
  userId: string;
  orgId: string;
  role: Role;
};

const requireMember = o.middleware(async ({ context, next }) => {
  const userId = context.auth?.userId;
  if (!userId) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const orgId = context.auth?.orgId;
  const role = parseClerkRole(context.auth?.orgRole);
  if (!orgId || !role) {
    throw new ORPCError("FORBIDDEN", {
      message: "Select an institution you belong to before continuing.",
    });
  }
  const actor: Actor = { userId, orgId, role };
  return next({ context: { actor } });
});

// Signed in and acting for an institution with a known role.
export const memberProcedure = publicProcedure.use(requireMember);

// Signed in, acting for an institution, and the role grants every permission listed.
export function authorizedProcedure(...permissions: [Permission, ...Permission[]]) {
  return memberProcedure.use(async ({ context, next }) => {
    const missing = permissions.filter((p) => !hasPermission(context.actor.role, p));
    if (missing.length > 0) {
      throw new ORPCError("FORBIDDEN", {
        message: "Your role does not allow this action.",
        data: { missing },
      });
    }
    return next();
  });
}
