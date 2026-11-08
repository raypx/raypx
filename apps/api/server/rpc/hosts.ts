import { ORPCError } from "@orpc/server";
import type { RpcBoundary } from "./boundary.ts";
export function createHostsHandlers({
  os,
  controlCall,
  options,
  allowedOrigins,
  enforceLimit,
  digest,
  controlFailure,
}: Pick<
  RpcBoundary,
  "os" | "controlCall" | "options" | "allowedOrigins" | "enforceLimit" | "digest" | "controlFailure"
>) {
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
        "hosts.authorize",
      );
    }),
    grant: os.hosts.grant.handler(async ({ input, context }) => {
      if (!options.control) throw new ORPCError("SERVICE_UNAVAILABLE");
      // The server entry replaces the private header from its socket; Workers supply the
      // edge-owned CF header. Neither limit stores the bearer credential.
      const peer =
        (options.clientIpHeader ? context.headers.get(options.clientIpHeader) : null) ?? "unknown";
      await enforceLimit(context, `rpc:hosts.grant:peer:${await digest(peer)}`, {
        window: 60,
        max: 120,
      });
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
      try {
        return await options.control.credentials.revokeHost(input.credential);
      } catch (error) {
        return controlFailure(error, context);
      }
    }),
  };
}
