import { call } from "@orpc/server";
import { expect, it, vi } from "vitest";
import { createAccessPolicy } from "../access.js";
import { createRpcMiddleware } from "./rpc.js";

it("rejects a missing RPC access declaration before reading the session or running the handler", async () => {
  const readSession = vi.fn(async () => null);
  const { os, withRpcPermission, withPublicRpcAccess } = createRpcMiddleware(
    { readSession },
    createAccessPolicy(),
    [],
  );
  const handler = vi.fn();
  const context = { headers: new Headers(), requestId: "missing-policy" };
  const privateProcedure = os.account.access.use(withRpcPermission()).handler(handler);
  const publicProcedure = os.account.access.use(withPublicRpcAccess).handler(handler);
  await expect(call(privateProcedure, {}, { context })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(call(publicProcedure, {}, { context })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(readSession).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});
