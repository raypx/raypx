import type { RpcSetup } from "./setup.js";
export function createObservedHandlers({
  os,
  callControl,
  withRpcPermission,
}: Pick<RpcSetup, "os" | "callControl" | "withRpcPermission">) {
  const canRead = withRpcPermission();
  return {
    list: os.observed.list
      .use(canRead)
      .handler(({ context }) =>
        callControl(context, (control, auth) => control.observed.listObserved(auth.user.id)),
      ),
    get: os.observed.get
      .use(canRead)
      .handler(({ input, context }) =>
        callControl(context, (control, auth) =>
          control.observed.getObserved(auth.user.id, input.id),
        ),
      ),
  };
}
