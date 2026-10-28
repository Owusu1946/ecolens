"use client";

import { useUser } from "@clerk/nextjs";
import { Button } from "@ecolens/ui/components/button";
import { Skeleton } from "@ecolens/ui/components/skeleton";

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
// from (institution, role). Widgets arrive with the features that feed them;
// until then each dashboard states what it is for.
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
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-2xl border p-5">
          <p className="text-sm">{dashboard.purpose}</p>
          <p className="text-muted-foreground mt-4 text-xs font-medium tracking-wide uppercase">
            This dashboard will show
          </p>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1.5 pl-4 text-sm">
            {dashboard.focus.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
