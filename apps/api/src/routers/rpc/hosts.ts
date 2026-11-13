import type { RpcContext } from "../../middleware/rpc.js";
import type { RpcBoundary } from "./boundary.js";
export function createHostsHandlers({
  os,
  controlCall,
  options,
  enforceLimit,
  controlFailure,
  withRpcPermission,
  withPublicRpcAccess,
  requireTrustedOrigin,
}: Pick<
  RpcBoundary,
  | "os"
  | "controlCall"
  | "options"
  | "enforceLimit"
  | "controlFailure"
  | "withRpcPermission"
  | "withPublicRpcAccess"
  | "requireTrustedOrigin"
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
    authorize: os.hosts.authorize
      .use(requireTrustedOrigin)
      .use(withRpcPermission({ window: 60, max: 5 }))
      .handler(({ input, context }) =>
        controlCall(context, (control, auth) => control.credentials.authorizeHost(auth, input)),
      ),
    grant: os.hosts.grant.use(withPublicRpcAccess).handler(async ({ input, context }) => {
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
    revoke: os.hosts.revoke.use(withPublicRpcAccess).handler(async ({ input, context }) => {
      await limitPeer(context, "hosts.revoke");
      try {
        return await options.control.credentials.revokeHost(input.credential);
      } catch (error) {
        return controlFailure(error, context);
      }
    }),
  };
}
