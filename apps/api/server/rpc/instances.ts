import type { RpcBoundary } from "./boundary.js";
export function createInstancesHandlers({
  os,
  instanceCall,
}: Pick<RpcBoundary, "os" | "instanceCall">) {
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
