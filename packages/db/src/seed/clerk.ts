import { createClerkClient } from "@clerk/backend";

import { INSTITUTIONS, type InstitutionKey, PEOPLE, type PersonKey } from "./reference";

export type ClerkIds = {
  orgs: Record<InstitutionKey, string>;
  users: Record<PersonKey, string>;
};

// Creates (or finds) one Clerk organization per institution and one demo user
// per role, and makes sure each user holds the right role. Safe to re-run.
export async function seedClerk(secretKey: string): Promise<ClerkIds> {
  const clerk = createClerkClient({ secretKey });

  const orgs = {} as Record<InstitutionKey, string>;
  for (const [key, inst] of Object.entries(INSTITUTIONS) as [
    InstitutionKey,
    (typeof INSTITUTIONS)[InstitutionKey],
  ][]) {
    const existing = await clerk.organizations.getOrganizationList({
      query: inst.name,
      limit: 10,
    });
    const found = existing.data.find((o) => o.name === inst.name);
    const org =
      found ??
      (await clerk.organizations.createOrganization({
        name: inst.name,
        publicMetadata: { institutionKind: inst.kind, shortName: inst.shortName, seed: true },
      }));
    orgs[key] = org.id;
    console.log(`  org   ${found ? "exists " : "created"} ${inst.name}`);
  }

  const users = {} as Record<PersonKey, string>;
  for (const [key, p] of Object.entries(PEOPLE) as [PersonKey, (typeof PEOPLE)[PersonKey]][]) {
    const existing = await clerk.users.getUserList({ emailAddress: [p.email] });
    const user =
      existing.data[0] ??
      (await clerk.users.createUser({
        emailAddress: [p.email],
        firstName: p.firstName,
        lastName: p.lastName,
        skipPasswordRequirement: true,
        publicMetadata: { seed: true },
      }));
    users[key] = user.id;

    const orgId = orgs[p.institution];
    const role = `org:${p.role}`;
    const memberships = await clerk.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      userId: [user.id],
    });
    const membership = memberships.data[0];
    if (!membership) {
      await clerk.organizations.createOrganizationMembership({
        organizationId: orgId,
        userId: user.id,
        role,
      });
    } else if (membership.role !== role) {
      await clerk.organizations.updateOrganizationMembership({
        organizationId: orgId,
        userId: user.id,
        role,
      });
    }
    console.log(
      `  user  ${existing.data[0] ? "exists " : "created"} ${p.firstName} ${p.lastName} → ${INSTITUTIONS[p.institution].shortName} (${role})`,
    );
  }

  return { orgs, users };
}
