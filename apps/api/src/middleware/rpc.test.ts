import { call, os, type AnyProcedure } from "@orpc/server";
import { expect, it, vi } from "vitest";
import { createAccessPolicy } from "../access.js";
import { createRpcRouter } from "../routers/rpc/index.js";
import { createRpcMiddleware, enforcesRpcAccess, type RpcContext } from "./rpc.js";

it("rejects a missing RPC access declaration before reading the session or running the handler", async () => {
  const readSession = vi.fn(async () => null);
  const { withRpcPermission, withPublicRpcAccess } = createRpcMiddleware(
    { readSession },
    createAccessPolicy(),
    [],
  );
  const handler = vi.fn();
  const context = { headers: new Headers(), requestId: "missing-policy" };
  const undeclared = os.$context<RpcContext>();
  const privateProcedure = undeclared.use(withRpcPermission()).handler(handler);
  const publicProcedure = undeclared.use(withPublicRpcAccess).handler(handler);
  await expect(call(privateProcedure, undefined, { context })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(call(publicProcedure, undefined, { context })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(readSession).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});

it("runs an access middleware on every procedure of the served router", () => {
  const router = createRpcRouter(
    {
      authHandler: async () => new Response(null),
      readSession: async () => null,
      allowedOrigins: [],
    },
    async () => ({}),
  );
  const unguarded: string[] = [];
  let procedures = 0;
  for (const [group, handlers] of Object.entries(router))
    for (const [name, procedure] of Object.entries<AnyProcedure>(handlers)) {
      procedures += 1;
      if (!enforcesRpcAccess(procedure)) unguarded.push(`${group}.${name}`);
    }
  // Assembling the router must not apply the shared middleware a second time.
  const shared = router.configuration.update["~orpc"].orderedMiddlewares.map(
    ({ middleware }) => middleware,
  );
  expect(new Set(shared).size).toBe(shared.length);
  expect(procedures).toBeGreaterThan(40);
  expect(unguarded).toEqual([]);
});
