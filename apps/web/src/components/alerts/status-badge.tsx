import { ALERT_STATUS } from "@/components/map/config";

import type { AlertStatus } from "./use-alert-writes";

export function StatusBadge({ status }: { status: AlertStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 border px-1.5 py-0.5">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: ALERT_STATUS[status].color }}
      />
      {ALERT_STATUS[status].label}
    </span>
  );
}
