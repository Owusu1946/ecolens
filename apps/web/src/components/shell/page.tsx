"use client";

import type { Permission } from "@ecolens/api/auth/roles";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@ecolens/ui/components/empty";
import { Lock } from "lucide-react";

import type { Stage } from "@/lib/navigation";

import { useMe } from "./use-me";

export function PageHeader({
  title,
  stage,
  description,
  children,
}: {
  title: string;
  stage?: Stage | null;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b px-4 py-6 sm:px-6 lg:px-8">
      <div className="min-w-0">
        {stage && (
          <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
            {stage}
          </p>
        )}
        <h1 className="text-xl font-medium tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Shows the page only if the role holds `permission`. A convenience for the
 * interface; the API refuses the underlying data on its own.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  const me = useMe();
  if (me.data && !me.data.permissions.includes(permission)) {
    return (
      <Empty className="m-4 border border-dashed sm:m-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Lock />
          </EmptyMedia>
          <EmptyTitle>Not part of your role</EmptyTitle>
          <EmptyDescription>
            As {me.data.roleLabel.toLowerCase()} at{" "}
            {me.data.institution?.shortName ?? "your institution"}, you don't have access to this
            section. Ask your administrator if you need it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return children;
}

/** A section of the shell whose screens are still being built. */
export function PlannedSection({
  title,
  stage,
  permission,
  description,
  plan,
}: {
  title: string;
  stage: Stage | null;
  permission: Permission;
  description: string;
  plan: string[];
}) {
  return (
    <RequirePermission permission={permission}>
      <PageHeader title={title} stage={stage} description={description} />
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-2xl border border-dashed p-5">
          <p className="text-sm font-medium">Coming in a later build</p>
          <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-4 text-sm">
            {plan.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </RequirePermission>
  );
}
