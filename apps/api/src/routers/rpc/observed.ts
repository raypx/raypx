import type { RpcBoundary } from "./boundary.js";
export function createObservedHandlers({
  os,
  controlCall,
  withRpcPermission,
}: Pick<RpcBoundary, "os" | "controlCall" | "withRpcPermission">) {
  const canRead = withRpcPermission();
  return {
    list: os.observed.list
      .use(canRead)
      .handler(({ context }) =>
        controlCall(context, (control, auth) => control.observed.listObserved(auth.user.id)),
      ),
    get: os.observed.get
      .use(canRead)
      .handler(({ input, context }) =>
        controlCall(context, (control, auth) =>
          control.observed.getObserved(auth.user.id, input.id),
        ),
      ),
  };
}
