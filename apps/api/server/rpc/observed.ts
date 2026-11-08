import type { RpcBoundary } from "./boundary.ts";
export function createObservedHandlers({
  os,
  controlCall,
}: Pick<RpcBoundary, "os" | "controlCall">) {
  return {
    list: os.observed.list.handler(({ context }) =>
      controlCall(context, "approvals.read", (control, auth) =>
        control.observed.listObserved(auth.user.id),
      ),
    ),
    get: os.observed.get.handler(({ input, context }) =>
      controlCall(context, "approvals.read", (control, auth) =>
        control.observed.getObserved(auth.user.id, input.id),
      ),
    ),
  };
}
