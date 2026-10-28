import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../../index";

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
};
export type V1Router = typeof v1Router;
export type V1RouterClient = RouterClient<typeof v1Router>;
