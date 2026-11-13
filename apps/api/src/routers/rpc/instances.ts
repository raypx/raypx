import { ORPCError } from "@orpc/server";
import { InstanceError } from "@raypx/instances";
import type { InstanceService } from "@raypx/instances/server";
import type { AccountContext, RpcContext } from "../../middleware/rpc.js";
import type { RpcBoundary } from "./boundary.js";
export function createInstancesHandlers({
  os,
  options,
  enforceLimit,
  withRpcPermission,
  withPublicRpcAccess,
  requireTrustedOrigin,
}: Pick<
  RpcBoundary,
  | "os"
  | "options"
  | "enforceLimit"
  | "withRpcPermission"
  | "withPublicRpcAccess"
  | "requireTrustedOrigin"
>) {
  async function instanceCall<T>(
    context: RpcContext,
    run: (service: InstanceService) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(options.instances);
    } catch (error) {
      if (!(error instanceof InstanceError)) throw error;
      throw new ORPCError(error.code === "INSTANCE_NOT_FOUND" ? "NOT_FOUND" : "CONFLICT", {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }
  /** Owner procedures share one account window. */
  async function ownerCall<T>(
    context: AccountContext,
    run: (service: InstanceService, accountId: string) => Promise<T>,
  ) {
    const accountId = context.auth.user.id;
    await enforceLimit(context, `instance:${accountId}:owner`, { window: 60, max: 30 });
    return instanceCall(context, (service) => run(service, accountId));
  }
  async function deviceCall<T>(
    context: RpcContext,
    run: (service: InstanceService) => Promise<T>,
    deviceId?: string,
  ) {
    const address = options.clientIpHeader
      ? (context.headers.get(options.clientIpHeader) ?? "unknown")
      : "unknown";
    // The caller chooses the device ID, so it only narrows a limit the address already has.
    if (deviceId) await enforceLimit(context, `instance:${address}:peer`, { window: 60, max: 300 });
    const key = deviceId ? `${address}:${deviceId}` : address;
    await enforceLimit(context, `instance:${key}:device`, { window: 60, max: 60 });
    return instanceCall(context, run);
  }
  const owner = withRpcPermission();

  return {
    begin: os.instances.begin
      .use(withPublicRpcAccess)
      .handler(({ input, context }) => deviceCall(context, (service) => service.begin(input))),
    inspect: os.instances.inspect
      .use(owner)
      .handler(({ input, context }) =>
        ownerCall(context, (service) => service.inspect(input.code)),
      ),
    approve: os.instances.approve
      .use(owner)
      .use(requireTrustedOrigin)
      .handler(({ input, context }) =>
        ownerCall(context, (service, accountId) => service.approve(accountId, input.code)),
      ),
    poll: os.instances.poll
      .use(withPublicRpcAccess)
      .handler(({ input, context }) =>
        deviceCall(context, (service) => service.poll(input.id, input.token), input.id),
      ),
    check: os.instances.check
      .use(withPublicRpcAccess)
      .handler(({ input, context }) =>
        deviceCall(context, (service) => service.check(input), input.instanceId),
      ),
    list: os.instances.list
      .use(owner)
      .handler(({ context }) =>
        ownerCall(context, (service, accountId) => service.list(accountId)),
      ),
    revoke: os.instances.revoke
      .use(owner)
      .use(requireTrustedOrigin)
      .handler(({ input, context }) =>
        ownerCall(context, (service, accountId) => service.revoke(accountId, input.instanceId)),
      ),
  };
}
