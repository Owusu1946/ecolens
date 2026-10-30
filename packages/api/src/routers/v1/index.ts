import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../../index";
import { adminRouter, auditRouter } from "./admin";
import { alertsRouter } from "./alerts";
import { dashboardRouter } from "./dashboard";
import { fieldReportsRouter } from "./field-reports";
import { incidentsRouter } from "./incidents";
import { ingestRouter } from "./ingest";
import { mapRouter } from "./map";
import { reportsRouter } from "./reports";
import { sessionRouter } from "./session";

export const v1Router = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      userId: context.auth?.userId,
    };
  }),
  session: sessionRouter,
  map: mapRouter,
  alerts: alertsRouter,
  incidents: incidentsRouter,
  fieldReports: fieldReportsRouter,
  reports: reportsRouter,
  dashboard: dashboardRouter,
  ingest: ingestRouter,
  admin: adminRouter,
  audit: auditRouter,
};
export type V1Router = typeof v1Router;
export type V1RouterClient = RouterClient<typeof v1Router>;
