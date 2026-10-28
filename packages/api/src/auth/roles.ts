// Role-based access for Ecolens (brief section 8, principle 6).
//
// Clerk Organizations model institutions (EPA, Minerals Commission, WRC, a
// district assembly, ...) and each membership carries one of the roles below.
// Clerk only says *who* someone is and *which role* they hold; *what a role may
// do* is defined here, in code, so every change to access rules is reviewed and
// versioned. This module has no runtime dependencies so the web app can import
// it to shape navigation and hide actions a user cannot take.

export const ROLES = [
  "admin",
  "leadership",
  "regulator",
  "data_steward",
  "analyst",
  "field_officer",
  "responder",
  "viewer",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Platform admin",
  leadership: "Leadership",
  regulator: "Regulator",
  data_steward: "Data steward",
  analyst: "Analyst / Reviewer",
  field_officer: "Field officer",
  responder: "Responder",
  viewer: "Viewer",
};

export const PERMISSIONS = [
  // Interpret / Validate
  "alert:read",
  "alert:triage",
  "alert:validate",
  // Escalate
  "incident:read",
  "incident:escalate",
  "incident:assign",
  "incident:act",
  "incident:close",
  // Observe (field)
  "field_report:read",
  "field_report:create",
  // Report
  "report:read",
  "report:generate",
  "report:publish",
  "metrics:read",
  // Governance
  "sensitive_location:read",
  "data_source:manage",
  "threshold:manage",
  "audit:read",
  "member:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY = ["alert:read", "incident:read", "report:read", "metrics:read"] as const;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  leadership: [
    ...READ_ONLY,
    "field_report:read",
    "report:publish",
    "sensitive_location:read",
    "audit:read",
  ],
  regulator: [
    ...READ_ONLY,
    "alert:triage",
    "alert:validate",
    "incident:escalate",
    "incident:assign",
    "incident:close",
    "field_report:read",
    "report:generate",
    "sensitive_location:read",
    "audit:read",
  ],
  data_steward: [...READ_ONLY, "data_source:manage"],
  analyst: [
    ...READ_ONLY,
    "alert:triage",
    "alert:validate",
    "incident:escalate",
    "field_report:read",
    "report:generate",
    "threshold:manage",
    "sensitive_location:read",
  ],
  field_officer: [
    "alert:read",
    "incident:read",
    "field_report:read",
    "field_report:create",
    "sensitive_location:read",
  ],
  responder: ["alert:read", "incident:read", "incident:act", "field_report:read", "report:read"],
  viewer: READ_ONLY,
};

// Clerk role keys are namespaced ("org:analyst"); ours are bare.
export function parseClerkRole(orgRole: string | null | undefined): Role | null {
  const key = orgRole?.startsWith("org:") ? orgRole.slice(4) : orgRole;
  return (ROLES as readonly string[]).includes(key ?? "") ? (key as Role) : null;
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// Which institution a Clerk organization represents. Stored on our
// `institutions` table, keyed by the Clerk organization id.
export const INSTITUTION_KINDS = [
  "platform",
  "steering",
  "epa",
  "minerals_commission",
  "water_resources_commission",
  "district_assembly",
  "regional_council",
  "research",
  "community",
  "data_provider",
] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

// The eight role dashboards (brief section 11). A dashboard is picked from the
// pair (institution, role): a regulator at EPA and one at the Minerals
// Commission do the same job but watch different things.
export const DASHBOARDS = [
  "leadership",
  "epa",
  "minerals_commission",
  "water_resources_commission",
  "analyst",
  "field",
  "responder",
  "admin",
] as const;
export type Dashboard = (typeof DASHBOARDS)[number];

const INSTITUTION_DASHBOARD: Partial<Record<InstitutionKind, Dashboard>> = {
  epa: "epa",
  minerals_commission: "minerals_commission",
  water_resources_commission: "water_resources_commission",
};

export function dashboardFor(role: Role, institution: InstitutionKind | null): Dashboard {
  switch (role) {
    case "admin":
      return "admin";
    case "analyst":
      return "analyst";
    case "field_officer":
      return "field";
    case "responder":
      return "responder";
    case "regulator":
    case "data_steward":
      return (institution && INSTITUTION_DASHBOARD[institution]) ?? "leadership";
    case "leadership":
    case "viewer":
      return "leadership";
  }
}
