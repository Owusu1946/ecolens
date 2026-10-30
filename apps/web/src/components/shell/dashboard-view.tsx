"use client";

import { useUser } from "@clerk/nextjs";
import type { Dashboard, Permission } from "@ecolens/api/auth/roles";
import { Button } from "@ecolens/ui/components/button";
import { Skeleton } from "@ecolens/ui/components/skeleton";
import {
  ActivityPanel,
  AlertsPanel,
  BasinsPanel,
  ConcessionsPanel,
  FieldPanel,
  IncidentsPanel,
  MeasuresPanel,
  RiversPanel,
  RulesPanel,
  SourcesPanel,
  WaitingPanel,
} from "@/components/dashboard/panels";
import { useOnline } from "@/hooks/use-network";
import { DASHBOARDS } from "@/lib/navigation";

import { PageHeader } from "./page";
import { useMe } from "./use-me";

const time = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// The overview routes each person to their role dashboard, picked by the API
// from (institution, role), and composes the widgets that role needs.
export function DashboardView() {
  const me = useMe();
  const { user } = useUser();
  const online = useOnline();

  if (!me.data) {
    if (me.isError) {
      return (
        <div className="px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-sm font-medium">Couldn't load your workspace</p>
          <p className="text-muted-foreground mt-1 text-sm">{me.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void me.refetch()}>
            Try again
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-3 px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
    );
  }

  const dashboard = DASHBOARDS[me.data.dashboard];
  const firstName = user?.firstName;

  return (
    <>
      <PageHeader
        title={dashboard.title}
        description={
          <>
            {firstName ? `Welcome, ${firstName}. ` : ""}
            Acting for {me.data.institution?.name ?? "your institution"} as{" "}
            {me.data.roleLabel.toLowerCase()}.
          </>
        }
      >
        <p className="text-muted-foreground text-xs">
          {online ? "Updated " : "Offline · saved "}
          {time.format(me.dataUpdatedAt)}
        </p>
      </PageHeader>
      <div className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-muted-foreground max-w-3xl text-sm text-pretty">{dashboard.purpose}</p>
        <Widgets dashboard={me.data.dashboard} permissions={me.data.permissions} />
      </div>
    </>
  );
}

// Each dashboard is composed of the same widgets, in the order its role needs
// them (brief section 11). Widgets the role can't read are left out; the API
// enforces the same rule.
function Widgets({
  dashboard,
  permissions,
}: {
  dashboard: Dashboard;
  permissions: readonly Permission[];
}) {
  const can = (p: Permission) => permissions.includes(p);
  const grid = "grid gap-4 xl:grid-cols-2";

  switch (dashboard) {
    case "leadership":
      return (
        <>
          {can("metrics:read") && <MeasuresPanel />}
          <div className={grid}>
            <IncidentsPanel />
            <AlertsPanel />
            <ConcessionsPanel />
            <RulesPanel />
          </div>
        </>
      );
    case "epa":
      return (
        <>
          <div className={grid}>
            <AlertsPanel title="Alerts for review" />
            <IncidentsPanel title="Incidents EPA leads or acts on" mine />
            <BasinsPanel />
            <ConcessionsPanel />
          </div>
          {can("metrics:read") && <MeasuresPanel />}
        </>
      );
    case "minerals_commission":
      return (
        <>
          <div className={grid}>
            <ConcessionsPanel />
            <AlertsPanel title="Land and forest alerts" lens="forest_land" />
            <IncidentsPanel title="Incidents referred to the Commission" mine />
            <IncidentsPanel title="Mining-related incidents across the pilot" lens="forest_land" />
          </div>
          {can("metrics:read") && <MeasuresPanel />}
        </>
      );
    case "water_resources_commission":
      return (
        <>
          <div className={grid}>
            <RiversPanel />
            <AlertsPanel title="Water alerts" lens="water" />
            <IncidentsPanel title="Incidents affecting water resources" lens="water" />
            <BasinsPanel />
          </div>
          {can("metrics:read") && <MeasuresPanel />}
        </>
      );
    case "analyst":
      return (
        <div className={grid}>
          <WaitingPanel />
          <AlertsPanel />
          <RulesPanel />
          <SourcesPanel />
        </div>
      );
    case "field":
      return (
        <div className={grid}>
          <FieldPanel />
          <AlertsPanel title="Alerts in the pilot area" />
        </div>
      );
    case "responder":
      return (
        <div className={grid}>
          <IncidentsPanel title="Your assembly's cases" mine />
          <RiversPanel />
        </div>
      );
    case "admin":
      return (
        <>
          <div className={grid}>
            <SourcesPanel />
            {can("audit:read") && <ActivityPanel />}
            <RulesPanel />
            <IncidentsPanel />
          </div>
          {can("metrics:read") && <MeasuresPanel />}
        </>
      );
  }
}
