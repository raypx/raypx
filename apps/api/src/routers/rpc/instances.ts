import { ORPCError } from "@orpc/server";
import { InstanceError } from "@raypx/instances";
import type { InstanceService } from "@raypx/instances/server";
import type { RpcContext } from "../../middleware/rpc.js";
import type { RpcBoundary } from "./boundary.js";
export function createInstancesHandlers({
  os,
  options,
  requirePermission,
  allowedOrigins,
  enforceLimit,
}: Pick<RpcBoundary, "os" | "options" | "requirePermission" | "allowedOrigins" | "enforceLimit">) {
  async function instanceCall<T>(
    context: RpcContext,
    owner: boolean,
    write: boolean,
    run: (service: InstanceService, accountId: string) => Promise<T>,
    deviceId?: string,
  ): Promise<T> {
    const auth = owner ? await requirePermission(context, "projects.read") : undefined;
    if (write && owner) {
      const origin = context.headers.get("origin");
      if (!origin || !allowedOrigins.includes(origin)) throw new ORPCError("FORBIDDEN");
    }
    const address = options.clientIpHeader
      ? (context.headers.get(options.clientIpHeader) ?? "unknown")
      : "unknown";
    await enforceLimit(
      context,
      `instance:${auth?.user.id ?? (deviceId ? address + ":" + deviceId : address)}:${owner ? "owner" : "device"}`,
      { window: 60, max: owner ? 30 : 60 },
    );
    if (!options.instances) throw new ORPCError("SERVICE_UNAVAILABLE");
    try {
      return await run(options.instances, auth?.user.id ?? "");
    } catch (error) {
      if (!(error instanceof InstanceError)) throw error;
      throw new ORPCError(error.code === "INSTANCE_NOT_FOUND" ? "NOT_FOUND" : "CONFLICT", {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }

  return {
    begin: os.instances.begin.handler(({ input, context }) =>
      instanceCall(context, false, true, (service) => service.begin(input)),
    ),
    inspect: os.instances.inspect.handler(({ input, context }) =>
      instanceCall(context, true, false, (service) => service.inspect(input.code)),
    ),
    approve: os.instances.approve.handler(({ input, context }) =>
      instanceCall(context, true, true, (service, owner) => service.approve(owner, input.code)),
    ),
    poll: os.instances.poll.handler(({ input, context }) =>
      instanceCall(
        context,
        false,
        false,
        (service) => service.poll(input.id, input.token),
        input.id,
      ),
    ),
    check: os.instances.check.handler(({ input, context }) =>
      instanceCall(context, false, false, (service) => service.check(input), input.instanceId),
    ),
    list: os.instances.list.handler(({ context }) =>
      instanceCall(context, true, false, (service, owner) => service.list(owner)),
    ),
    revoke: os.instances.revoke.handler(({ input, context }) =>
      instanceCall(context, true, true, (service, owner) =>
        service.revoke(owner, input.instanceId),
      ),
    ),
  };
}
