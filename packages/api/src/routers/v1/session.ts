import { dashboardFor, ROLE_LABELS, ROLE_PERMISSIONS } from "../../auth/roles";
import { memberProcedure } from "../../index";

export const sessionRouter = {
  // Who the caller is acting as and what they may do. The web app uses this to
  // pick the dashboard and hide actions the role cannot take; the API still
  // enforces every permission on its own.
  me: memberProcedure.handler(async ({ context }) => {
    const { actor } = context;
    const institution = await context.db.query.institutions.findFirst({
      where: { clerkOrgId: actor.orgId },
      columns: { id: true, name: true, shortName: true, kind: true },
    });
    return {
      userId: actor.userId,
      orgId: actor.orgId,
      institution: institution ?? null,
      role: actor.role,
      roleLabel: ROLE_LABELS[actor.role],
      permissions: ROLE_PERMISSIONS[actor.role],
      dashboard: dashboardFor(actor.role, institution?.kind ?? null),
    };
  }),
};
