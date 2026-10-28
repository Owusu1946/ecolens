import { dashboardFor, ROLE_LABELS, ROLE_PERMISSIONS } from "../../auth/roles";
import { memberProcedure } from "../../index";

export const sessionRouter = {
  // Who the caller is acting as and what they may do. The web app uses this to
  // pick the dashboard and hide actions the role cannot take; the API still
  // enforces every permission on its own.
  me: memberProcedure.handler(({ context }) => {
    const { actor } = context;
    return {
      userId: actor.userId,
      orgId: actor.orgId,
      role: actor.role,
      roleLabel: ROLE_LABELS[actor.role],
      permissions: ROLE_PERMISSIONS[actor.role],
      dashboard: dashboardFor(actor.role, null),
    };
  }),
};
