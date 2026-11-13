import type { RpcBoundary } from "./boundary.js";
export function createApprovalsHandlers({
  os,
  controlCall,
  withRpcPermission,
}: Pick<RpcBoundary, "os" | "controlCall" | "withRpcPermission">) {
  return {
    list: os.approvals.list
      .use(withRpcPermission())
      .handler(({ context }) =>
        controlCall(context, (control, auth) => control.tasks.listApprovals(auth.user.id)),
      ),
  };
}
