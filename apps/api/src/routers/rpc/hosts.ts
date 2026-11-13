import { ORPCError } from "@orpc/server";
import type { RpcContext } from "../../middleware/rpc.js";
import type { RpcBoundary } from "./boundary.js";
export function createHostsHandlers({
  os,
  controlCall,
  options,
  allowedOrigins,
  enforceLimit,
  controlFailure,
}: Pick<
  RpcBoundary,
  "os" | "controlCall" | "options" | "allowedOrigins" | "enforceLimit" | "controlFailure"
>) {
  const digest = async (value: string) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");

  // The server entry replaces the private header from its socket; Workers supply the
  // edge-owned CF header. No limit stores the bearer credential.
  const limitPeer = async (context: RpcContext, procedure: string) => {
    const peer =
      (options.clientIpHeader ? context.headers.get(options.clientIpHeader) : null) ?? "unknown";
    await enforceLimit(context, `rpc:${procedure}:peer:${await digest(peer)}`, {
      window: 60,
      max: 120,
    });
  };

  return {
    authorize: os.hosts.authorize.handler(({ input, context }) => {
      const origin = context.headers.get("origin");
      if (!origin || !allowedOrigins.includes(origin))
        throw new ORPCError("FORBIDDEN", {
          data: { error: { code: "ORIGIN_REJECTED" }, requestId: context.requestId },
        });
      return controlCall(
        context,
        "projects.read",
        (control, auth) => control.credentials.authorizeHost(auth, input),
        { procedure: "hosts.authorize", window: 60, max: 5 },
      );
    }),
    grant: os.hosts.grant.handler(async ({ input, context }) => {
      if (!options.control) throw new ORPCError("SERVICE_UNAVAILABLE");
      await limitPeer(context, "hosts.grant");
      await enforceLimit(context, `rpc:hosts.grant:credential:${await digest(input.credential)}`, {
        window: 60,
        max: 6,
      });
      try {
        return await options.control.credentials.hostGrant(input.credential);
      } catch (error) {
        return controlFailure(error, context);
      }
    }),
    revoke: os.hosts.revoke.handler(async ({ input, context }) => {
      if (!options.control) throw new ORPCError("SERVICE_UNAVAILABLE");
      await limitPeer(context, "hosts.revoke");
      try {
        return await options.control.credentials.revokeHost(input.credential);
      } catch (error) {
        return controlFailure(error, context);
      }
    }),
  };
}
