import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const publicProcedure = os.$context<Context>();

const requireAuth = publicProcedure.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);
