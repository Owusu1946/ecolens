import type { Context as ApiContext } from "@ecolens/api/context";

import { getDb } from "./services";

type ClerkContextAuth = ApiContext["auth"];

function toClerkContextAuth(auth: ClerkContextAuth): ClerkContextAuth {
  return auth ? { userId: auth.userId, orgId: auth.orgId, orgRole: auth.orgRole } : null;
}

import { createClerkClient } from "@clerk/backend";

import { ENV } from "./env.server";

const clerkClient = createClerkClient({
  secretKey: ENV.CLERK_SECRET_KEY,
  publishableKey: ENV.CLERK_PUBLISHABLE_KEY,
});

export async function authenticateClerkRequest(request: Request): Promise<ClerkContextAuth> {
  const requestState = await clerkClient.authenticateRequest(request, {
    authorizedParties: [ENV.CORS_ORIGIN],
  });
  return toClerkContextAuth(requestState.toAuth());
}

import type { Context as HonoContext } from "hono";

// Report PDFs through the Browser Run (formerly Browser Rendering) REST API, when an account and
// token are configured. Without them reports are still generated as HTML.
function pdfRenderer(): ApiContext["renderPdf"] {
  const account = ENV.CLOUDFLARE_ACCOUNT_ID;
  const token = ENV.BROWSER_RENDERING_TOKEN;
  if (!account || !token) return null;
  return async (html) => {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/browser-run/pdf`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          gotoOptions: { waitUntil: "networkidle0", timeout: 30_000 },
          pdfOptions: { format: "a4", printBackground: true, preferCSSPageSize: true },
        }),
      },
    );
    if (!res.ok) throw new Error(`Browser Rendering failed: ${res.status} ${await res.text()}`);
    return res.arrayBuffer();
  };
}

// Institution membership through Clerk Organizations (org = institution).
const directory: ApiContext["directory"] = {
  async members(organizationId) {
    const { data } = await clerkClient.organizations.getOrganizationMembershipList({
      organizationId,
      limit: 200,
    });
    return data.map((m) => ({
      userId: m.publicUserData?.userId ?? "",
      name:
        [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" ") || null,
      email: m.publicUserData?.identifier ?? null,
      role: m.role,
      joinedAt: new Date(m.createdAt).toISOString(),
    }));
  },
  async invitations(organizationId) {
    const { data } = await clerkClient.organizations.getOrganizationInvitationList({
      organizationId,
      status: ["pending"],
      limit: 100,
    });
    return data.map((i) => ({
      id: i.id,
      email: i.emailAddress,
      role: i.role,
      createdAt: new Date(i.createdAt).toISOString(),
    }));
  },
  async invite(organizationId, emailAddress, role, inviterUserId) {
    const invitation = await clerkClient.organizations.createOrganizationInvitation({
      organizationId,
      emailAddress,
      role,
      inviterUserId,
      redirectUrl: `${ENV.CORS_ORIGIN}/sign-in`,
    });
    return { id: invitation.id };
  },
  async revokeInvitation(organizationId, invitationId, requestingUserId) {
    await clerkClient.organizations.revokeOrganizationInvitation({
      organizationId,
      invitationId,
      requestingUserId,
    });
  },
  async setRole(organizationId, userId, role) {
    await clerkClient.organizations.updateOrganizationMembership({ organizationId, userId, role });
  },
  async remove(organizationId, userId) {
    await clerkClient.organizations.deleteOrganizationMembership({ organizationId, userId });
  },
};

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions): Promise<ApiContext> {
  const db = await getDb();
  const clerkAuth = await authenticateClerkRequest(context.req.raw);
  return {
    db,
    auth: clerkAuth,
    photos: ENV.PHOTOS,
    reports: ENV.REPORTS,
    renderPdf: pdfRenderer(),
    firmsMapKey: ENV.FIRMS_MAP_KEY || null,
    directory,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
