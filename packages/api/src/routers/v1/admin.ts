import type { Database } from "@ecolens/db";
import { auditEvents, institutions } from "@ecolens/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, gte, like, lte, type SQL } from "drizzle-orm";
import { z } from "zod";

import { parseClerkRole, ROLE_LABELS, ROLES, type Role } from "../../auth/roles";
import type { Context } from "../../context";
import { type Actor, authorizedProcedure } from "../../index";
import { institutionNames } from "./shared";

// Platform management (brief section 8) and the audit trail (principle 5).
// Access is by institutional invitation only: administrators invite people to
// an existing institution with a role; institutions are never created here.
// Every membership change is itself audited against the institution.

function directoryOf(ctx: Context) {
  if (!ctx.directory) {
    throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Member management isn't available." });
  }
  return ctx.directory;
}

async function institutionById(db: Database, id: string) {
  const [row] = await db.select().from(institutions).where(eq(institutions.id, id));
  if (!row?.clerkOrgId) throw new ORPCError("NOT_FOUND", { message: "Institution not found." });
  return row as typeof row & { clerkOrgId: string };
}

async function auditMember(
  db: Database,
  actor: Actor,
  institutionId: string,
  action: string,
  data: Record<string, unknown>,
) {
  await db.insert(auditEvents).values({
    actorUserId: actor.userId,
    actorOrgId: actor.orgId,
    actorRole: actor.role,
    action,
    entityType: "institution",
    entityId: institutionId,
    data,
  });
}

const roleInput = z.enum(ROLES);

export const adminRouter = {
  // Institutions with their members and pending invitations.
  institutions: authorizedProcedure("member:manage").handler(async ({ context }) => {
    const directory = directoryOf(context);
    const rows = await context.db.select().from(institutions).orderBy(asc(institutions.name));
    return Promise.all(
      rows.map(async (i) => {
        const [members, invitations] = i.clerkOrgId
          ? await Promise.all([
              directory.members(i.clerkOrgId),
              directory.invitations(i.clerkOrgId),
            ])
          : [[], []];
        const role = (r: string) => parseClerkRole(r) ?? r;
        return {
          id: i.id,
          name: i.name,
          shortName: i.shortName,
          kind: i.kind,
          members: members.map((m) => ({ ...m, role: role(m.role) })),
          invitations: invitations.map((v) => ({ ...v, role: role(v.role) })),
        };
      }),
    );
  }),

  invite: authorizedProcedure("member:manage")
    .input(
      z.object({
        institutionId: z.uuid(),
        email: z.email(),
        role: roleInput,
      }),
    )
    .handler(async ({ input, context }) => {
      const directory = directoryOf(context);
      const inst = await institutionById(context.db, input.institutionId);
      const invitation = await directory.invite(
        inst.clerkOrgId,
        input.email.toLowerCase(),
        `org:${input.role}`,
        context.actor.userId,
      );
      await auditMember(context.db, context.actor, inst.id, "member.invite", {
        email: input.email.toLowerCase(),
        role: input.role,
      });
      return invitation;
    }),

  revokeInvitation: authorizedProcedure("member:manage")
    .input(
      z.object({ institutionId: z.uuid(), invitationId: z.string().min(1), email: z.string() }),
    )
    .handler(async ({ input, context }) => {
      const directory = directoryOf(context);
      const inst = await institutionById(context.db, input.institutionId);
      await directory.revokeInvitation(inst.clerkOrgId, input.invitationId, context.actor.userId);
      await auditMember(context.db, context.actor, inst.id, "member.revoke_invitation", {
        email: input.email,
      });
      return { revoked: true };
    }),

  setRole: authorizedProcedure("member:manage")
    .input(
      z.object({
        institutionId: z.uuid(),
        userId: z.string().min(1),
        role: roleInput,
        reason: z.string().trim().min(10, "Say why the role is changing.").max(1000),
      }),
    )
    .handler(async ({ input, context }) => {
      if (input.userId === context.actor.userId) {
        throw new ORPCError("FORBIDDEN", { message: "You can't change your own role." });
      }
      const directory = directoryOf(context);
      const inst = await institutionById(context.db, input.institutionId);
      await directory.setRole(inst.clerkOrgId, input.userId, `org:${input.role}`);
      await auditMember(context.db, context.actor, inst.id, "member.set_role", {
        userId: input.userId,
        role: input.role,
        reason: input.reason,
      });
      return { role: input.role };
    }),

  remove: authorizedProcedure("member:manage")
    .input(
      z.object({
        institutionId: z.uuid(),
        userId: z.string().min(1),
        reason: z.string().trim().min(10, "Say why access is being removed.").max(1000),
      }),
    )
    .handler(async ({ input, context }) => {
      if (input.userId === context.actor.userId) {
        throw new ORPCError("FORBIDDEN", { message: "You can't remove yourself." });
      }
      const directory = directoryOf(context);
      const inst = await institutionById(context.db, input.institutionId);
      await directory.remove(inst.clerkOrgId, input.userId);
      await auditMember(context.db, context.actor, inst.id, "member.remove", {
        userId: input.userId,
        reason: input.reason,
      });
      return { removed: true };
    }),
};

// The audit trail, read-only for roles with `audit:read` (regulators,
// leadership, evaluators, administrators).
export const auditRouter = {
  list: authorizedProcedure("audit:read")
    .input(
      z.object({
        entityType: z
          .enum(["alert", "incident", "field_report", "report", "institution"])
          .optional(),
        action: z.string().max(60).optional(),
        actorRole: z.enum(ROLES).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(200).default(50),
      }),
    )
    .handler(async ({ input, context: { db } }) => {
      const filters: (SQL | undefined)[] = [
        input.entityType ? eq(auditEvents.entityType, input.entityType) : undefined,
        input.action ? like(auditEvents.action, `${input.action}%`) : undefined,
        input.actorRole ? eq(auditEvents.actorRole, input.actorRole) : undefined,
        input.from ? gte(auditEvents.occurredAt, new Date(`${input.from}T00:00:00Z`)) : undefined,
        input.to ? lte(auditEvents.occurredAt, new Date(`${input.to}T23:59:59Z`)) : undefined,
      ];
      const where = and(...filters);
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(auditEvents)
          .where(where)
          .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
          .limit(input.pageSize + 1)
          .offset(input.page * input.pageSize),
        db.select({ n: count() }).from(auditEvents).where(where),
      ]);
      const items = rows.slice(0, input.pageSize);
      const names = await institutionNames(
        db,
        items.map((r) => r.actorOrgId),
      );
      return {
        items: items.map(({ clientMutationId: _c, actorUserId, ...r }) => ({
          ...r,
          occurredAt: r.occurredAt.toISOString(),
          // The system and people are told apart; people are named by role and institution.
          actor: actorUserId.startsWith("system:") ? "Automated analysis" : null,
          institution: names.get(r.actorOrgId) ?? null,
          roleLabel: ROLE_LABELS[r.actorRole as Role] ?? r.actorRole,
        })),
        hasMore: rows.length > input.pageSize,
        total: totals[0]?.n ?? 0,
      };
    }),
};
