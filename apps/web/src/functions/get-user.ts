import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "~/middlewares/auth";

export const getUser = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return context.session;
  });
