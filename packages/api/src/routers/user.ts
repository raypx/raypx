import { count, db } from "@raypx/database";
import { user } from "@raypx/database/schemas";

import { publicProcedure } from "../middleware";

export const userRouter = {
  getAll: publicProcedure.handler(async () => {
    return await db.select().from(user);
  }),
  getCount: publicProcedure.handler(async () => {
    const result = await db.select({ count: count() }).from(user);
    return result[0]?.count ?? 0;
  }),
  all: publicProcedure.handler(async () => {
    return await db.select().from(user);
  }),
};
