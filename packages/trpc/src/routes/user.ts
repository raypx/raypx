import { db } from "@raypx/db"
import { TRPCError, type TRPCRouterRecord } from "@trpc/server"

import { protectedProcedure } from "../trpc"

export const userRouter = {
  all: protectedProcedure.query(async ({ ctx }) => {
    try {
      console.log(ctx.session)
      const user = await db.query.user.findMany()
      return user
    } catch (error) {
      console.error(error)
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    }
  }),
} satisfies TRPCRouterRecord
