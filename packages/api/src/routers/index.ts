import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../middleware";
import { storageRouter } from "./storage";
import { userRouter } from "./user";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  users: userRouter,
  storage: storageRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
