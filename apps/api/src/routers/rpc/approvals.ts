import type { RpcSetup } from "./setup.js";
export function createApprovalsHandlers({
  os,
  callControl,
  withRpcPermission,
}: Pick<RpcSetup, "os" | "callControl" | "withRpcPermission">) {
  return {
    list: os.approvals.list
      .use(withRpcPermission())
      .handler(({ context }) =>
        callControl(context, (control, auth) => control.tasks.listApprovals(auth.user.id)),
      ),
  };
}
